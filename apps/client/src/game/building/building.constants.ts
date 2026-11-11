import type { Terrain } from '../map/map.types';
import type { BuildingKind } from './building.types';

export const BUILDING_KINDS: readonly BuildingKind[] = [
  'city',
  'market',
  'farm',
  'lumberjack',
  'miner',
  'lab',
  'barracks',
  'factory',
  'port',
  'fishery',
  'cannon',
  'trench',
  'battery',
];

export const PRODUCTION_BUILDINGS: ReadonlySet<BuildingKind> = new Set<BuildingKind>([
  'market',
  'lumberjack',
  'miner',
  'lab',
  'farm',
  'fishery',
]);

export const FLAT_COST_BUILDINGS: ReadonlySet<BuildingKind> = new Set<BuildingKind>(['trench']);

export const GATHERED_TERRAIN: Readonly<Partial<Record<BuildingKind, Terrain>>> = {
  lumberjack: 'forest',
  miner: 'ore',
};

export const CLEARS_TERRAIN: Readonly<Partial<Record<BuildingKind, Terrain>>> = {
  lumberjack: 'forest',
};
