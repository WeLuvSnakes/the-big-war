import { createShape } from './map-shape.service';
import { isPassable, isWater } from './terrain.service';
import type { GameConfig } from '../config/config.types';
import { NEUTRAL_OWNER } from '../empire/empire.constants';
import type { Rng } from '@the-big-war/game-engine/rng/rng.types';
import { FOREST_SHARE, MAP_SHAPE, ORE_RICHNESS } from './map.constants';
import type { Biome, HexCell, HexGrid, WorldLabels } from './map.types';
import { flood, labelWorld, neighbourIndices } from './world-labels.service';
import type { Axial } from '@the-big-war/game-engine/world-tile/world-tile.types';
import { createNoise, sampleFbm } from '@the-big-war/game-engine/noise/noise.service';
import { nextFloat, nextInt, nextUint } from '@the-big-war/game-engine/rng/rng.service';
import { distance, gridAt, makeGrid, neighbors } from '@the-big-war/game-engine/world-tile/world-tile.service';

export interface GeneratedWorld {
  readonly grid: HexGrid;
  readonly labels: WorldLabels;
}

const HISTOGRAM_BINS = 2048;

function topShareThreshold(values: Float32Array, include: (at: number) => boolean, share: number): number {
  let min = Infinity;
  let max = -Infinity;
  let total = 0;
  for (let at = 0; at < values.length; at++) {
    if (!include(at)) continue;
    const value = values[at]!;
    total += 1;
    if (value < min) min = value;
    if (value > max) max = value;
  }
  if (total === 0 || max <= min) return min;
  const bins = new Int32Array(HISTOGRAM_BINS);
  const span = (HISTOGRAM_BINS - 1) / (max - min);
  for (let at = 0; at < values.length; at++) {
    if (include(at)) bins[Math.floor((values[at]! - min) * span)]! += 1;
  }
  const wanted = total * share;
  let seen = 0;
  for (let bin = HISTOGRAM_BINS - 1; bin > 0; bin--) {
    seen += bins[bin]!;
    if (seen >= wanted) return min + bin / span;
  }
  return min;
}

function elevationField(config: GameConfig, rng: Rng): Float32Array {
  const { width, height, preset = 'continents' } = config.map;
  const shape = createShape(preset, rng);
  const warpU = createNoise(nextUint(rng));
  const warpV = createNoise(nextUint(rng));
  const terrain = createNoise(nextUint(rng));
  const aspect = width / height;
  const { warpFrequency: wf, warpAmount, elevationFrequency: ef, elevationNoise, edgeMargin } = MAP_SHAPE;
  const elevation = new Float32Array(width * height);
  for (let r = 0, at = 0; r < height; r++) {
    const v = (r + 0.5) / height;
    for (let q = 0; q < width; q++, at++) {
      const u = (q + 0.5) / width;
      const wu = u + (sampleFbm(warpU, u * wf * aspect, v * wf, 3) - 0.5) * warpAmount * 2;
      const wv = v + (sampleFbm(warpV, u * wf * aspect, v * wf, 3) - 0.5) * warpAmount * 2;
      const edge = Math.min(1, Math.min(u, 1 - u, v, 1 - v) / edgeMargin);
      const relief = sampleFbm(terrain, u * ef * aspect, v * ef, 5);
      elevation[at] = (shape.land(wu, wv) * (1 - elevationNoise) + relief * elevationNoise) * edge;
    }
  }
  const threshold = topShareThreshold(elevation, () => true, shape.share);
  for (let at = 0; at < elevation.length; at++) elevation[at] = elevation[at]! - threshold;
  return elevation;
}

function removeSpecks(width: number, height: number, land: Uint8Array): void {
  const islands = flood(width, height, at => land[at] === 1);
  const main = islands.sizes.indexOf(Math.max(...islands.sizes, 0));
  for (let at = 0; at < land.length; at++) {
    const id = islands.labels[at]!;
    if (id !== -1 && id !== main && islands.sizes[id]! < MAP_SHAPE.minIslandTiles) land[at] = 0;
  }
  const lakes = flood(width, height, at => land[at] === 0);
  const sea = lakes.sizes.indexOf(Math.max(...lakes.sizes, 0));
  for (let at = 0; at < land.length; at++) {
    const id = lakes.labels[at]!;
    if (id !== -1 && id !== sea && lakes.sizes[id]! < MAP_SHAPE.minLakeTiles) land[at] = 1;
  }
}

function coastDistance(width: number, height: number, land: Uint8Array): Int32Array {
  const dist = new Int32Array(land.length).fill(-1);
  const queue = new Int32Array(land.length);
  const near = new Int32Array(4);
  let tail = 0;
  for (let at = 0; at < land.length; at++) {
    if (land[at] === 1) continue;
    dist[at] = 0;
    queue[tail++] = at;
  }
  for (let head = 0; head < tail; head++) {
    const at = queue[head]!;
    const count = neighbourIndices(at, width, height, near);
    for (let i = 0; i < count; i++) {
      const next = near[i]!;
      if (dist[next] !== -1) continue;
      dist[next] = dist[at]! + 1;
      queue[tail++] = next;
    }
  }
  return dist;
}

