import { ensureFront } from '../front/front.service';
import type { GameState } from '../state/state.types';
import type { EmpireId } from '../empire/empire.types';
import { NEUTRAL_OWNER } from '../empire/empire.constants';
import { garrisonedTroops } from '../trench/trench.service';
import type { BuildingKind } from '../building/building.types';
import { isPassable, passableAt } from '../map/terrain.service';
import type { Axial } from '@the-big-war/game-engine/world-tile/world-tile.types';
import { distance, gridAt, gridInBounds, neighbors, gridIndex } from '@the-big-war/game-engine/world-tile/world-tile.service';

export function launchExpedition(
  state: GameState,
  empire: EmpireId,
  target: Axial,
  troops: number,
  origin: Axial | null = null,
): void {
  const targetIndex = gridIndex(state.grid, target.q, target.r);
  const existing = state.expeditions.find(
    expedition => expedition.empire === empire && expedition.region.includes(targetIndex),
  );
  if (existing) {
    existing.troops += troops;
    existing.target = { q: target.q, r: target.r };
    return;
  }
  const region = wildRegion(state, target, empire);
  if (region.length === 0) {
    returnToReserve(state, empire, troops);
    return;
  }
  const start = origin ?? stagingHex(state, empire, target) ?? nearestOwnedHex(state, empire, target) ?? target;
  state.expeditions.push({
    empire,
    target: { q: target.q, r: target.r },
    troops,
    region,
    origin: { q: start.q, r: start.r },
    squads: [],
  });
}

export function wildRegion(state: GameState, start: Axial, empire: EmpireId): number[] {
  const { grid } = state;
  const startIndex = gridIndex(grid, start.q, start.r);
  const seen = new Set<number>([startIndex]);
  const queue: Axial[] = [start];
  const region: number[] = [];
  while (queue.length > 0) {
    const hex = queue.pop()!;
    const index = gridIndex(grid, hex.q, hex.r);
    const cell = gridAt(grid, hex);
    if (!cell || !isPassable(cell.terrain)) continue;
    const wild = cell.owner === NEUTRAL_OWNER;
    if (!wild && cell.owner !== empire && index !== startIndex) continue;
    if (wild) region.push(index);
    for (const next of neighbors(hex)) {
      if (!gridInBounds(grid, next.q, next.r)) continue;
      const nextIndex = gridIndex(grid, next.q, next.r);
      if (seen.has(nextIndex)) continue;
      seen.add(nextIndex);
      queue.push(next);
    }
  }
  return region;
}

export function joinFront(
  state: GameState,
  empire: EmpireId,
  hex: Axial,
  target: Axial,
  troops: number,
  intent: 'attack' | 'defence',
): boolean {
  const front = ensureFront(state, hex, target);
  const isSideA = front.hexA.q === hex.q && front.hexA.r === hex.r;
  const side = isSideA ? front.sideA : front.sideB;
  if (side.empire !== empire) return false;
  side.troops += troops;
  side.mode = intent;
  front.lastAttackAt = state.elapsed;
  return true;
}

export function returnToReserve(state: GameState, empire: EmpireId, troops: number): void {
  const owner = state.empires[empire];
  if (!owner || !owner.alive || troops <= 0) return;
  owner.soldiers += troops;
}

export function deployedTroops(state: GameState, empire: EmpireId): number {
  let total = 0;
  for (const expedition of state.expeditions) {
    if (expedition.empire !== empire) continue;
    total += expedition.troops;
    for (const squad of expedition.squads) total += squad.troops;
  }
  for (const column of state.columns) if (column.empire === empire) total += column.troops;
  total += garrisonedTroops(state, empire);
  for (const front of state.fronts) {
    if (front.sideA.empire === empire) total += front.sideA.troops;
    if (front.sideB.empire === empire) total += front.sideB.troops;
  }
  return total;
}

export function nearestOwnedHex(state: GameState, empire: EmpireId, target: Axial): Axial | null {
  let best: Axial | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const cell of state.grid.cells) {
    if (cell.owner !== empire) continue;
    const d = distance(cell, target);
    if (d < bestDistance) {
      bestDistance = d;
      best = { q: cell.q, r: cell.r };
    }
  }
  return best;
}

const STAGING_KINDS: ReadonlySet<BuildingKind> = new Set(['city', 'barracks', 'fort']);

export function stagingHex(state: GameState, empire: EmpireId, target: Axial): Axial | null {
  let best: Axial | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const cell of state.grid.cells) {
    if (cell.owner !== empire || !cell.building || cell.building.buildRemaining > 0) continue;
    if (!STAGING_KINDS.has(cell.building.kind)) continue;
    const d = distance(cell, target);
    if (d < bestDistance) {
      bestDistance = d;
      best = { q: cell.q, r: cell.r };
    }
  }
  return best;
}

function ownedPath(state: GameState, empire: EmpireId, from: Axial, to: Axial): Axial[] | null {
  const { grid } = state;
  const key = (hex: Axial) => gridIndex(grid, hex.q, hex.r);
  const goal = key(to);
  const previous = new Map<number, Axial | null>([[key(from), null]]);
  const queue: Axial[] = [from];
  for (let head = 0; head < queue.length; head++) {
    const hex = queue[head]!;
    if (key(hex) === goal) {
      const path: Axial[] = [];
      for (let at: Axial | null = hex; at; at = previous.get(key(at))!) path.push({ q: at.q, r: at.r });
      return path.reverse();
    }
    for (const next of neighbors(hex)) {
      if (!gridInBounds(grid, next.q, next.r) || previous.has(key(next))) continue;
      if (gridAt(grid, next)?.owner !== empire) continue;
      previous.set(key(next), hex);
      queue.push(next);
    }
  }
  return null;
}

export function marchPath(state: GameState, empire: EmpireId, target: Axial, border: Axial | null = null): Axial[] | null {
  const outward = passablePath(state, empire, target, border);
  if (!outward) return null;
  const staging = stagingHex(state, empire, target);
  const inward = staging ? ownedPath(state, empire, staging, outward[0]!) : null;
  const path = inward ? [...inward, ...outward.slice(1)] : outward;
  return path.length >= 2 ? path : null;
}

function passablePath(state: GameState, empire: EmpireId, target: Axial, border: Axial | null): Axial[] | null {
  const { grid } = state;
  const key = (hex: Axial) => gridIndex(grid, hex.q, hex.r);
  const towardTarget = new Map<number, Axial | null>([[key(target), null]]);
  const queue: Axial[] = [target];
  for (let head = 0; head < queue.length; head++) {
    const hex = queue[head]!;
    const reached = border ? hex.q === border.q && hex.r === border.r : gridAt(grid, hex)?.owner === empire;
    if (reached) {
      const path: Axial[] = [];
      for (let at: Axial | null = hex; at; at = towardTarget.get(key(at))!) path.push({ q: at.q, r: at.r });
      return path;
    }
    for (const next of neighbors(hex)) {
      if (!gridInBounds(grid, next.q, next.r) || towardTarget.has(key(next))) continue;
      if (!passableAt(state, next) && gridAt(grid, next)?.owner !== empire) continue;
      towardTarget.set(key(next), hex);
      queue.push(next);
    }
  }
  return null;
}
