import { createSignal } from 'solid-js';
import { ownerColor } from '../render/theme';
import { audio } from '../audio/audio.service';
import { createControllers } from './controllers';
import type { Camera } from '../render/world.types';
import { createMatchAudio } from '../audio/match-audio';
import { whenSettled } from '../game/store/store.service';
import { panBy } from '@the-big-war/frontend/session/camera';
import type { SpawnPlot } from '../render/overlay-layer.types';
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

const HOME_TILE_PX = 12;
const LEFT_RAIL_PX = 72;
const VIEW_EPSILON = 0.5;
const SCALE_EPSILON = 0.001;

export function createMatchRuntime(options: MatchRuntimeOptions): MatchRuntime {
  const { store, world, host } = options;
  const [cameraMoved, setCameraMoved] = createSignal(false);
  const [choosingSpawn, setChoosingSpawn] = createSignal(false);
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
    onTroopsSent: target => {
      world.spawnFx('captureFlash', target, undefined);
      audio.play('march');
      audio.play('warCry');
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

  const pickSpawn = (at: Pixel) => {
    const target = localToHex(at);
    if (!target) return;
    whenSettled(store.dispatch({ type: 'ChooseSpawn', empire: store.state.playerEmpire, target }), result => {
      if (!result.ok) {
        controllers.notice(result.reason);
        return;
      }
      world.spawnFx('captureFlash', target, undefined);
      runtime.confirmSpawn();
    });
  };

  const spawnPlots = (): SpawnPlot[] => {
    const plots: SpawnPlot[] = [];
    store.state.spawnSites.forEach((hex, empire) => {
      if (hex) plots.push({ hex, color: ownerColor(empire), own: empire === store.state.playerEmpire });
    });
    return plots;
  };

  const showWholeMap = () => {
    const { grid, config } = store.state;
    const mapWidth = grid.width * config.map.hexSize;
    const mapHeight = grid.height * config.map.hexSize;
    const scale = Math.min(world.size.width / mapWidth, world.size.height / mapHeight);
    world.camera.set({ scale, x: 0, y: 0 });
    const zoom = world.camera.scale;
    world.camera.set({
      x: clampAxis(0, mapWidth, world.size.width / zoom),
      y: clampAxis(0, mapHeight, world.size.height / zoom),
    });
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
        if (choosingSpawn()) pickSpawn(intent.at);
        else controllers.tap(intent.at);
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
        if (!choosingSpawn()) controllers.key(intent.key);
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
      selectedShip: controllers.selectedShip(),
      hovered: placing ? hover : null,
      ghost:
        placing && hover
          ? {
              hex: hover,
              kind: tool.building,
              valid: placementError(store.state, store.state.playerEmpire, hover, tool.building) === null,
            }
          : null,
      spawnPlots: choosingSpawn() ? spawnPlots() : [],
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

  const runtime: MatchRuntime = {
    controllers,
    cameraMoved,
    choosingSpawn,
    beginSpawnChoice(): void {
      store.setPaused(true);
      setChoosingSpawn(true);
      showWholeMap();
    },
    confirmSpawn(): void {
      setChoosingSpawn(false);
      whenSettled(store.dispatch({ type: 'ConfirmSpawn' }), result => {
        if (!result.ok) {
          controllers.notice(result.reason);
          return;
        }
        store.setPaused(false);
        runtime.fillScreenFromLeft();
      });
    },
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
      const cover = Math.max(viewWidth / mapWidth, viewHeight / mapHeight);
      const scale = Math.max(cover, HOME_TILE_PX / hexSize);
      let minQ = Infinity;
      let maxQ = -Infinity;
      let minR = Infinity;
      let maxR = -Infinity;
      for (const cell of grid.cells) {
        if (cell.owner !== store.state.playerEmpire) continue;
        minQ = Math.min(minQ, cell.q);
        maxQ = Math.max(maxQ, cell.q);
        minR = Math.min(minR, cell.r);
        maxR = Math.max(maxR, cell.r);
      }
      if (minQ === Infinity) {
        world.camera.set({ scale, x: 0, y: Math.max(0, (mapHeight - viewHeight / scale) / 2) });
      } else {
        const centreY = ((minR + maxR + 1) / 2) * hexSize;
        const centreX = ((minQ + maxQ + 1) / 2) * hexSize;
        const x = scale > cover ? centreX - viewWidth / (2 * scale) : Math.max(0, (minQ - 1) * hexSize);
        world.camera.set({ scale, x, y: centreY - viewHeight / (2 * scale) });
      }
      const zoom = world.camera.scale;
      world.camera.set({
        x: clampAxis(world.camera.x, mapWidth, viewWidth / zoom),
        y: clampAxis(world.camera.y, mapHeight, viewHeight / zoom),
      });
      if (minQ !== Infinity) {
        world.camera.set({ x: Math.min(world.camera.x, minQ * hexSize - LEFT_RAIL_PX / zoom) });
      }
      rememberHomeView();
    },
    centreOnHex(hex: Axial): void {
      centreOnWorld(axialToPixel(hex, store.state.config.map.hexSize));
      syncCameraMoved();
    },
  };

  return runtime;
}
