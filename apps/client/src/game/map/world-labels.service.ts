import { isWater } from './terrain.service';
import type { HexGrid, WorldLabels } from './map.types';

export interface FloodResult {
  readonly labels: Int32Array;
  readonly sizes: number[];
}

export function neighbourIndices(at: number, width: number, height: number, out: Int32Array): number {
  const q = at % width;
  let count = 0;
  if (q > 0) out[count++] = at - 1;
  if (q < width - 1) out[count++] = at + 1;
  if (at >= width) out[count++] = at - width;
  if (at < width * (height - 1)) out[count++] = at + width;
  return count;
}

export function flood(width: number, height: number, member: (at: number) => boolean): FloodResult {
  const total = width * height;
  const labels = new Int32Array(total).fill(-1);
  const stack = new Int32Array(total);
  const near = new Int32Array(4);
  const sizes: number[] = [];
  for (let start = 0; start < total; start++) {
    if (labels[start] !== -1 || !member(start)) continue;
    const id = sizes.length;
    let size = 0;
    let top = 0;
    stack[top++] = start;
    labels[start] = id;
    while (top > 0) {
      const at = stack[--top]!;
      size += 1;
      const count = neighbourIndices(at, width, height, near);
      for (let i = 0; i < count; i++) {
        const next = near[i]!;
        if (labels[next] !== -1 || !member(next)) continue;
        labels[next] = id;
        stack[top++] = next;
      }
    }
    sizes.push(size);
  }
  return { labels, sizes };
}

export function labelWorld(grid: HexGrid, fords?: Uint8Array): WorldLabels {
  const { cells, width, height } = grid;
  const land = flood(width, height, at => !isWater(cells[at]!.terrain));
  const water = flood(width, height, at => isWater(cells[at]!.terrain) || fords?.[at] === 1);
  return { landmass: land.labels, waterBody: water.labels, landSizes: land.sizes, waterSizes: water.sizes };
}
