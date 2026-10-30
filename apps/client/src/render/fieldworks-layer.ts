import { Container, Graphics } from 'pixi.js';
import type { HexRange } from './terrain-layer';
import type { HexCell } from '../game/map/map.types';
import type { PlacementGhost } from './overlay-layer.types';
import type { BuildingId } from '../game/building/building.types';
import type { TrenchSample, TrenchShape } from './trench-geometry';
import { trenchFront, trenchPaths, trenchSamples, trenchShape } from './trench-geometry';
import type { AxialGrid, Pixel } from '@the-big-war/game-engine/world-tile/world-tile.types';
import { axialToPixel, gridAt } from '@the-big-war/game-engine/world-tile/world-tile.service';
import {
  GUN_METAL_COLOR,
  HEDGEHOG_COLOR,
  HEDGEHOG_HIGHLIGHT,
  SANDBAG_COLOR,
  SANDBAG_OUTLINE,
  SANDBAG_SHADE,
  STAKE_COLOR,
  TRENCH_EARTH_COLOR,
  TRENCH_FLOOR_COLOR,
  TRENCH_SPOIL_COLOR,
  WIRE_COLOR,
} from './theme';

const CONSTRUCTION_ALPHA = 0.45;
const GHOST_ALPHA = 0.6;
const INVALID_GHOST_ALPHA = 0.35;
const INVALID_GHOST_TINT = 0xff6060;
const SPOIL_WIDTH = 0.5;
const WALL_WIDTH = 0.3;
const FLOOR_WIDTH = 0.18;
const BAG_SPACING = 0.1;
const BAG_OFFSET = 0.16;
const WIRE_OFFSET = 0.36;
const STAKE_SPACING = 0.25;
const HEDGEHOG_SIZE = 0.1;

interface FieldworkEntry {
  readonly object: Graphics;
  key: string;
}

export class FieldworksLayer {

  readonly container: Container;
  private readonly entries = new Map<BuildingId, FieldworkEntry>();
  private readonly free: Graphics[] = [];
  private readonly ghost = new Graphics();
  private ghostKey = '';

  constructor() {
    this.container = new Container();
    this.container.eventMode = 'none';
    this.ghost.eventMode = 'none';
  }

  draw(grid: AxialGrid<HexCell>, hexSize: number, range: HexRange | null, ghost: PlacementGhost | null): void {
    const trenchGhost = ghost?.kind === 'trench' ? ghost : null;
    const planned = trenchGhost?.valid ? trenchGhost.hex : null;
    const seen = new Set<BuildingId>();
    if (range) {
      for (let r = range.minR; r <= range.maxR; r++) {
        for (let q = range.minQ; q <= range.maxQ; q++) {
          const cell = grid.cells[r * grid.width + q];
          const building = cell?.building;
          if (!cell || !building || (building.kind !== 'trench' && building.kind !== 'bunker')) continue;
          seen.add(building.id);
          const shape = building.kind === 'trench' ? trenchShape(grid, cell, planned) : null;
          const key = `${building.kind},${hexSize},${shape?.key ?? ''},${building.machineGun},${building.buildRemaining > 0}`;
          const entry = this.acquire(building.id);
          if (entry.key !== key) {
            entry.key = key;
            entry.object.clear();
            if (shape) drawTrench(entry.object, shape, hexSize, building.machineGun);
            else if (building.buildRemaining <= 0) drawHedgehogs(entry.object, cell, hexSize);
          }
          const center = axialToPixel(cell, hexSize);
          entry.object.position.set(center.x, center.y);
          entry.object.alpha = building.buildRemaining > 0 ? CONSTRUCTION_ALPHA : 1;
        }
      }
    }
    for (const [id, entry] of this.entries) {
      if (seen.has(id)) continue;
      this.container.removeChild(entry.object);
      this.free.push(entry.object);
      this.entries.delete(id);
    }
    this.drawGhost(grid, hexSize, trenchGhost);
  }

