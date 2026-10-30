import type { GameState } from '../state/state.types';
import { step } from '../simulation/simulation.service';
import { createGameStore } from '../store/store.service';
import type { GameConfig } from '../config/config.types';
import { createMirrorStore } from './mirror-store.service';
import { createInitialState } from '../state/setup.service';
import { drainChangedTiles } from '../map/world-index.service';
import { fail } from '@the-big-war/game-engine/commands/command.service';
import type { Stepper } from '@the-big-war/game-engine/simulation/simulation.types';
import type { InProcessSim, PostReply, SimHost, SimReply, SimRequest } from './sim.types';
import { encodeFrame, encodeSnapshot, frameTransfer, snapshotTransfer, type ShipPaths } from './sim-codec.service';

const PERF_SAMPLES = 4096;

function record(samples: number[], value: number): void {
  if (samples.length >= PERF_SAMPLES) samples.shift();
  samples.push(value);
}

export function createSimHost(post: PostReply): SimHost {
  let demo = false;
  let suspended = false;
  let dirty = false;
  let paths: ShipPaths = new WeakMap();
  let lastTick = -1;
  let matchLoaded = false;
  let match = 0;
  let loopMs: number[] = [];
  let tickMs: number[] = [];
  let publishMs: number[] = [];

  const timedStep: Stepper<GameState> = (state, dt) => {
    const started = performance.now();
    step(state, dt);
    record(tickMs, performance.now() - started);
  };

  const createMatch = (config: GameConfig): GameState => {
    const state = createInitialState(config);
    const first = state.empires[0];
    if (demo && first) first.isHuman = false;
    return state;
  };

  const store = createGameStore({ createMatch, step: timedStep });

  const sendSnapshot = (seq: number): void => {
    paths = new WeakMap();
    matchLoaded = true;
    drainChangedTiles(store.state.index, () => {});
    const snapshot = encodeSnapshot(store.state, store.paused(), paths, seq, match);
    post(snapshot, snapshotTransfer(snapshot));
    lastTick = store.state.tick;
    dirty = false;
  };

  const publish = (): void => {
    if (!matchLoaded || (!dirty && store.state.tick === lastTick)) return;
    const started = performance.now();
    const frame = encodeFrame(store.state, store.paused(), paths);
    post(frame, frameTransfer(frame));
    lastTick = store.state.tick;
    dirty = false;
    record(publishMs, performance.now() - started);
  };

  const handle = (request: SimRequest): void => {
    switch (request.type) {
      case 'start':
        match += 1;
        demo = request.demo;
        store.startMatch(request.config);
        sendSnapshot(request.seq);
        return;
      case 'menu':
        match += 1;
        store.returnToMenu();
        sendSnapshot(request.seq);
        return;
      case 'command': {
        const stale = request.match !== match;
        const result = stale ? fail(request.command.type, 'stale_match') : store.dispatch(request.command);
        dirty = true;
        publish();
        post({ type: 'result', seq: request.seq, result }, []);
        return;
      }
      case 'paused':
        store.setPaused(request.value);
        dirty = true;
        publish();
        return;
      case 'speed':
        store.setSpeed(request.value);
        dirty = true;
        publish();
        return;
      case 'suspend':
        suspended = request.value;
        return;
      case 'perf':
        post({ type: 'perf', seq: request.seq, perf: { tickMs, loopMs, publishMs } }, []);
        tickMs = [];
        loopMs = [];
        publishMs = [];
        return;
    }
  };

  return {
    get state() {
      return store.state;
    },
    handle,
    advance(dtSeconds: number): void {
      if (suspended) return;
      const started = performance.now();
      store.step(dtSeconds);
      record(loopMs, performance.now() - started);
    },
    publish,
  };
}

export function createInProcessSim(): InProcessSim {
  let deliver: (reply: SimReply) => void = () => {};
  const host = createSimHost((reply, transfer) => deliver(structuredClone(reply, { transfer })));
  const store = createMirrorStore({
    post: request => host.handle(structuredClone(request)),
    listen: handler => {
      deliver = handler;
    },
  });
  return { host, store };
}
