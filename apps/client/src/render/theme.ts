import type { TerrainColorMap } from './theme.types';
import { clamp } from '@the-big-war/game-engine/math/math.service';

export type * from './theme.types';

export function parseCssColor(value: string): number | null {
  const text = value.trim();
  if (text.length === 0) return null;
  if (text.startsWith('#')) {
    const hex = text.slice(1);
    if (hex.length === 3) {
      const r = hex[0];
      const g = hex[1];
      const b = hex[2];
      if (r === undefined || g === undefined || b === undefined) return null;
      return (parseInt(r + r, 16) << 16) | (parseInt(g + g, 16) << 8) | parseInt(b + b, 16);
    }
    if (hex.length === 6 || hex.length === 8) {
      const value6 = parseInt(hex.slice(0, 6), 16);
      return Number.isNaN(value6) ? null : value6;
    }
    return null;
  }
  const rgb = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i.exec(text);
  if (rgb) {
    const r = Math.round(Number(rgb[1]));
    const g = Math.round(Number(rgb[2]));
    const b = Math.round(Number(rgb[3]));
    return ((r & 0xff) << 16) | ((g & 0xff) << 8) | (b & 0xff);
  }
  return null;
}

function cssVar(name: string, fallback: number): number {
  if (typeof document === 'undefined' || typeof getComputedStyle !== 'function') return fallback;
  const root = document.documentElement;
  if (!root) return fallback;
  const raw = getComputedStyle(root).getPropertyValue(name);
  return parseCssColor(raw) ?? fallback;
}

const FACTION_FALLBACKS: readonly number[] = [
  0xe8302a, 0x2a6cf0, 0xff8a1c, 0xf5d22a, 0x9b4de0, 0x22d3ee, 0xff3fb4, 0xf4f4f4,
];

const SEA_FALLBACK = 0x2f86d6;

export const FACTION_COLORS: readonly number[] = FACTION_FALLBACKS.map((fallback, index) =>
  cssVar(`--faction-${index}`, fallback),
);

export const SEA_COLOR = cssVar('--street-map-sea', SEA_FALLBACK);

export const NEUTRAL_COLOR = 0x5fa84a;

export const TERRAIN_TINTS: TerrainColorMap = {
  plain: 0x000000,
  forest: 0x0f3a1c,
  mountain: 0x6e6a62,
  ore: 0x4a3f2c,
};

export const TERRAIN_PIXEL_MIX = 0.3;
export const OWNER_BLEND = 0.85;
export const PAVE_PIXEL_MIX = 0.45;

export const SHALLOW_COLOR = 0x6fc0e8;
export const SHALLOW_MIX: readonly number[] = [0, 0.6, 0.3];

export const BIOME_COLORS: Readonly<Record<string, number>> = {
  temperate: NEUTRAL_COLOR,
  steppe: 0xa9b35a,
  desert: 0xd9c27e,
  tundra: 0xb9c4bd,
  taiga: 0x3f7f5e,
  jungle: 0x2f8f3c,
  swamp: 0x5b7048,
  volcanic: 0x5a4a48,
};

export const PAVE_MORTAR = 0x6a6358;
export const PAVE_STONES: readonly number[] = [0x9a9283, 0x8b8374, 0xa59d8d];
export const PAVE_STREET = 0x57514a;
export const PAVE_CURB = 0xb8b09f;
export const PAVE_OWNER_TINT = 0.14;

export const HEX_SHADE_MIN = -0.06;
export const HEX_SHADE_MAX = 0.06;

export const HEX_BORDER_WIDTH = 3;
export const HEX_BORDER_DARKEN = 0.35;

export const FRONT_EDGE_COLOR = 0xff6a3d;
export const FRONT_EDGE_WIDTH = 2.5;

export const SELECTION_COLOR = 0xffffff;
export const SELECTION_WIDTH = 3;
export const HOVER_COLOR = 0xf0f0f0;
export const HOVER_WIDTH = 1.5;

export const ACCENT_COLOR = 0xf0c850;
export const DANGER_COLOR = 0xe03232;
export const INFO_COLOR = 0x5db6e5;
export const SUCCESS_COLOR = 0x72cc72;

export const DEMOLISH_DIM = 0.35;

export const TRENCH_SPOIL_COLOR = 0x7a5a3a;
export const TRENCH_EARTH_COLOR = 0x4a3422;
export const TRENCH_FLOOR_COLOR = 0x2b1e14;
export const SANDBAG_COLOR = 0xcdb98e;
export const SANDBAG_SHADE = 0x9c8a62;
export const SANDBAG_OUTLINE = 0x5a4a32;
export const WIRE_COLOR = 0x3a3a3e;
export const STAKE_COLOR = 0x4a3a2a;
export const HEDGEHOG_COLOR = 0x2e2e33;
export const HEDGEHOG_HIGHLIGHT = 0x6a6a72;
export const GUN_METAL_COLOR = 0x26262b;

export const VOID_COLOR = 0x060a16;
export const WORLD_BORDER_COLOR = 0xd4a83a;
export const WORLD_BORDER_WIDTH = 3;

let nationColors: readonly number[] = [];
let nationColorsRevision = 0;

export function setNationColors(colors: readonly number[]): void {
  nationColors = colors;
  nationColorsRevision++;
}

export function nationColorsVersion(): number {
  return nationColorsRevision;
}

export function ownerColor(owner: number): number {
  if (owner < 0) return NEUTRAL_COLOR;
  return nationColors[owner] ?? FACTION_COLORS[owner % FACTION_COLORS.length] ?? NEUTRAL_COLOR;
}

export function ownerCss(owner: number): string {
  return `#${ownerColor(owner).toString(16).padStart(6, '0')}`;
}

export function mixColor(a: number, b: number, t: number): number {
  const clamped = t < 0 ? 0 : t > 1 ? 1 : t;
  const ar = (a >> 16) & 0xff;
  const ag = (a >> 8) & 0xff;
  const ab = a & 0xff;
  const br = (b >> 16) & 0xff;
  const bg = (b >> 8) & 0xff;
  const bb = b & 0xff;
  const r = (ar + (br - ar) * clamped) | 0;
  const g = (ag + (bg - ag) * clamped) | 0;
  const bl = (ab + (bb - ab) * clamped) | 0;
  return (r << 16) | (g << 8) | bl;
}

export function shadeColor(color: number, factor: number): number {
  const r = clamp(Math.round(((color >> 16) & 0xff) * factor), 0, 255);
  const g = clamp(Math.round(((color >> 8) & 0xff) * factor), 0, 255);
  const b = clamp(Math.round((color & 0xff) * factor), 0, 255);
  return (r << 16) | (g << 8) | b;
}

export function hexShade(q: number, r: number): number {
  
  let h = (q * 374761393 + r * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  h = (h ^ (h >>> 16)) >>> 0;
  const unit = h / 0xffffffff;
  return 1 + HEX_SHADE_MIN + unit * (HEX_SHADE_MAX - HEX_SHADE_MIN);
}
