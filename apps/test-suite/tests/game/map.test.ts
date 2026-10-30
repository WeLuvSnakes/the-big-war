import { describe, expect, test } from 'bun:test';
import { isWater } from '@the-big-war/client/game/map/terrain.service';
import type { MapPreset } from '@the-big-war/client/game/map/map.types';
import { flood } from '@the-big-war/client/game/map/world-labels.service';
import { isPortSite } from '@the-big-war/client/game/map/port-site.service';
import { setOwner } from '@the-big-war/client/game/map/world-index.service';
import { MAP_MASKS } from '@the-big-war/client/game/map/map-masks.constants';
import { dispatch } from '@the-big-war/client/game/commands/commands.service';
import { MAP_PRESET_ORDER } from '@the-big-war/client/game/map/map.constants';
import { createInitialState } from '@the-big-war/client/game/state/setup.service';
import { reachableEmpires } from '@the-big-war/client/game/bot/bot-queries.service';
import { createNoise, sampleFbm } from '@the-big-war/game-engine/noise/noise.service';
import { DEFAULT_GAME_CONFIG } from '@the-big-war/client/game/config/config.constants';
import { checkWinConditions } from '@the-big-war/client/game/simulation/systems/victory.system';
import { gridAt, gridIndex, neighbors } from '@the-big-war/game-engine/world-tile/world-tile.service';

const world = (preset: MapPreset, seed: number, width = 120, height = 72, empireCount = 6) =>
  createInitialState({
    ...DEFAULT_GAME_CONFIG,
    map: { ...DEFAULT_GAME_CONFIG.map, preset, seed, width, height },
    start: { ...DEFAULT_GAME_CONFIG.start, empireCount, neutralStates: 3 },
  });

describe('noise', () => {
  test('is seeded and stays in unit range', () => {
    const a = createNoise(5);
    const b = createNoise(5);
    for (let i = 0; i < 500; i++) {
      const value = sampleFbm(a, i * 0.37, i * 0.11, 4);
      expect(value).toBe(sampleFbm(b, i * 0.37, i * 0.11, 4));
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });
});

describe('map generation', () => {
  test('masks are rectangular', () => {
    for (const rows of Object.values(MAP_MASKS)) {
      expect(new Set(rows.map(row => row.length)).size).toBe(1);
    }
  });

  for (const preset of MAP_PRESET_ORDER) {
    test(`${preset}: land share, ports, reachability, connected land`, () => {
      for (let seed = 1; seed <= 12; seed++) {
        const state = world(preset, seed * 31);
        const { grid, map } = state;
        const share = state.landHexCount / grid.cells.length;
        expect(share).toBeGreaterThan(0.15);
        expect(share).toBeLessThan(0.75);
        expect(state.landHexCount).toBe(grid.cells.filter(cell => !isWater(cell.terrain)).length);

        const contenders = state.empires.filter(empire => !empire.neutralState);
        const shores = contenders.map(empire => {
          const owned = grid.cells.filter(cell => cell.owner === empire.id);
          expect(owned.length).toBeGreaterThan(0);
          expect(owned.every(cell => !isWater(cell.terrain))).toBe(true);
          expect(owned.some(cell => isPortSite(grid, map, cell) && cell.terrain === 'plain')).toBe(true);
          return empire.id;
        });
        for (const id of shores) expect(reachableEmpires(state, id).size).toBeGreaterThan(0);

        const open = (at: number) => !isWater(grid.cells[at]!.terrain) && grid.cells[at]!.terrain !== 'mountain';
        const pockets = flood(grid.width, grid.height, open);
        const perMass = new Map<number, Set<number>>();
        pockets.labels.forEach((pocket, at) => {
          if (pocket === -1) return;
          const mass = map.landmass[at]!;
          perMass.set(mass, (perMass.get(mass) ?? new Set()).add(pocket));
        });
        for (const seen of perMass.values()) expect(seen.size).toBe(1);
      }
    });
  }

  test('labels agree with terrain', () => {
    const { grid, map } = world('continents', 9);
    grid.cells.forEach((cell, at) => {
      if (isWater(cell.terrain)) {
        expect(map.landmass[at]).toBe(-1);
        expect(map.waterBody[at]).toBeGreaterThanOrEqual(0);
      } else {
        expect(map.landmass[at]).toBeGreaterThanOrEqual(0);
      }
    });
  });

  test('rivers get fords that both ships and waves can use', () => {
    const { map } = world('pangaea', 4, 240, 140);
    let fords = 0;
    for (let at = 0; at < map.landmass.length; at++) if (map.landmass[at]! >= 0 && map.waterBody[at]! >= 0) fords += 1;
    expect(fords).toBeGreaterThan(0);
  });

  test('mountains never stand alone and biomes vary', () => {
    const biomes = new Set<string>();
    for (const preset of MAP_PRESET_ORDER) {
      const state = world(preset, 77, 240, 140);
      for (const cell of state.grid.cells) {
        if (!isWater(cell.terrain)) biomes.add(cell.biome);
        if (cell.terrain !== 'mountain') continue;
        const near = neighbors(cell).some(hex => gridAt(state.grid, hex)?.terrain === 'mountain');
        if (cell.owner === -1) expect(near).toBe(true);
      }
    }
    expect(biomes.size).toBeGreaterThanOrEqual(7);
  });

  test('ore is rare but present', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const state = world('pangaea', seed, 72, 42, 4);
      const ore = state.grid.cells.filter(cell => cell.terrain === 'ore').length;
      expect(ore).toBeGreaterThan(0);
      expect(ore / state.grid.cells.length).toBeLessThan(0.02);
    }
  });

  test('World size generates under 2s and stays near linear in area', () => {
    const timed = (width: number, height: number) => {
      const start = performance.now();
      world('archipelago', 3, width, height, 16);
      return performance.now() - start;
    };
    timed(120, 72);
    const small = timed(120, 72);
    const large = timed(500, 300);
    expect(large).toBeLessThan(2000);
    expect(large / Math.max(1, small)).toBeLessThan(((500 * 300) / (120 * 72)) * 3);
  });
});

describe('water rules', () => {
  test('waves refuse water and unreachable islands', () => {
    const state = world('archipelago', 8);
    const water = state.grid.cells.find(cell => isWater(cell.terrain))!;
    state.empires[0]!.soldiers = 50;
    const result = dispatch(state, { type: 'SendTroops', empire: 0, target: { q: water.q, r: water.r }, percent: 50 });
    expect(result.ok).toBe(false);
    expect(state.offensives.length).toBe(0);

    const home = state.grid.cells.find(cell => cell.owner === 0)!;
    const mine = state.map.landmass[gridIndex(state.grid, home.q, home.r)];
    const away = state.grid.cells.find(
      cell => cell.owner === -1 && !isWater(cell.terrain) && state.map.landmass[gridIndex(state.grid, cell.q, cell.r)] !== mine,
    );
    if (away) {
      expect(dispatch(state, { type: 'SendTroops', empire: 0, target: { q: away.q, r: away.r }, percent: 50 }).ok).toBe(false);
    }
  });

  test('holding 80% of land wins by domination', () => {
    const state = world('pangaea', 2, 72, 42, 2);
    const land = state.grid.cells.filter(cell => !isWater(cell.terrain));
    for (const cell of land.slice(0, Math.ceil(land.length * 0.85))) if (cell.owner === -1) setOwner(state, cell, 0);
    checkWinConditions(state);
    expect(state.status).toBe('ended');
    expect(state.endReason).toBe('domination');
  });
});
