

import type { HexCell } from '../game/map/map.types';
import { CHUNK_SHIFT, CHUNK_SIZE, type TileImage, isPaved } from './tile-image';
import { BufferImageSource, Container, Graphics, Sprite, Texture } from 'pixi.js';
import type { Pixel } from '@the-big-war/game-engine/world-tile/world-tile.types';
import { DIRECTIONS } from '@the-big-war/game-engine/world-tile/world-tile.constants';
import type { AxialGrid } from '@the-big-war/game-engine/world-tile/world-tile.types';
import { axialToPixel, gridAt, pixelToHex } from '@the-big-war/game-engine/world-tile/world-tile.service';
import {
  HEX_BORDER_DARKEN,
  HEX_BORDER_WIDTH,
  PAVE_CURB,
  PAVE_MORTAR,
  PAVE_OWNER_TINT,
  PAVE_STONES,
  PAVE_STREET,
  hexShade,
  mixColor,
  ownerColor,
  shadeColor,
} from './theme';

export interface HexRange {
  minQ: number;
  maxQ: number;
  minR: number;
  maxR: number;
}

interface ChunkSpan {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
}

export function visibleHexRange(
  grid: Pick<AxialGrid<unknown>, 'width' | 'height'>,
  hexSize: number,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): HexRange | null {
  const corners: Pixel[] = [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: minX, y: maxY },
    { x: maxX, y: maxY },
  ];
  let minQ = Infinity;
  let maxQ = -Infinity;
  let minR = Infinity;
  let maxR = -Infinity;
  for (const corner of corners) {
    const hex = pixelToHex(corner, hexSize);
    if (hex.q < minQ) minQ = hex.q;
    if (hex.q > maxQ) maxQ = hex.q;
    if (hex.r < minR) minR = hex.r;
    if (hex.r > maxR) maxR = hex.r;
  }
  
  const clamped: HexRange = {
    minQ: Math.max(0, minQ - 1),
    maxQ: Math.min(grid.width - 1, maxQ + 1),
    minR: Math.max(0, minR - 1),
    maxR: Math.min(grid.height - 1, maxR + 1),
  };
  if (clamped.minQ > clamped.maxQ || clamped.minR > clamped.maxR) return null;
  return clamped;
}

function stoneHash(q: number, r: number, row: number, col: number): number {
  let h = (q * 73856093) ^ (r * 19349663) ^ (row * 83492791) ^ (col * 2654435761);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) % PAVE_STONES.length;
}

function hexBorderColor(cell: HexCell): number {
  return shadeColor(ownerColor(cell.owner), HEX_BORDER_DARKEN);
}

const GLYPH_SIZE_RATIO = 0.3;
const UPLOAD_INTERVAL_MS = 66;
const CHUNK_BUILDS_PER_FRAME = 6;

export const DETAIL_TILE_PX = 8;

interface Chunk {
  readonly fills: Graphics;
  readonly lines: Graphics;
  version: number;
}

export class TerrainLayer {
  readonly container: Container;
  private readonly tiles = new Sprite();
  private readonly fillRoot = new Container();
  private readonly lineRoot = new Container();
  private readonly chunks = new Map<number, Chunk>();
  private readonly freeChunks: Chunk[] = [];
  private image: TileImage | null = null;
  private source: BufferImageSource | null = null;
  private uploaded = -1;
  private lastUpload = Number.NEGATIVE_INFINITY;

  constructor() {
    this.container = new Container();
    this.tiles.eventMode = 'none';
    this.fillRoot.eventMode = 'none';
    this.lineRoot.eventMode = 'none';
    this.container.addChild(this.tiles, this.fillRoot, this.lineRoot);
  }

  draw(
    grid: AxialGrid<HexCell>,
    image: TileImage,
    hexSize: number,
    range: HexRange | null,
    tilePx: number,
    now: number,
  ): void {
    this.syncTexture(image, hexSize, now);
    const detail = range !== null && tilePx >= DETAIL_TILE_PX;
    this.fillRoot.visible = detail;
    this.lineRoot.visible = detail;
    if (!detail) {
      this.releaseChunks(null);
      return;
    }
    this.drawChunks(grid, image, hexSize, range);
  }

  invalidate(): void {
    this.releaseChunks(null);
    this.image = null;
    this.uploaded = -1;
    this.lastUpload = Number.NEGATIVE_INFINITY;
  }

  private syncTexture(image: TileImage, hexSize: number, now: number): void {
    if (this.image !== image) {
      this.releaseChunks(null);
      this.tiles.texture.destroy(false);
      this.source?.destroy();
      this.source = new BufferImageSource({
        resource: image.bytes,
        width: image.width,
        height: image.height,
        format: 'rgba8unorm',
        scaleMode: 'nearest',
      });
      this.tiles.texture = new Texture({ source: this.source });
      this.image = image;
      this.uploaded = image.version;
      this.lastUpload = now;
    }
    this.tiles.scale.set(hexSize);
    if (image.version === this.uploaded || now - this.lastUpload < UPLOAD_INTERVAL_MS) return;
    this.uploaded = image.version;
    this.lastUpload = now;
    this.source?.update();
  }