function carveRivers(
  width: number,
  height: number,
  land: Uint8Array,
  elevation: Float32Array,
  dist: Int32Array,
  rng: Rng,
): Uint8Array {
  const fords = new Uint8Array(land.length);
  let peak = 0;
  for (let at = 0; at < land.length; at++) if (land[at] === 1 && elevation[at]! > peak) peak = elevation[at]!;
  const count = Math.round(((width * height) / 1000) * MAP_SHAPE.riversPerKiloTile);
  const paths: number[][] = [];
  const near = new Int32Array(4);
  for (let attempt = 0; attempt < count * 30 && paths.length < count; attempt++) {
    let at = nextInt(rng, land.length);
    if (land[at] !== 1 || dist[at]! < MAP_SHAPE.riverMinLength) continue;
    if (elevation[at]! < peak * MAP_SHAPE.riverSourceHeight) continue;
    const path: number[] = [];
    while (land[at] === 1) {
      path.push(at);
      const options = neighbourIndices(at, width, height, near);
      let best = -1;
      let bestScore = Infinity;
      for (let i = 0; i < options; i++) {
        const next = near[i]!;
        if (dist[next]! >= dist[at]!) continue;
        const score = nextFloat(rng);
        if (score < bestScore) {
          bestScore = score;
          best = next;
        }
      }
      if (best === -1) break;
      at = best;
    }
    for (const cell of path) land[cell] = 0;
    paths.push(path);
  }

  for (const path of paths) {
    const start = Math.min(path.length >> 1, nextInt(rng, MAP_SHAPE.fordSpacing));
    for (let i = start; i < path.length - 1; i += MAP_SHAPE.fordSpacing) {
      const at = path[i]!;
      const options = neighbourIndices(at, width, height, near);
      let banks = 0;
      for (let side = 0; side < options; side++) banks += land[near[side]!]!;
      if (banks < 2) continue;
      fords[at] = 1;
      land[at] = 1;
    }
  }
  return fords;
}

function classify(temperature: number, moisture: number, lowland: boolean): Biome {
  if (temperature < 0.24) return moisture > 0.55 ? 'taiga' : 'tundra';
  if (temperature < 0.42) return moisture > 0.42 ? 'taiga' : 'steppe';
  if (temperature < 0.72) {
    if (moisture < 0.34) return 'steppe';
    return moisture > 0.68 && lowland ? 'swamp' : 'temperate';
  }
  if (moisture < 0.42) return 'desert';
  if (moisture > 0.72 && lowland) return 'swamp';
  return moisture > 0.58 ? 'jungle' : 'steppe';
}

function stretch(value: number): number {
  return Math.max(0, Math.min(1, (value - 0.5) * 2.4 + 0.5));
}

function assignClimate(
  width: number,
  height: number,
  land: Uint8Array,
  elevation: Float32Array,
  dist: Int32Array,
  peak: number,
  rng: Rng,
): Biome[] {
  const heat = createNoise(nextUint(rng));
  const damp = createNoise(nextUint(rng));
  const fire = createNoise(nextUint(rng));
  const f = MAP_SHAPE.climateFrequency;
  const aspect = width / height;
  const biomes = new Array<Biome>(land.length);
  for (let r = 0, at = 0; r < height; r++) {
    const v = (r + 0.5) / height;
    for (let q = 0; q < width; q++, at++) {
      const u = (q + 0.5) / width;
      const height01 = peak > 0 ? Math.max(0, elevation[at]!) / peak : 0;
      const latitude = 1 - Math.abs(v - 0.5) * 2;
      const temperature = latitude * 0.75 + stretch(sampleFbm(heat, u * f * aspect, v * f, 3)) * 0.35 - height01 * 0.2;
      const near = Math.max(0, 1 - dist[at]! / 16);
      const moisture = stretch(sampleFbm(damp, u * f * aspect, v * f, 4)) * 0.85 + near * 0.2;
      const volcano = sampleFbm(fire, u * f * 3 * aspect, v * f * 3, 2);
      biomes[at] = volcano > MAP_SHAPE.volcanicThreshold && height01 > 0.2 ? 'volcanic' : classify(temperature, moisture, height01 < 0.3);
    }
  }
  return biomes;
}

