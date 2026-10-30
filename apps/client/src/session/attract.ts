import { configFromSettings, rivalFactions } from './flow';
import { assignNationColors } from '../render/nation-colors';
import { createWorkerStore } from '../game/sim/worker-store';
import { createFrameLoop } from '@the-big-war/frontend/session/frame-loop';
import type { AttractMode, AttractOptions, AttractSequence } from './attract.types';

export type * from './attract.types';

const DRIFT_PERIOD_SECONDS = 70;

export const ATTRACT_SEQUENCES: readonly AttractSequence[] = [
  {
    settings: { bots: rivalFactions(4), mapSize: 'skirmish', preset: 'continents', difficulty: 'hard', neutralStates: 'few', seed: 1914 },
    seconds: 75,
    speed: 4,
  },
  {
    settings: { bots: rivalFactions(5), mapSize: 'skirmish', preset: 'pangaea', difficulty: 'hard', neutralStates: 'many', seed: 1939 },
    seconds: 90,
    speed: 4,
  },
  {
    settings: { bots: rivalFactions(2), mapSize: 'skirmish', preset: 'continents', difficulty: 'hard', neutralStates: 'none', seed: 1066 },
    seconds: 60,
    speed: 4,
  },
  {
    settings: { bots: rivalFactions(5), mapSize: 'skirmish', preset: 'straits', difficulty: 'hard', neutralStates: 'few', seed: 1815 },
    seconds: 90,
    speed: 4,
  },
];

export function createAttractMode(options: AttractOptions): AttractMode {
  const { world } = options;
  const sequences = options.sequences ?? ATTRACT_SEQUENCES;
  const store = createWorkerStore(true);

  let index = -1;
  let elapsed = 0;
  let baseScale = 1;
  let loading = false;
  let ready = false;
  let active = false;

  const mapExtent = () => {
    const { grid, config } = store.state;
    return { width: grid.width * config.map.hexSize, height: grid.height * config.map.hexSize };
  };

  const next = async (): Promise<void> => {
    loading = true;
    index = (index + 1) % sequences.length;
    const sequence = sequences[index]!;
    await store.startMatch(configFromSettings(sequence.settings));
    loading = false;
    ready = true;
    if (!active) {
      store.setPaused(true);
      return;
    }
    assignNationColors(store.state);
    store.setSpeed(sequence.speed);
    elapsed = 0;
    const map = mapExtent();
    baseScale = Math.max(world.size.width / map.width, world.size.height / map.height) * 1.35;
  };

  const drift = (): void => {
    const map = mapExtent();
    const phase = (elapsed / DRIFT_PERIOD_SECONDS) * Math.PI * 2;
    const scale = baseScale * (1 + 0.12 * Math.sin(phase * 0.5));
    const viewWidth = world.size.width / scale;
    const viewHeight = world.size.height / scale;
    const spanX = Math.max(0, map.width - viewWidth);
    const spanY = Math.max(0, map.height - viewHeight);
    world.camera.set({
      scale,
      x: spanX * (0.5 + 0.5 * Math.sin(phase)),
      y: spanY * (0.5 + 0.5 * Math.sin(phase * 0.7 + 1)),
    });
  };

  const loop = createFrameLoop(dt => {
    if (!ready) return;
    elapsed += dt;
    if (!loading && (elapsed >= sequences[index]!.seconds || store.status() === 'ended')) void next();
    drift();
    world.render(store.state);
  });

  return {
    start(): void {
      if (loop.running()) return;
      index = -1;
      active = true;
      ready = false;
      world.setOverlay({ selected: null, hovered: null, ghost: null, cannonFrom: null, cannonTarget: null });
      void next();
      loop.start();
    },
    stop(): void {
      active = false;
      loop.stop();
      store.setPaused(true);
    },
  };
}
