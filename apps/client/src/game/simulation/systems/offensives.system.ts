import type { HexCell } from '../../map/map.types';
import { ENGINE_TUNING } from '../simulation.constants';
import type { GameState } from '../../state/state.types';
import { NEUTRAL_OWNER } from '../../empire/empire.constants';
import { isTotalWar } from '../../diplomacy/diplomacy.service';
import type { Offensive } from '../../offensive/offensive.types';
import { lerp } from '@the-big-war/game-engine/math/math.service';
import { setBuilding, setOwner } from '../../map/world-index.service';
import { heapPop } from '@the-big-war/game-engine/collections/min-heap.service';
import { attackPowerAt, defencePowerAt } from '../../offensive/wave-power.service';
import { addToEncampments, drawFromEncampments } from '../../troops/troops.service';
import { gridAt, neighbors } from '@the-big-war/game-engine/world-tile/world-tile.service';
import { biomeDefenceAt, biomeSpeedAt, isPassable, terrainDefenceAt, tileScale } from '../../map/terrain.service';
import {
  canEnter,
  defendersAt,
  endOffensive,
  enqueueTile,
  isDefending,
  removeOffensive,
  seedFrontier,
} from '../../offensive/offensive.service';

export function stepOffensives(state: GameState, dt: number): void {
  for (const offensive of [...state.offensives]) {
    const empire = state.empires[offensive.empire];
    if (!empire || !empire.alive) {
      removeOffensive(state, offensive);
      continue;
    }
    if (offensive.mission !== 'attack') {
      stepIdle(state, offensive, dt);
      continue;
    }
    if (offensive.target !== NEUTRAL_OWNER && !state.empires[offensive.target]?.alive) {
      endOffensive(state, offensive);
      continue;
    }
    advance(state, offensive, dt);
  }
}

function stepIdle(state: GameState, offensive: Offensive, dt: number): void {
  if (stepMarch(offensive, dt) || offensive.mission !== 'retreat') return;
  addToEncampments(state, offensive.empire, offensive.troops);
  offensive.troops = 0;
  removeOffensive(state, offensive);
}

function tilesPerSecond(state: GameState, offensive: Offensive): number {
  const { baseTilesPerSecond, tilesPerRootTroop } = state.config.wave;
  return (baseTilesPerSecond + tilesPerRootTroop * Math.sqrt(offensive.troops)) * Math.sqrt(tileScale(state));
}

function stepMarch(offensive: Offensive, dt: number): boolean {
  const march = offensive.march;
  if (!march) return false;
  march.progress += dt;
  const t = Math.min(1, march.progress / march.duration);
  offensive.head = { q: lerp(march.from.q, march.to.q, t), r: lerp(march.from.r, march.to.r, t) };
  offensive.recent[0] = offensive.head;
  if (t < 1) return true;
  offensive.march = null;
  offensive.head = march.to;
  offensive.recent[0] = march.to;
  return false;
}

function advance(state: GameState, offensive: Offensive, dt: number): void {
  if (stepMarch(offensive, dt)) return;
  offensive.budget += tilesPerSecond(state, offensive) * dt;
  const contested = offensive.target !== NEUTRAL_OWNER;
  let assault = dt;
  while (offensive.budget >= 1 || (contested && assault > 0)) {
    if (offensive.troops <= 0) {
      removeOffensive(state, offensive);
      return;
    }
    let index = offensive.captureTile ?? heapPop(offensive.frontier);
    if (index === undefined) {
      seedFrontier(state, offensive);
      index = heapPop(offensive.frontier);
    }
    if (index === undefined) {
      endOffensive(state, offensive);
      return;
    }
    const cell = state.grid.cells[index]!;
    if (cell.owner !== offensive.target) {
      clearCapture(offensive);
      continue;
    }
    if (contested) {
      offensive.captureTile = index;
      assault = assaultTile(state, offensive, cell, assault);
      if (offensive.captureHealth! > 0 || offensive.budget < 1) break;
    }
    offensive.budget -= tileEffort(state, cell);
    const cost = tileCost(state, offensive, cell);
    if (cost > offensive.troops) {
      bleedDefender(state, offensive, offensive.troops);
      removeOffensive(state, offensive);
      return;
    }
    offensive.troops -= cost;
    bleedDefender(state, offensive, cost);
    clearCapture(offensive);
    takeTile(state, offensive, cell);
  }
  offensive.budget = Math.min(1, offensive.budget);
  if (offensive.troops <= 0) removeOffensive(state, offensive);
}

function clearCapture(offensive: Offensive): void {
  offensive.captureTile = undefined;
  offensive.captureHealth = undefined;
  offensive.captureHitAt = undefined;
}

