import { withLiveEmpire } from '../command-guards';
import { isNavigable } from '../../ship/sea-route.service';
import { hasUnlock } from '../../research/research.service';
import type { BuildShipCommand, OrderShipCommand } from '../commands.types';
import { ok, fail } from '@the-big-war/game-engine/commands/command.service';
import { gridAt, gridIndex } from '@the-big-war/game-engine/world-tile/world-tile.service';
import { isBlockaded, isFinishedPort, setShipCourse, shipById } from '../../ship/ship.service';

export const handleBuildShip = withLiveEmpire<BuildShipCommand>((state, command, empire) => {
  const cell = gridAt(state.grid, command.hex);
  if (!cell || cell.owner !== command.empire || !isFinishedPort(cell)) return fail(command.type, 'no_port');
  if (!hasUnlock(empire, 'ship:battleship')) return fail(command.type, 'not_researched');
  if (cell.building!.shipBuild > 0) return fail(command.type, 'port_busy');
  if (isBlockaded(state, cell)) return fail(command.type, 'blockaded');
  const { battleshipCost, battleshipSeconds } = state.config.ship;
  if (empire.gold < battleshipCost) return fail(command.type, 'insufficient_gold');
  empire.gold -= battleshipCost;
  cell.building!.shipBuild = battleshipSeconds;
  return ok(command.type);
});

export const handleOrderShip = withLiveEmpire<OrderShipCommand>((state, command) => {
  const ship = shipById(state, command.ship);
  if (!ship || ship.empire !== command.empire || ship.kind !== 'battleship') return fail(command.type, 'invalid_target');
  const cell = gridAt(state.grid, command.target);
  if (!cell || !isNavigable(state.map, gridIndex(state.grid, cell.q, cell.r))) return fail(command.type, 'invalid_target');
  return setShipCourse(state, ship, command.target) ? ok(command.type) : fail(command.type, 'no_sea_route');
});
