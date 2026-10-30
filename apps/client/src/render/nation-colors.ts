import type { GameState } from '../game/state/state.types';
import { NEUTRAL_COLOR, SEA_COLOR, setNationColors } from './theme';
import { clamp01 } from '@the-big-war/game-engine/math/math.service';

type Lab = readonly [number, number, number];

const CONTENDER_LIGHTNESS = [0.56, 0.68, 0.8] as const;
const CONTENDER_CHROMA = [0.2, 0.13] as const;
const CONTENDER_HUE_STEP = 15;

const NEUTRAL_STATE_LIGHTNESS = [0.5, 0.62, 0.74] as const;
const NEUTRAL_STATE_CHROMA = 0.045;
const NEUTRAL_STATE_HUE_STEP = 30;
const SPATIAL_WEIGHT = 0.6;
const BACKDROP_MIN_DISTANCE = 0.09;
const REUSE_PENALTY = 0.04;

function srgbToLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(channel: number): number {
  const c = channel <= 0.0031308 ? channel * 12.92 : 1.055 * channel ** (1 / 2.4) - 0.055;
  return Math.round(c * 255);
}

function toLab(color: number): Lab {
  const r = srgbToLinear((color >> 16) & 0xff);
  const g = srgbToLinear((color >> 8) & 0xff);
  const b = srgbToLinear(color & 0xff);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function oklchToLinear(lightness: number, chroma: number, hue: number): [number, number, number] {
  const a = chroma * Math.cos((hue * Math.PI) / 180);
  const b = chroma * Math.sin((hue * Math.PI) / 180);
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}
function oklch(lightness: number, chroma: number, hue: number): number {
  let c = chroma;
  let rgb = oklchToLinear(lightness, c, hue);
  while (c > 0 && rgb.some(v => v < 0 || v > 1)) {
    c -= 0.005;
    rgb = oklchToLinear(lightness, c, hue);
  }
  const [r, g, b] = rgb.map(v => linearToSrgb(clamp01(v)));
  return (r! << 16) | (g! << 8) | b!;
}

function distance(a: Lab, b: Lab): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

interface Candidate {
  readonly color: number;
  readonly lab: Lab;
}

function buildPalette(lightnesses: readonly number[], chromas: readonly number[], hueStep: number): Candidate[] {
  const backdrop = [toLab(NEUTRAL_COLOR), toLab(SEA_COLOR)];
  const palette: Candidate[] = [];
  for (const lightness of lightnesses) {
    for (const chroma of chromas) {
      const offset = (lightnesses.indexOf(lightness) * hueStep) / lightnesses.length;
      for (let hue = offset; hue < 360; hue += hueStep) {
        const color = oklch(lightness, chroma, hue);
        const lab = toLab(color);
        if (backdrop.some(ref => distance(lab, ref) < BACKDROP_MIN_DISTANCE)) continue;
        if (palette.some(other => other.color === color)) continue;
        palette.push({ color, lab });
      }
    }
  }
  return palette;
}

const CONTENDER_PALETTE = buildPalette(CONTENDER_LIGHTNESS, CONTENDER_CHROMA, CONTENDER_HUE_STEP);
const NEUTRAL_STATE_PALETTE = buildPalette(NEUTRAL_STATE_LIGHTNESS, [NEUTRAL_STATE_CHROMA], NEUTRAL_STATE_HUE_STEP);

function territoryCentroids(state: GameState): ({ x: number; y: number } | null)[] {
  const sums = state.empires.map(() => ({ x: 0, y: 0, n: 0 }));
  for (const cell of state.grid.cells) {
    const sum = sums[cell.owner];
    if (!sum) continue;
    sum.x += cell.q;
    sum.y += cell.r;
    sum.n++;
  }
  return sums.map(sum => (sum.n > 0 ? { x: sum.x / sum.n, y: sum.y / sum.n } : null));
}

export function assignNationColors(state: GameState): void {
  const centroids = territoryCentroids(state);
  const diagonal = Math.hypot(state.grid.width, state.grid.height) || 1;
  const backdrop = [toLab(NEUTRAL_COLOR), toLab(SEA_COLOR)];
  const assigned: { lab: Lab; at: { x: number; y: number } | null }[] = [];
  const uses = new Map<number, number>();
  const colors: number[] = [];

  const order = [...state.empires].sort((a, b) => Number(b.isHuman) - Number(a.isHuman) || a.id - b.id);
  for (const empire of order) {
    const palette = empire.neutralState ? NEUTRAL_STATE_PALETTE : CONTENDER_PALETTE;
    const at = centroids[empire.id] ?? null;
    let best = palette[0]!;
    let bestScore = Number.NEGATIVE_INFINITY;
    for (const candidate of palette) {
      let score = Math.min(...backdrop.map(ref => distance(candidate.lab, ref)));
      for (const other of assigned) {
        const apart = at && other.at ? Math.hypot(at.x - other.at.x, at.y - other.at.y) / diagonal : 0;
        score = Math.min(score, distance(candidate.lab, other.lab) + apart * SPATIAL_WEIGHT);
      }
      score -= (uses.get(candidate.color) ?? 0) * REUSE_PENALTY;
      if (score > bestScore) {
        bestScore = score;
        best = candidate;
      }
    }
    colors[empire.id] = best.color;
    uses.set(best.color, (uses.get(best.color) ?? 0) + 1);
    assigned.push({ lab: best.lab, at });
  }

  setNationColors(colors);
}
