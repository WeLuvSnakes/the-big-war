import type { Biome, MapPreset, Terrain } from './map.types';

export const TERRAINS: readonly Terrain[] = ['plain', 'forest', 'mountain', 'ore', 'water'];

export const BIOMES: readonly Biome[] = ['temperate', 'steppe', 'desert', 'tundra', 'taiga', 'jungle', 'swamp', 'volcanic'];

export const MAP_PRESET_ORDER: readonly MapPreset[] = [
  'continents',
  'pangaea',
  'twin_continents',
  'archipelago',
  'inland_sea',
  'atoll_ring',
  'river_delta',
  'straits',
  'skull',
  'snake',
  'crescent',
];

export const MAP_PRESET_LABELS: Readonly<Record<MapPreset, string>> = {
  continents: 'Continents',
  pangaea: 'Pangaea',
  twin_continents: 'Twin Continents',
  archipelago: 'Archipelago',
  inland_sea: 'Inland Sea',
  atoll_ring: 'Atoll Ring',
  river_delta: 'River Delta',
  straits: 'Straits',
  skull: 'Skull',
  snake: 'Snake',
  crescent: 'Crescent',
};

export const FOREST_SHARE: Readonly<Record<Biome, number>> = {
  temperate: 0.14,
  steppe: 0.02,
  desert: 0,
  tundra: 0.02,
  taiga: 0.45,
  jungle: 0.5,
  swamp: 0.15,
  volcanic: 0,
};

export const ORE_RICHNESS: Readonly<Record<Biome, number>> = {
  temperate: 0.35,
  steppe: 0.35,
  desert: 1,
  tundra: 0.35,
  taiga: 0.35,
  jungle: 0.35,
  swamp: 0.2,
  volcanic: 1,
};

export const MAP_SHAPE = {
  edgeMargin: 0.06,
  warpFrequency: 4,
  warpAmount: 0.09,
  elevationFrequency: 5,
  elevationNoise: 0.3,

  minIslandTiles: 6,
  minLakeTiles: 6,

  riversPerKiloTile: 0.5,
  riverMinLength: 8,
  riverSourceHeight: 0.25,
  fordSpacing: 18,

  mountainShare: 0.09,
  ridgeWavelength: 22,
  volcanicThreshold: 0.73,
  climateFrequency: 4,
  forestWavelength: 9,

  oreDepositsPerKiloTile: 2,
  oreSpacing: 12,
  oreMinSize: 1,
  oreMaxSize: 3,

  portMinWater: 12,
  minStartLand: 10,
  minCapitalLandmass: 60,
  capitalSamples: 48,
} as const;
