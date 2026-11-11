import type { Bot } from './bot.types';
import { BOT_TUNING } from './bot.constants';
import type { HexCell } from '../map/map.types';
import { finishedPorts } from '../ship/ship.service';
import { isClaimable } from '../map/terrain.service';
import type { Empire } from '../empire/empire.types';
import type { GameState } from '../state/state.types';
import type { Unit, UnitKind } from '../unit/unit.types';
import type { Command } from '../commands/commands.types';
import { NEUTRAL_OWNER } from '../empire/empire.constants';
import { buildingCellsOf } from '../map/world-index.service';
import { pick } from '@the-big-war/game-engine/rng/rng.service';
import { UNIT_KINDS, UNIT_STATS } from '../unit/unit.constants';
import type { Axial } from '@the-big-war/game-engine/world-tile/world-tile.types';
import { gridAt, gridIndex, ring } from '@the-big-war/game-engine/world-tile/world-tile.service';
import { cellAtPixel, hostileUnits, isWalkable, populationCap, populationOf, unitsOf } from '../unit/unit.service';
import { armyPower, armyShare, hasFreeBoat, hostileUnitsNear, overseasTarget, incomeEstimate, intruders, rivalVehicleShare, workforce } from './bot-queries.service';

const SCOUT_SQUAD = 2;
const TRAIN_WEIGHTS: Readonly<Record<UnitKind, number>> = {
  infantry: 5,
  assault: 3,
  mg: 2,
  sniper: 1,
  mrap: 2,
  tank: 1,
};
const ANTI_VEHICLE_WEIGHTS: Readonly<Record<UnitKind, number>> = {
  infantry: 2,
  assault: 1,
  mg: 0,
  sniper: 4,
  mrap: 1,
  tank: 4,
};
const ANTI_INFANTRY_WEIGHTS: Readonly<Record<UnitKind, number>> = {
  infantry: 3,
  assault: 3,
  mg: 4,
  sniper: 1,
  mrap: 4,
  tank: 2,
};

export function unitCommands(bot: Bot, state: GameState, empire: Empire, dt: number): Command[] {
  const threat = intruders(state, empire.id);
  fundArmy(bot, state, empire, dt, threat.length > 0);
  const commands = trainCommands(bot, state, empire, threat.length > 0);
  const last = bot.cooldowns.get('units') ?? -Infinity;
  if (bot.clock - last < Math.max(1, bot.skill.reactionSeconds * 2)) return commands;
  bot.cooldowns.set('units', bot.clock);
  commands.push(...armyCommands(bot, state, empire, threat));
  return commands;
}

function trainWeights(bot: Bot, state: GameState): Readonly<Record<UnitKind, number>> {
  if (!bot.skill.counters) return TRAIN_WEIGHTS;
  const vehicles = rivalVehicleShare(state, bot.empire);
  if (vehicles >= 0.3) return ANTI_VEHICLE_WEIGHTS;
  return state.units.some(unit => hostileUnits(state, bot.empire, unit.empire)) ? ANTI_INFANTRY_WEIGHTS : TRAIN_WEIGHTS;
}

function producerCount(state: GameState, empire: Empire): number {
  return buildingCellsOf(state, empire.id).filter(cell => cell.building?.kind === 'barracks' || cell.building?.kind === 'factory').length;
}

function fundArmy(bot: Bot, state: GameState, empire: Empire, dt: number, threatened: boolean): void {
  const producers = producerCount(state, empire);
  if (producers === 0) {
    bot.armyBudget = 0;
    return;
  }
  const cap = BOT_TUNING.armyBudgetBase + producers * BOT_TUNING.armyBudgetPerProducer;
  const share = threatened ? Math.max(BOT_TUNING.threatArmyShare, bot.skill.armyShare) : armyShare(bot, state, empire);
  bot.armyBudget = Math.min(cap, bot.armyBudget + incomeEstimate(state, empire) * share * dt);
  const idleEco = empire.gold - bot.armyBudget - BOT_TUNING.surplusGold;
  if (bot.reserve === 0 && idleEco > 0) bot.armyBudget += idleEco;
  bot.armyBudget = Math.min(bot.armyBudget, empire.gold);
}

