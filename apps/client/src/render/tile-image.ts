import type { GameState } from '../game/state/state.types';
import type { HexCell, HexGrid } from '../game/map/map.types';
import type { WorldIndex } from '../game/map/world-index.types';
import { drainChangedTiles } from '../game/map/world-index.service';
import type { BuildingKind } from '../game/building/building.types';
import {
  BIOME_COLORS,
  HEX_BORDER_DARKEN,
  NEUTRAL_COLOR,
  OWNER_BLEND,
  PAVE_PIXEL_MIX,
  PAVE_STONES,
  SEA_COLOR,
  SHALLOW_COLOR,
  SHALLOW_MIX,
  TERRAIN_PIXEL_MIX,
  TERRAIN_TINTS,
  mixColor,
  nationColorsVersion,
  ownerColor,
  shadeColor,
} from './theme';

export const CHUNK_SHIFT = 5;
export const CHUNK_SIZE = 1 << CHUNK_SHIFT;

const SWEEP_ROWS = 4;
const TERRAIN_CODES: Readonly<Record<string, number>> = { plain: 0, forest: 1, mountain: 2, ore: 3, water: 4 };
const UNPAVED: ReadonlySet<BuildingKind> = new Set<BuildingKind>(['trench', 'tank']);

export function isPaved(cell: HexCell | undefined): boolean {
  return !!cell?.building && !UNPAVED.has(cell.building.kind);
}

function tileKey(cell: HexCell): number {
  return ((cell.owner + 2) << 4) | ((TERRAIN_CODES[cell.terrain] ?? 0) << 1) | (isPaved(cell) ? 1 : 0);
}

export class TileImage {
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8ClampedArray<ArrayBuffer>;
  readonly bytes: Uint8Array;
  readonly chunkVersions: Uint32Array;
  version = 0;
  private readonly chunkColumns: number;
  private readonly keys: Int32Array;
  private readonly shore: Uint8Array;
  private colors = -1;
  private sweepRow = 0;

  constructor(grid: HexGrid) {
    this.width = grid.width;
    this.height = grid.height;
    this.pixels = new Uint8ClampedArray(new ArrayBuffer(grid.width * grid.height * 4));
    this.bytes = new Uint8Array(this.pixels.buffer);
    this.chunkColumns = Math.ceil(grid.width / CHUNK_SIZE);
    this.chunkVersions = new Uint32Array(this.chunkColumns * Math.ceil(grid.height / CHUNK_SIZE));
    this.keys = new Int32Array(grid.cells.length);
    this.shore = new Uint8Array(grid.cells.length);
    this.measureShore(grid);
  }

  chunkKey(x: number, y: number): number {
    return y * this.chunkColumns + x;
  }

  chunkX(key: number): number {
    return key % this.chunkColumns;
  }

  chunkY(key: number): number {
    return Math.floor(key / this.chunkColumns);
  }

  sync(grid: HexGrid, index: WorldIndex): void {
    if (this.colors !== nationColorsVersion()) {
      drainChangedTiles(index, () => {});
      this.rebuild(grid);
      return;
    }
    drainChangedTiles(index, at => this.touch(grid, at));
    this.sweep(grid);
  }

  fillColor(grid: HexGrid, at: number): number {
    const cell = grid.cells[at]!;
    if (cell.terrain === 'water') return mixColor(SEA_COLOR, SHALLOW_COLOR, SHALLOW_MIX[this.shore[at]!] ?? 0);
    const land = BIOME_COLORS[cell.biome] ?? NEUTRAL_COLOR;
    return cell.owner < 0 ? land : mixColor(land, ownerColor(cell.owner), OWNER_BLEND);
  }

