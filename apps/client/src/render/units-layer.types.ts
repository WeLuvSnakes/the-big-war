import type { UnitId } from '../game/unit/unit.types';
import type { EmpireId } from '../game/empire/empire.types';

export interface SelectionBox {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

export interface UnitsView {
  readonly player: EmpireId;
  readonly selected: ReadonlySet<UnitId>;
  readonly box: SelectionBox | null;
}

export interface UnitShot {
  readonly x: number;
  readonly y: number;
  readonly ex: number;
  readonly ey: number;
  readonly heavy: boolean;
  readonly sniper: boolean;
  life: number;
}

export interface UnitBoom {
  readonly x: number;
  readonly y: number;
  readonly r: number;
  life: number;
}

export interface UnitBody {
  readonly x: number;
  readonly y: number;
  readonly empire: EmpireId;
  readonly angle: number;
  readonly wreck: boolean;
  readonly size: number;
}

export interface UnitMark {
  readonly x: number;
  readonly y: number;
  readonly color: number;
  life: number;
}
