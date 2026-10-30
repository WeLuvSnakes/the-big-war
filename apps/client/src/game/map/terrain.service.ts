import type { GameState } from '../state/state.types';
import type { Biome, HexCell, Terrain } from './map.types';
import { ENGINE_TUNING } from '../simulation/simulation.constants';
import { gridAt } from '@the-big-war/game-engine/world-tile/world-tile.service';
import type { Axial } from '@the-big-war/game-engine/world-tile/world-tile.types';

const REFERENCE_MAP_TILES = 3024;

export function terrainAt(state: GameState, hex: Axial): Terrain {
  return gridAt(state.grid, hex)?.terrain ?? 'plain';
}

export function mapTileScale(width: number, height: number): number {
  return Math.sqrt((width * height) / REFERENCE_MAP_TILES);
}

export function tileScale(state: GameState): number {
  return mapTileScale(state.grid.width, state.grid.height);
}

export function isWater(terrain: Terrain): boolean {
  return terrain === 'water';
}

export function isClaimable(terrain: Terrain): boolean {
  return terrain !== 'water';
}

export function biomeDefenceAt(state: GameState, cell: HexCell): number {
  return state.config.biomes[cell.biome]?.defence ?? 1;
}

export function biomeSpeedAt(state: GameState, cell: HexCell): number {
  return state.config.biomes[cell.biome]?.speed ?? 1;
}

const BIOME_LABELS: Readonly<Record<Biome, string>> = {
  temperate: 'Temperate',
  steppe: 'Steppe',
  desert: 'Desert',
  tundra: 'Tundra',
  taiga: 'Taiga',
  jungle: 'Jungle',
  swamp: 'Swamp',
  volcanic: 'Volcanic',
};

export function biomeLabel(biome: Biome): string {
  return BIOME_LABELS[biome];
}

export function isPassable(terrain: Terrain): boolean {
  return terrain !== 'mountain';
}

export function terrainDefenceAt(state: GameState, hex: Axial): number {
  return state.config.combat.terrainDefence[terrainAt(state, hex)] ?? ENGINE_TUNING.defaultTerrainDefence;
}

export function terrainLabel(terrain: Terrain): string {
  switch (terrain) {
    case 'forest':
      return 'Forest';
    case 'mountain':
      return 'Mountain';
    case 'ore':
      return 'Ore';
    case 'water':
      return 'Water';
    default:
      return 'Plain';
  }
}
