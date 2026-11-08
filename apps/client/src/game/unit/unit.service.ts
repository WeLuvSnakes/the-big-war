import { atWar } from '../ship/ship.service';
import type { HexCell } from '../map/map.types';
import type { GameState } from '../state/state.types';
import type { EmpireId } from '../empire/empire.types';
import { buildingCellsOf } from '../map/world-index.service';
import { nextFloat } from '@the-big-war/game-engine/rng/rng.service';
import { FORMATION_RANK, UNIT_STATS, UNIT_TUNING } from './unit.constants';
import { gridAt } from '@the-big-war/game-engine/world-tile/world-tile.service';
import type { Formation, Unit, UnitEvent, UnitId, UnitKind, UnitMode, UnitOrder, UnitStats } from './unit.types';

export function unitStats(kind: UnitKind): UnitStats {
  return UNIT_STATS[kind];
}

export function createUnit(state: GameState, kind: UnitKind, empire: EmpireId, x: number, y: number, face = 0): Unit {
  const stats = unitStats(kind);
  return {
    id: state.nextUnitId++,
    kind,
    empire,
    x,
    y,
    hp: stats.hp,
    tx: x,
    ty: y,
    gx: x,
    gy: y,
    target: null,
    mode: 'amove',
    formation: 'wedge',
    heading: null,
    face,
    hull: face,
    moving: false,
    cooldown: nextFloat(state.rng) * stats.weapon.cooldown,
    coaxCooldown: 0,
    setup: stats.setupSeconds,
    suppression: 0,
    captureAt: -1,
    capture: 0,
  };
}

export function unitById(state: GameState, id: UnitId): Unit | undefined {
  return state.units.find(unit => unit.id === id);
}

export function unitsOf(state: GameState, empire: EmpireId): Unit[] {
  return state.units.filter(unit => unit.empire === empire);
}

export function hostileUnits(state: GameState, a: EmpireId, b: EmpireId): boolean {
  return atWar(state, a, b);
}

export function cellAtPixel(state: GameState, x: number, y: number): HexCell | undefined {
  const size = state.config.map.hexSize;
  return gridAt(state.grid, { q: Math.floor(x / size), r: Math.floor(y / size) });
}

export function isWalkable(cell: HexCell | undefined): boolean {
  return !!cell && cell.terrain !== 'water' && cell.terrain !== 'mountain';
}

export function isCover(cell: HexCell | undefined): boolean {
  return !!cell && (cell.terrain === 'forest' || cell.terrain === 'mountain' || (cell.building?.kind === 'trench' && cell.building.buildRemaining <= 0));
}

export function populationOf(state: GameState, empire: EmpireId): number {
  let total = 0;
  for (const unit of state.units) if (unit.empire === empire) total += unitStats(unit.kind).population;
  for (const line of state.production) {
    if (line.empire !== empire) continue;
    for (const kind of line.queue) total += unitStats(kind).population;
  }
  return total;
}

export function populationCap(state: GameState, empire: EmpireId): number {
  let producers = 0;
  for (const cell of buildingCellsOf(state, empire)) {
    const building = cell.building;
    if (!building || building.buildRemaining > 0) continue;
    if (building.kind === 'barracks' || building.kind === 'factory') producers += 1;
  }
  return UNIT_TUNING.basePopulation + producers * UNIT_TUNING.populationPerProducer;
}

export function formationSlot(formation: Formation, index: number): readonly [number, number] {
  const rank = Math.ceil(index / 2);
  const side = index % 2 ? -1 : 1;
  if (formation === 'wedge') return [side * rank, rank];
  if (formation === 'vee') return [side * rank, -rank];
  if (formation === 'column') return [(index % 2) - 0.5, Math.floor(index / 2)];
  return [0, index];
}

export function groupFormation(units: readonly Unit[]): Formation {
  const first = units[0];
  if (!first) return 'wedge';
  return units.every(unit => unit.formation === first.formation) ? first.formation : 'wedge';
}

const centre = (units: readonly Unit[], pick: (unit: Unit) => number): number =>
  units.reduce((sum, unit) => sum + pick(unit), 0) / units.length;

