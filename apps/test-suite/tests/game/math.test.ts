import { describe, expect, test } from 'bun:test';
import { classes, clock, perSecond, signed } from '@the-big-war/frontend/ui/format/format';
import { clamp, clamp01, clampPercent, lerp, percentShare } from '@the-big-war/game-engine/math/math.service';

describe('math helpers', () => {
  test('clamp bounds a value', () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
    expect(clamp01(0.5)).toBe(0.5);
    expect(lerp(2, 4, 0.5)).toBe(3);
  });

  test('percentShare commits at least one troop and never more than the whole troops', () => {
    expect(clampPercent(0)).toBe(1);
    expect(percentShare(3, 1)).toBe(1);
    expect(percentShare(100, 250)).toBe(100);
    expect(percentShare(0.5, 50)).toBe(0);
  });
});

describe('format helpers', () => {
  test('formats signs, rates, clocks and classes', () => {
    expect(signed(0)).toBe('+0');
    expect(signed(-2)).toBe('-2');
    expect(perSecond(1.25)).toBe('+1.3/s');
    expect(clock(65)).toBe('1:05');
    expect(classes('a', false, null, 'b')).toBe('a b');
  });
});
