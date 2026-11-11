import type { GameState } from '../../game/state/state.types';
import type { EmpireId } from '../../game/empire/empire.types';
import type { Building } from '../../game/building/building.types';
import type { Axial } from '@the-big-war/game-engine/world-tile/world-tile.types';
import { gridAt, neighbors } from '@the-big-war/game-engine/world-tile/world-tile.service';

export function buildingState(building: Building): string {
  const parts: string[] = [`L${building.level}`];
  if (building.kind === 'cannon' && building.cooldown > 0) {
    parts.push(`Reloading ${building.cooldown.toFixed(0)}s`);
  }
  if (building.kind === 'farm') parts.push(`+${Math.round(building.growth * 100)}%`);
  if (building.demolishAt !== null) parts.push('Demolish');
  return parts.join(' · ');
}

export function ownNeighbourCount(state: GameState, hex: Axial, player: EmpireId): number {
  return neighbors(hex).filter(candidate => gridAt(state.grid, candidate)?.owner === player).length;
}

