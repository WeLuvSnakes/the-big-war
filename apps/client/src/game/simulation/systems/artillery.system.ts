import { shellShips } from '../../ship/ship.service';
import type { GameState } from '../../state/state.types';
import type { EmpireId } from '../../empire/empire.types';
import { allBuildingCells } from '../../map/world-index.service';
import { shellingFactor } from '../../building/building.service';
import type { Offensive } from '../../offensive/offensive.types';
import type { Axial } from '@the-big-war/game-engine/world-tile/world-tile.types';
import { distance, gridAt } from '@the-big-war/game-engine/world-tile/world-tile.service';

export function stepArtillery(state: GameState): void {
  const battery = state.config.battery;
  for (const cell of allBuildingCells(state)) {
    const building = cell.building;
    if (building?.kind !== 'battery' || building.buildRemaining > 0 || building.cooldown > 0) continue;
    if (building.demolishAt !== null) continue;
    const target = pickTarget(state, cell.owner, cell, battery.range);
    if (!target) {
      if (shellShips(state, cell.owner, cell, battery.range, battery.damage) > 0) building.cooldown = battery.cooldown;
      continue;
    }
    const covered = gridAt(state.grid, target.head)?.owner ?? target.empire;
    target.troops = Math.max(0, target.troops - battery.damage * shellingFactor(state, covered, target.head));
    building.cooldown = battery.cooldown;
  }
}

function pickTarget(state: GameState, owner: EmpireId, from: Axial, range: number): Offensive | null {
  let best: Offensive | null = null;
  let bestTroops = 0;
  for (const offensive of state.offensives) {
    if (offensive.target !== owner || offensive.troops <= bestTroops) continue;
    if (distance(from, offensive.head) > range) continue;
    best = offensive;
    bestTroops = offensive.troops;
  }
  return best;
}
