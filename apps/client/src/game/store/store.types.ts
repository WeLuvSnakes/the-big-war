import type { GameState } from '../state/state.types';
import type { GameConfig } from '../config/config.types';
import type { Command, CommandResult } from '../commands/commands.types';
import type { Stepper } from '@the-big-war/game-engine/simulation/simulation.types';
import type { GameStore as EngineGameStore } from '@the-big-war/game-engine/store/store.types';

export type MatchFactory = (config: GameConfig) => GameState;

export type GameStore = EngineGameStore<GameState, Command, CommandResult, GameConfig>;

export type CommandReply = CommandResult | Promise<CommandResult>;

export interface ClientStore {
  readonly state: GameState;
  readonly version: EngineGameStore<GameState, Command, CommandResult, GameConfig>['version'];
  dispatch(command: Command): CommandReply;
  step(dtSeconds: number): void;
  startMatch(config?: GameConfig): void | Promise<void>;
  returnToMenu(): void;
  setPaused(paused: boolean): void;
  readonly paused: () => boolean;
  setSpeed(speed: GameState['speed']): void;
  readonly status: () => GameState['status'];
  readonly winner: () => GameState['winner'];
}

export interface StoreOptions {
  readonly createMatch?: MatchFactory;

  readonly config?: GameConfig;

  readonly startInMenu?: boolean;

  readonly step?: Stepper<GameState>;
}
