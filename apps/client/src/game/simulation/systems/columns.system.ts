import { ENGINE_TUNING } from '../simulation.constants';
import { NEUTRAL_OWNER } from '../../empire/empire.constants';
import type { Column, GameState } from '../../state/state.types';
import { canAttack, declareWar } from '../../diplomacy/diplomacy.service';
import { gridAt } from '@the-big-war/game-engine/world-tile/world-tile.service';
import { isPassable, passableAt, terrainDefenceAt } from '../../map/terrain.service';
import { joinFront, launchExpedition, returnToReserve } from '../../troops/troops.service';

export function stepColumns(state: GameState, dt: number): void {
  for (let index = state.columns.length - 1; index >= 0; index--) {
    const column = state.columns[index]!;
    if (!advanceColumn(state, column, dt)) state.columns.splice(index, 1);
  }
}

function advanceColumn(state: GameState, column: Column, dt: number): boolean {
  const empire = state.empires[column.empire];
  if (!empire || !empire.alive) return false;
  const here = column.path[column.step]!;
  const next = column.path[column.step + 1];
  const hereCell = gridAt(state.grid, here);
  if (!hereCell || hereCell.owner !== column.empire) {
    returnToReserve(state, column.empire, column.troops);
    return false;
  }
  if (!next) {
    launchExpedition(state, column.empire, here, column.troops, here);
    return false;
  }
  const nextCell = gridAt(state.grid, next);
  if (!nextCell) {
    returnToReserve(state, column.empire, column.troops);
    return false;
  }

  if (nextCell.owner !== column.empire && nextCell.owner !== NEUTRAL_OWNER && column.mission === 'claim') {
    launchExpedition(state, column.empire, here, column.troops, here);
    return false;
  }

  if (nextCell.owner !== column.empire && nextCell.owner !== NEUTRAL_OWNER) {
    const check = canAttack(state, column.empire, nextCell.owner);
    if (!check.allowed) {
      returnToReserve(state, column.empire, column.troops);
      return false;
    }
    declareWar(state, column.empire, nextCell.owner);
    if (!joinFront(state, column.empire, here, next, column.troops, 'attack')) {
      returnToReserve(state, column.empire, column.troops);
    }
    return false;
  }

  const terrain = terrainDefenceAt(state, next);
  const claiming = nextCell.owner === NEUTRAL_OWNER;
  const mountain = !isPassable(nextCell.terrain);
  const cost = ENGINE_TUNING.claimSoldiersPerHex * terrain * (mountain ? ENGINE_TUNING.mountainClaimSoldiers : 1);
  if (claiming && column.troops < cost) {
    returnToReserve(state, column.empire, column.troops);
    return false;
  }
  const duration = columnLegDuration(state, column);
  column.progress += dt;
  if (column.progress < duration) return true;
  if (claiming) nextCell.owner = column.empire;
  if (claiming && mountain) column.troops -= cost;
  column.step += 1;
  column.progress = 0;
  return true;
}

export function columnLegDuration(state: GameState, column: Column): number {
  const next = column.path[column.step + 1];
  if (!next) return 1;
  const terrain = terrainDefenceAt(state, next);
  const claiming = gridAt(state.grid, next)?.owner === NEUTRAL_OWNER;
  if (!claiming) return ENGINE_TUNING.walkSecondsPerHex * terrain;
  const mountain = !passableAt(state, next);
  return ENGINE_TUNING.claimSecondsPerHex * terrain * (mountain ? ENGINE_TUNING.mountainClaimSeconds : 1);
}
