import type { HexCell } from '../map/map.types';
import type { GameState } from '../state/state.types';
import type { EmpireId } from '../empire/empire.types';
import { NEUTRAL_OWNER } from '../empire/empire.constants';
import { returnToReserve } from '../troops/troops.service';
import { shellingFactor } from '../building/building.service';
import { isClaimable, isPassable } from '../map/terrain.service';
import { ENGINE_TUNING } from '../simulation/simulation.constants';
import type { Offensive, OffensiveMarch } from './offensive.types';
import { buildingCellsOf, ownedCells } from '../map/world-index.service';
import type { Axial } from '@the-big-war/game-engine/world-tile/world-tile.types';
import { createMinHeap, heapClear, heapPush } from '@the-big-war/game-engine/collections/min-heap.service';
import { distance, gridIndex, neighbors, gridAt } from '@the-big-war/game-engine/world-tile/world-tile.service';

function tileJitter(index: number): number {
  const mixed = Math.imul(index ^ (index >>> 7), 2654435761) >>> 24;
  return (mixed / 255) * ENGINE_TUNING.waveJitter;
}

export function enqueueTile(state: GameState, offensive: Offensive, cell: HexCell): void {
  const index = gridIndex(state.grid, cell.q, cell.r);
  if (offensive.queued.has(index)) return;
  offensive.queued.add(index);
  offensive.order += 1;
  const pull = distance(cell, offensive.focus) * ENGINE_TUNING.waveFocusPull;
  heapPush(offensive.frontier, index, offensive.order + pull + tileJitter(index));
}

export function canEnter(offensive: Offensive, cell: HexCell): boolean {
  if (cell.owner !== offensive.target || !isClaimable(cell.terrain)) return false;
  if (offensive.target !== NEUTRAL_OWNER || isPassable(cell.terrain)) return true;
  return cell.q === offensive.focus.q && cell.r === offensive.focus.r;
}

function seedFrontier(state: GameState, offensive: Offensive): void {
  heapClear(offensive.frontier);
  offensive.queued.clear();
  offensive.order = 0;
  for (const cell of ownedCells(state, offensive.empire)) {
    for (const hex of neighbors(cell)) {
      const next = gridAt(state.grid, hex);
      if (next && canEnter(offensive, next)) enqueueTile(state, offensive, next);
    }
  }
}

export function bordersOwner(state: GameState, empire: EmpireId, owner: EmpireId, landmass?: number): boolean {
  for (const cell of ownedCells(state, empire)) {
    for (const hex of neighbors(cell)) {
      const next = gridAt(state.grid, hex);
      if (!next || next.owner !== owner || !isClaimable(next.terrain)) continue;
      if (landmass === undefined || state.map.landmass[gridIndex(state.grid, hex.q, hex.r)] === landmass) return true;
    }
  }
  return false;
}

function cancelOpposing(state: GameState, empire: EmpireId, target: EmpireId, troops: number): number {
  let remaining = troops;
  for (const opposing of state.offensives) {
    if (opposing.empire !== target || opposing.target !== empire || remaining <= 0) continue;
    const spent = Math.min(remaining, opposing.troops);
    opposing.troops -= spent;
    remaining -= spent;
  }
  return remaining;
}

function newOffensive(state: GameState, empire: EmpireId, target: EmpireId, focus: Axial, troops: number): Offensive {
  return {
    id: state.nextOffensiveId++,
    empire,
    target,
    troops,
    focus: { q: focus.q, r: focus.r },
    head: { q: focus.q, r: focus.r },
    march: null,
    budget: 0,
    order: 0,
    taken: 0,
    frontier: createMinHeap(),
    queued: new Set(),
    recent: [],
  };
}

