import type { GameState } from './state.types';
import { createBaseState } from './state.service';
import type { Empire } from '../empire/empire.types';
import { createEmpire } from '../empire/empire.service';
import { NATION_NAMES } from '../names/names.constants';
import type { GameConfig } from '../config/config.types';
import { NEUTRAL_OWNER } from '../empire/empire.constants';
import { createBuilding } from '../building/building.service';
import type { BuildingKind } from '../building/building.types';
import { DEFAULT_GAME_CONFIG } from '../config/config.constants';
import type { HexCell, HexGrid, Terrain } from '../map/map.types';
import type { Rng } from '@the-big-war/game-engine/rng/rng.types';
import { clamp } from '@the-big-war/game-engine/math/math.service';
import { setBuilding, setOwner } from '../map/world-index.service';
import type { Axial } from '@the-big-war/game-engine/world-tile/world-tile.types';
import { createRng, nextFloat, nextInt } from '@the-big-war/game-engine/rng/rng.service';
import { area, makeGrid, gridIndex } from '@the-big-war/game-engine/world-tile/world-tile.service';

const DEV_FACTIONS = ['ironclad', 'league', 'verdant', 'academy'];

function devTerrain(rng: Rng): Terrain {
  const roll = nextFloat(rng);
  if (roll < 0.22) return 'forest';
  if (roll < 0.32) return 'mountain';
  return 'plain';
}

function devEmpires(config: GameConfig): Empire[] {
  const empires: Empire[] = [];
  for (let id = 0; id < config.start.empireCount; id++) {
    empires.push(
      createEmpire(config, {
        id,
        name: id === 0 ? 'You' : (NATION_NAMES[id] ?? `Empire ${id}`),
        factionId: DEV_FACTIONS[id % DEV_FACTIONS.length]!,
        isHuman: id === 0,
        neutralState: false,
      }),
    );
  }
  return empires;
}

function capitalFor(state: GameState, id: number): Axial {
  const cx = Math.floor(state.grid.width / 2);
  const cy = Math.floor(state.grid.height / 2);
  const count = state.empires.length;
  const angle = (2 * Math.PI * id) / Math.max(1, count);
  const radius = Math.floor(Math.min(state.grid.width, state.grid.height) * 0.3);
  const q = Math.round(cx + radius * Math.cos(angle));
  const r = Math.round(cy + radius * Math.sin(angle));
  return {
    q: clamp(q, 1, state.grid.width - 2),
    r: clamp(r, 1, state.grid.height - 2),
  };
}

function cellAt(grid: HexGrid, hex: Axial): HexCell | undefined {
  return grid.cells[gridIndex(grid, hex.q, hex.r)];
}

function seedCapitals(state: GameState, rng: Rng): void {
  const grid = state.grid;
  const build = (cell: HexCell, kind: BuildingKind, level = 1): void => {
    setBuilding(state, cell, createBuilding(state, kind, level, 0));
  };

  for (const empire of state.empires) {
    const capital = capitalFor(state, empire.id);
    for (const hex of area(capital, 2)) {
      const cell = cellAt(grid, hex);
      if (!cell) continue;
      setOwner(state, cell, empire.id);
    }
    const capCell = cellAt(grid, capital);
    if (!capCell || capCell.owner !== empire.id) continue;
    build(capCell, 'city', empire.id === 0 ? 2 : 1);
    const near = area(capital, 1).filter(h => {
      const c = cellAt(grid, h);
      return c && c.owner === empire.id && c.building === null;
    });
    if (near[0]) build(cellAt(grid, near[0])!, 'market');
    if (near[1]) build(cellAt(grid, near[1])!, nextInt(rng, 2) === 0 ? 'farm' : 'barracks');
  }
}

export function createDevState(config: GameConfig = DEFAULT_GAME_CONFIG): GameState {
  const rng = createRng(config.map.seed);
  const grid = makeGrid<HexCell>(config.map.width, config.map.height, hex => ({
    q: hex.q,
    r: hex.r,
    terrain: devTerrain(rng),
    biome: 'temperate',
    owner: NEUTRAL_OWNER,
    building: null,
  }));

  const state = createBaseState(config, grid, devEmpires(config));
  seedCapitals(state, rng);

  for (const empire of state.empires) {
    empire.hexCount = grid.cells.filter(cell => cell.owner === empire.id).length;
  }

  return state;
}
