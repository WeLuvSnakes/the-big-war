import { clamp } from '@the-big-war/game-engine/math/math.service';


import type { Camera, VisibleWorldRect } from './camera.types';
import type { Pixel } from '@the-big-war/game-engine/world-tile/world-tile.types';

export type * from './camera.types';

export const MIN_SCALE = 0.35;
export const MAX_SCALE = 2.6;

export const DEFAULT_SCALE = 0.85;

export function createCamera(x = 0, y = 0, scale = DEFAULT_SCALE): Camera {
  return { x, y, scale: clampScale(scale) };
}

export function clampScale(scale: number): number {
  return clamp(scale, MIN_SCALE, MAX_SCALE);
}

export function screenToWorld(camera: Camera, screen: Pixel, viewport: Pixel): Pixel {
  return {
    x: camera.x + (screen.x - viewport.x / 2) / camera.scale,
    y: camera.y + (screen.y - viewport.y / 2) / camera.scale,
  };
}

export function worldToScreen(camera: Camera, world: Pixel, viewport: Pixel): Pixel {
  return {
    x: (world.x - camera.x) * camera.scale + viewport.x / 2,
    y: (world.y - camera.y) * camera.scale + viewport.y / 2,
  };
}

export function panBy(camera: Camera, dxScreen: number, dyScreen: number): void {
  camera.x -= dxScreen / camera.scale;
  camera.y -= dyScreen / camera.scale;
}

export function zoomAt(camera: Camera, factor: number, anchor: Pixel, viewport: Pixel): void {
  const before = screenToWorld(camera, anchor, viewport);
  camera.scale = clampScale(camera.scale * factor);
  const after = screenToWorld(camera, anchor, viewport);
  camera.x += before.x - after.x;
  camera.y += before.y - after.y;
}

export function visibleWorldRect(camera: Camera, viewport: Pixel): VisibleWorldRect {
  const halfW = viewport.x / 2 / camera.scale;
  const halfH = viewport.y / 2 / camera.scale;
  return {
    minX: camera.x - halfW,
    minY: camera.y - halfH,
    maxX: camera.x + halfW,
    maxY: camera.y + halfH,
  };
}
