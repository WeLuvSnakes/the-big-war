import type { FxKind } from './fx-layer';
import type { OverlayState } from './overlay-layer';
import type { GameState } from '../game/state/state.types';
import type { Axial, Pixel } from '@the-big-war/game-engine/world-tile/world-tile.types';

export interface Camera {
  
  x: number;
  
  y: number;
  
  scale: number;
}

export interface CameraController extends Camera {
  
  set(next: Partial<Camera>): void;
  
  zoomBy(factor: number, canvasX: number, canvasY: number): void;
  
  toScreen(worldX: number, worldY: number): Pixel;
  
  toWorld(canvasX: number, canvasY: number): Pixel;
}

export interface WorldOptions {
  
  readonly host: HTMLElement;
  
  readonly initialScale?: number;
  
  readonly background?: number;
  
  readonly autoStart?: boolean;
}

export interface WorldRenderer {
  
  readonly camera: CameraController;
  
  init(): Promise<void>;
  
  render(state: GameState): void;
  
  setOverlay(overlay: Partial<OverlayState>): void;
  
  spawnFx(kind: FxKind, hex: Axial, color?: number): void;
  
  screenToHex(screenX: number, screenY: number): Axial;
  
  screenToWorld(screenX: number, screenY: number): Pixel;
  
  worldToScreen(worldX: number, worldY: number): Pixel;
  
  readonly size: { readonly width: number; readonly height: number };
  
  destroy(): void;
}
