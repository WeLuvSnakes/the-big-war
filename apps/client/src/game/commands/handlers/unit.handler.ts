import { withLiveEmpire } from '../command-guards';
import { planLanding } from '../../ship/ship.service';
import { isClaimable } from '../../map/terrain.service';
import { UNIT_TUNING } from '../../unit/unit.constants';
import type { GameState } from '../../state/state.types';
import type { EmpireId } from '../../empire/empire.types';
import type { Unit, UnitOrder } from '../../unit/unit.types';
import { NEUTRAL_OWNER } from '../../empire/empire.constants';
import { canAttack, declareWar } from '../../diplomacy/diplomacy.service';
import { ok, fail } from '@the-big-war/game-engine/commands/command.service';
import type { Axial } from '@the-big-war/game-engine/world-tile/world-tile.types';
import { ownTrench, trenchOccupants, trenchSlot } from '../../trench/trench.service';
import { gridAt, gridIndex } from '@the-big-war/game-engine/world-tile/world-tile.service';
import type { CancelUnitCommand, OrderUnitsCommand, TrainUnitCommand } from '../commands.types';
import { applyOrder, cellAtPixel, orderGroup, populationCap, populationOf, unitStats } from '../../unit/unit.service';

export const handleTrainUnit = withLiveEmpire<TrainUnitCommand>((state, command, empire) => {
  const cell = gridAt(state.grid, command.hex);
  const building = cell?.building;
  const stats = unitStats(command.kind);
  if (!cell || !building || cell.owner !== command.empire) return fail(command.type, 'invalid_target');
  if (building.kind !== stats.producer || building.buildRemaining > 0 || building.demolishAt !== null) {
    return fail(command.type, 'invalid_target');
  }
  const at = gridIndex(state.grid, cell.q, cell.r);
  let line = state.production.find(item => item.at === at && item.building === building.id);
  if (line && line.queue.length >= UNIT_TUNING.maxQueue) return fail(command.type, 'queue_full');
  if (empire.gold < stats.gold) return fail(command.type, 'insufficient_gold');
  if (empire.civilians < stats.civilians) return fail(command.type, 'insufficient_civilians');
  if (populationOf(state, command.empire) + stats.population > populationCap(state, command.empire)) {
    return fail(command.type, 'unit_limit');
  }
  empire.gold -= stats.gold;
  empire.civilians -= stats.civilians;
  if (!line) {
    line = { building: building.id, empire: command.empire, at, queue: [], progress: 0 };
    state.production.push(line);
  }
  line.queue.push(command.kind);
  return ok(command.type);
});

export const handleCancelUnit = withLiveEmpire<CancelUnitCommand>((state, command, empire) => {
  const cell = gridAt(state.grid, command.hex);
  if (!cell || cell.owner !== command.empire) return fail(command.type, 'invalid_target');
  const at = gridIndex(state.grid, cell.q, cell.r);
  const line = state.production.find(item => item.at === at && item.empire === command.empire);
  const kind = line?.queue.pop();
  if (!line || !kind) return fail(command.type, 'invalid_target');
  if (line.queue.length === 0) line.progress = 0;
  const stats = unitStats(kind);
  empire.gold += stats.gold;
  empire.civilians += stats.civilians;
  return ok(command.type);
});

export const handleOrderUnits = withLiveEmpire<OrderUnitsCommand>((state, command) => {
  const wanted = new Set(command.units);
  const units = state.units.filter(unit => unit.empire === command.empire && wanted.has(unit.id));
  if (units.length === 0) return fail(command.type, 'invalid_target');
  const enemy = orderTarget(state, command.order);
  if (enemy !== null && enemy !== command.empire) {
    const attackCheck = canAttack(state, command.empire, enemy);
    if (!attackCheck.allowed) return fail(command.type, attackCheck.reason ?? 'invalid_target');
    declareWar(state, command.empire, enemy);
  }
  for (const unit of units) unit.boarding = null;
  const voyage = command.order.kind === 'move' ? overseas(state, units, command.order) : null;
  if (voyage) {
    const plan = planLanding(state, command.empire, voyage.focus, voyage.owner, voyage.landmass);
    if (typeof plan === 'string') return fail(command.type, plan);
    embark(state, units, plan.port, voyage.focus);
    return ok(command.type);
  }
  const rest = command.order.kind === 'move' ? stationInTrench(state, command.empire, units, command.order) : units;
  if (rest.length > 0) applyOrder(state, rest, command.order);
  return ok(command.type);
});

function stationInTrench(state: GameState, empire: EmpireId, units: readonly Unit[], order: { readonly x: number; readonly y: number }): readonly Unit[] {
  const cell = cellAtPixel(state, order.x, order.y);
  if (!cell || !ownTrench(state, empire, cell)) return units;
  const chosen = new Set(units);
  const taken = trenchOccupants(state, cell).filter(unit => !chosen.has(unit)).length;
  const room = Math.max(0, state.config.trench.capacity - taken);
  const infantry = units.filter(unit => !unitStats(unit.kind).vehicle).slice(0, room);
  infantry.forEach((unit, index) => {
    const slot = trenchSlot(state, cell, taken + index);
    unit.mode = 'hold';
    unit.target = null;
    unit.heading = null;
    unit.tx = slot.x;
    unit.ty = slot.y;
    unit.gx = slot.x;
    unit.gy = slot.y;
  });
  const placed = new Set(infantry);
  return units.filter(unit => !placed.has(unit));
}

interface Voyage {
  readonly focus: Axial;
  readonly owner: EmpireId;
  readonly landmass: number;
}

function landmassAt(state: GameState, x: number, y: number): number | null {
  const cell = cellAtPixel(state, x, y);
  return cell ? state.map.landmass[gridIndex(state.grid, cell.q, cell.r)]! : null;
}

function overseas(state: GameState, units: readonly Unit[], order: { readonly x: number; readonly y: number }): Voyage | null {
  const cell = cellAtPixel(state, order.x, order.y);
  if (!cell || !isClaimable(cell.terrain)) return null;
  const home = landmassAt(state, units[0]!.x, units[0]!.y);
  const away = landmassAt(state, order.x, order.y);
  if (home === null || away === null || home === away) return null;
  return { focus: { q: cell.q, r: cell.r }, owner: cell.owner, landmass: home };
}

function embark(state: GameState, units: readonly Unit[], port: Axial, focus: Axial): void {
  const group = Math.min(...units.map(unit => unit.id));
  for (const unit of units) unit.boarding = { group, port, focus };
  const size = state.config.map.hexSize;
  orderGroup(units, (port.q + 0.5) * size, (port.r + 0.5) * size, 'amove', 'column');
}

function orderTarget(state: GameState, order: UnitOrder): EmpireId | null {
  if (order.kind === 'attack') return state.units.find(unit => unit.id === order.target)?.empire ?? null;
  if (order.kind !== 'move') return null;
  const cell = cellAtPixel(state, order.x, order.y);
  return cell && cell.owner !== NEUTRAL_OWNER ? cell.owner : null;
}
