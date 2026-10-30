import { isClaimable } from '@the-big-war/client/game/map/terrain.service';
import type { GameState } from '@the-big-war/client/game/state/state.types';
import type { Axial } from '@the-big-war/game-engine/world-tile/world-tile.types';
import { gridAt, neighbors } from '@the-big-war/game-engine/world-tile/world-tile.service';

export function foreignTarget(state: GameState): Axial | null {
  for (const cell of state.grid.cells) {
    if (cell.owner !== state.playerEmpire) continue;
    for (const hex of neighbors(cell)) {
      const next = gridAt(state.grid, hex);
      if (next && next.owner !== state.playerEmpire && isClaimable(next.terrain)) return hex;
    }
  }
  return null;
}
