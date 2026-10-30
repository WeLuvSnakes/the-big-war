import type { HexCell } from '../../map/map.types';
import { ENGINE_TUNING } from '../simulation.constants';
import type { GameState } from '../../state/state.types';
import { NEUTRAL_OWNER } from '../../empire/empire.constants';
import { isTotalWar } from '../../diplomacy/diplomacy.service';
import type { Offensive } from '../../offensive/offensive.types';
import { setBuilding, setOwner } from '../../map/world-index.service';
import { heapPop } from '@the-big-war/game-engine/collections/min-heap.service';
import { attackPowerAt, defencePowerAt } from '../../offensive/wave-power.service';
import { gridAt, neighbors } from '@the-big-war/game-engine/world-tile/world-tile.service';
import { canEnter, endOffensive, enqueueTile, removeOffensive } from '../../offensive/offensive.service';
import { biomeDefenceAt, biomeSpeedAt, isPassable, terrainDefenceAt, tileScale } from '../../map/terrain.service';

export function stepOffensives(state: GameState, dt: number): void {
  for (const offensive of [...state.offensives]) {
    const empire = state.empires[offensive.empire];
    if (!empire || !empire.alive) {
      removeOffensive(state, offensive);
      continue;
    }
    if (offensive.target !== NEUTRAL_OWNER && !state.empires[offensive.target]?.alive) {
      endOffensive(state, offensive);
      continue;
    }
    advance(state, offensive, dt);
  }
}

function tilesPerSecond(state: GameState, offensive: Offensive): number {
  const { baseTilesPerSecond, tilesPerRootTroop } = state.config.wave;
  return (baseTilesPerSecond + tilesPerRootTroop * Math.sqrt(offensive.troops)) * tileScale(state);
}

function advance(state: GameState, offensive: Offensive, dt: number): void {
  offensive.budget += tilesPerSecond(state, offensive) * dt;
  while (offensive.budget >= 1) {
    if (offensive.troops <= 0) {
      removeOffensive(state, offensive);
      return;
    }
    const index = heapPop(offensive.frontier);
    if (index === undefined) {
      endOffensive(state, offensive);
      return;
    }
    const cell = state.grid.cells[index]!;
    if (cell.owner !== offensive.target) continue;
    offensive.budget -= tileEffort(state, cell);
    const cost = tileCost(state, offensive, cell);
    if (cost > offensive.troops) {
      bleedDefender(state, offensive, offensive.troops);
      removeOffensive(state, offensive);
      return;
    }
    offensive.troops -= cost;
    bleedDefender(state, offensive, cost);
    takeTile(state, offensive, cell);
  }
  if (offensive.troops <= 0) removeOffensive(state, offensive);
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
  const defender = state.empires[offensive.target];
  if (!defender) return;
  defender.soldiers = Math.max(0, defender.soldiers - spent * state.config.wave.defenderLossShare);
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
