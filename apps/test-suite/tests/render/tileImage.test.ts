import { describe, expect, test } from 'bun:test';
import { TileImage } from '@the-big-war/client/render/tile-image';
import type { GameState } from '@the-big-war/client/game/state/state.types';
import type { HexCell, HexGrid } from '@the-big-war/client/game/map/map.types';
import { makeGrid } from '@the-big-war/game-engine/world-tile/world-tile.service';
import { DEFAULT_GAME_CONFIG } from '@the-big-war/client/game/config/config.constants';
import { createWorldIndex, setOwner } from '@the-big-war/client/game/map/world-index.service';
import { OWNER_BLEND, SEA_COLOR, mixColor, setNationColors } from '@the-big-war/client/render/theme';

function makeState(width: number, height: number, tweak?: (cell: HexCell) => void): GameState {
  const grid = makeGrid<HexCell>(width, height, hex => {
    const cell = { q: hex.q, r: hex.r, terrain: 'plain', biome: 'desert', owner: -1, building: null } as unknown as HexCell;
    tweak?.(cell);
    return cell;
  }) as HexGrid;
  return { grid, config: DEFAULT_GAME_CONFIG, index: createWorldIndex(grid) } as unknown as GameState;
}

function pixel(image: TileImage, at: number): number {
  const p = image.pixels;
  return (p[at * 4]! << 16) | (p[at * 4 + 1]! << 8) | p[at * 4 + 2]!;
}

describe('TileImage', () => {
  test('neutral land shows the biome and water fades from shallows to sea', () => {
    const state = makeState(8, 1, cell => {
      if (cell.q > 0) (cell as { terrain: string }).terrain = 'water';
    });
    const image = new TileImage(state.grid);
    image.sync(state.grid, state.index);
    expect(pixel(image, 0)).toBe(0xd9c27e);
    expect(pixel(image, 1)).not.toBe(pixel(image, 2));
    expect(pixel(image, 2)).not.toBe(SEA_COLOR);
    expect(pixel(image, 3)).toBe(SEA_COLOR);
  });

  test('a changed tile repaints itself and its neighbours as borders, without a rescan', () => {
    setNationColors([0x112233]);
    const state = makeState(5, 5);
    const image = new TileImage(state.grid);
    image.sync(state.grid, state.index);
    const at = 2 * 5 + 2;
    setOwner(state, state.grid.cells[at]!, 0);
    setOwner(state, state.grid.cells[at + 1]!, 0);
    const before = image.version;
    expect(state.index.changedTiles).toEqual([at, at + 1]);
    image.sync(state.grid, state.index);
    expect(state.index.changedTiles).toEqual([]);
    expect(image.version).toBe(before + 2);
    expect(pixel(image, at)).not.toBe(mixColor(0xd9c27e, 0x112233, OWNER_BLEND));
  });

  test('sweep picks up terrain edits that bypass the index', () => {
    setNationColors([]);
    const state = makeState(5, 5);
    const image = new TileImage(state.grid);
    image.sync(state.grid, state.index);
    const plain = pixel(image, 7);
    state.grid.cells[7]!.terrain = 'mountain';
    image.sync(state.grid, state.index);
    image.sync(state.grid, state.index);
    expect(pixel(image, 7)).not.toBe(plain);
  });
});
