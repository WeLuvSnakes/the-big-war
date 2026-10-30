import { MAP_SHAPE } from './map.constants';
import { isPassable } from './terrain.service';
import type { GameConfig } from '../config/config.types';
import { NEUTRAL_OWNER } from '../empire/empire.constants';
import type { HexCell, HexGrid, Terrain } from './map.types';
import type { Rng } from '@the-big-war/game-engine/rng/rng.types';
import { nextFloat, nextInt } from '@the-big-war/game-engine/rng/rng.service';
import type { Axial } from '@the-big-war/game-engine/world-tile/world-tile.types';
import { area, distance, gridAt, gridInBounds, makeGrid, neighbors, gridIndex } from '@the-big-war/game-engine/world-tile/world-tile.service';

function paintBlob(grid: HexGrid, rng: Rng, center: Axial, radius: number, terrain: Terrain): void {
  for (const hex of area(center, radius)) {
    if (!gridInBounds(grid, hex.q, hex.r)) continue;

    if (distance(center, hex) === radius && nextFloat(rng) < 0.5) continue;
    const cell = gridAt(grid, hex);
    if (!cell || cell.terrain === 'mountain') continue;

    cell.terrain = terrain;
  }
}

function walkSpine(rng: Rng, start: Axial, length: number, bend: number): Axial[] {
  let heading = nextFloat(rng) * Math.PI * 2;
  let x = start.q;
  let y = start.r;
  const spine: Axial[] = [{ q: start.q, r: start.r }];
  for (let step = 0; step < length; step++) {
    heading += (nextFloat(rng) - 0.5) * bend;
    x += Math.cos(heading);
    y += Math.sin(heading);
    const target = { q: Math.round(x), r: Math.round(y) };
    let last = spine[spine.length - 1]!;
    while (last.q !== target.q || last.r !== target.r) {
      last = last.q !== target.q && (last.r === target.r || nextFloat(rng) < 0.5)
        ? { q: last.q + Math.sign(target.q - last.q), r: last.r }
        : { q: last.q, r: last.r + Math.sign(target.r - last.r) };
      spine.push(last);
    }
  }
  return spine;
}

function paintRange(grid: HexGrid, rng: Rng, start: Axial): void {
  const length =
    MAP_SHAPE.rangeMinLength + nextInt(rng, MAP_SHAPE.rangeMaxLength - MAP_SHAPE.rangeMinLength + 1);
  const spine = walkSpine(rng, start, length, MAP_SHAPE.rangeBend);

  spine.forEach((hex, index) => {
    const along = index / Math.max(1, spine.length - 1);
    const core = along > MAP_SHAPE.rangeTaper && along < 1 - MAP_SHAPE.rangeTaper;
    paintMountain(grid, hex);
    if (!core) return;
    for (const side of neighbors(hex)) {
      if (nextFloat(rng) < MAP_SHAPE.rangeWidenChance) paintMountain(grid, side);
    }
  });
}

function warpField(width: number, height: number, rng: Rng): (q: number, r: number) => Axial {
  const cell = MAP_SHAPE.wallWarpCell;
  const cols = Math.ceil(width / cell) + 2;
  const rows = Math.ceil(height / cell) + 2;
  const knots = Array.from({ length: cols * rows }, () => ({
    q: (nextFloat(rng) * 2 - 1) * MAP_SHAPE.wallWarp,
    r: (nextFloat(rng) * 2 - 1) * MAP_SHAPE.wallWarp,
  }));
  return (q, r) => {
    const x = q / cell;
    const y = r / cell;
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const tx = x - x0;
    const ty = y - y0;
    const at = (i: number, j: number) => knots[j * cols + i]!;
    const mix = (key: 'q' | 'r') =>
      (at(x0, y0)[key] * (1 - tx) + at(x0 + 1, y0)[key] * tx) * (1 - ty) +
      (at(x0, y0 + 1)[key] * (1 - tx) + at(x0 + 1, y0 + 1)[key] * tx) * ty;
    return { q: q + mix('q'), r: r + mix('r') };
  };
}

function scatterSites(width: number, height: number, rng: Rng): Axial[] {
  const sites: Axial[] = [];
  for (let attempt = 0; attempt < 400 && sites.length < MAP_SHAPE.wallRegions; attempt++) {
    const site = { q: nextFloat(rng) * width, r: nextFloat(rng) * height };
    if (sites.some(other => Math.hypot(other.q - site.q, other.r - site.r) < MAP_SHAPE.wallRegionSpacing)) continue;
    sites.push(site);
  }
  return sites;
}

