import { isWater } from '../map/terrain.service';
import type { CoastTile, SeaIndex } from './ship.types';
import type { HexGrid, WorldLabels } from '../map/map.types';
import { neighbourIndices } from '../map/world-labels.service';
import { aStar } from '@the-big-war/game-engine/pathfinding/a-star.service';
import type { Axial } from '@the-big-war/game-engine/world-tile/world-tile.types';

const SECTOR_SIZE = 8;

const indexes = new WeakMap<WorldLabels, SeaIndex>();

function sectorOf(at: number, width: number): number {
  const q = at % width;
  const r = (at - q) / width;
  return Math.floor(q / SECTOR_SIZE) + Math.floor(r / SECTOR_SIZE) * width;
}

function floodRegions(grid: HexGrid, labels: WorldLabels): { regionOf: Int32Array; centres: Axial[] } {
  const { width, height } = grid;
  const regionOf = new Int32Array(width * height).fill(-1);
  const near = new Int32Array(4);
  const centres: Axial[] = [];
  for (let start = 0; start < regionOf.length; start++) {
    if (regionOf[start] !== -1 || labels.waterBody[start]! < 0) continue;
    const region = centres.length;
    const sector = sectorOf(start, width);
    const stack = [start];
    regionOf[start] = region;
    let sumQ = 0;
    let sumR = 0;
    let size = 0;
    while (stack.length > 0) {
      const at = stack.pop()!;
      const q = at % width;
      sumQ += q;
      sumR += (at - q) / width;
      size += 1;
      const count = neighbourIndices(at, width, height, near);
      for (let i = 0; i < count; i++) {
        const next = near[i]!;
        if (regionOf[next] !== -1 || labels.waterBody[next]! < 0 || sectorOf(next, width) !== sector) continue;
        regionOf[next] = region;
        stack.push(next);
      }
    }
    centres.push({ q: sumQ / size, r: sumR / size });
  }
  return { regionOf, centres };
}

function linkRegions(grid: HexGrid, regionOf: Int32Array, count: number): number[][] {
  const { width, height } = grid;
  const links = Array.from({ length: count }, () => new Set<number>());
  const near = new Int32Array(4);
  for (let at = 0; at < regionOf.length; at++) {
    const region = regionOf[at]!;
    if (region < 0) continue;
    const total = neighbourIndices(at, width, height, near);
    for (let i = 0; i < total; i++) {
      const other = regionOf[near[i]!]!;
      if (other >= 0 && other !== region) links[region]!.add(other);
    }
  }
  return links.map(set => [...set].sort((a, b) => a - b));
}

function addCoast(map: Map<number, CoastTile[]>, key: number, tile: CoastTile): void {
  const list = map.get(key);
  if (list) list.push(tile);
  else map.set(key, [tile]);
}

function createSeaIndex(grid: HexGrid, labels: WorldLabels): SeaIndex {
  const { width, height, cells } = grid;
  const { regionOf, centres } = floodRegions(grid, labels);
  const coastByBody = new Map<number, CoastTile[]>();
  const coastByLandmass = new Map<number, CoastTile[]>();
  const near = new Int32Array(4);
  for (let beach = 0; beach < cells.length; beach++) {
    const landmass = labels.landmass[beach]!;
    if (landmass < 0) continue;
    const seen = new Set<number>();
    const count = neighbourIndices(beach, width, height, near);
    for (let i = 0; i < count; i++) {
      const water = near[i]!;
      const body = labels.waterBody[water]!;
      if (!isWater(cells[water]!.terrain) || seen.has(body)) continue;
      seen.add(body);
      const tile = { beach, water, body };
      addCoast(coastByBody, body, tile);
      addCoast(coastByLandmass, landmass, tile);
    }
  }
  return { regionOf, centres, links: linkRegions(grid, regionOf, centres.length), coastByBody, coastByLandmass };
}

export function seaIndex(grid: HexGrid, labels: WorldLabels): SeaIndex {
  let index = indexes.get(labels);
  if (!index) {
    index = createSeaIndex(grid, labels);
    indexes.set(labels, index);
  }
  return index;
}

export function isNavigable(labels: WorldLabels, at: number): boolean {
  return labels.waterBody[at]! >= 0;
}

export function sameWater(labels: WorldLabels, a: number, b: number): boolean {
  return isNavigable(labels, a) && labels.waterBody[a] === labels.waterBody[b];
}

function regionCorridor(index: SeaIndex, from: number, to: number): Set<number> | null {
  const goal = index.centres[to]!;
  const gap = (a: Axial, b: Axial) => Math.abs(a.q - b.q) + Math.abs(a.r - b.r);
  const path = aStar({
    start: from,
    goal: to,
    heuristic: node => gap(index.centres[node]!, goal),
    neighbors: (node, visit) => {
      for (const next of index.links[node]!) visit(next, gap(index.centres[node]!, index.centres[next]!));
    },
  });
  return path ? new Set(path) : null;
}

export function findSeaRoute(grid: HexGrid, labels: WorldLabels, from: number, to: number): number[] | null {
  if (!sameWater(labels, from, to)) return null;
  const index = seaIndex(grid, labels);
  const corridor = regionCorridor(index, index.regionOf[from]!, index.regionOf[to]!);
  if (!corridor) return null;
  const { width, height } = grid;
  const goalQ = to % width;
  const goalR = (to - goalQ) / width;
  const near = new Int32Array(4);
  const path = aStar({
    start: from,
    goal: to,
    heuristic: node => {
      const q = node % width;
      return Math.abs(q - goalQ) + Math.abs((node - q) / width - goalR);
    },
    neighbors: (node, visit) => {
      const count = neighbourIndices(node, width, height, near);
      const options = near.slice(0, count);
      for (const next of options) if (corridor.has(index.regionOf[next]!)) visit(next, 1);
    },
  });
  return path ? path.slice(1) : null;
}
