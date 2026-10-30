import { DEMOLISH_DIM } from './theme';
import type { HexRange } from './terrain-layer';
import { DETAIL_TILE_PX } from './terrain-layer';
import type { HexCell } from '../game/map/map.types';
import type { PlacementGhost } from './overlay-layer.types';
import { Container, Graphics, GraphicsContext } from 'pixi.js';
import { clamp01 } from '@the-big-war/game-engine/math/math.service';
import { BUILDING_SPRITES, SPRITE_PALETTE, SPRITE_SIZE } from './pixel-sprites';
import { axialToPixel } from '@the-big-war/game-engine/world-tile/world-tile.service';
import type { AxialGrid } from '@the-big-war/game-engine/world-tile/world-tile.types';
import type { Building, BuildingKind, BuildingId } from '../game/building/building.types';

const GHOST_ALPHA = 0.6;
const INVALID_GHOST_ALPHA = 0.35;
const INVALID_GHOST_TINT = 0xff6060;
const SPRITE_FILL = 0.85;
const CONSTRUCTION_ALPHA = 0.45;
const BAR_WIDTH = 0.7;
const BAR_HEIGHT = 0.1;
const BAR_BACK = 0x1b1330;
const BAR_FILL = 0xffd35c;
const FORT_RING_COLOR = 0x9a9a9a;
const FORT_RING_ALPHA = 0.55;
const FORT_RING_FILL_ALPHA = 0.06;
const ICON_PX = 14;
const LANDMARK_TILE_PX = 5;
const LANDMARKS: ReadonlySet<BuildingKind> = new Set<BuildingKind>(['city', 'fort']);

interface GlyphEntry {
  readonly object: Graphics;
  id: BuildingId;
  kind: BuildingKind;
  level: number;
  demolishAt: number | null;
  demolishing: boolean;
}

export class BuildingsLayer {
  
  readonly container: Container;
  private readonly entries = new Map<BuildingId, GlyphEntry>();
  private readonly free: Graphics[] = [];
  private readonly ghost = new Graphics();
  private readonly progress = new Graphics();
  private readonly rings = new Graphics();
  private readonly contexts = new Map<string, GraphicsContext>();
  private ghostKey = '';
  private elapsed = 0;

  constructor() {
    this.container = new Container();
    this.container.eventMode = 'none';
    this.ghost.eventMode = 'none';
    this.ghost.alpha = GHOST_ALPHA;
    this.progress.eventMode = 'none';
    this.rings.eventMode = 'none';
    this.container.addChild(this.rings);
  }

  drawGhost(ghost: PlacementGhost | null, hexSize: number): void {
    if (!ghost || ghost.kind === 'trench') {
      if (this.ghost.parent) this.container.removeChild(this.ghost);
      return;
    }
    const key = `${ghost.kind},${hexSize}`;
    if (key !== this.ghostKey) {
      this.ghostKey = key;
      this.ghost.clear();
      paintSprite(this.ghost, ghost.kind, 1, hexSize);
    }
    this.ghost.alpha = ghost.valid ? GHOST_ALPHA : INVALID_GHOST_ALPHA;
    this.ghost.tint = ghost.valid ? 0xffffff : INVALID_GHOST_TINT;
    const center = axialToPixel(ghost.hex, hexSize);
    this.ghost.position.set(center.x, center.y);
    this.container.addChild(this.ghost);
  }

  draw(
    grid: AxialGrid<HexCell>,
    indexed: readonly number[],
    hexSize: number,
    range: HexRange | null,
    tilePx: number,
    elapsed: number,
    specs: Readonly<Record<BuildingKind, { readonly buildSeconds: number }>>,
    fortRadius: number,
  ): void {
    this.elapsed = elapsed;
    this.progress.clear();
    this.rings.clear();
    if (!range) {
      this.releaseAll();
      return;
    }
    const detail = tilePx >= DETAIL_TILE_PX;
    const iconScale = Math.max(1, ICON_PX / (tilePx * SPRITE_FILL));
    const seen = new Set<BuildingId>();
    for (const at of indexed) {
      const cell = grid.cells[at];
      const building = cell?.building ?? null;
      if (!cell || !building) continue;
      const { q, r } = cell;
      if (q < range.minQ || q > range.maxQ || r < range.minR || r > range.maxR) continue;
      if (building.kind === 'trench' && !detail) continue;
      if (tilePx < LANDMARK_TILE_PX && !LANDMARKS.has(building.kind)) continue;
      const center = axialToPixel({ q, r }, hexSize);
      if (building.kind === 'trench') {
        if (building.buildRemaining > 0) {
          const total = specs.trench.buildSeconds || 1;
          this.drawProgress(center.x, center.y, hexSize, 1 - building.buildRemaining / total);
        }
        continue;
      }
      seen.add(building.id);
      const entry = this.acquire(building, hexSize);
      entry.object.position.set(center.x, center.y);
      entry.object.scale.set(iconScale);
      if (detail && building.kind === 'fort' && building.buildRemaining <= 0) {
        this.drawFortRing(center.x, center.y, (fortRadius + 0.5) * hexSize);
      }
      const demolishing = building.demolishAt !== null;
      const levelChanged = entry.level !== building.level;
      const kindChanged = entry.kind !== building.kind;
      const demolishChanged = entry.demolishAt !== building.demolishAt;
      if (levelChanged || kindChanged || demolishChanged || entry.id !== building.id) {
        entry.id = building.id;
        entry.kind = building.kind;
        entry.level = building.level;
        entry.demolishAt = building.demolishAt;
        entry.demolishing = demolishing;
        this.redraw(entry, hexSize);
      }
      const constructing = building.buildRemaining > 0;
      entry.object.alpha = demolishing ? this.demolishAlpha() : constructing ? CONSTRUCTION_ALPHA : 1;
      if (detail && constructing) {
        const total = specs[building.kind].buildSeconds || 1;
        this.drawProgress(center.x, center.y, hexSize, 1 - building.buildRemaining / total);
      }
    }
    for (const [id, entry] of this.entries) {
      if (seen.has(id)) continue;
      this.release(id, entry);
    }
    this.container.addChild(this.progress);
  }

