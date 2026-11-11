import type { Unit } from '../unit/unit.types';
import type { HexCell } from '../map/map.types';
import type { GameState } from '../state/state.types';
import type { EmpireId } from '../empire/empire.types';
import type { Building } from '../building/building.types';
import { gridAt } from '@the-big-war/game-engine/world-tile/world-tile.service';
import type { Axial } from '@the-big-war/game-engine/world-tile/world-tile.types';

export function ownTrench(state: GameState, empire: EmpireId, hex: Axial): Building | null {
  const cell = gridAt(state.grid, hex);
  const building = cell?.building;
  if (!cell || cell.owner !== empire || !building || building.kind !== 'trench') return null;
  if (building.buildRemaining > 0 || building.demolishAt !== null) return null;
  return building;
}

export function trenchOccupants(state: GameState, cell: HexCell): Unit[] {
  const size = state.config.map.hexSize;
  return state.units.filter(
    unit => unit.empire === cell.owner && Math.floor(unit.x / size) === cell.q && Math.floor(unit.y / size) === cell.r,
  );
}

export function trenchSlot(state: GameState, hex: Axial, index: number): { x: number; y: number } {
  const size = state.config.map.hexSize;
  const capacity = state.config.trench.capacity;
  const angle = (index / capacity) * Math.PI * 2;
  const radius = size * 0.25;
  return { x: (hex.q + 0.5) * size + Math.cos(angle) * radius, y: (hex.r + 0.5) * size + Math.sin(angle) * radius };
}