function trainCommands(bot: Bot, state: GameState, empire: Empire, threatened: boolean): Command[] {
  let room = populationCap(state, empire.id) - populationOf(state, empire.id);
  if (room <= 0) return [];
  const lastScout = bot.cooldowns.get('scout') ?? -Infinity;
  const scoutsShort =
    unitsOf(state, empire.id).length < bot.skill.scoutSquads * SCOUT_SQUAD && bot.clock - lastScout >= BOT_TUNING.scoutRefillSeconds;
  let gold = Math.min(empire.gold, scoutsShort ? Math.max(bot.armyBudget, UNIT_STATS.infantry.gold) : bot.armyBudget);
  let civilians = empire.civilians - (threatened || scoutsShort ? 0 : workforce(state, empire).jobs * BOT_TUNING.civilianGuard);
  const weights = trainWeights(bot, state);
  const commands: Command[] = [];

  for (const cell of buildingCellsOf(state, empire.id)) {
    const building = cell.building;
    if (!building || building.buildRemaining > 0 || building.demolishAt !== null) continue;
    if (building.kind !== 'barracks' && building.kind !== 'factory') continue;
    const at = gridIndex(state.grid, cell.q, cell.r);
    const line = state.production.find(item => item.at === at && item.building === building.id);
    if ((line?.queue.length ?? 0) >= BOT_TUNING.queueDepth) continue;
    const options = UNIT_KINDS.filter(
      kind =>
        UNIT_STATS[kind].producer === building.kind &&
        UNIT_STATS[kind].population <= room &&
        gold >= UNIT_STATS[kind].gold &&
        civilians >= UNIT_STATS[kind].civilians,
    );
    const kind = pick(bot.rng, options.flatMap(option => Array<UnitKind>(weights[option]).fill(option)));
    if (!kind) continue;
    room -= UNIT_STATS[kind].population;
    gold -= UNIT_STATS[kind].gold;
    civilians -= UNIT_STATS[kind].civilians;
    bot.armyBudget = Math.max(0, bot.armyBudget - UNIT_STATS[kind].gold);
    if (scoutsShort) bot.cooldowns.set('scout', bot.clock);
    commands.push({ type: 'TrainUnit', empire: empire.id, hex: { q: cell.q, r: cell.r }, kind });
  }
  return commands;
}

function centroid(units: readonly Unit[]): { x: number; y: number } {
  return {
    x: units.reduce((sum, unit) => sum + unit.x, 0) / units.length,
    y: units.reduce((sum, unit) => sum + unit.y, 0) / units.length,
  };
}

function moveOrder(empire: Empire, units: readonly Unit[], x: number, y: number): Command {
  return {
    type: 'OrderUnits',
    empire: empire.id,
    units: units.map(unit => unit.id),
    order: { kind: 'move', mode: 'amove', x, y, formation: 'wedge' },
  };
}

function hexOrder(state: GameState, empire: Empire, units: readonly Unit[], hex: Axial): Command {
  const size = state.config.map.hexSize;
  return moveOrder(empire, units, (hex.q + 0.5) * size, (hex.r + 0.5) * size);
}

function trackStuck(bot: Bot, units: readonly Unit[]): void {
  const seen = new Set<number>();
  for (const unit of units) {
    seen.add(unit.id);
    const track = bot.tracks.get(unit.id);
    const gap = Math.hypot(unit.tx - unit.x, unit.ty - unit.y);
    if (!unit.moving || !track || track.gap - gap > BOT_TUNING.stuckDistance || gap > track.gap + BOT_TUNING.stuckDistance * 4) {
      bot.tracks.set(unit.id, { gap, since: bot.clock });
    }
  }
  for (const id of bot.tracks.keys()) if (!seen.has(id)) bot.tracks.delete(id);
}

function staleBoarders(bot: Bot, units: readonly Unit[]): Unit[] {
  const stale: Unit[] = [];
  for (const unit of units) {
    if (unit.boarding === null) {
      bot.boardingSince.delete(unit.id);
      continue;
    }
    const since = bot.boardingSince.get(unit.id) ?? bot.clock;
    bot.boardingSince.set(unit.id, since);
    if (bot.clock - since >= BOT_TUNING.boardingTimeout) stale.push(unit);
  }
  for (const unit of stale) bot.boardingSince.delete(unit.id);
  return stale;
}

function idleCheck(bot: Bot): (unit: Unit) => boolean {
  return unit => {
    if (unit.target !== null || unit.captureAt >= 0) return false;
    if (!unit.moving) return true;
    const track = bot.tracks.get(unit.id);
    return !!track && bot.clock - track.since >= BOT_TUNING.stuckSeconds;
  };
}