  private drawChunks(grid: AxialGrid<HexCell>, image: TileImage, hexSize: number, range: HexRange): void {
    const span = { minX: range.minQ >> CHUNK_SHIFT, maxX: range.maxQ >> CHUNK_SHIFT, minY: range.minR >> CHUNK_SHIFT, maxY: range.maxR >> CHUNK_SHIFT };
    this.releaseChunks(span);
    let budget = CHUNK_BUILDS_PER_FRAME;
    for (let y = span.minY; y <= span.maxY; y++) {
      for (let x = span.minX; x <= span.maxX; x++) {
        const key = image.chunkKey(x, y);
        const version = image.chunkVersions[key] ?? 0;
        let chunk = this.chunks.get(key);
        if (chunk?.version === version || budget === 0) continue;
        chunk ??= this.acquireChunk(key);
        budget--;
        chunk.version = version;
        this.buildChunk(chunk, grid, image, hexSize, x, y);
      }
    }
  }

  private acquireChunk(key: number): Chunk {
    const chunk = this.freeChunks.pop() ?? { fills: new Graphics(), lines: new Graphics(), version: -1 };
    chunk.fills.eventMode = 'none';
    chunk.lines.eventMode = 'none';
    this.fillRoot.addChild(chunk.fills);
    this.lineRoot.addChild(chunk.lines);
    this.chunks.set(key, chunk);
    return chunk;
  }

  private releaseChunks(span: ChunkSpan | null): void {
    const image = this.image;
    for (const [key, chunk] of this.chunks) {
      if (span && image) {
        const x = image.chunkX(key);
        const y = image.chunkY(key);
        if (x >= span.minX && x <= span.maxX && y >= span.minY && y <= span.maxY) continue;
      }
      chunk.fills.clear();
      chunk.lines.clear();
      chunk.version = -1;
      this.fillRoot.removeChild(chunk.fills);
      this.lineRoot.removeChild(chunk.lines);
      this.chunks.delete(key);
      this.freeChunks.push(chunk);
    }
  }

  private buildChunk(chunk: Chunk, grid: AxialGrid<HexCell>, image: TileImage, hexSize: number, chunkX: number, chunkY: number): void {
    const { fills, lines } = chunk;
    fills.clear();
    lines.clear();
    const minQ = chunkX << CHUNK_SHIFT;
    const minR = chunkY << CHUNK_SHIFT;
    const maxQ = Math.min(grid.width, minQ + CHUNK_SIZE);
    const maxR = Math.min(grid.height, minR + CHUNK_SIZE);
    const owners = (q: number, r: number): number | null =>
      q < 0 || r < 0 || q >= grid.width || r >= grid.height ? null : (grid.cells[r * grid.width + q]?.owner ?? null);

    for (let r = minR; r < maxR; r++) {
      for (let q = minQ; q < maxQ; q++) {
        const at = r * grid.width + q;
        const cell = grid.cells[at];
        if (!cell) continue;
        if (isPaved(cell)) {
          this.drawPavement(fills, grid, cell, hexSize);
        } else {
          const color = image.fillColor(grid, at);
          if (color !== image.pixelColor(grid, at)) {
            fills.rect(q * hexSize - 1, r * hexSize - 1, hexSize + 2, hexSize + 2);
            fills.fill({ color });
          }
        }
        if (cell.owner >= 0) {
          const x = q * hexSize;
          const y = r * hexSize;
          let edged = false;
          for (const dir of DIRECTIONS) {
            if (owners(q + dir.q, r + dir.r) === cell.owner) continue;
            const x0 = dir.q === 1 ? x + hexSize : x;
            const y0 = dir.r === 1 ? y + hexSize : y;
            const x1 = dir.q === 0 ? x + hexSize : x0;
            const y1 = dir.r === 0 ? y + hexSize : y0;
            lines.moveTo(x0, y0);
            lines.lineTo(x1, y1);
            edged = true;
          }
          if (edged) lines.stroke({ width: HEX_BORDER_WIDTH, color: hexBorderColor(cell), alpha: 1 });
        }
      }
    }
    this.drawGlyphs(lines, grid, hexSize, minQ, minR, maxQ, maxR);
  }