export function launchOffensive(
  state: GameState,
  empire: EmpireId,
  target: EmpireId,
  focus: Axial,
  troops: number,
): boolean {
  const aimed = gridAt(state.grid, focus);
  if (!aimed || !isClaimable(aimed.terrain)) return false;
  const landmass = target === NEUTRAL_OWNER ? state.map.landmass[gridIndex(state.grid, focus.q, focus.r)] : undefined;
  if (!bordersOwner(state, empire, target, landmass)) return false;
  const remaining = cancelOpposing(state, empire, target, troops);
  const existing = state.offensives.find(item => item.empire === empire && item.target === target);
  if (existing) {
    existing.troops += remaining;
    existing.focus = { q: focus.q, r: focus.r };
    seedFrontier(state, existing);
    return true;
  }
  if (remaining <= 0) return true;
  const offensive = newOffensive(state, empire, target, focus, remaining);
  seedFrontier(state, offensive);
  offensive.march = planMarch(state, offensive);
  state.offensives.push(offensive);
  return true;
}

function planMarch(state: GameState, offensive: Offensive): OffensiveMarch | null {
  const from = nearestBy(buildingCellsOf(state, offensive.empire), offensive.focus);
  const entry = nearestBy([...offensive.queued].map(at => state.grid.cells[at]!), offensive.focus);
  if (!from || !entry) return null;
  const { marchSecondsPerHex, maxMarchSeconds } = state.config.wave;
  const duration = Math.min(maxMarchSeconds, distance(from, entry) * marchSecondsPerHex);
  if (duration <= 0) return null;
  const start = { q: from.q, r: from.r };
  offensive.head = start;
  offensive.recent.push(start);
  return { from: start, to: { q: entry.q, r: entry.r }, duration, progress: 0 };
}

function nearestBy(cells: Iterable<HexCell>, to: Axial): HexCell | null {
  let best: HexCell | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const cell of cells) {
    const d = distance(cell, to);
    if (d < bestDistance) {
      best = cell;
      bestDistance = d;
    }
  }
  return best;
}

export function launchBeachhead(state: GameState, empire: EmpireId, beach: HexCell, focus: Axial, troops: number): void {
  const target = beach.owner;
  const remaining = cancelOpposing(state, empire, target, troops);
  if (remaining <= 0) return;
  let offensive = state.offensives.find(item => item.empire === empire && item.target === target);
  if (offensive) offensive.troops += remaining;
  else {
    offensive = newOffensive(state, empire, target, focus, remaining);
    state.offensives.push(offensive);
  }
  offensive.focus = { q: focus.q, r: focus.r };
  offensive.head = { q: beach.q, r: beach.r };
  const index = gridIndex(state.grid, beach.q, beach.r);
  offensive.queued.add(index);
  heapPush(offensive.frontier, index, -Infinity);
}

export function removeOffensive(state: GameState, offensive: Offensive): void {
  const index = state.offensives.indexOf(offensive);
  if (index >= 0) state.offensives.splice(index, 1);
}

export function endOffensive(state: GameState, offensive: Offensive): void {
  returnToReserve(state, offensive.empire, offensive.troops);
  offensive.troops = 0;
  removeOffensive(state, offensive);
}

export function endOffensivesBetween(state: GameState, a: EmpireId, b: EmpireId): void {
  for (const offensive of [...state.offensives]) {
    const connects =
      (offensive.empire === a && offensive.target === b) || (offensive.empire === b && offensive.target === a);
    if (connects) endOffensive(state, offensive);
  }
}

export function troopsCommittedAgainst(state: GameState, attacker: EmpireId, defender: EmpireId): number {
  let total = 0;
  for (const offensive of state.offensives) {
    if (offensive.empire === attacker && offensive.target === defender) total += offensive.troops;
  }
  return total;
}

export function shellOffensives(state: GameState, shooter: EmpireId, at: Axial, radius: number, damage: number): void {
  for (const offensive of state.offensives) {
    if (offensive.empire === shooter || distance(offensive.head, at) > radius) continue;
    const owner = gridAt(state.grid, offensive.head)?.owner ?? offensive.empire;
    offensive.troops = Math.max(0, offensive.troops - damage * shellingFactor(state, owner, offensive.head));
  }
}
