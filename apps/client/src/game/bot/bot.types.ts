import type { EmpireId } from '../empire/empire.types';
import type { Rng } from '@the-big-war/game-engine/rng/rng.types';
import type { Axial } from '@the-big-war/game-engine/world-tile/world-tile.types';

export interface BotPersonality {
  readonly aggression: number;
  readonly economy: number;
  readonly expansion?: number;
}

export interface Bot {
  readonly empire: EmpireId;
  readonly personality: BotPersonality;

  readonly rng: Rng;

  clock: number;
  readonly cooldowns: Map<string, number>;
}

export interface BotOptions {
  readonly empire: EmpireId;

  readonly seed: number;
  readonly personality?: BotPersonality;
}

export interface HostileEdge {
  readonly from: Axial;
  readonly target: Axial;
  readonly defender: EmpireId;
}


export interface CannonShot {
  readonly from: Axial;
  readonly target: Axial;
}