function armyCommands(bot: Bot, state: GameState, empire: Empire, threat: readonly Unit[]): Command[] {
  fullScans = BOT_TUNING.fullScansPerCycle;
  const all = unitsOf(state, empire.id);
  const release = staleBoarders(bot, all);
  const units = all.filter(unit => unit.boarding === null);
  trackStuck(bot, units);
  const isIdle = idleCheck(bot);
  const home = rallyPoint(state, empire);
  if (release.length > 0 && home) return [hexOrder(state, empire, release, home)];
  const alive = new Set(units.map(unit => unit.id));
  for (const id of bot.scouts) if (!alive.has(id)) bot.scouts.delete(id);
  for (const unit of units) {
    if (bot.scouts.size >= bot.skill.scoutSquads * SCOUT_SQUAD) break;
    if (UNIT_STATS[unit.kind].vehicle) continue;
    bot.scouts.add(unit.id);
  }

  if (threat.length > 0) {
    const centre = centroid(threat);
    const defenders = units.filter(unit => unit.target === null);
    return defenders.length > 0 ? [moveOrder(empire, defenders, centre.x, centre.y)] : [];
  }

  const commands: Command[] = [];
  const claimed = new Set<number>();
  const scouts = units.filter(unit => bot.scouts.has(unit.id) && isIdle(unit));
  for (let at = 0; at < scouts.length; at += SCOUT_SQUAD) {
    const squad = scouts.slice(at, at + SCOUT_SQUAD);
    const centre = centroid(squad);
    const goal = nearestCell(state, centre.x, centre.y, cell => cell.owner === NEUTRAL_OWNER, claimed);
    if (!goal) {
      const voyage = voyageCommand(bot, state, empire, squad, []);
      if (voyage) commands.push(voyage);
      continue;
    }
    claimed.add(gridIndex(state.grid, goal.q, goal.r));
    commands.push(hexOrder(state, empire, squad, goal));
  }

  const army = units.filter(unit => !bot.scouts.has(unit.id));
  const rally = rallyPoint(state, empire);
  if (bot.skill.retreat && rally) {
    const hurt = army.filter(unit => unit.hp < UNIT_STATS[unit.kind].hp * BOT_TUNING.retreatHealth && unit.target === null);
    if (hurt.length > 0) commands.push(hexOrder(state, empire, hurt, rally));
  }

  const healthy = (unit: Unit): boolean => unit.hp >= UNIT_STATS[unit.kind].hp * BOT_TUNING.retreatHealth;
  const available = army.filter(unit => unit.target === null && unit.captureAt < 0 && healthy(unit));
  if (available.length < BOT_TUNING.attackGroupMin) return commands;
  const centre = centroid(available);
  const atWar = state.empires.some(other => other.id !== empire.id && other.alive && hostileUnits(state, empire.id, other.id));
  const enemy = atWar ? attackTarget(state, empire, centre.x, centre.y, claimed) : null;
  let spare = available;
  if (enemy) {
    const size = state.config.map.hexSize;
    const ex = (enemy.q + 0.5) * size;
    const ey = (enemy.r + 0.5) * size;
    const needed = armyPower(hostileUnitsNear(state, empire.id, ex, ey, BOT_TUNING.defenceRadius)) * bot.skill.attackRatio;
    if (armyPower(available) >= needed) {
      const byRange = [...available].sort((a, b) => Math.hypot(a.x - ex, a.y - ey) - Math.hypot(b.x - ex, b.y - ey));
      const strike: Unit[] = [];
      let power = 0;
      for (const unit of byRange) {
        if (power >= needed * BOT_TUNING.strikeMargin && strike.length >= BOT_TUNING.attackGroupMin) break;
        strike.push(unit);
        power += armyPower([unit]);
      }
      claimed.add(gridIndex(state.grid, enemy.q, enemy.r));
      commands.push(hexOrder(state, empire, strike, enemy));
      const sent = new Set(strike.map(unit => unit.id));
      spare = available.filter(unit => !sent.has(unit.id));
    }
  }
  commands.push(...spreadCommands(bot, state, empire, spare.filter(isIdle), claimed));
  return commands;
}