  private drawPavement(g: Graphics, grid: AxialGrid<HexCell>, cell: HexCell, hexSize: number): void {
    const { q, r } = cell;
    const x = q * hexSize;
    const y = r * hexSize;
    const unit = hexSize / 16;
    const tint = (color: number) => (cell.owner >= 0 ? mixColor(color, ownerColor(cell.owner), PAVE_OWNER_TINT) : color);

    g.rect(x, y, hexSize, hexSize);
    g.fill({ color: tint(PAVE_MORTAR) });
    PAVE_STONES.forEach((stone, shade) => {
      for (let row = 0; row < 4; row++) {
        const offset = row % 2 === 1 ? -2.5 : 0;
        for (let col = 0, left = offset; left < 16; col++, left += 5) {
          if (stoneHash(q, r, row, col) !== shade) continue;
          const from = Math.max(0, left) + 0.5;
          const to = Math.min(16, left + 5) - 0.5;
          if (to <= from) continue;
          g.rect(x + from * unit, y + (row * 4 + 0.5) * unit, (to - from) * unit, 3 * unit);
        }
      }
      g.fill({ color: tint(stone) });
    });

    const links = DIRECTIONS.filter(dir => isPaved(gridAt(grid, { q: q + dir.q, r: r + dir.r })));
    if (links.length === 0) return;
    const cx = x + hexSize / 2;
    const cy = y + hexSize / 2;
    const street = (pad: number) => {
      const half = 2 * unit + pad;
      g.rect(cx - half, cy - half, half * 2, half * 2);
      for (const dir of links) {
        if (dir.q !== 0) g.rect(dir.q > 0 ? cx : x, cy - half, hexSize / 2, half * 2);
        else g.rect(cx - half, dir.r > 0 ? cy : y, half * 2, hexSize / 2);
      }
    };
    street(unit * 0.75);
    g.fill({ color: tint(PAVE_CURB) });
    street(0);
    g.fill({ color: tint(PAVE_STREET) });
  }

  private drawGlyphs(
    g: Graphics,
    grid: AxialGrid<HexCell>,
    hexSize: number,
    minQ: number,
    minR: number,
    maxQ: number,
    maxR: number,
  ): void {
    const scale = hexSize * GLYPH_SIZE_RATIO;
    for (let r = minR; r < maxR; r++) {
      for (let q = minQ; q < maxQ; q++) {
        const terrain = grid.cells[r * grid.width + q]?.terrain;
        if (terrain !== 'forest' && terrain !== 'ore' && terrain !== 'mountain') continue;
        const center = axialToPixel({ q, r }, hexSize);
        if (terrain === 'forest') this.drawTrees(g, center, scale, q, r);
        else if (terrain === 'ore') this.drawOre(g, center, scale);
        else this.drawMountain(g, center, scale);
      }
    }
  }

  private drawTrees(g: Graphics, center: Pixel, scale: number, q: number, r: number): void {
    
    const jitter = (hexShade(q, r) - 1) * 2;
    const offsets: readonly [number, number][] = [
      [-scale * 0.55, scale * 0.2],
      [scale * 0.5, scale * 0.35],
      [scale * 0.0, -scale * 0.55],
    ];
    for (let i = 0; i < offsets.length; i++) {
      const offset = offsets[i];
      if (!offset) continue;
      const x = center.x + offset[0] + jitter * (i - 1) * 0.5;
      const y = center.y + offset[1];
      const half = scale * 0.42;
      const height = scale * 0.86;
      g.poly([x, y - height, x - half, y, x + half, y]);
    }
    g.fill({ color: 0x245c33 });
    
    for (let i = 0; i < offsets.length; i++) {
      const offset = offsets[i];
      if (!offset) continue;
      const x = center.x + offset[0] + jitter * (i - 1) * 0.5;
      const y = center.y + offset[1];
      g.rect(x - 1, y, 2, scale * 0.3);
    }
    g.fill({ color: 0x3c2a1c });
  }

  private drawOre(g: Graphics, center: Pixel, scale: number): void {
    const rocks: readonly [number, number, number][] = [
      [-0.5, 0.25, 0.55],
      [0.45, 0.3, 0.5],
      [0.0, -0.35, 0.6],
    ];
    for (const [dx, dy, size] of rocks) {
      const x = center.x + dx * scale;
      const y = center.y + dy * scale;
      const half = size * scale;
      g.poly([x - half, y + half * 0.6, x - half * 0.5, y - half * 0.6, x + half * 0.6, y - half * 0.5, x + half, y + half * 0.6]);
    }
    g.fill({ color: 0x3a3530 });
    for (const [dx, dy, size] of rocks) {
      const x = center.x + dx * scale;
      const y = center.y + dy * scale;
      const fleck = Math.max(1.5, size * scale * 0.35);
      g.rect(x - fleck, y - fleck * 0.5, fleck, fleck);
      g.rect(x + fleck * 0.4, y + fleck * 0.3, fleck * 0.8, fleck * 0.8);
    }
    g.fill({ color: 0xf2c94c });
  }

  private drawMountain(g: Graphics, center: Pixel, scale: number): void {
    const half = scale * 1.05;
    const height = scale * 1.35;
    
    g.poly([
      center.x - half,
      center.y + height * 0.5,
      center.x,
      center.y - height * 0.5,
      center.x + half,
      center.y + height * 0.5,
    ]);
    g.fill({ color: 0x6b665e });
    g.poly([
      center.x,
      center.y - height * 0.5,
      center.x + half,
      center.y + height * 0.5,
      center.x,
      center.y + height * 0.5,
    ]);
    g.fill({ color: 0x524d46 });
    
    g.poly([
      center.x - scale * 0.3,
      center.y - height * 0.14,
      center.x,
      center.y - height * 0.5,
      center.x + scale * 0.3,
      center.y - height * 0.14,
    ]);
    g.fill({ color: 0xdfe3e6 });
  }
}
