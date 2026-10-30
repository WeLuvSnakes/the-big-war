import type { Bot } from './bot.types';
import { BOT_TUNING } from './bot.constants';
import { hasPort } from '../ship/ship.service';
import type { GameState } from '../state/state.types';
import type { Command } from '../commands/commands.types';
import { buildingCellsOf } from '../map/world-index.service';
import type { BuildingKind } from '../building/building.types';
import type { Empire, EmpireId } from '../empire/empire.types';
import type { ResearchNode } from '../research/research.types';
import { RESEARCH_NODES } from '../research/research.constants';
import { meetsRequirements } from '../research/research.service';
import { chance } from '@the-big-war/game-engine/rng/rng.service';
import { buildingCost, ownedBuildings, upgradeError } from '../building/building.service';
import { findCannonShot, findSite, unmannedBorderTrench, wantsPort } from './bot-queries.service';

const ECONOMY_PLAN: readonly BuildingKind[] = ['market', 'fishery', 'farm', 'lumberjack', 'miner', 'lab', 'city'];

const MILITARY_PLAN: readonly BuildingKind[] = [
  'barracks',
  'fort',
  'lab',
  'cannon',
  'battery',
  'machine_gun',
  'bunker',
  'tank',
  'market',
  'fishery',
  'farm',
  'city',
];

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

  available.sort((a, b) => {
    const prioA = (a.branch === 'military' ? bot.personality.aggression : bot.personality.economy) * 100 - a.cost;
    const prioB = (b.branch === 'military' ? bot.personality.aggression : bot.personality.economy) * 100 - b.cost;
    return prioB - prioA;
  });
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

function needsFirstBarracks(state: GameState, empireId: EmpireId): boolean {
  return !buildingCellsOf(state, empireId).some(cell => cell.building?.kind === 'barracks');
}

function placedCounts(state: GameState, empireId: EmpireId): Map<BuildingKind, number> {
  const counts = new Map<BuildingKind, number>();
  for (const cell of buildingCellsOf(state, empireId)) {
    if (cell.building) counts.set(cell.building.kind, (counts.get(cell.building.kind) ?? 0) + 1);
  }
  return counts;
}

export function constructionCommands(bot: Bot, state: GameState, empire: Empire): Command[] {
  const commands: Command[] = [];
  if (empire.gold >= buildingCost(state, bot.empire, 'port') && wantsPort(state, bot.empire)) {
    const port = findSite(state, bot.empire, 'port');
    if (port) return [{ type: 'PlaceBuilding', empire: bot.empire, hex: port, kind: 'port' }];
  }
  const firstBarracks = needsFirstBarracks(state, bot.empire);
  if (firstBarracks) {
    if (empire.gold < buildingCost(state, bot.empire, 'barracks')) return commands;
    const site = findSite(state, bot.empire, 'barracks');
    if (site) commands.push({ type: 'PlaceBuilding', empire: bot.empire, hex: site, kind: 'barracks' });
    return commands;
  }
  const plan = bot.personality.economy >= bot.personality.aggression ? ECONOMY_PLAN : MILITARY_PLAN;
  const placed = placedCounts(state, bot.empire);
  const limit = BOT_TUNING.baseBuildingLimit + empire.hexCount / BOT_TUNING.tilesPerBuildingLimit;
  const total = buildingCellsOf(state, bot.empire).length;
  const leastBuiltFirst = [...plan].sort((a, b) => (placed.get(a) ?? 0) - (placed.get(b) ?? 0));
  for (const kind of total < limit ? leastBuiltFirst : []) {
    if (empire.gold < buildingCost(state, bot.empire, kind)) continue;
    const site = findSite(state, bot.empire, kind);
    if (!site) continue;
    commands.push({ type: 'PlaceBuilding', empire: bot.empire, hex: site, kind });
    break;
  }

  if (
    empire.gold > buildingCost(state, bot.empire, 'barracks') * 2 &&
    chance(bot.rng, BOT_TUNING.militaryBuildChance * (1 - bot.personality.economy))
  ) {
    const site = findSite(state, bot.empire, 'barracks');
    if (site) commands.push({ type: 'PlaceBuilding', empire: bot.empire, hex: site, kind: 'barracks' });
  }

  const cheapestUpgrade = state.config.barracksTiers[1]?.upgradeCost ?? Infinity;
  for (const { hex, building } of empire.gold >= cheapestUpgrade ? ownedBuildings(state, bot.empire) : []) {
    if (building.kind !== 'barracks' || upgradeError(state, bot.empire, hex) !== null) continue;
    commands.push({ type: 'UpgradeBuilding', empire: bot.empire, hex });
    break;
  }
  return commands;
}

export function trenchCommands(bot: Bot, state: GameState, empire: Empire): Command[] {
  const commands: Command[] = [];
  const reserveFloor = empire.reserveCap * BOT_TUNING.reserveFloorRatio;
  const unmanned = unmannedBorderTrench(state, bot.empire);
  if (unmanned && empire.soldiers > reserveFloor) {
    commands.push({ type: 'ManTrench', empire: bot.empire, hex: unmanned, percent: BOT_TUNING.trenchManPercent });
  }

  if (countPlacedTrenches(state, bot.empire) >= BOT_TUNING.trenchTarget) return commands;
  if (empire.gold < state.config.buildings.trench.cost) return commands;
  if (!chance(bot.rng, BOT_TUNING.militaryBuildChance * bot.personality.aggression)) return commands;
  const site = findSite(state, bot.empire, 'trench');
  if (site) commands.push({ type: 'PlaceBuilding', empire: bot.empire, hex: site, kind: 'trench' });
  return commands;
}

function countPlacedTrenches(state: GameState, empireId: EmpireId): number {
  let count = 0;
  for (const cell of buildingCellsOf(state, empireId)) if (cell.building?.kind === 'trench') count += 1;
  return count;
}

export function cannonCommand(bot: Bot, state: GameState, empire: Empire): Command | null {
  if (!chance(bot.rng, BOT_TUNING.cannonFireChance)) return null;
  const shot = findCannonShot(state, bot.empire);
  if (!shot || empire.gold < state.config.cannon.cost) return null;
  return { type: 'FireCannon', empire: bot.empire, from: shot.from, target: shot.target };
}
