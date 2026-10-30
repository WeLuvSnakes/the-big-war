import { describe, expect, test } from 'bun:test';
import { defaultSettings } from '@the-big-war/client/session/flow';
import { previewPixels } from '@the-big-war/client/ui/menu-screen/map-preview';

describe('previewPixels', () => {
  test('draws one opaque pixel per tile at the real map size', () => {
    const { pixels, width, height } = previewPixels({ ...defaultSettings(7), mapSize: 'skirmish' });
    expect([width, height]).toEqual([120, 72]);
    expect(pixels.length).toBe(120 * 72 * 4);
    expect(pixels[3]).toBe(255);
  });

  test('a seed always previews the same world and another seed does not', () => {
    const first = previewPixels(defaultSettings(7)).pixels;
    expect(previewPixels(defaultSettings(7)).pixels).toEqual(first);
    expect(previewPixels(defaultSettings(8)).pixels).not.toEqual(first);
  });
});
