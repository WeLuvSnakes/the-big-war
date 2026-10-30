import { createSignal } from 'solid-js';
import type { GameState } from '../state/state.types';
import type { GameConfig } from '../config/config.types';
import { DEFAULT_GAME_CONFIG } from '../config/config.constants';
import type { Command, CommandResult } from '../commands/commands.types';
import type { MirrorStore, SimLink, SimPerf, SimReply } from './sim.types';
import { applyFrame, applySnapshot, emptyMirror } from './sim-codec.service';

export function createMirrorStore(link: SimLink, demo = false): MirrorStore {
  let current = emptyMirror(DEFAULT_GAME_CONFIG);
  let nextSeq = 1;
  let match = 0;
  const [version, setVersion] = createSignal(0);
  const [paused, setPausedSignal] = createSignal(false);
  const waiting = new Map<number, (value: never) => void>();

  const request = <T>(send: (seq: number) => void): Promise<T> =>
    new Promise<T>(resolve => {
      const seq = nextSeq++;
      waiting.set(seq, resolve as (value: never) => void);
      send(seq);
    });

  const settle = (seq: number, value?: unknown): void => {
    const resolve = waiting.get(seq);
    waiting.delete(seq);
    resolve?.(value as never);
  };

  const receive = (reply: SimReply): void => {
    switch (reply.type) {
      case 'snapshot':
        current = applySnapshot(reply);
        match = reply.match;
        setPausedSignal(reply.frame.paused);
        setVersion(value => value + 1);
        settle(reply.seq);
        return;
      case 'frame':
        applyFrame(current, reply);
        setPausedSignal(reply.paused);
        setVersion(value => value + 1);
        return;
      case 'result':
        settle(reply.seq, reply.result);
        return;
      case 'perf':
        settle(reply.seq, reply.perf);
        return;
    }
  };

  link.listen(receive);

  return {
    get state(): GameState {
      return current;
    },
    version,
    dispatch: (command: Command) =>
      request<CommandResult>(seq => link.post({ type: 'command', seq, match, command })),
    step: () => {},
    startMatch: (config?: GameConfig) => request<void>(seq => link.post({ type: 'start', seq, config, demo })),
    returnToMenu: () => {
      void request<void>(seq => link.post({ type: 'menu', seq }));
    },
    setPaused: value => link.post({ type: 'paused', value }),
    paused,
    setSpeed: value => link.post({ type: 'speed', value }),
    status: () => current.status,
    winner: () => current.winner,
    perf: () => request<SimPerf>(seq => link.post({ type: 'perf', seq })),
  };
}
