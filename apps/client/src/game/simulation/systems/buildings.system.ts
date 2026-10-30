import { ENGINE_TUNING } from '../simulation.constants';
import type { GameState } from '../../state/state.types';
import type { EmpireId } from '../../empire/empire.types';
import { returnToReserve } from '../../troops/troops.service';
import type { Building } from '../../building/building.types';
import { allBuildingCells, buildingCellsOf, setBuilding } from '../../map/world-index.service';

export function stepBuildings(state: GameState, dt: number): void {
  for (const building of activeConstruction(state)) {
    building.buildRemaining = Math.max(0, building.buildRemaining - dt);
  }
  for (const cell of allBuildingCells(state)) {
    const building = cell.building;
    if (!building || building.buildRemaining > 0) continue;
    if ((building.kind === 'cannon' || building.kind === 'battery') && building.cooldown > 0) {
      building.cooldown = Math.max(0, building.cooldown - dt);
    }
  }
}

export function removeDemolishedBuildings(state: GameState): void {
  for (const cell of allBuildingCells(state)) {
    const building = cell.building;
    if (!building || building.demolishAt === null) continue;
    if (building.demolishAt > state.elapsed) continue;
    if (building.garrison > 0) returnToReserve(state, cell.owner, building.garrison);
    setBuilding(state, cell, null);
  }
}

export function constructionQueue(state: GameState, empire: EmpireId): Building[] {
  const queue: Building[] = [];
  for (const cell of buildingCellsOf(state, empire)) {
    if (cell.building && cell.building.buildRemaining > 0) queue.push(cell.building);
  }
  return queue.sort((a, b) => a.id - b.id);
}

function activeConstruction(state: GameState): Building[] {
  const byEmpire = new Map<EmpireId, Building[]>();
  for (const cell of allBuildingCells(state)) {
    const building = cell.building;
    if (!building || building.buildRemaining <= 0) continue;
    const list = byEmpire.get(cell.owner) ?? [];
    list.push(building);
    byEmpire.set(cell.owner, list);
  }
  const active: Building[] = [];
  for (const list of byEmpire.values()) {
    list.sort((a, b) => a.id - b.id);
    active.push(...list.slice(0, ENGINE_TUNING.buildSlotsPerEmpire));
  }
  return active;
}
