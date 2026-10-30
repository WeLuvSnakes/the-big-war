import { describe, expect, test } from 'bun:test';
import type { HexCell } from '@the-big-war/client/game/map/map.types';
import { visibleHexRange } from '@the-big-war/client/render/terrain-layer';
import { NEUTRAL_OWNER } from '@the-big-war/client/game/empire/empire.constants';
import type { AxialGrid } from '@the-big-war/game-engine/world-tile/world-tile.types';
import { axialToPixel, makeGrid } from '@the-big-war/game-engine/world-tile/world-tile.service';

function makeCellGrid(width: number, height: number): AxialGrid<HexCell> {
  return makeGrid<HexCell>(width, height, hex => ({
    q: hex.q,
    r: hex.r,
    terrain: 'plain',
    biome: 'temperate',
    owner: NEUTRAL_OWNER,
    building: null,
  }));
}

describe('visibleHexRange', () => {
  test('returns null when the rect misses the grid entirely', () => {
    const grid = makeCellGrid(8, 6);
    
    const range = visibleHexRange(grid, 32, -100000, -100000, -99900, -99900);
    expect(range).toBeNull();
  });

  test('clamps the range to grid bounds', () => {
    const grid = makeCellGrid(8, 6);
    const range = visibleHexRange(grid, 32, -10000, -10000, 10000, 10000);
    expect(range).toEqual({ minQ: 0, maxQ: 7, minR: 0, maxR: 5 });
  });

  test('a rect around one hex centre includes that hex', () => {
    const grid = makeCellGrid(20, 20);
    const center = axialToPixel({ q: 10, r: 8 }, 32);
    const range = visibleHexRange(grid, 32, center.x - 1, center.y - 1, center.x + 1, center.y + 1);
    expect(range).not.toBeNull();
    if (!range) return;
    expect(range.minQ).toBeLessThanOrEqual(10);
    expect(range.maxQ).toBeGreaterThanOrEqual(10);
    expect(range.minR).toBeLessThanOrEqual(8);
    expect(range.maxR).toBeGreaterThanOrEqual(8);
  });
});