function paintWalls(grid: HexGrid, rng: Rng): void {
  const sites = scatterSites(grid.width, grid.height, rng);
  if (sites.length < 2) return;
  const warp = warpField(grid.width, grid.height, rng);
  const kept = new Map<string, boolean>();
  const walls = new Map<string, HexCell[]>();

  for (const cell of grid.cells) {
    const p = warp(cell.q, cell.r);
    let first = -1;
    let second = -1;
    let d1 = Infinity;
    let d2 = Infinity;
    sites.forEach((site, index) => {
      const d = Math.hypot(site.q - p.q, site.r - p.r);
      if (d < d1) {
        second = first;
        d2 = d1;
        first = index;
        d1 = d;
      } else if (d < d2) {
        second = index;
        d2 = d;
      }
    });
    if (d2 - d1 >= MAP_SHAPE.wallThickness) continue;
    const pair = `${Math.min(first, second)}:${Math.max(first, second)}`;
    if (!kept.has(pair)) kept.set(pair, nextFloat(rng) < MAP_SHAPE.wallKeepChance);
    if (!kept.get(pair)) continue;
    const wall = walls.get(pair) ?? [];
    wall.push(cell);
    walls.set(pair, wall);
  }

  for (const [pair, wall] of walls) {
    const [a, b] = pair.split(':').map(Number) as [number, number];
    for (const cell of wall) cell.terrain = 'mountain';
    cutPasses(grid, rng, wall, sites[a]!, sites[b]!);
  }
}

function cutPasses(grid: HexGrid, rng: Rng, wall: readonly HexCell[], a: Axial, b: Axial): void {
  const along = { q: -(b.r - a.r), r: b.q - a.q };
  const ordered = [...wall].sort((x, y) => x.q * along.q + x.r * along.r - (y.q * along.q + y.r * along.r));
  const count = Math.max(1, Math.round(ordered.length / MAP_SHAPE.passSpacing / MAP_SHAPE.wallThickness));
  for (let i = 0; i < count; i++) {
    const slot = (i + 0.25 + nextFloat(rng) * 0.5) / count;
    const centre = ordered[Math.min(ordered.length - 1, Math.floor(slot * ordered.length))]!;
    for (const hex of area(centre, MAP_SHAPE.passRadius + 1)) {
      const cell = gridAt(grid, hex);
      const dq = Math.abs(hex.q - centre.q);
      const dr = Math.abs(hex.r - centre.r);
      if (cell?.terrain === 'mountain' && Math.max(dq, dr) <= MAP_SHAPE.passRadius) cell.terrain = 'plain';
    }
  }
}

function paintMountain(grid: HexGrid, hex: Axial): void {
  const cell = gridAt(grid, hex);
  if (cell) cell.terrain = 'mountain';
}

export function generateTerrain(config: GameConfig, rng: Rng): HexGrid {
  const { width, height } = config.map;
  const grid = makeGrid<HexCell>(width, height, hex => ({
    q: hex.q,
    r: hex.r,
    terrain: 'plain',
    owner: NEUTRAL_OWNER,
    building: null,
  }));

  const randomCenter = (): Axial => ({
    q: nextInt(rng, width),
    r: nextInt(rng, height),
  });

  paintWalls(grid, rng);
  const inset = MAP_SHAPE.rangeEdgeInset;
  for (let i = 0; i < MAP_SHAPE.mountainRanges; i++) {
    paintRange(grid, rng, { q: inset + nextInt(rng, width - inset * 2), r: inset + nextInt(rng, height - inset * 2) });
  }
  for (let i = 0; i < MAP_SHAPE.forestPatches; i++) {
    const radius =
      MAP_SHAPE.patchMinRadius + nextInt(rng, MAP_SHAPE.patchMaxRadius - MAP_SHAPE.patchMinRadius + 1);
    paintBlob(grid, rng, randomCenter(), radius, 'forest');
  }

  for (const cell of grid.cells) {
    if (cell.terrain !== 'plain') continue;
    if (nextFloat(rng) < MAP_SHAPE.forestVeinChance) cell.terrain = 'forest';
  }

  pruneLoneMountains(grid);
  connectRegions(grid);
  placeOre(grid, rng);
  return grid;
}

