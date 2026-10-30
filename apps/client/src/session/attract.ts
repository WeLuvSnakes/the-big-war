import { configFromSettings } from './flow';
import { assignNationColors } from '../render/nation-colors';
import { FACTIONS } from '../game/faction/faction.constants';
import { createGameStore } from '../game/store/store.service';
import { createInitialState } from '../game/state/setup.service';
import { createFrameLoop } from '@the-big-war/frontend/session/frame-loop';
import type { AttractMode, AttractOptions, AttractSequence } from './attract.types';

export type * from './attract.types';

const rivals = (count: number): string[] =>
  Array.from({ length: count }, (_, i) => FACTIONS[(i + 1) % FACTIONS.length]!.id);

const DRIFT_PERIOD_SECONDS = 70;

export const ATTRACT_SEQUENCES: readonly AttractSequence[] = [
  {
    settings: { bots: rivals(4), mapSize: 'small', difficulty: 'hard', neutralStates: 'few', seed: 1914 },
    seconds: 75,
    speed: 4,
  },
  {
    settings: { bots: rivals(5), mapSize: 'medium', difficulty: 'hard', neutralStates: 'many', seed: 1939 },
    seconds: 90,
    speed: 4,
  },
  {
    settings: { bots: rivals(2), mapSize: 'small', difficulty: 'hard', neutralStates: 'none', seed: 1066 },
    seconds: 60,
    speed: 4,
  },
  {
    settings: { bots: rivals(5), mapSize: 'large', difficulty: 'hard', neutralStates: 'few', seed: 1815 },
    seconds: 90,
    speed: 4,
  },
];

export function createAttractMode(options: AttractOptions): AttractMode {
  const { world } = options;
  const sequences = options.sequences ?? ATTRACT_SEQUENCES;
  const store = createGameStore({
    createMatch: config => {
      const state = createInitialState(config);
      const first = state.empires[0];
      if (first) first.isHuman = false;
      return state;
    },
  });

  let index = -1;
  let elapsed = 0;
  let baseScale = 1;

  const mapExtent = () => {
    const { grid, config } = store.state;
    return { width: grid.width * config.map.hexSize, height: grid.height * config.map.hexSize };
  };

  const next = (): void => {
    index = (index + 1) % sequences.length;
    const sequence = sequences[index]!;
    store.startMatch(configFromSettings(sequence.settings));
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
    elapsed += dt;
    if (elapsed >= sequences[index]!.seconds || store.status() === 'ended') next();
    store.step(dt);
    drift();
    world.render(store.state);
  });

  return {
    start(): void {
      if (loop.running()) return;
      index = -1;
      world.setOverlay({ selected: null, hovered: null, ghost: null, cannonFrom: null, cannonTarget: null });
      next();
      loop.start();
    },
    stop(): void {
      loop.stop();
    },
  };
}