  pixelColor(grid: HexGrid, at: number): number {
    const cell = grid.cells[at]!;
    const fill = this.fillColor(grid, at);
    if (cell.terrain === 'water') return fill;
    if (cell.owner >= 0 && this.isBorder(grid, at)) return shadeColor(ownerColor(cell.owner), HEX_BORDER_DARKEN);
    if (isPaved(cell)) return mixColor(fill, PAVE_STONES[0] ?? fill, PAVE_PIXEL_MIX);
    const tint = TERRAIN_TINTS[cell.terrain];
    return tint === undefined || cell.terrain === 'plain' ? fill : mixColor(fill, tint, TERRAIN_PIXEL_MIX);
  }

  private isBorder(grid: HexGrid, at: number): boolean {
    const owner = grid.cells[at]!.owner;
    const { width, height, cells } = grid;
    const q = at % width;
    const r = (at - q) / width;
    return (
      q === 0 ||
      r === 0 ||
      q === width - 1 ||
      r === height - 1 ||
      cells[at - 1]!.owner !== owner ||
      cells[at + 1]!.owner !== owner ||
      cells[at - width]!.owner !== owner ||
      cells[at + width]!.owner !== owner
    );
  }

  private rebuild(grid: HexGrid): void {
    this.colors = nationColorsVersion();
    for (let at = 0; at < grid.cells.length; at++) {
      this.keys[at] = tileKey(grid.cells[at]!);
      this.paint(grid, at);
    }
    this.chunkVersions.fill(this.version + 1);
    this.version++;
  }

  private sweep(grid: HexGrid): void {
    const { width, height, cells } = grid;
    for (let row = 0; row < SWEEP_ROWS; row++) {
      const start = this.sweepRow * width;
      for (let at = start; at < start + width; at++) {
        if (this.keys[at] !== tileKey(cells[at]!)) this.touch(grid, at);
      }
      this.sweepRow = (this.sweepRow + 1) % height;
    }
  }

  private touch(grid: HexGrid, at: number): void {
    const { width, height } = grid;
    const q = at % width;
    const r = (at - q) / width;
    this.keys[at] = tileKey(grid.cells[at]!);
    this.repaint(grid, at);
    if (q > 0) this.repaint(grid, at - 1);
    if (q + 1 < width) this.repaint(grid, at + 1);
    if (r > 0) this.repaint(grid, at - width);
    if (r + 1 < height) this.repaint(grid, at + width);
    this.version++;
  }

  private repaint(grid: HexGrid, at: number): void {
    this.paint(grid, at);
    const q = at % grid.width;
    const r = (at - q) / grid.width;
    this.chunkVersions[this.chunkKey(q >> CHUNK_SHIFT, r >> CHUNK_SHIFT)]!++;
  }

  private paint(grid: HexGrid, at: number): void {
    const color = this.pixelColor(grid, at);
    const offset = at * 4;
    this.pixels[offset] = (color >> 16) & 0xff;
    this.pixels[offset + 1] = (color >> 8) & 0xff;
    this.pixels[offset + 2] = color & 0xff;
    this.pixels[offset + 3] = 255;
  }

  private measureShore(grid: HexGrid): void {
    const { width, height, cells } = grid;
    const reaches = (at: number, match: (next: number) => boolean): boolean => {
      const q = at % width;
      const r = (at - q) / width;
      return (
        (q > 0 && match(at - 1)) ||
        (q + 1 < width && match(at + 1)) ||
        (r > 0 && match(at - width)) ||
        (r + 1 < height && match(at + width))
      );
    };
    const isWaterAt = (at: number): boolean => cells[at]!.terrain === 'water';
    for (let at = 0; at < cells.length; at++) {
      if (isWaterAt(at) && reaches(at, next => !isWaterAt(next))) this.shore[at] = 1;
    }
    for (let at = 0; at < cells.length; at++) {
      if (isWaterAt(at) && !this.shore[at] && reaches(at, next => this.shore[next] === 1)) this.shore[at] = 2;
    }
  }
}

const images = new WeakMap<WorldIndex, TileImage>();

export function tileImageFor(state: GameState): TileImage {
  let image = images.get(state.index);
  if (!image) {
    image = new TileImage(state.grid);
    images.set(state.index, image);
  }
  image.sync(state.grid, state.index);
  return image;
}
