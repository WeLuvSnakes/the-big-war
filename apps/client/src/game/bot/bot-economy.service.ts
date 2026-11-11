import type { Bot } from './bot.types';
import { hasPort } from '../ship/ship.service';
import type { GameState } from '../state/state.types';
import type { Command } from '../commands/commands.types';
import { buildingCost } from '../building/building.service';
import { buildingCellsOf } from '../map/world-index.service';
import type { BuildingKind } from '../building/building.types';
import type { Empire, EmpireId } from '../empire/empire.types';
import type { ResearchNode } from '../research/research.types';
import { RESEARCH_NODES } from '../research/research.constants';
import { meetsRequirements } from '../research/research.service';
import { populationCap, populationOf } from '../unit/unit.service';
import { chance, pick } from '@the-big-war/game-engine/rng/rng.service';
import { BOT_TUNING, EARLY_RESEARCH, OPENING_ORDER } from './bot.constants';
import { armyShare, findCannonShot, findSite, hostileEdges, producersBusy, incomeEstimate, wantsPort, workforce } from './bot-queries.service';

export function pickResearch(bot: Bot, empire: Empire, navy = false): ResearchNode | null {
  if (empire.research.active) return null;
  const available = RESEARCH_NODES.filter(
    node =>
      !empire.research.completed.includes(node.id) &&
      meetsRequirements(empire.research, node) &&
      empire.science >= node.cost,
  );
  if (available.length === 0) return null;
  const naval = navy ? available.find(node => node.id === 'dreadnoughts' || node.id === 'drill') : undefined;
  if (naval) return naval;

  const priority = (node: ResearchNode): number => {
    const early = EARLY_RESEARCH.indexOf(node.id);
    const flavour = (node.branch === 'military' ? bot.personality.aggression : bot.personality.economy) * 100;
    return flavour - node.cost + (early >= 0 ? 120 - early * 10 : 0);
  };
  available.sort((a, b) => priority(b) - priority(a));
  return available[0] ?? null;
}

export function researchCommand(bot: Bot, state: GameState, empire: Empire): Command | null {
  const node = pickResearch(bot, empire, hasPort(state, bot.empire));
  if (!node) return null;
  const optionId =
    node.kind === 'choice' && node.options && node.options.length > 0
      ? node.options[bot.empire % node.options.length]!.id
      : undefined;
  return optionId
    ? { type: 'StartResearch', empire: bot.empire, nodeId: node.id, optionId }
    : { type: 'StartResearch', empire: bot.empire, nodeId: node.id };
}

function placedCounts(state: GameState, empireId: EmpireId): Map<BuildingKind, number> {
  const counts = new Map<BuildingKind, number>();
  for (const cell of buildingCellsOf(state, empireId)) {
    if (cell.building) counts.set(cell.building.kind, (counts.get(cell.building.kind) ?? 0) + 1);
  }
  return counts;
}

interface Pick {
  readonly kind: BuildingKind;
  readonly score: number;
}

function openingPick(state: GameState, empireId: EmpireId, placed: ReadonlyMap<BuildingKind, number>): BuildingKind | null {
  for (const kind of OPENING_ORDER) {
    if ((placed.get(kind) ?? 0) > 0) continue;
    if (findSite(state, empireId, kind)) return kind;
  }
  return null;
}

function wantsBarracks(bot: Bot, income: number): boolean {
  const eager = 1.2 - bot.personality.aggression * 0.4;
  return income >= bot.skill.barracksIncome * eager || bot.clock >= bot.skill.barracksDeadline * eager;
}