function spreadCommands(bot: Bot, state: GameState, empire: Empire, idle: readonly Unit[], claimed: Set<number>): Command[] {
  const commands: Command[] = [];
  const claimable = (cell: HexCell): boolean => cell.owner === NEUTRAL_OWNER || (cell.owner >= 0 && hostileUnits(state, empire.id, cell.owner));
  const size = state.config.map.hexSize;
  const pool: Unit[] = [];
  for (const unit of idle) {
    const cell = commands.length < BOT_TUNING.singlesPerCycle ? nearbyCell(state, unit, near => near.owner === NEUTRAL_OWNER, claimed) : null;
    const safe = cell && hostileUnitsNear(state, empire.id, (cell.q + 0.5) * size, (cell.r + 0.5) * size, BOT_TUNING.defenceRadius).length === 0;
    if (!cell || !safe) {
      pool.push(unit);
      continue;
    }
    claimed.add(gridIndex(state.grid, cell.q, cell.r));
    commands.push(hexOrder(state, empire, [unit], cell));
  }
  const squadLimit = commands.length + BOT_TUNING.squadOrdersPerCycle;
  while (pool.length >= BOT_TUNING.attackGroupMin && commands.length < squadLimit) {
    const lead = pool.shift()!;
    pool.sort((a, b) => Math.hypot(a.x - lead.x, a.y - lead.y) - Math.hypot(b.x - lead.x, b.y - lead.y));
    const squad = [lead, ...pool.splice(0, BOT_TUNING.attackGroupMin - 1)];
    const centre = centroid(squad);
    const goal = nearestCell(state, centre.x, centre.y, claimable, claimed);
    if (!goal) {
      const voyage = voyageCommand(bot, state, empire, squad, pool);
      if (voyage) commands.push(voyage);
      continue;
    }
    claimed.add(gridIndex(state.grid, goal.q, goal.r));
    commands.push(hexOrder(state, empire, squad, goal));
  }
  return commands;
}

function voyageCommand(bot: Bot, state: GameState, empire: Empire, squad: Unit[], pool: Unit[]): Command | null {
  if (!hasFreeBoat(state, empire.id) || state.units.some(unit => unit.empire === empire.id && unit.boarding !== null)) return null;
  const origin = cellAtPixel(state, squad[0]!.x, squad[0]!.y);
  if (!origin) return null;
  const mass = state.map.landmass[gridIndex(state.grid, origin.q, origin.r)];
  const ported = finishedPorts(state, empire.id).some(port => state.map.landmass[gridIndex(state.grid, port.q, port.r)] === mass);
  if (!ported) return null;
  const recent = (hex: Axial): boolean =>
    bot.clock - (bot.cooldowns.get(`beach:${gridIndex(state.grid, hex.q, hex.r)}`) ?? -Infinity) < BOT_TUNING.beachCooldown;
  const beach = overseasTarget(state, empire.id, recent);
  if (!beach) return null;
  bot.cooldowns.set(`beach:${gridIndex(state.grid, beach.q, beach.r)}`, bot.clock);
  if (gridAt(state.grid, beach)?.owner === NEUTRAL_OWNER) return hexOrder(state, empire, squad, beach);
  const size = state.config.map.hexSize;
  const needed = armyPower(hostileUnitsNear(state, empire.id, (beach.q + 0.5) * size, (beach.r + 0.5) * size, BOT_TUNING.defenceRadius)) * bot.skill.attackRatio;
  const party = [...squad];
  const nearby = pool.filter(unit => cellAtPixel(state, unit.x, unit.y) && state.map.landmass[gridIndex(state.grid, ...pixelHex(state, unit))] === mass);
  for (const unit of nearby) {
    if (party.length >= BOT_TUNING.invasionMax || (party.length >= BOT_TUNING.invasionSize && armyPower(party) >= needed)) break;
    party.push(unit);
  }
  if (armyPower(party) < needed) return null;
  const sent = new Set(party.map(unit => unit.id));
  for (let at = pool.length - 1; at >= 0; at--) if (sent.has(pool[at]!.id)) pool.splice(at, 1);
  return hexOrder(state, empire, party, beach);
}

function attackTarget(state: GameState, empire: Empire, x: number, y: number, taken: ReadonlySet<number>): HexCell | null {
  const hostile = (cell: HexCell): boolean => cell.owner >= 0 && hostileUnits(state, empire.id, cell.owner);
  const nearest = nearestCell(state, x, y, hostile, taken);
  if (!nearest) return null;
  const building = nearestCell(state, x, y, cell => hostile(cell) && cell.building !== null, taken);
  if (!building) return nearest;
  const size = state.config.map.hexSize;
  const gap = (cell: HexCell): number => Math.hypot((cell.q + 0.5) * size - x, (cell.r + 0.5) * size - y);
  return gap(building) <= gap(nearest) + BOT_TUNING.defenceRadius ? building : nearest;
}

