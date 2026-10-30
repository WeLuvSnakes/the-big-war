import type { EmpireId } from '../empire/empire.types';
import type { Building } from '../building/building.types';
import type { AxialGrid } from '@the-big-war/game-engine/world-tile/world-tile.types';

export type Terrain = 'plain' | 'forest' | 'mountain' | 'ore' | 'water';

export type Biome = 'temperate' | 'steppe' | 'desert' | 'tundra' | 'taiga' | 'jungle' | 'swamp' | 'volcanic';

export type MapPreset =
  | 'continents'
  | 'pangaea'
  | 'twin_continents'
  | 'archipelago'
  | 'inland_sea'
  | 'atoll_ring'
  | 'river_delta'
  | 'straits'
  | 'skull'
  | 'snake'
  | 'crescent';

export interface WorldLabels {
  readonly landmass: Int32Array;
  readonly waterBody: Int32Array;
  readonly landSizes: readonly number[];
  readonly waterSizes: readonly number[];
}

export interface HexCell {
  readonly q: number;
  readonly r: number;
  terrain: Terrain;
  readonly biome: Biome;

  owner: EmpireId;

  harvested?: number;
  building: Building | null;
}

export type HexGrid = AxialGrid<HexCell>;