function scoredPicks(bot: Bot, state: GameState, empire: Empire, placed: ReadonlyMap<BuildingKind, number>): Pick[] {
  const count = (kind: BuildingKind): number => placed.get(kind) ?? 0;
  const cost = (kind: BuildingKind): number => buildingCost(state, bot.empire, kind);
  const income = incomeEstimate(state, empire);
  const { spare } = workforce(state, empire);
  const econ = state.config.economy;
  const picks: Pick[] = [];
  const staffed = (rate: number): number => rate * Math.max(0, Math.min(1, spare / econ.workersPerBuilding));

  picks.push({ kind: 'market', score: staffed(econ.marketGoldPerSecond) / cost('market') });
  picks.push({ kind: 'fishery', score: staffed(econ.fisheryGoldPerSecond) / cost('fishery') });
  picks.push({ kind: 'lumberjack', score: BOT_TUNING.gathererGoldPerSecond / (1 + count('lumberjack') * 0.5) / cost('lumberjack') });
  picks.push({ kind: 'miner', score: BOT_TUNING.minerGoldPerSecond / (1 + count('miner') * 0.5) / cost('miner') });

  const producerCount = count('barracks') + count('factory');
  const civilianTarget = econ.workersPerBuilding + BOT_TUNING.civilianReserveBase + producerCount * BOT_TUNING.civiliansPerProducer;
  const growthWeight = BOT_TUNING.growthScore * (spare < civilianTarget ? 1 : 0.2);
  const farmRoom = count('farm') * econ.farmGrowthPerFarm < econ.farmGrowthMax;
  if (farmRoom) picks.push({ kind: 'farm', score: (econ.farmGrowthPerFarm * growthWeight) / cost('farm') });
  picks.push({ kind: 'city', score: (econ.cityGrowthPerCity * growthWeight) / cost('city') });
  if (income >= BOT_TUNING.labIncome * (1 + count('lab'))) picks.push({ kind: 'lab', score: BOT_TUNING.labScore / (1 + count('lab')) });

  const producers = producerCount + count('factory');
  const armyIncome = income * armyShare(bot, state, empire);
  const popFull = populationCap(state, bot.empire) - populationOf(state, bot.empire) <= 0;
  const saturated = !popFull && bot.armyBudget >= BOT_TUNING.armyBudgetBase && producersBusy(state, bot.empire);
  const roomForProducer = producerCount < bot.skill.maxProducers;
  if (roomForProducer && producers > 0 && (popFull || saturated || armyIncome > producers * BOT_TUNING.barracksGoldPerSecond)) {
    const score = saturated ? BOT_TUNING.saturatedScore : popFull ? BOT_TUNING.popFullScore : 0.03 * bot.personality.aggression + 0.01;
    picks.push({ kind: 'barracks', score });
  }
  if (roomForProducer && count('barracks') > 0 && count('factory') === 0 && income >= BOT_TUNING.factoryIncome) {
    picks.push({ kind: 'factory', score: 0.025 });
  }
  if (count('cannon') < 2 && hostileEdges(state, bot.empire).length > 0) picks.push({ kind: 'cannon', score: 0.02 });

  return picks.filter(pick => pick.score > 0).sort((a, b) => b.score - a.score);
}

function nextBuilding(bot: Bot, state: GameState, empire: Empire): BuildingKind | null {
  const placed = placedCounts(state, bot.empire);
  const opening = openingPick(state, bot.empire, placed);
  if (opening) return opening;
  if ((placed.get('barracks') ?? 0) === 0 && wantsBarracks(bot, incomeEstimate(state, empire))) return 'barracks';

  const limit = BOT_TUNING.baseBuildingLimit + empire.hexCount / BOT_TUNING.tilesPerBuildingLimit;
  const rich = empire.gold - bot.armyBudget >= BOT_TUNING.surplusGold;
  const capped = !rich && buildingCellsOf(state, bot.empire).length >= limit;
  const picks = scoredPicks(bot, state, empire, placed).filter(
    pick => (!capped || pick.kind === 'barracks' || pick.kind === 'factory') && findSite(state, bot.empire, pick.kind),
  );
  if (picks.length === 0) return null;
  if (picks.length > 1 && chance(bot.rng, bot.skill.slop)) return pick(bot.rng, picks)!.kind;
  return picks[0]!.kind;
}

export function constructionCommands(bot: Bot, state: GameState, empire: Empire): Command[] {
  const last = bot.cooldowns.get('build') ?? -Infinity;
  if (bot.clock - last < bot.skill.reactionSeconds) return [];
  bot.cooldowns.set('build', bot.clock);

  const purse = empire.gold - Math.min(bot.armyBudget, empire.gold);
  if (purse >= buildingCost(state, bot.empire, 'port') && wantsPort(state, bot.empire)) {
    const port = findSite(state, bot.empire, 'port');
    if (port) return [{ type: 'PlaceBuilding', empire: bot.empire, hex: port, kind: 'port' }];
  }

  const kind = nextBuilding(bot, state, empire);
  if (!kind) {
    bot.reserve = 0;
    return [];
  }
  const cost = buildingCost(state, bot.empire, kind);
  const military = kind === 'barracks' || kind === 'factory';
  if ((military ? empire.gold : purse) < cost) {
    bot.reserve = cost;
    return [];
  }
  bot.reserve = 0;
  const site = findSite(state, bot.empire, kind);
  return site ? [{ type: 'PlaceBuilding', empire: bot.empire, hex: site, kind }] : [];
}

export function cannonCommand(bot: Bot, state: GameState, empire: Empire): Command | null {
  if (!chance(bot.rng, BOT_TUNING.cannonFireChance)) return null;
  const shot = findCannonShot(state, bot.empire);
  if (!shot || empire.gold < state.config.cannon.cost) return null;
  return { type: 'FireCannon', empire: bot.empire, from: shot.from, target: shot.target };
}
