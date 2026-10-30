import { createBotAgents } from '../bot/bot.service';
import { dispatch } from '../commands/commands.service';
import { step } from '../simulation/simulation.service';
import { createInitialState } from '../state/setup.service';
import type { GameStore, StoreOptions } from './store.types';
import { DEFAULT_GAME_CONFIG } from '../config/config.constants';
import { createGameStore as createEngineStore } from '@the-big-war/game-engine/store/store.service';

export function createGameStore(options: StoreOptions = {}): GameStore {
  return createEngineStore({
    config: options.config ?? DEFAULT_GAME_CONFIG,
    createMatch: options.createMatch ?? createInitialState,
    step,
    dispatch,
    createAgents: createBotAgents,
    agentTickSeconds: state => state.config.bot.tickSeconds,
    startInMenu: options.startInMenu ?? true,
  });
}

let singleton: GameStore | null = null;

export function gameStore(): GameStore {
  if (!singleton) singleton = createGameStore();
  return singleton;
}

export function setGameStore(store: GameStore | null): GameStore | null {
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
