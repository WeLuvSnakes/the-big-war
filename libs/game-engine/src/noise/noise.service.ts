import type { ValueNoise } from './noise.types';
import { createRng, nextFloat } from '../rng/rng.service';

const TABLE_SIZE = 4096;
const TABLE_MASK = TABLE_SIZE - 1;

export function createNoise(seed: number): ValueNoise {
  const rng = createRng(seed);
  const table = new Float32Array(TABLE_SIZE);
  for (let i = 0; i < TABLE_SIZE; i++) table[i] = nextFloat(rng);
  return { table };
}

function lattice(noise: ValueNoise, x: number, y: number): number {
  const mixed = Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1);
  return noise.table[(mixed ^ (mixed >>> 15)) & TABLE_MASK]!;
}

function fade(t: number): number {
  return t * t * (3 - 2 * t);
}

export function sampleNoise(noise: ValueNoise, x: number, y: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = fade(x - x0);
  const ty = fade(y - y0);
  const top = lattice(noise, x0, y0) * (1 - tx) + lattice(noise, x0 + 1, y0) * tx;
  const bottom = lattice(noise, x0, y0 + 1) * (1 - tx) + lattice(noise, x0 + 1, y0 + 1) * tx;
  return top * (1 - ty) + bottom * ty;
}

export function sampleFbm(noise: ValueNoise, x: number, y: number, octaves: number, gain = 0.5, lacunarity = 2): number {
  let total = 0;
  let weight = 1;
  let span = 0;
  let frequency = 1;
  for (let octave = 0; octave < octaves; octave++) {
    total += sampleNoise(noise, x * frequency, y * frequency) * weight;
    span += weight;
    weight *= gain;
    frequency *= lacunarity;
  }
  return total / span;
}
