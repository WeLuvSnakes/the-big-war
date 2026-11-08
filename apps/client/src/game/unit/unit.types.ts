import type { EmpireId } from '../empire/empire.types';
import type { BuildingId } from '../building/building.types';

export type UnitId = number;

export type UnitKind = 'infantry' | 'assault' | 'mg' | 'sniper' | 'mrap' | 'tank';

export type UnitShape = 'circle' | 'diamond' | 'square' | 'triangle' | 'vehicle';

export type UnitMode = 'amove' | 'guard' | 'hold';

export type Formation = 'wedge' | 'column' | 'file' | 'vee';

export type UnitProducer = 'barracks' | 'factory';

export type WeaponSound = UnitKind | 'coax';

export interface WeaponStats {
  readonly range: number;
  readonly damage: number;
  readonly cooldown: number;
  readonly accuracy: number;
  readonly falloff: number;
  readonly penetration: number;
  readonly splash: number;
  readonly suppression: number;
  readonly sound: WeaponSound;
}

export interface UnitStats {
  readonly name: string;
  readonly hotkey: string;
  readonly description: string;
  readonly hp: number;
  readonly speed: number;
  readonly size: number;
  readonly armor: number;
  readonly vehicle: boolean;
  readonly shape: UnitShape;
  readonly setupSeconds: number;
  readonly weapon: WeaponStats;
  readonly coax: WeaponStats | null;
  readonly producer: UnitProducer;
  readonly gold: number;
  readonly civilians: number;
  readonly population: number;
  readonly trainSeconds: number;
}

export interface Unit {
  readonly id: UnitId;
  readonly kind: UnitKind;
  readonly empire: EmpireId;

  x: number;
  y: number;
  hp: number;

  tx: number;
  ty: number;
  gx: number;
  gy: number;
  target: UnitId | null;
  mode: UnitMode;
  formation: Formation;
  heading: number | null;

  face: number;
  hull: number;
  moving: boolean;

  cooldown: number;
  coaxCooldown: number;
  setup: number;
  suppression: number;

  captureAt: number;
  capture: number;
}

export interface ProductionQueue {
  readonly building: BuildingId;
  readonly empire: EmpireId;
  readonly at: number;

  queue: UnitKind[];
  progress: number;
}

export type UnitEventKind = 'shot' | 'blast' | 'death';

export interface UnitEvent {
  readonly id: number;
  readonly kind: UnitEventKind;
  readonly empire: EmpireId;
  readonly x: number;
  readonly y: number;
  readonly ex: number;
  readonly ey: number;
  readonly sound: WeaponSound;
  readonly heavy: boolean;
  readonly vehicle: boolean;
  readonly angle: number;
  readonly size: number;
  readonly radius: number;
}

export type UnitOrder =
  | { readonly kind: 'move'; readonly mode: 'amove' | 'guard'; readonly x: number; readonly y: number; readonly formation: Formation }
  | { readonly kind: 'attack'; readonly target: UnitId }
  | { readonly kind: 'hold' }
  | { readonly kind: 'arrange'; readonly formation: Formation };
