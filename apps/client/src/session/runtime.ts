import { createSignal } from 'solid-js';
import { audio } from '../audio/audio.service';
import { createControllers } from './controllers';
import type { Camera } from '../render/world.types';
import { createMatchAudio } from '../audio/match-audio';
import { panBy } from '@the-big-war/frontend/session/camera';
import { placementError } from '../game/building/building.service';
import type { MatchRuntime, MatchRuntimeOptions } from './runtime.types';
import { createFrameLoop } from '@the-big-war/frontend/session/frame-loop';
import { attachInput, type InputIntent } from '@the-big-war/frontend/session/input';
import type { Axial, Pixel } from '@the-big-war/game-engine/world-tile/world-tile.types';
import { axialToPixel, gridInBounds } from '@the-big-war/game-engine/world-tile/world-tile.service';

export type * from './runtime.types';


const clampAxis = (value: number, mapExtent: number, viewExtent: number): number => {
  const overflow = mapExtent - viewExtent;
  return overflow < 0 ? overflow / 2 : Math.min(overflow, Math.max(0, value));
};

const VIEW_EPSILON = 0.5;
const SCALE_EPSILON = 0.001;

export function createMatchRuntime(options: MatchRuntimeOptions): MatchRuntime {
  const { store, world, host } = options;
  const [cameraMoved, setCameraMoved] = createSignal(false);
  let homeView: Camera | null = null;

  const viewIsHome = (): boolean => {
    if (!homeView) return true;
    return (
      Math.abs(world.camera.x - homeView.x) <= VIEW_EPSILON &&
      Math.abs(world.camera.y - homeView.y) <= VIEW_EPSILON &&
      Math.abs(world.camera.scale - homeView.scale) <= SCALE_EPSILON
    );
  };

  const syncCameraMoved = (): void => {
    setCameraMoved(!viewIsHome());
  };

  const rememberHomeView = (): void => {
    homeView = { x: world.camera.x, y: world.camera.y, scale: world.camera.scale };
    setCameraMoved(false);
  };

  const localToHex = (at: Pixel): Axial | null => {
    const rect = host.getBoundingClientRect();
    const hex = world.screenToHex(at.x + rect.left, at.y + rect.top);
    if (!gridInBounds(store.state.grid, hex.q, hex.r)) return null;
    return hex;
  };

  const controllers = createControllers({
    store,
    viewport: () => ({ x: world.size.width, y: world.size.height }),
    screenToHex: localToHex,
    clientToHex: at => {
      const hex = world.screenToHex(at.x, at.y);
      return gridInBounds(store.state.grid, hex.q, hex.r) ? hex : null;
    },
    onTroopsSent: (from, target) => {
      world.spawnFx('captureFlash', target, undefined);
      audio.play('march');
      audio.play('warCry');
      void from;
    },
  });

  const centreOnWorld = (point: Pixel) => {
    const scale = world.camera.scale;
    const viewWidth = world.size.width > 10 ? world.size.width : (typeof window !== 'undefined' ? window.innerWidth : 1200);
    const viewHeight = world.size.height > 10 ? world.size.height : (typeof window !== 'undefined' ? window.innerHeight : 800);
    world.camera.set({
      x: point.x - viewWidth / (2 * scale),
      y: point.y - viewHeight / (2 * scale),
    });
  };

  const empireCentroid = (empire: number): Pixel | null => {
    const grid = store.state.grid;
    const hexSize = store.state.config.map.hexSize;
    let sumX = 0;
    let sumY = 0;
    let count = 0;
    for (const cell of grid.cells) {
      if (cell.owner !== empire) continue;
      const pixel = axialToPixel({ q: cell.q, r: cell.r }, hexSize);
      sumX += pixel.x;
      sumY += pixel.y;
      count++;
    }
    return count === 0 ? null : { x: sumX / count, y: sumY / count };
  };

  const handleIntent = (intent: InputIntent) => {
    switch (intent.kind) {
      case 'pan':
        panBy(world.camera, intent.dx, intent.dy);
        syncCameraMoved();
        return;
      case 'zoom':
        
        world.camera.zoomBy(intent.factor, intent.anchor.x, intent.anchor.y);
        syncCameraMoved();
        return;
      case 'tap':
        controllers.tap(intent.at);
        return;
      case 'longPress':
        controllers.secondary(intent.at);
        return;
      case 'cancel':
        if (controllers.tool().kind === 'place') controllers.cancelTool();
        return;
      case 'hover':
        controllers.setHover(localToHex(intent.at));
        return;
      case 'leave':
        controllers.setHover(null);
        return;
      case 'panEnd':
        return;
      case 'key':
        controllers.key(intent.key);
        return;
    }
  };

  let detach: (() => void) | null = null;
  let endedNotified = false;
  const matchAudio = createMatchAudio(store);

  const loop = createFrameLoop(dt => {
    store.step(dt);
    matchAudio.update(dt);

    const tool = controllers.tool();
    const hover = controllers.hoverHex();
    const placing = tool.kind === 'place';
    world.setOverlay({
      selected: controllers.selectedHex(),
      hovered: placing ? hover : null,
      ghost:
        placing && hover
          ? {
              hex: hover,
              kind: tool.building,
              valid: placementError(store.state, store.state.playerEmpire, hover, tool.building) === null,
            }
          : null,
      cannonFrom: tool.kind === 'cannon' || tool.kind === 'trench-attack' ? tool.from : null,
      cannonRange: tool.kind === 'trench-attack' ? 1 : store.state.config.cannon.range,
      cannonTarget: tool.kind === 'cannon' || tool.kind === 'trench-attack' ? controllers.hoverHex() : null,
    });
    world.render(store.state);

    if (!endedNotified && store.status() === 'ended') {
      endedNotified = true;
      options.onEnded?.(store.winner());
    }
  });

  return {
    controllers,
    cameraMoved,
    start(): void {
      detach = attachInput({ element: host, viewport: () => ({ x: world.size.width, y: world.size.height }), onIntent: handleIntent });
      endedNotified = false;
      world.render(store.state);
      loop.start();
    },
    stop(): void {
      loop.stop();
      detach?.();
      detach = null;
    },
    resetCamera(): void {
      if (homeView) world.camera.set(homeView);
      setCameraMoved(false);
    },
    centreOnEmpire(empire: number): void {
      const point = empireCentroid(empire);
      if (point) {
        centreOnWorld(point);
        syncCameraMoved();
      }
    },
    fillScreenFromLeft(): void {
      const grid = store.state.grid;
      const hexSize = store.state.config.map.hexSize;
      const mapWidth = grid.width * hexSize;
      const mapHeight = grid.height * hexSize;
      const viewWidth = world.size.width > 10 ? world.size.width : (typeof window !== 'undefined' ? window.innerWidth : 1200);
      const viewHeight = world.size.height > 10 ? world.size.height : (typeof window !== 'undefined' ? window.innerHeight : 800);
      const scale = Math.max(viewWidth / mapWidth, viewHeight / mapHeight);
      let minQ = Infinity;
      let minR = Infinity;
      let maxR = -Infinity;
      for (const cell of grid.cells) {
        if (cell.owner !== store.state.playerEmpire) continue;
        minQ = Math.min(minQ, cell.q);
        minR = Math.min(minR, cell.r);
        maxR = Math.max(maxR, cell.r);
      }
      if (minQ === Infinity) {
        world.camera.set({ scale, x: 0, y: Math.max(0, (mapHeight - viewHeight / scale) / 2) });
      } else {
        const centreY = ((minR + maxR + 1) / 2) * hexSize;
        world.camera.set({ scale, x: Math.max(0, (minQ - 1) * hexSize), y: centreY - viewHeight / (2 * scale) });
      }
      const zoom = world.camera.scale;
      world.camera.set({
        x: clampAxis(world.camera.x, mapWidth, viewWidth / zoom),
        y: clampAxis(world.camera.y, mapHeight, viewHeight / zoom),
      });
      rememberHomeView();
    },
    centreOnHex(hex: Axial): void {
      centreOnWorld(axialToPixel(hex, store.state.config.map.hexSize));
      syncCameraMoved();
    },
  };
}