export function pruneLoneMountains(grid: HexGrid): void {
  for (const cell of grid.cells) {
    if (cell.terrain !== 'mountain') continue;
    if (!neighbors(cell).some(hex => gridAt(grid, hex)?.terrain === 'mountain')) cell.terrain = 'plain';
  }
}

interface Regions {
  readonly labels: Int32Array;
  readonly sizes: number[];
}

function labelRegions(grid: HexGrid): Regions {
  const labels = new Int32Array(grid.cells.length).fill(-1);
  const sizes: number[] = [];
  grid.cells.forEach((cell, index) => {
    if (labels[index] !== -1 || !isPassable(cell.terrain)) return;
    const id = sizes.length;
    let size = 0;
    const stack: Axial[] = [cell];
    labels[index] = id;
    while (stack.length > 0) {
      const hex = stack.pop()!;
      size += 1;
      for (const next of neighbors(hex)) {
        const neighbour = gridAt(grid, next);
        const nextIndex = gridIndex(grid, next.q, next.r);
        if (!neighbour || labels[nextIndex] !== -1 || !isPassable(neighbour.terrain)) continue;
        labels[nextIndex] = id;
        stack.push(next);
      }
    }
    sizes.push(size);
  });
  return { labels, sizes };
}

export function connectRegions(grid: HexGrid): void {
  for (let guard = 0; guard < grid.cells.length; guard++) {
    const { labels, sizes } = labelRegions(grid);
    if (sizes.length <= 1) return;
    const main = sizes.indexOf(Math.max(...sizes));

    let filled = false;
    grid.cells.forEach((cell, index) => {
      const label = labels[index]!;
      if (label === -1 || label === main || sizes[label]! >= MAP_SHAPE.pocketMinSize) return;
      cell.terrain = 'mountain';
      filled = true;
    });
    if (filled) continue;

    carveToMain(grid, labels, main);
  }
}

function carveToMain(grid: HexGrid, labels: Int32Array, main: number): void {
  const previous = new Int32Array(grid.cells.length).fill(-2);
  const queue: number[] = [];
  labels.forEach((label, index) => {
    if (label !== main) return;
    previous[index] = -1;
    queue.push(index);
  });
  for (let head = 0; head < queue.length; head++) {
    const index = queue[head]!;
    const label = labels[index]!;
    if (label !== -1 && label !== main) {
      for (let at = index; at !== -1; at = previous[at]!) {
        const cell = grid.cells[at]!;
        if (cell.terrain === 'mountain') cell.terrain = 'plain';
      }
      return;
    }
    const cell = grid.cells[index]!;
    for (const next of neighbors(cell)) {
      if (!gridInBounds(grid, next.q, next.r)) continue;
      const nextIndex = gridIndex(grid, next.q, next.r);
      if (previous[nextIndex] !== -2) continue;
      previous[nextIndex] = index;
      queue.push(nextIndex);
    }
  }
}

function placeOre(grid: HexGrid, rng: Rng): void {
  const foothills = grid.cells.filter(
    cell => cell.terrain === 'plain' && neighbors(cell).some(hex => gridAt(grid, hex)?.terrain === 'mountain'),
  );
  if (foothills.length === 0) return;
  const deposits: Axial[] = [];
  for (let attempt = 0; attempt < foothills.length && deposits.length < MAP_SHAPE.oreDeposits; attempt++) {
    const seed = foothills[nextInt(rng, foothills.length)]!;
    if (seed.terrain !== 'plain') continue;
    if (deposits.some(existing => distance(existing, seed) < MAP_SHAPE.oreSpacing)) continue;
    deposits.push(seed);
    const size = MAP_SHAPE.oreMinSize + nextInt(rng, MAP_SHAPE.oreMaxSize - MAP_SHAPE.oreMinSize + 1);
    const vein: HexCell[] = [seed];
    seed.terrain = 'ore';
    while (vein.length < size) {
      const from = vein[nextInt(rng, vein.length)]!;
      const options = neighbors(from)
        .map(hex => gridAt(grid, hex))
        .filter((cell): cell is HexCell => cell !== undefined && (cell.terrain === 'plain' || cell.terrain === 'forest'));
      if (options.length === 0) break;
      const next = options[nextInt(rng, options.length)]!;
      next.terrain = 'ore';
      vein.push(next);
    }
  }
}
