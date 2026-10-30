import { createBotAgents } from '../bot/bot.service';
import { dispatch } from '../commands/commands.service';
import { step } from '../simulation/simulation.service';
import { createInitialState } from '../state/setup.service';
import type { CommandResult } from '../commands/commands.types';
import { DEFAULT_GAME_CONFIG } from '../config/config.constants';
import type { ClientStore, CommandReply, GameStore, StoreOptions } from './store.types';
import { createGameStore as createEngineStore } from '@the-big-war/game-engine/store/store.service';

export function createGameStore(options: StoreOptions = {}): GameStore {
  return createEngineStore({
    config: options.config ?? DEFAULT_GAME_CONFIG,
    createMatch: options.createMatch ?? createInitialState,
    step: options.step ?? step,
    dispatch,
    createAgents: createBotAgents,
    agentTickSeconds: state => state.config.bot.tickSeconds,
    startInMenu: options.startInMenu ?? true,
  });
}

export function whenSettled(reply: CommandReply, then: (result: CommandResult) => void): void {
  if (reply instanceof Promise) void reply.then(then);
  else then(reply);
}

let singleton: ClientStore | null = null;

export function gameStore(): ClientStore {
  if (!singleton) singleton = createGameStore();
  return singleton;
}

export function setGameStore(store: ClientStore | null): ClientStore | null {
  const previous = singleton;
  singleton = store;
  return previous;
}

export function live<T>(read: () => T): () => T {
  return () => {
    gameStore().version();
    return read();
  };
}
