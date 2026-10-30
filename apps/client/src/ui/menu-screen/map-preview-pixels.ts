import { TileImage } from '../../render/tile-image';
import { configFromSettings } from '../../session/flow';
import type { MatchSettings } from '../../session/flow';
import { createRng } from '@the-big-war/game-engine/rng/rng.service';
import { generateWorld } from '../../game/map/map-generator.service';

export function previewPixels(settings: MatchSettings): { pixels: Uint8ClampedArray<ArrayBuffer>; width: number; height: number } {
  const config = configFromSettings(settings);
  const { grid } = generateWorld(config, createRng(config.map.seed));
  const image = new TileImage(grid);
  const pixels = new Uint8ClampedArray(new ArrayBuffer(grid.cells.length * 4));
  for (let at = 0; at < grid.cells.length; at++) {
    const color = image.pixelColor(grid, at);
    pixels[at * 4] = color >> 16;
    pixels[at * 4 + 1] = (color >> 8) & 0xff;
    pixels[at * 4 + 2] = color & 0xff;
    pixels[at * 4 + 3] = 255;
  }
  return { pixels, width: grid.width, height: grid.height };
}