  private drawGhost(grid: AxialGrid<HexCell>, hexSize: number, ghost: PlacementGhost | null): void {
    const cell = ghost ? gridAt(grid, ghost.hex) : null;
    if (!ghost || !cell) {
      if (this.ghost.parent) this.container.removeChild(this.ghost);
      return;
    }
    const shape = trenchShape(grid, cell);
    const key = `${hexSize},${shape.key}`;
    if (key !== this.ghostKey) {
      this.ghostKey = key;
      this.ghost.clear();
      drawTrench(this.ghost, shape, hexSize, false);
    }
    this.ghost.alpha = ghost.valid ? GHOST_ALPHA : INVALID_GHOST_ALPHA;
    this.ghost.tint = ghost.valid ? 0xffffff : INVALID_GHOST_TINT;
    const center = axialToPixel(cell, hexSize);
    this.ghost.position.set(center.x, center.y);
    this.container.addChild(this.ghost);
  }

  reset(): void {
    for (const entry of this.entries.values()) entry.object.destroy();
    for (const object of this.free) object.destroy();
    this.entries.clear();
    this.free.length = 0;
    this.ghost.clear();
    this.ghostKey = '';
    if (this.ghost.parent) this.container.removeChild(this.ghost);
  }

  private acquire(id: BuildingId): FieldworkEntry {
    const existing = this.entries.get(id);
    if (existing) return existing;
    const object = this.free.pop() ?? new Graphics();
    object.eventMode = 'none';
    this.container.addChild(object);
    const entry: FieldworkEntry = { object, key: '' };
    this.entries.set(id, entry);
    return entry;
  }
}

function drawTrench(g: Graphics, shape: TrenchShape, hexSize: number, machineGun: boolean): void {
  const paths = trenchPaths(shape, hexSize);
  const lone = shape.links.length === 0;
  const cap = lone ? 'round' : 'butt';

  for (const path of paths) polyline(g, path, SPOIL_WIDTH * hexSize, TRENCH_SPOIL_COLOR, 0.55, cap);
  for (const path of paths) polyline(g, path, WALL_WIDTH * hexSize, TRENCH_EARTH_COLOR, 1, cap);
  for (const path of paths) polyline(g, path, FLOOR_WIDTH * hexSize, TRENCH_FLOOR_COLOR, 1, cap);
  if (shape.links.length === 1) deadEnd(g, hexSize);

  const bags = trenchSamples(shape, hexSize, hexSize * BAG_SPACING);
  sandbags(g, bags, hexSize, BAG_OFFSET, 1);
  sandbags(g, bags, hexSize, -BAG_OFFSET, 0.8);

  if (shape.facing) barbedWire(g, trenchSamples(shape, hexSize, hexSize * STAKE_SPACING), hexSize);
  if (machineGun) machineGunNest(g, hexSize, trenchFront(shape));
}

function polyline(
  g: Graphics,
  points: readonly Pixel[],
  width: number,
  color: number,
  alpha: number,
  cap: 'round' | 'butt',
): void {
  const first = points[0];
  if (!first) return;
  g.moveTo(first.x, first.y);
  for (let i = 1; i < points.length; i++) g.lineTo(points[i]!.x, points[i]!.y);
  g.stroke({ width, color, alpha, cap, join: 'round' });
}

function deadEnd(g: Graphics, hexSize: number): void {
  g.circle(0, 0, (WALL_WIDTH * hexSize) / 2);
  g.fill({ color: TRENCH_EARTH_COLOR });
  g.circle(0, 0, (FLOOR_WIDTH * hexSize) / 2);
  g.fill({ color: TRENCH_FLOOR_COLOR });
}

function sandbags(g: Graphics, samples: readonly TrenchSample[], hexSize: number, offset: number, shade: number): void {
  const length = hexSize * BAG_SPACING * 0.52;
  const depth = hexSize * 0.036;
  const color = shade < 1 ? SANDBAG_SHADE : SANDBAG_COLOR;
  for (const { at, dir, front } of samples) {
    const cx = at.x + front.x * offset * hexSize;
    const cy = at.y + front.y * offset * hexSize;
    const corners = [
      { x: cx - dir.x * length - front.x * depth, y: cy - dir.y * length - front.y * depth },
      { x: cx + dir.x * length - front.x * depth, y: cy + dir.y * length - front.y * depth },
      { x: cx + dir.x * length + front.x * depth, y: cy + dir.y * length + front.y * depth },
      { x: cx - dir.x * length + front.x * depth, y: cy - dir.y * length + front.y * depth },
    ];
    g.poly(corners.flatMap(corner => [corner.x, corner.y + depth * 0.6]));
    g.fill({ color: 0x000000, alpha: 0.22 });
    g.poly(corners.flatMap(corner => [corner.x, corner.y]));
    g.fill({ color });
    g.stroke({ width: Math.max(0.6, hexSize * 0.012), color: SANDBAG_OUTLINE, join: 'round' });
  }
}

