import type { ModifierTotals } from '../modifier/modifier.types';

export type EmpireId = number;

export interface EmpireResearch {
  readonly completed: string[];

  readonly chosen: Record<string, string>;

  active: {
    readonly nodeId: string;

    progress: number;

    readonly optionId: string | null;
  } | null;
}

export interface Empire {
  readonly id: EmpireId;
  readonly name: string;

  factionId: string;
  isHuman: boolean;
  readonly neutralState: boolean;

  readonly colorIndex: number;
  gold: number;
  science: number;

  goldBalance: number;

  scienceBalance: number;

  civilians: number;

  civilianBalance: number;

  bonuses: ModifierTotals;
  research: EmpireResearch;

  readonly unlocks: string[];

  hexCount: number;
  alive: boolean;

  eliminatedAt: number | null;
}

export interface EmpireSeed {
  readonly id: EmpireId;
  readonly name: string;
  readonly factionId: string;
  readonly isHuman: boolean;
  readonly neutralState: boolean;
}
