import type { UnitId } from '../unit/unit.types';
import type { EmpireId } from '../empire/empire.types';
import type { Rng } from '@the-big-war/game-engine/rng/rng.types';
import type { Axial } from '@the-big-war/game-engine/world-tile/world-tile.types';

export interface BotPersonality {
  readonly aggression: number;
  readonly economy: number;
  readonly expansion?: number;
}

export interface BotSkill {
  readonly reactionSeconds: number;
  readonly slop: number;
  readonly armyShare: number;
  readonly attackRatio: number;
  readonly barracksIncome: number;
  readonly barracksDeadline: number;
  readonly scoutSquads: number;
  readonly retreat: boolean;
  readonly counters: boolean;
  readonly maxProducers: number;
}

export interface Bot {
  readonly empire: EmpireId;
  readonly personality: BotPersonality;
  readonly skill: BotSkill;

  readonly rng: Rng;

  clock: number;
  readonly cooldowns: Map<string, number>;
  reserve: number;
  armyBudget: number;
  readonly scouts: Set<UnitId>;
  readonly tracks: Map<UnitId, UnitTrack>;
  readonly boardingSince: Map<UnitId, number>;
}

export interface UnitTrack {
  readonly gap: number;
  readonly since: number;
}

export interface BotOptions {
  readonly empire: EmpireId;

  readonly seed: number;
  readonly personality?: BotPersonality;
  readonly difficulty?: number;
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