function barbedWire(g: Graphics, samples: readonly TrenchSample[], hexSize: number): void {
  const stakes = samples.map(({ at, front }) => ({
    x: at.x + front.x * WIRE_OFFSET * hexSize,
    y: at.y + front.y * WIRE_OFFSET * hexSize,
  }));
  const arm = hexSize * 0.035;
  for (const at of stakes) {
    g.moveTo(at.x - arm, at.y - arm);
    g.lineTo(at.x + arm, at.y + arm);
    g.moveTo(at.x + arm, at.y - arm);
    g.lineTo(at.x - arm, at.y + arm);
  }
  g.stroke({ width: Math.max(0.8, hexSize * 0.02), color: STAKE_COLOR });
  for (let i = 1; i < stakes.length; i++) {
    const a = stakes[i - 1]!;
    const b = stakes[i]!;
    if (Math.hypot(b.x - a.x, b.y - a.y) > hexSize * STAKE_SPACING * 2.4) continue;
    for (const sag of [1, -1]) {
      g.moveTo(a.x, a.y);
      g.quadraticCurveTo((a.x + b.x) / 2, (a.y + b.y) / 2 + sag * hexSize * 0.03, b.x, b.y);
    }
  }
  g.stroke({ width: Math.max(0.5, hexSize * 0.01), color: WIRE_COLOR, alpha: 0.9 });
}

function machineGunNest(g: Graphics, hexSize: number, front: Pixel): void {
  const ring = hexSize * 0.17;
  const bag = hexSize * 0.05;
  for (let i = 0; i < 10; i++) {
    const angle = (i / 10) * Math.PI * 2;
    const x = Math.cos(angle) * ring;
    const y = Math.sin(angle) * ring;
    if (x * -front.x + y * -front.y > ring * 0.7) continue;
    g.ellipse(x, y, bag, bag * 0.75);
    g.fill({ color: SANDBAG_COLOR });
    g.stroke({ width: Math.max(0.6, hexSize * 0.012), color: SANDBAG_OUTLINE });
  }
  g.moveTo(0, 0);
  g.lineTo(front.x * hexSize * 0.3, front.y * hexSize * 0.3);
  g.stroke({ width: Math.max(1.2, hexSize * 0.04), color: GUN_METAL_COLOR, cap: 'round' });
  g.rect(-hexSize * 0.05, -hexSize * 0.04, hexSize * 0.1, hexSize * 0.08);
  g.fill({ color: GUN_METAL_COLOR });
}

function drawHedgehogs(g: Graphics, cell: HexCell, hexSize: number): void {
  const seed = Math.abs((cell.q * 73856093) ^ (cell.r * 19349663));
  const corners = [
    { x: -0.4, y: -0.4 },
    { x: 0.4, y: -0.4 },
    { x: 0.4, y: 0.4 },
    { x: -0.4, y: 0.4 },
  ];
  for (let i = 0; i < 3; i++) {
    const corner = corners[(seed + i) % corners.length]!;
    hedgehog(g, corner.x * hexSize, corner.y * hexSize, hexSize * HEDGEHOG_SIZE);
  }
}

function hedgehog(g: Graphics, x: number, y: number, size: number): void {
  g.ellipse(x, y + size * 0.7, size * 1.1, size * 0.3);
  g.fill({ color: 0x000000, alpha: 0.25 });
  const beams: [number, number, number, number][] = [
    [-size, -size, size, size],
    [size, -size, -size, size],
    [-size * 1.1, size * 0.2, size * 1.1, -size * 0.2],
  ];
  for (const [ax, ay, bx, by] of beams) {
    g.moveTo(x + ax, y + ay);
    g.lineTo(x + bx, y + by);
  }
  g.stroke({ width: Math.max(1.2, size * 0.35), color: HEDGEHOG_COLOR, cap: 'square' });
  for (const [ax, ay, bx, by] of beams) {
    g.moveTo(x + ax, y + ay - size * 0.08);
    g.lineTo(x + bx, y + by - size * 0.08);
  }
  g.stroke({ width: Math.max(0.5, size * 0.1), color: HEDGEHOG_HIGHLIGHT });
}
