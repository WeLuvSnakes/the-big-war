import type { GameState } from './state.types';
import { isClaimable } from '../map/terrain.service';
import type { Empire } from '../empire/empire.types';
import { labelWorld } from '../map/world-labels.service';
import type { GameConfig } from '../config/config.types';
import type { HexGrid, WorldLabels } from '../map/map.types';
import { createWorldIndex } from '../map/world-index.service';
import { createRng } from '@the-big-war/game-engine/rng/rng.service';

export function createBaseState(config: GameConfig, grid: HexGrid, empires: Empire[], map: WorldLabels = labelWorld(grid)): GameState {
  return {
    config,
    status: 'playing',
    playerEmpire: 0,
    grid,
    map,
    index: createWorldIndex(grid, config.biomes),
    empires,
    offensives: [],
    nextOffensiveId: 1,
    ships: [],
    nextShipId: 1,
    shipHash: new Map(),
    tradeClock: 0,
    spawnSites: [],
    landHexCount: grid.cells.filter(cell => isClaimable(cell.terrain)).length,
    elapsed: 0,
    tick: 0,
    speed: 1,
    rng: createRng(config.map.seed ^ 0x5eed),
    winner: null,
    endReason: null,
    nextBuildingId: 1,
    relations: {},
    offerCooldowns: {},
    pendingOffers: [],
    agentAccumulator: 0,
  };
}
