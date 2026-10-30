import type { ShipId } from '../game/ship/ship.types';
import type { BuildingKind } from '../game/building/building.types';
import type { Axial } from '@the-big-war/game-engine/world-tile/world-tile.types';

export interface PlacementGhost {
  readonly hex: Axial;
  readonly kind: BuildingKind;
  readonly valid: boolean;
}

export interface SpawnPlot {
  readonly hex: Axial;
  readonly color: number;
  readonly own: boolean;
}

export interface OverlayState {
  
  selected: Axial | null;
  
  hovered: Axial | null;
  
  cannonFrom: Axial | null;
  
  cannonRange: number;
  
  cannonTarget: Axial | null;

  ghost: PlacementGhost | null;

  spawnPlots: readonly SpawnPlot[];

  selectedShip: ShipId | null;
}
