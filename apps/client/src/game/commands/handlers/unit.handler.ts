import { withLiveEmpire } from '../command-guards';
import { UNIT_TUNING } from '../../unit/unit.constants';
import { ok, fail } from '@the-big-war/game-engine/commands/command.service';
import { gridAt, gridIndex } from '@the-big-war/game-engine/world-tile/world-tile.service';
import { applyOrder, populationCap, populationOf, unitStats } from '../../unit/unit.service';
import type { CancelUnitCommand, OrderUnitsCommand, TrainUnitCommand } from '../commands.types';

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
  applyOrder(state, units, command.order);
  return ok(command.type);
});
