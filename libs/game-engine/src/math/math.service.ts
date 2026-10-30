export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

export function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

export function clampPercent(percent: number): number {
  return clamp(Math.round(percent), 1, 100);
}

export function percentShare(total: number, percent: number): number {
  return Math.min(Math.floor(total), Math.max(1, Math.floor((total * clampPercent(percent)) / 100)));
}
