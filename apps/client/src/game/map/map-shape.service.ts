import type { MapPreset } from './map.types';
import type { Rng } from '@the-big-war/game-engine/rng/rng.types';
import { MAP_MASKS, type SilhouettePreset } from './map-masks.constants';
import { nextFloat, nextUint } from '@the-big-war/game-engine/rng/rng.service';
import { createNoise, sampleNoise } from '@the-big-war/game-engine/noise/noise.service';

export interface MapShape {
  readonly land: (u: number, v: number) => number;
  readonly share: number;
}

function blob(u: number, v: number, cu: number, cv: number, ru: number, rv: number): number {
  const du = (u - cu) / ru;
  const dv = (v - cv) / rv;
  return Math.max(0, 1 - du * du - dv * dv);
}

function silhouette(preset: SilhouettePreset): MapShape {
  const rows = MAP_MASKS[preset];
  const height = rows.length;
  const width = rows[0]!.length;
  const at = (x: number, y: number): number => (rows[Math.min(height - 1, y)]![Math.min(width - 1, x)] === '#' ? 1 : 0);
  let filled = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) filled += at(x, y);
  const land = (u: number, v: number): number => {
    const x = Math.max(0, u * width - 0.5);
    const y = Math.max(0, v * height - 0.5);
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const tx = x - x0;
    const ty = y - y0;
    const top = at(x0, y0) * (1 - tx) + at(x0 + 1, y0) * tx;
    const bottom = at(x0, y0 + 1) * (1 - tx) + at(x0 + 1, y0 + 1) * tx;
    return top * (1 - ty) + bottom * ty;
  };
  return { land, share: filled / (width * height) };
}

function continents(rng: Rng): MapShape {
  const blobs = Array.from({ length: 3 }, (_, i) => ({
    u: 0.2 + i * 0.3 + (nextFloat(rng) - 0.5) * 0.08,
    v: 0.3 + nextFloat(rng) * 0.4,
    ru: 0.15 + nextFloat(rng) * 0.04,
    rv: 0.3 + nextFloat(rng) * 0.08,
  }));
  return {
    share: 0.42,
    land: (u, v) => blobs.reduce((best, item) => Math.max(best, blob(u, v, item.u, item.v, item.ru, item.rv)), 0),
  };
}

function archipelago(rng: Rng): MapShape {
  const noise = createNoise(nextUint(rng));
  return {
    share: 0.28,
    land: (u, v) => sampleNoise(noise, u * 11, v * 7) * Math.min(1, blob(u, v, 0.5, 0.5, 0.75, 0.75) * 2),
  };
}

function riverDelta(): MapShape {
  return {
    share: 0.55,
    land: (u, v) => {
      const base = blob(u, v, 0.5, 0.4, 0.62, 0.62);
      if (v < 0.42) return base;
      const angle = Math.atan2(u - 0.5, v - 0.3);
      const channel = Math.abs(Math.sin(angle * 9));
      return channel < 0.32 ? base * 0.15 : base;
    },
  };
}

function straits(rng: Rng): MapShape {
  const phase = nextFloat(rng) * Math.PI * 2;
  return {
    share: 0.58,
    land: (u, v) => {
      const across = Math.abs(v - 0.5 - 0.12 * Math.sin(u * 6.28 + phase));
      const down = Math.abs(u - 0.5 - 0.08 * Math.sin(v * 6.28 + phase));
      return Math.min(1, Math.min(across, down * 0.7) * 16);
    },
  };
}

export function createShape(preset: MapPreset, rng: Rng): MapShape {
  switch (preset) {
    case 'pangaea':
      return { share: 0.6, land: (u, v) => blob(u, v, 0.5, 0.5, 0.56, 0.56) };
    case 'twin_continents':
      return {
        share: 0.44,
        land: (u, v) => Math.max(blob(u, v, 0.25, 0.5, 0.21, 0.5), blob(u, v, 0.75, 0.5, 0.21, 0.5)),
      };
    case 'archipelago':
      return archipelago(rng);
    case 'inland_sea':
      return { share: 0.52, land: (u, v) => Math.max(0, blob(u, v, 0.5, 0.5, 0.62, 0.62) - blob(u, v, 0.5, 0.5, 0.3, 0.3) * 1.3) };
    case 'atoll_ring':
      return {
        share: 0.26,
        land: (u, v) => Math.max(0, 1 - Math.abs(Math.hypot((u - 0.5) / 0.42, (v - 0.5) / 0.4) - 0.8) / 0.32),
      };
    case 'river_delta':
      return riverDelta();
    case 'straits':
      return straits(rng);
    case 'skull':
    case 'snake':
    case 'crescent':
      return silhouette(preset);
    default:
      return continents(rng);
  }
}
