import { FxLayer } from './fx-layer';
import type { FxKind } from './fx-layer';
import { RoadsLayer } from './roads-layer';
import { ShipsLayer } from './ships-layer';
import { tileImageFor } from './tile-image';
import { OverlayLayer } from './overlay-layer';
import { SoldiersLayer } from './soldiers-layer';
import { BuildingsLayer } from './buildings-layer';
import type { OverlayState } from './overlay-layer';
import { FieldworksLayer } from './fieldworks-layer';
import { NationLabelsLayer } from './nation-labels-layer';
import type { GameState } from '../game/state/state.types';
import { WORLD_BORDER_COLOR, WORLD_BORDER_WIDTH } from './theme';
import { Application, Container, Graphics, Ticker } from 'pixi.js';
import { DETAIL_TILE_PX, TerrainLayer, visibleHexRange } from './terrain-layer';
import { pixelToHex } from '@the-big-war/game-engine/world-tile/world-tile.service';
import type { Axial, Pixel } from '@the-big-war/game-engine/world-tile/world-tile.types';
import type {
  Camera,
  CameraController,
  WorldOptions,
  WorldRenderer,
} from './world.types';

export type * from './world.types';

export const MIN_ZOOM = 0.35;
export const MAX_ZOOM = 3.0;

export function createWorld(options: WorldOptions): WorldRenderer {
  const app = new Application();
  const initialized = { done: false };
  const size = { width: 1, height: 1 };
  let mapSize: { readonly width: number; readonly height: number } | null = null;

  const ZOOM_OUT_PAST_FIT = 0.5;
  const PAN_SLACK = 0.25;
  const minZoom = (): number =>
    mapSize
      ? Math.min(MAX_ZOOM, Math.min(size.width / mapSize.width, size.height / mapSize.height) * ZOOM_OUT_PAST_FIT)
      : MIN_ZOOM;

  const clampZoom = (scale: number): number => {
    if (!Number.isFinite(scale)) return 1;
    return Math.min(MAX_ZOOM, Math.max(minZoom(), scale));
  };

  const constrainAxis = (value: number, mapExtent: number, viewExtent: number): number => {
    const overflow = mapExtent - viewExtent;
    if (overflow <= 0) return overflow / 2;
    const slack = viewExtent * PAN_SLACK;
    return Math.min(Math.max(0, overflow) + slack, Math.max(Math.min(0, overflow) - slack, value));
  };

  const constrainCamera = (): void => {
    if (!mapSize) return;
    cameraState.scale = clampZoom(cameraState.scale);
    cameraState.x = constrainAxis(cameraState.x, mapSize.width, size.width / cameraState.scale);
    cameraState.y = constrainAxis(cameraState.y, mapSize.height, size.height / cameraState.scale);
  };

  const cameraState: Camera = { x: 0, y: 0, scale: clampZoom(options.initialScale ?? 1) };

  const stage = new Container();
  const terrain = new TerrainLayer();
  const fieldworks = new FieldworksLayer();
  const roads = new RoadsLayer();
  const buildings = new BuildingsLayer();
  const overlay = new OverlayLayer();
  const soldiers = new SoldiersLayer();
  soldiers.container.sortableChildren = true;
  const ships = new ShipsLayer();
  const nationLabels = new NationLabelsLayer();
  const fx = new FxLayer();
  const worldBorder = new Graphics();
  worldBorder.eventMode = 'none';

  let lastFxTime = 0;

  const camera: CameraController = {
    get x() {
      return cameraState.x;
    },
    set x(value: number) {
      cameraState.x = value;
    },
    get y() {
      return cameraState.y;
    },
    set y(value: number) {
      cameraState.y = value;
    },
    get scale() {
      return cameraState.scale;
    },
    set scale(value: number) {
      cameraState.scale = clampZoom(value);
    },
    set(next: Partial<Camera>): void {
      if (next.x !== undefined) cameraState.x = next.x;
      if (next.y !== undefined) cameraState.y = next.y;
      if (next.scale !== undefined) cameraState.scale = clampZoom(next.scale);
    },
    zoomBy(factor: number, screenX: number, screenY: number): void {
      const before = toWorld(cameraState, screenX, screenY);
      cameraState.scale = clampZoom(cameraState.scale * factor);
      const after = toWorld(cameraState, screenX, screenY);
      
      cameraState.x += before.x - after.x;
      cameraState.y += before.y - after.y;
    },
    toScreen(worldX: number, worldY: number): Pixel {
      return {
        x: (worldX - cameraState.x) * cameraState.scale,
        y: (worldY - cameraState.y) * cameraState.scale,
      };
    },
    toWorld(screenX: number, screenY: number): Pixel {
      return toWorld(cameraState, screenX, screenY);
    },
  };

  const overlayState: OverlayState = {
    selected: null,
    hovered: null,
    cannonFrom: null,
    cannonRange: 6,
    cannonTarget: null,
    ghost: null,
    spawnPlots: [],
    selectedShip: null,
  };

  let lastState: GameState | null = null;

  const measure = (): void => {
    const rect = options.host.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));
    size.width = width;
    size.height = height;
  };

  const drawFrame = (state: GameState, dtSeconds: number): void => {
    const hexSize = state.config.map.hexSize;
    mapSize = { width: state.grid.width * hexSize, height: state.grid.height * hexSize };
    constrainCamera();
    stage.scale.set(cameraState.scale);
    stage.position.set(Math.round(-cameraState.x * cameraState.scale), Math.round(-cameraState.y * cameraState.scale));
    const range = visibleHexRange(
      state.grid,
      hexSize,
      cameraState.x,
      cameraState.y,
      cameraState.x + size.width / cameraState.scale,
      cameraState.y + size.height / cameraState.scale,
    );
    const tilePx = hexSize * cameraState.scale;
    const image = tileImageFor(state);
    terrain.draw(state.grid, image, hexSize, range, tilePx, performance.now());
    const detailRange = tilePx >= DETAIL_TILE_PX ? range : null;
    roads.draw(state.grid, state.index.roads, hexSize);
    fieldworks.draw(state.grid, state.index.buildings, hexSize, detailRange, overlayState.ghost);
    nationLabels.draw(state, hexSize);
    buildings.draw(state.grid, state.index.buildings, hexSize, range, tilePx, state.elapsed, state.config.buildings, state.config.support.fortDefenceRadius);
    buildings.drawGhost(overlayState.ghost, hexSize);
    overlay.draw(overlayState, hexSize);
    soldiers.draw(state, hexSize, range, tilePx);
    ships.draw(state, hexSize, cameraState.scale, range, overlayState.selectedShip);
    fx.update(dtSeconds);

    const borderWidth = WORLD_BORDER_WIDTH / cameraState.scale;
    worldBorder.clear();
    worldBorder.rect(-borderWidth / 2, -borderWidth / 2, mapSize.width + borderWidth, mapSize.height + borderWidth);
    worldBorder.stroke({ width: borderWidth, color: WORLD_BORDER_COLOR });
  };

  const onTick = (ticker: Ticker): void => {
    if (!lastState) return;
    const now = ticker.lastTime;
    const dt = lastFxTime === 0 ? 0 : Math.min(0.1, (now - lastFxTime) / 1000);
    lastFxTime = now;
    resizeIfNeeded();
    drawFrame(lastState, dt);
  };

  let resizeObserver: ResizeObserver | null = null;
  let lastWidth = 0;
  let lastHeight = 0;
  
  let canvasLeft = 0;
  let canvasTop = 0;
  const resizeIfNeeded = (): void => {
    const rect = options.host.getBoundingClientRect();
    canvasLeft = rect.left;
    canvasTop = rect.top;
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));
    if (width === lastWidth && height === lastHeight) return;
    lastWidth = width;
    lastHeight = height;
    size.width = width;
    size.height = height;
    app.renderer.resize(width, height);
  };

  const world: WorldRenderer = {
    camera,
    async init(): Promise<void> {
      if (initialized.done) return;
      measure();
      lastWidth = size.width;
      lastHeight = size.height;
      await app.init({
        width: size.width,
        height: size.height,
        background: options.background ?? 0x14181c,
        antialias: false,
        roundPixels: true,
        autoStart: options.autoStart ?? true,
        resolution: Math.min(2, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1),
        autoDensity: true,
      });
      stage.addChild(terrain.container, roads.container, fieldworks.container, worldBorder, nationLabels.container, buildings.container, overlay.container, soldiers.container, ships.container, fx.container);
      app.stage.addChild(stage);
      options.host.appendChild(app.canvas);
      app.canvas.style.display = 'block';
      app.canvas.style.width = '100%';
      app.canvas.style.height = '100%';
      
      const rect = options.host.getBoundingClientRect();
      canvasLeft = rect.left;
      canvasTop = rect.top;

      initialized.done = true;
      if (options.autoStart ?? true) {
        app.ticker.add(onTick);
      }
      if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(() => resizeIfNeeded());
        resizeObserver.observe(options.host);
      }
    },
    render(state: GameState): void {
      if (!initialized.done) return;
      lastState = state;
      
      if (!(options.autoStart ?? true)) {
        const now = typeof performance !== 'undefined' ? performance.now() : 0;
        const dt = lastFxTime === 0 ? 0 : Math.min(0.1, (now - lastFxTime) / 1000);
        lastFxTime = now;
        resizeIfNeeded();
        drawFrame(state, dt);
      }
    },
    setOverlay(next: Partial<OverlayState>): void {
      if (next.selected !== undefined) overlayState.selected = next.selected;
      if (next.hovered !== undefined) overlayState.hovered = next.hovered;
      if (next.cannonFrom !== undefined) overlayState.cannonFrom = next.cannonFrom;
      if (next.cannonRange !== undefined) overlayState.cannonRange = next.cannonRange;
      if (next.cannonTarget !== undefined) overlayState.cannonTarget = next.cannonTarget;
      if (next.spawnPlots !== undefined) overlayState.spawnPlots = next.spawnPlots;
      if (next.ghost !== undefined) overlayState.ghost = next.ghost;
      if (next.selectedShip !== undefined) overlayState.selectedShip = next.selectedShip;
    },
    spawnFx(kind: FxKind, hex: Axial, color?: number): void {
      const hexSize = lastState?.config.map.hexSize ?? 32;
      fx.spawn(kind, hex, hexSize, color);
    },
    screenToHex(screenX: number, screenY: number): Axial {
      const hexSize = lastState?.config.map.hexSize ?? 32;
      return pixelToHex(camera.toWorld(screenX - canvasLeft, screenY - canvasTop), hexSize);
    },
    screenToWorld(screenX: number, screenY: number): Pixel {
      return camera.toWorld(screenX - canvasLeft, screenY - canvasTop);
    },
    worldToScreen(worldX: number, worldY: number): Pixel {
      const point = camera.toScreen(worldX, worldY);
      return { x: point.x + canvasLeft, y: point.y + canvasTop };
    },
    get size() {
      return size;
    },
    destroy(): void {
      if (!initialized.done) return;
      initialized.done = false;
      resizeObserver?.disconnect();
      resizeObserver = null;
      if (options.autoStart ?? true) app.ticker.remove(onTick);
      buildings.reset();
      fieldworks.reset();
      roads.reset();
      soldiers.reset();
      ships.reset();
      fx.clear();
      terrain.invalidate();
      app.destroy(true, { children: true });
      lastState = null;
      lastFxTime = 0;
    },
  };

  return world;
}

function toWorld(cameraState: Camera, screenX: number, screenY: number): Pixel {
  return {
    x: cameraState.x + screenX / cameraState.scale,
    y: cameraState.y + screenY / cameraState.scale,
  };
}
