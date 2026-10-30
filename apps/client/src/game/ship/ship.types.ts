import type { EmpireId } from '../empire/empire.types';
import type { BuildingId } from '../building/building.types';
import type { Axial } from '@the-big-war/game-engine/world-tile/world-tile.types';

export type ShipId = number;

export type ShipKind = 'transport' | 'battleship' | 'trade';

export interface Ship {
  readonly id: ShipId;
  readonly kind: ShipKind;
  readonly empire: EmpireId;
  readonly homePort: BuildingId;

  hp: number;

  pos: Axial;
  next: Axial | null;
  progress: number;

  path: number[];
  pathAt: number;

  cooldown: number;

  troops: number;
  beach: Axial | null;
  focus: Axial | null;

  destination: Axial | null;
  routeTiles: number;
}

export interface CoastTile {
  readonly beach: number;
  readonly water: number;
  readonly body: number;
}

export interface SeaIndex {
  readonly regionOf: Int32Array;
  readonly centres: readonly Axial[];
  readonly links: readonly (readonly number[])[];
  readonly coastByBody: ReadonlyMap<number, readonly CoastTile[]>;
  readonly coastByLandmass: ReadonlyMap<number, readonly CoastTile[]>;
}

export interface LandingPlan {
  readonly port: Axial;
  readonly coast: CoastTile;
  readonly route: number[];
}
