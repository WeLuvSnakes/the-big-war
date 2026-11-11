import { shellShips } from '../../ship/ship.service';
import { shellUnits } from '../../unit/unit.service';
import type { GameState } from '../../state/state.types';
import { allBuildingCells } from '../../map/world-index.service';

export function stepArtillery(state: GameState): void {
  const battery = state.config.battery;
  for (const cell of allBuildingCells(state)) {
    const building = cell.building;
    if (building?.kind !== 'battery' || building.buildRemaining > 0 || building.cooldown > 0) continue;
    if (building.demolishAt !== null) continue;
    if (shellUnits(state, cell.owner, cell, battery.range, battery.damage) > 0) {
      building.cooldown = battery.cooldown;
      continue;
    }
    if (shellShips(state, cell.owner, cell, battery.range, battery.damage) > 0) building.cooldown = battery.cooldown;
  }
}
