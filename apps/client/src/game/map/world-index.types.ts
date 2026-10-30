import type { HexCell } from './map.types';
import type { EmpireId } from '../empire/empire.types';

export interface WorldIndex {
  readonly tiles: Map<EmpireId, Set<number>>;
  readonly sortedTiles: Map<EmpireId, readonly HexCell[]>;
  readonly buildings: number[];
  readonly empireBuildings: Map<EmpireId, number[]>;
  readonly population: Map<EmpireId, number>;
  readonly changedTiles: number[];
  readonly changedFlags: Uint8Array;
}
