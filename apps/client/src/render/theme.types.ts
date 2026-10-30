import type { Terrain } from '../game/map/map.types';

export type ColorValue = number;

export type TerrainColorMap = Readonly<Partial<Record<Terrain, ColorValue>>>;

