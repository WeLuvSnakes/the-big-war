import type { Pixel } from '@the-big-war/game-engine/world-tile/world-tile.types';

export type InputIntent =
  | { readonly kind: 'pan'; readonly dx: number; readonly dy: number }
  | { readonly kind: 'zoom'; readonly factor: number; readonly anchor: Pixel }
  | { readonly kind: 'tap'; readonly at: Pixel; readonly shift: boolean }
  | { readonly kind: 'context'; readonly at: Pixel }
  | { readonly kind: 'boxStart'; readonly at: Pixel }
  | { readonly kind: 'boxMove'; readonly at: Pixel }
  | { readonly kind: 'boxEnd'; readonly at: Pixel; readonly shift: boolean }
  | { readonly kind: 'longPress'; readonly at: Pixel }
  | { readonly kind: 'hover'; readonly at: Pixel }
  | { readonly kind: 'leave' }
  | { readonly kind: 'panEnd' }
  | { readonly kind: 'key'; readonly key: string; readonly shift: boolean }
  | { readonly kind: 'keyUp'; readonly key: string }
  | { readonly kind: 'blur' };

export interface InputHost {
  
  readonly element: HTMLElement;
  
  readonly viewport: () => Pixel;
  
  readonly onIntent: (intent: InputIntent) => void;
}

export interface PointerState {
  id: number;
  
  startX: number;
  startY: number;
  
  lastX: number;
  lastY: number;
  
  dragging: boolean;
  
  timer: ReturnType<typeof setTimeout> | null;
  
  consumed: boolean;

  button: number;

  box: boolean;

  shift: boolean;
}