function paintFeatures(grid: HexGrid, elevation: Float32Array, peak: number, fords: Uint8Array, rng: Rng): void {
  const { cells, width } = grid;
  const ridges = createNoise(nextUint(rng));
  const woods = createNoise(nextUint(rng));
  const scores = new Float32Array(cells.length);
  const eligible = (at: number) => !isWater(cells[at]!.terrain) && fords[at] !== 1;
  for (let at = 0; at < cells.length; at++) {
    if (!eligible(at)) continue;
    const q = at % width;
    const r = (at - q) / width;
    const raw = sampleFbm(ridges, q / MAP_SHAPE.ridgeWavelength, r / MAP_SHAPE.ridgeWavelength, 4);
    const ridge = 1 - Math.abs(raw * 2 - 1);
    const volcanic = cells[at]!.biome === 'volcanic' ? 0.2 : 0;
    scores[at] = ridge * 0.7 + (peak > 0 ? Math.max(0, elevation[at]!) / peak : 0) * 0.3 + volcanic;
  }
  const line = topShareThreshold(scores, eligible, MAP_SHAPE.mountainShare);
  for (let at = 0; at < cells.length; at++) {
    if (!eligible(at)) continue;
    const cell = cells[at]!;
    if (scores[at]! >= line) {
      cell.terrain = 'mountain';
      continue;
    }
    const wood = stretch(sampleFbm(woods, cell.q / MAP_SHAPE.forestWavelength, cell.r / MAP_SHAPE.forestWavelength, 3));
    if (wood < FOREST_SHARE[cell.biome]) cell.terrain = 'forest';
  }
}

export function pruneLoneMountains(grid: HexGrid): void {
  for (const cell of grid.cells) {
    if (cell.terrain !== 'mountain') continue;
    if (!neighbors(cell).some(hex => gridAt(grid, hex)?.terrain === 'mountain')) cell.terrain = 'plain';
  }
}

function connectPasses(grid: HexGrid): void {
  const { cells, width, height } = grid;
  const open = (at: number) => !isWater(cells[at]!.terrain) && isPassable(cells[at]!.terrain);
  const solid = (at: number) => !isWater(cells[at]!.terrain);
  const masses = flood(width, height, solid);
  const pockets = flood(width, height, open);
  const biggest = new Map<number, number>();
  pockets.labels.forEach((pocket, at) => {
    if (pocket === -1) return;
    const mass = masses.labels[at]!;
    const current = biggest.get(mass);
    if (current === undefined || pockets.sizes[pocket]! > pockets.sizes[current]!) biggest.set(mass, pocket);
  });

  const parent = new Int32Array(cells.length).fill(-2);
  const queue = new Int32Array(cells.length);
  const near = new Int32Array(4);
  let tail = 0;
  for (let at = 0; at < cells.length; at++) {
    const pocket = pockets.labels[at]!;
    if (pocket === -1 || biggest.get(masses.labels[at]!) !== pocket) continue;
    parent[at] = -1;
    queue[tail++] = at;
  }
  for (let head = 0; head < tail; head++) {
    const at = queue[head]!;
    const count = neighbourIndices(at, width, height, near);
    for (let i = 0; i < count; i++) {
      const next = near[i]!;
      if (parent[next] !== -2 || !solid(next)) continue;
      parent[next] = at;
      queue[tail++] = next;
      if (cells[next]!.terrain === 'mountain' || cells[at]!.terrain !== 'mountain') continue;
      for (let back = at; back >= 0 && cells[back]!.terrain === 'mountain'; back = parent[back]!) {
        cells[back]!.terrain = 'plain';
      }
    }
  }
}

function placeOre(grid: HexGrid, rng: Rng): void {
  const foothills = grid.cells.filter(
    cell => cell.terrain === 'plain' && neighbors(cell).some(hex => gridAt(grid, hex)?.terrain === 'mountain'),
  );
  if (foothills.length === 0) return;
  const wanted = Math.max(1, Math.round((grid.cells.length / 1000) * MAP_SHAPE.oreDepositsPerKiloTile));
  const deposits: Axial[] = [];
  for (let attempt = 0; attempt < wanted * 12 && deposits.length < wanted; attempt++) {
    const seed = foothills[nextInt(rng, foothills.length)]!;
    if (seed.terrain !== 'plain' || nextFloat(rng) > ORE_RICHNESS[seed.biome]) continue;
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

export function generateWorld(config: GameConfig, rng: Rng): GeneratedWorld {
  const { width, height } = config.map;
  const elevation = elevationField(config, rng);
  const land = new Uint8Array(elevation.length);
  let peak = 0;
  for (let at = 0; at < land.length; at++) {
    land[at] = elevation[at]! >= 0 ? 1 : 0;
    if (elevation[at]! > peak) peak = elevation[at]!;
  }
  removeSpecks(width, height, land);
  const fords = carveRivers(width, height, land, elevation, coastDistance(width, height, land), rng);
  const biomes = assignClimate(width, height, land, elevation, coastDistance(width, height, land), peak, rng);
  const grid = makeGrid<HexCell>(width, height, hex => {
    const at = hex.r * width + hex.q;
    return {
      q: hex.q,
      r: hex.r,
      terrain: land[at] === 1 ? 'plain' : 'water',
      biome: biomes[at]!,
      owner: NEUTRAL_OWNER,
      building: null,
    };
  });

  paintFeatures(grid, elevation, peak, fords, rng);
  pruneLoneMountains(grid);
  connectPasses(grid);
  placeOre(grid, rng);
  return { grid, labels: labelWorld(grid, fords) };
}