export function orderGroup(units: readonly Unit[], x: number, y: number, mode: UnitMode, formation: Formation, facing?: number): void {
  if (units.length === 0) return;
  const cx = centre(units, unit => unit.x);
  const cy = centre(units, unit => unit.y);
  const angle = facing ?? Math.atan2(y - cy, x - cx);
  const fx = Math.cos(angle);
  const fy = Math.sin(angle);
  const px = -fy;
  const py = fx;
  const sorted = [...units].sort((a, b) => FORMATION_RANK[a.kind] - FORMATION_RANK[b.kind] || a.id - b.id);
  const gap = sorted.some(unit => unitStats(unit.kind).vehicle) ? UNIT_TUNING.vehicleFormationGap : UNIT_TUNING.formationGap;
  const slots = sorted.map((_, index) => formationSlot(formation, index));
  const middle = slots.reduce((sum, [, back]) => sum + back, 0) / slots.length;
  const lateral = (unit: Unit): number => (unit.x - cx) * px + (unit.y - cy) * py;
  const assigned = new Map<Unit, readonly [number, number]>();
  for (let start = 0; start < sorted.length; ) {
    let end = start;
    while (end < sorted.length && sorted[end]!.kind === sorted[start]!.kind) end++;
    const indices = Array.from({ length: end - start }, (_, offset) => start + offset);
    const slotsLeftToRight = [...indices].sort((a, b) => slots[a]![0] - slots[b]![0] || slots[a]![1] - slots[b]![1]);
    const unitsLeftToRight = [...indices].sort((a, b) => lateral(sorted[a]!) - lateral(sorted[b]!));
    unitsLeftToRight.forEach((unitIndex, n) => assigned.set(sorted[unitIndex]!, slots[slotsLeftToRight[n]!]!));
    start = end;
  }
  for (const unit of sorted) {
    const [side, back] = assigned.get(unit)!;
    unit.heading = angle;
    unit.tx = x + px * side * gap - fx * (back - middle) * gap;
    unit.ty = y + py * side * gap - fy * (back - middle) * gap;
    unit.gx = unit.tx;
    unit.gy = unit.ty;
    unit.target = null;
    unit.mode = mode;
    unit.formation = formation;
  }
}

export function arrangeGroup(units: readonly Unit[], formation: Formation): void {
  if (units.length === 0) return;
  const enRoute = units.some(unit => Math.hypot(unit.tx - unit.x, unit.ty - unit.y) > UNIT_TUNING.arriveDistance + 1);
  const x = enRoute ? centre(units, unit => unit.tx) : centre(units, unit => unit.x);
  const y = enRoute ? centre(units, unit => unit.ty) : centre(units, unit => unit.y);
  const angle = Math.atan2(
    centre(units, unit => Math.sin(unit.heading ?? unit.face)),
    centre(units, unit => Math.cos(unit.heading ?? unit.face)),
  );
  const kept = new Map(units.map(unit => [unit, { mode: unit.mode, target: unit.target }]));
  orderGroup(units, x, y, 'amove', formation, angle);
  for (const unit of units) {
    const previous = kept.get(unit)!;
    unit.mode = previous.mode;
    unit.target = previous.target;
  }
}

export function applyOrder(state: GameState, units: readonly Unit[], order: UnitOrder): void {
  if (order.kind === 'move') {
    orderGroup(units, order.x, order.y, order.mode, order.formation);
    return;
  }
  if (order.kind === 'arrange') {
    arrangeGroup(units, order.formation);
    return;
  }
  if (order.kind === 'hold') {
    for (const unit of units) {
      unit.mode = 'hold';
      unit.tx = unit.x;
      unit.ty = unit.y;
      unit.target = null;
    }
    return;
  }
  const target = unitById(state, order.target);
  if (!target) return;
  for (const unit of units) {
    unit.target = target.id;
    unit.mode = 'amove';
    unit.tx = unit.x;
    unit.ty = unit.y;
  }
}

export function weaponDamage(target: UnitStats, penetration: number, amount: number): number {
  return amount * (1 - Math.max(0, target.armor - penetration));
}

export function pushUnitEvent(state: GameState, event: Omit<UnitEvent, 'id'>): void {
  state.unitEvents.push({ ...event, id: state.nextUnitEventId++ });
  if (state.unitEvents.length > UNIT_TUNING.maxEvents) state.unitEvents.splice(0, state.unitEvents.length - UNIT_TUNING.maxEvents);
}

export function removeUnitsOf(state: GameState, empire: EmpireId): void {
  state.units = state.units.filter(unit => unit.empire !== empire);
  state.production = state.production.filter(line => line.empire !== empire);
}
