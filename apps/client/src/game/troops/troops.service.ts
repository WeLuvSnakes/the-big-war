import { troopsAtSea } from '../ship/ship.service';
import type { GameState } from '../state/state.types';
import type { EmpireId } from '../empire/empire.types';
import { ownedCells } from '../map/world-index.service';
import { garrisonedTroops } from '../trench/trench.service';
import { distance } from '@the-big-war/game-engine/world-tile/world-tile.service';
import type { Axial } from '@the-big-war/game-engine/world-tile/world-tile.types';

export function returnToReserve(state: GameState, empire: EmpireId, troops: number): void {
  const owner = state.empires[empire];
  if (!owner || !owner.alive || troops <= 0) return;
  owner.soldiers += troops;
}

export function deployedTroops(state: GameState, empire: EmpireId): number {
  let total = garrisonedTroops(state, empire);
  for (const offensive of state.offensives) if (offensive.empire === empire) total += offensive.troops;
  return total + troopsAtSea(state, empire);
}

export function nearestOwnedHex(state: GameState, empire: EmpireId, target: Axial): Axial | null {
  let best: Axial | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const cell of ownedCells(state, empire)) {
    const d = distance(cell, target);
    if (d < bestDistance) {
      bestDistance = d;
      best = { q: cell.q, r: cell.r };
    }
  }
  return best;
}