  private drawFortRing(x: number, y: number, radius: number): void {
    this.rings.rect(x - radius, y - radius, radius * 2, radius * 2);
    this.rings.fill({ color: FORT_RING_COLOR, alpha: FORT_RING_FILL_ALPHA });
    this.rings.stroke({ color: FORT_RING_COLOR, alpha: FORT_RING_ALPHA, width: 2 });
  }

  private drawProgress(x: number, y: number, hexSize: number, done: number): void {
    const width = hexSize * BAR_WIDTH;
    const height = Math.max(2, hexSize * BAR_HEIGHT);
    const left = x - width / 2;
    const top = y + hexSize * 0.42;
    this.progress.rect(left - 1, top - 1, width + 2, height + 2);
    this.progress.fill({ color: BAR_BACK, alpha: 0.85 });
    this.progress.rect(left, top, width * clamp01(done), height);
    this.progress.fill({ color: BAR_FILL });
  }

  reset(): void {
    this.releaseAll();
  }

  private releaseAll(): void {
    for (const [id, entry] of this.entries) this.release(id, entry);
  }

  private release(id: BuildingId, entry: GlyphEntry): void {
    this.container.removeChild(entry.object);
    entry.demolishing = false;
    this.free.push(entry.object);
    this.entries.delete(id);
  }

  private acquire(building: Building, hexSize: number): GlyphEntry {
    const existing = this.entries.get(building.id);
    if (existing) return existing;
    const object = this.free.pop() ?? new Graphics();
    object.eventMode = 'none';
    this.container.addChild(object);
    const entry: GlyphEntry = {
      object,
      id: building.id,
      kind: building.kind,
      level: building.level,
      demolishAt: building.demolishAt,
      demolishing: building.demolishAt !== null,
    };
    this.entries.set(building.id, entry);
    this.redraw(entry, hexSize);
    return entry;
  }

  private demolishAlpha(): number {
    const phase = Math.sin((this.elapsed / 1.2) * Math.PI * 2);
    return DEMOLISH_DIM + (1 - DEMOLISH_DIM) * (0.5 + phase * 0.35);
  }

  private redraw(entry: GlyphEntry, hexSize: number): void {
    const key = `${entry.kind},${entry.level},${hexSize}`;
    let context = this.contexts.get(key);
    if (!context) {
      context = new GraphicsContext();
      paintSprite(context, entry.kind, entry.level, hexSize);
      this.contexts.set(key, context);
    }
    entry.object.context = context;
  }
}

function paintSprite(g: Graphics | GraphicsContext, kind: BuildingKind, level: number, hexSize: number): void {
  const rows = kind === 'city' ? SPRITE_SIZE + 2 : SPRITE_SIZE;
  const pixel = (hexSize * SPRITE_FILL) / rows;
  const left = -(SPRITE_SIZE * pixel) / 2;
  const top = -(rows * pixel) / 2;
  BUILDING_SPRITES[kind].forEach((row, y) => {
    for (let x = 0; x < SPRITE_SIZE; x++) {
      const color = SPRITE_PALETTE[row[x] ?? '.'];
      if (color === undefined) continue;
      g.rect(left + x * pixel, top + y * pixel, pixel, pixel);
      g.fill({ color });
    }
  });
  if (kind === 'city') {
    for (let i = 0; i < level; i++) {
      g.rect(left + i * pixel * 2, top + (SPRITE_SIZE + 1) * pixel, pixel, pixel);
      g.fill({ color: SPRITE_PALETTE.y ?? 0xffd35c });
    }
  }
}