function assaultTile(state: GameState, offensive: Offensive, cell: HexCell, seconds: number): number {
  const { tileHealth, tileDamagePerTroop, tileHealSeconds } = state.config.wave;
  const defenders = defendersAt(state, cell, offensive.empire);
  const surplus = Math.max(0, offensive.troops - defenders);
  const idle = state.elapsed - (offensive.captureHitAt ?? state.elapsed) > tileHealSeconds;
  const health = surplus <= 0 || idle ? tileHealth : (offensive.captureHealth ?? tileHealth);
  if (seconds > 0) offensive.captureHitAt = state.elapsed;
  const damagePerSecond = surplus * tileDamagePerTroop;
  const needed = damagePerSecond > 0 ? health / damagePerSecond : Number.POSITIVE_INFINITY;
  const spent = Math.min(seconds, needed);
  offensive.captureHealth = needed <= seconds ? 0 : health - damagePerSecond * seconds;
  if (defenders > 0) fightDefenders(state, offensive, cell, defenders, spent);
  return seconds - spent;
}

function fightDefenders(state: GameState, offensive: Offensive, cell: HexCell, defenders: number, seconds: number): void {
  const { fightLossPerTroop, fightMinLossPerSecond } = state.config.wave;
  const engaged = Math.min(offensive.troops, defenders);
  const loss = Math.min(engaged, Math.max(fightMinLossPerSecond, engaged * fightLossPerTroop) * seconds);
  offensive.troops = loss >= offensive.troops - ENGINE_TUNING.progressEpsilon ? 0 : offensive.troops - loss;
  const remaining = 1 - loss / defenders;
  for (const defending of [...state.offensives]) {
    if (!isDefending(defending, cell, offensive.empire)) continue;
    defending.troops *= remaining;
    if (defending.troops <= ENGINE_TUNING.progressEpsilon) removeOffensive(state, defending);
  }
}

function tileEffort(state: GameState, cell: HexCell): number {
  const mountain = isPassable(cell.terrain) ? 1 : ENGINE_TUNING.mountainClaimSeconds;
  return (terrainDefenceAt(state, cell) * mountain) / biomeSpeedAt(state, cell);
}

function tileCost(state: GameState, offensive: Offensive, cell: HexCell): number {
  const { wave } = state.config;
  const terrain = terrainDefenceAt(state, cell);
  if (offensive.target === NEUTRAL_OWNER) {
    const mountain = isPassable(cell.terrain) ? 1 : ENGINE_TUNING.mountainClaimSoldiers;
    return wave.neutralTroopsPerTile * terrain * mountain * biomeDefenceAt(state, cell);
  }
  const defender = state.empires[offensive.target]!;
  const density = defender.soldiers / Math.max(1, defender.hexCount);
  const held = Math.max(wave.minTroopsPerTile, density * wave.densityWeight);
  const defence = defencePowerAt(state, offensive.target, offensive.empire, cell).value;
  const attack = attackPowerAt(state, offensive.empire, cell).value;
  const share = state.empires[offensive.empire]!.hexCount / Math.max(1, state.landHexCount);
  const sprawl = isTotalWar(state) ? 1 : 1 + wave.sprawlCost * share;
  return ((held + (cell.building?.garrison ?? 0)) * defence * sprawl) / attack;
}

function bleedDefender(state: GameState, offensive: Offensive, spent: number): void {
  drawFromEncampments(state, offensive.target, offensive.head, spent * state.config.wave.defenderLossShare);
}

function takeTile(state: GameState, offensive: Offensive, cell: HexCell): void {
  setOwner(state, cell, offensive.empire);
  if (cell.building) {
    if (cell.building.kind === 'cannon' || cell.building.kind === 'battery') cell.building.cooldown = 0;
    cell.building.demolishAt = null;
    cell.building.garrison = 0;
    cell.building.shipBuild = 0;
  } else if (offensive.target !== NEUTRAL_OWNER) {
    advanceTank(state, cell, offensive.empire);
  }

  offensive.taken += 1;
  offensive.head = { q: cell.q, r: cell.r };
  offensive.recent.push(offensive.head);
  if (offensive.recent.length > ENGINE_TUNING.waveRecentTiles) offensive.recent.shift();

  for (const hex of neighbors(cell)) {
    const next = gridAt(state.grid, hex);
    if (next && canEnter(offensive, next)) enqueueTile(state, offensive, next);
  }
}

function advanceTank(state: GameState, cell: HexCell, owner: number): void {
  if (cell.terrain !== 'plain') return;
  for (const neighbour of neighbors(cell)) {
    const from = gridAt(state.grid, neighbour);
    const tank = from?.building;
    if (!from || from.owner !== owner || tank?.kind !== 'tank') continue;
    if (tank.buildRemaining > 0 || tank.demolishAt !== null) continue;
    setBuilding(state, from, null);
    setBuilding(state, cell, tank);
    return;
  }
}