function rallyPoint(state: GameState, empire: Empire): Axial | null {
  const home = buildingCellsOf(state, empire.id).find(cell => cell.building?.kind === 'city') ?? buildingCellsOf(state, empire.id)[0];
  return home ? { q: home.q, r: home.r } : null;
}

let fullScans = 0;

function nearestCell(
  state: GameState,
  x: number,
  y: number,
  accept: (cell: HexCell) => boolean,
  taken: ReadonlySet<number>,
): HexCell | null {
  const size = state.config.map.hexSize;
  const origin = cellAtPixel(state, x, y);
  const mass = origin ? state.map.landmass[gridIndex(state.grid, origin.q, origin.r)] : undefined;
  if (origin) {
    for (let radius = 1; radius <= BOT_TUNING.ringSearchRadius; radius++) {
      for (const hex of ring({ q: origin.q, r: origin.r }, radius)) {
        const cell: HexCell | undefined = gridAt(state.grid, hex);
        if (!cell || !isClaimable(cell.terrain) || !isWalkable(cell) || !accept(cell)) continue;
        const at = gridIndex(state.grid, cell.q, cell.r);
        if (taken.has(at) || state.map.landmass[at] !== mass) continue;
        if (clearWalk(state, x, y, (cell.q + 0.5) * size, (cell.r + 0.5) * size)) return cell;
      }
    }
  }
  if (fullScans <= 0) return null;
  fullScans -= 1;
  const nearest: { cell: HexCell; gap: number }[] = [];
  for (const cell of state.grid.cells) {
    if (!isClaimable(cell.terrain) || !isWalkable(cell) || !accept(cell)) continue;
    if (mass !== undefined && state.map.landmass[gridIndex(state.grid, cell.q, cell.r)] !== mass) continue;
    const gap = Math.hypot((cell.q + 0.5) * size - x, (cell.r + 0.5) * size - y);
    if (nearest.length >= BOT_TUNING.targetCandidates && gap >= nearest[nearest.length - 1]!.gap) continue;
    if (taken.has(gridIndex(state.grid, cell.q, cell.r))) continue;
    let at = nearest.length;
    while (at > 0 && nearest[at - 1]!.gap > gap) at -= 1;
    nearest.splice(at, 0, { cell, gap });
    if (nearest.length > BOT_TUNING.targetCandidates) nearest.pop();
  }
  return nearest.find(item => clearWalk(state, x, y, (item.cell.q + 0.5) * size, (item.cell.r + 0.5) * size))?.cell ?? null;
}

function pixelHex(state: GameState, unit: Unit): [number, number] {
  const cell = cellAtPixel(state, unit.x, unit.y)!;
  return [cell.q, cell.r];
}

function nearbyCell(state: GameState, unit: Unit, accept: (cell: HexCell) => boolean, taken: ReadonlySet<number>): HexCell | null {
  const origin = cellAtPixel(state, unit.x, unit.y);
  if (!origin) return null;
  const size = state.config.map.hexSize;
  const mass = state.map.landmass[gridIndex(state.grid, origin.q, origin.r)];
  for (let radius = 1; radius <= BOT_TUNING.localSearchRadius; radius++) {
    for (const hex of ring({ q: origin.q, r: origin.r }, radius)) {
      const cell: HexCell | undefined = gridAt(state.grid, hex);
      if (!cell || !isClaimable(cell.terrain) || !isWalkable(cell) || !accept(cell)) continue;
      const at = gridIndex(state.grid, cell.q, cell.r);
      if (taken.has(at) || state.map.landmass[at] !== mass) continue;
      if (clearWalk(state, unit.x, unit.y, (cell.q + 0.5) * size, (cell.r + 0.5) * size)) return cell;
    }
  }
  return null;
}

function clearWalk(state: GameState, x0: number, y0: number, x1: number, y1: number): boolean {
  const stride = state.config.map.hexSize / 2;
  const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / stride);
  for (let at = 1; at < steps; at++) {
    const t = at / steps;
    if (!isWalkable(cellAtPixel(state, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t))) return false;
  }
  return true;
}
