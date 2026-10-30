import type { HexCell } from '../map/map.types';
import type { EmpireId } from '../empire/empire.types';
import type { Axial } from '@the-big-war/game-engine/world-tile/world-tile.types';

export type BuildingId = number;

export type BuildingKind =
  | 'city'
  | 'market'
  | 'lumberjack'
  | 'miner'
  | 'farm'
  | 'lab'
  | 'port'
  | 'fishery'
  | 'barracks'
  | 'fort'
  | 'cannon'
  | 'trench'
  | 'machine_gun'
  | 'battery'
  | 'bunker'
  | 'tank';

export type GathererPhase = 'idle' | 'outbound' | 'working' | 'returning';

export interface Gatherer {
  pos: Axial;
  target: Axial | null;
  phase: GathererPhase;

  progress: number;
  duration: number;
}

export type WalkerPhase = 'outbound' | 'building' | 'returning';

export interface Walker {
  readonly site: BuildingId;
  readonly empire: EmpireId;
  readonly path: readonly number[];

  pos: Axial;
  phase: WalkerPhase;
  leg: number;
  progress: number;
}

export interface Building {
  readonly id: BuildingId;
  readonly kind: BuildingKind;

  level: number;

  cooldown: number;

  growth: number;

  demolishAt: number | null;

  buildRemaining: number;

  gatherers: Gatherer[];

  garrison: number;

  machineGun: boolean;

  shipBuild: number;

  shellDamage: number;
}

export interface OwnedBuilding {
  readonly hex: Axial;
  readonly cell: HexCell;
  readonly building: Building;
}
