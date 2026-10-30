import { withLiveEmpire } from '../command-guards';
import type { GameState } from '../../state/state.types';
import { setBuilding } from '../../map/world-index.service';
import { ENGINE_TUNING } from '../../simulation/simulation.constants';
import { ok, fail } from '@the-big-war/game-engine/commands/command.service';
import { gridAt } from '@the-big-war/game-engine/world-tile/world-tile.service';
import { buildingCost, createBuilding, placementError, upgradeCost, upgradeError } from '../../building/building.service';
import type {
  CommandResult,
  DemolishBuildingCommand,
  PlaceBuildingCommand,
  UpgradeBuildingCommand,
} from '../commands.types';

export function handlePlaceBuilding(state: GameState, command: PlaceBuildingCommand): CommandResult {
  const error = placementError(state, command.empire, command.hex, command.kind);
  if (error) return fail(command.type, error);
  const empire = state.empires[command.empire]!;
  const cell = gridAt(state.grid, command.hex)!;
  const spec = state.config.buildings[command.kind];

  empire.gold -= buildingCost(state, command.empire, command.kind);
  empire.civilians -= ENGINE_TUNING.civiliansPerBuild;
  if (command.kind === 'machine_gun' && cell.building) {
    cell.building.machineGun = true;
    return ok(command.type);
  }
  cell.terrain = 'plain';
  setBuilding(state, cell, createBuilding(state, command.kind, 1, spec.buildSeconds));
  return ok(command.type);
}

export const handleDemolishBuilding = withLiveEmpire<DemolishBuildingCommand>((state, command) => {
  const cell = gridAt(state.grid, command.hex);
  if (!cell || !cell.building) return fail(command.type, 'invalid_target');
  if (cell.owner !== command.empire) return fail(command.type, 'invalid_target');

  cell.building.demolishAt = state.elapsed + state.config.demolish.durationSeconds;
  return ok(command.type);
});

export function handleUpgradeBuilding(state: GameState, command: UpgradeBuildingCommand): CommandResult {
  const error = upgradeError(state, command.empire, command.hex);
  if (error) return fail(command.type, error);
  const building = gridAt(state.grid, command.hex)!.building!;
  state.empires[command.empire]!.gold -= upgradeCost(state, building);
  building.level += 1;
  return ok(command.type);
}
