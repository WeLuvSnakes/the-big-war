import type { HexCell } from '../game/map/map.types';
import { gridAt, neighbors } from '@the-big-war/game-engine/world-tile/world-tile.service';
import type { Axial, AxialGrid, Pixel } from '@the-big-war/game-engine/world-tile/world-tile.types';

const LONE_HALF_LENGTH = 0.36;
const CURVE_STEPS = 8;

export interface TrenchShape {
  readonly links: readonly Pixel[];
  readonly facing: Pixel | null;
  readonly key: string;
}

export interface TrenchSample {
  readonly at: Pixel;
  readonly dir: Pixel;
  readonly front: Pixel;
}

export function trenchShape(grid: AxialGrid<HexCell>, cell: HexCell, planned: Axial | null = null): TrenchShape {
  const links: Pixel[] = [];
  let fx = 0;
  let fy = 0;
  for (const neighbour of neighbors(cell)) {
    const other = gridAt(grid, neighbour);
    if (!other) continue;
    const dx = neighbour.q - cell.q;
    const dy = neighbour.r - cell.r;
    const isPlanned = planned !== null && neighbour.q === planned.q && neighbour.r === planned.r;
    if (other.owner === cell.owner && (isPlanned || other.building?.kind === 'trench')) links.push({ x: dx, y: dy });
    else if (other.owner !== cell.owner) {
      fx += dx;
      fy += dy;
    }
  }
  const length = Math.hypot(fx, fy);
  const facing = length > 0 ? { x: fx / length, y: fy / length } : null;
  const key = `${links.map(link => `${link.x},${link.y}`).join(';')}|${facing ? `${facing.x.toFixed(2)},${facing.y.toFixed(2)}` : '-'}`;
  return { links, facing, key };
}

function trenchFront(shape: TrenchShape): Pixel {
  if (shape.facing) return shape.facing;
  const first = shape.links[0];
  if (first) return first.x !== 0 ? { x: 0, y: -1 } : { x: 1, y: 0 };
  return { x: 0, y: -1 };
}

export function trenchPaths(shape: TrenchShape, hexSize: number): Pixel[][] {
  const half = hexSize / 2;
  const edge = (link: Pixel): Pixel => ({ x: link.x * half, y: link.y * half });
  const { links } = shape;
  if (links.length === 0) {
    const front = trenchFront(shape);
    const reach = hexSize * LONE_HALF_LENGTH;
    return [[{ x: front.y * reach, y: -front.x * reach }, { x: -front.y * reach, y: front.x * reach }]];
  }
  if (links.length === 1) return [[{ x: 0, y: 0 }, edge(links[0]!)]];
  if (links.length === 2) {
    const a = edge(links[0]!);
    const b = edge(links[1]!);
    if (a.x === -b.x && a.y === -b.y) return [[a, b]];
    const path: Pixel[] = [];
    for (let i = 0; i <= CURVE_STEPS; i++) {
      const t = i / CURVE_STEPS;
      const u = 1 - t;
      path.push({ x: u * u * a.x + t * t * b.x, y: u * u * a.y + t * t * b.y });
    }
    return [path];
  }
  return links.map(link => [{ x: 0, y: 0 }, edge(link)]);
}

export function trenchSamples(shape: TrenchShape, hexSize: number, spacing: number): TrenchSample[] {
  const front = trenchFront(shape);
  const out: TrenchSample[] = [];
  for (const path of trenchPaths(shape, hexSize)) {
    const fromEdge = shape.links.length > 0 && Math.hypot(path[0]!.x, path[0]!.y) > 1e-6;
    let carry = fromEdge ? spacing / 2 : spacing / 4;
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1]!;
      const b = path[i]!;
      const length = Math.hypot(b.x - a.x, b.y - a.y);
      if (length === 0) continue;
      const dir = { x: (b.x - a.x) / length, y: (b.y - a.y) / length };
      let normal = { x: -dir.y, y: dir.x };
      if (normal.x * front.x + normal.y * front.y < 0) normal = { x: -normal.x, y: -normal.y };
      let d = carry;
      for (; d < length; d += spacing) out.push({ at: { x: a.x + dir.x * d, y: a.y + dir.y * d }, dir, front: normal });
      carry = d - length;
    }
  }
  return out;
}

