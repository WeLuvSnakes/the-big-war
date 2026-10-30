import type { EmpireId } from '../empire/empire.types';
import type { Axial } from '@the-big-war/game-engine/world-tile/world-tile.types';
import type { MinHeap } from '@the-big-war/game-engine/collections/min-heap.types';

export type OffensiveId = number;

export interface ModifierLine {
  readonly label: string;

  readonly attack: number;
  readonly defence: number;
}

export interface OffensiveMarch {
  readonly from: Axial;
  readonly to: Axial;
  readonly duration: number;

  progress: number;
}

export interface Offensive {
  readonly id: OffensiveId;
  readonly empire: EmpireId;
  readonly target: EmpireId;

  troops: number;
  focus: Axial;
  head: Axial;
  march: OffensiveMarch | null;

  budget: number;
  order: number;
  taken: number;

  readonly frontier: MinHeap;
  readonly queued: Set<number>;
  readonly recent: Axial[];
}
