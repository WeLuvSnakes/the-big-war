import type { Accessor } from 'solid-js';
import type { MapPreset } from '../game/map/map.types';

export type Screen = 'menu' | 'match' | 'end';

export type MapSize = 'skirmish' | 'regional' | 'continental' | 'world';

export type Difficulty = 'easy' | 'normal' | 'hard';

export type NeutralStates = 'none' | 'few' | 'many';

export interface MatchSettings {
  readonly bots: readonly string[];
  readonly mapSize: MapSize;
  readonly preset: MapPreset;
  readonly difficulty: Difficulty;
  readonly neutralStates: NeutralStates;
  readonly seed: number;
}

export interface MatchResult {
  readonly winner: number | null;
  readonly playerWon: boolean;
}

export interface MatchFlow {
  readonly screen: Accessor<Screen>;
  readonly settings: Accessor<MatchSettings>;
  readonly playerFaction: Accessor<string>;
  readonly playerName: Accessor<string>;
  readonly playerColorIndex: Accessor<number>;
  readonly lastResult: Accessor<MatchResult | null>;

  backToMenu(): void;
  updateSettings(patch: Partial<MatchSettings>): void;
  chooseFaction(factionId: string): void;
  setPlayerName(name: string): void;
  setPlayerColorIndex(colorIndex: number): void;

  enterMatch(): void;

  showResult(winner: number | null, playerEmpire: number): void;
}
