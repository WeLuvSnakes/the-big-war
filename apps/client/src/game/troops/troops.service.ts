import type { HexCell } from '../map/map.types';
import { troopsAtSea } from '../ship/ship.service';
import type { GameState } from '../state/state.types';
import type { EmpireId } from '../empire/empire.types';
import { isEncampment } from '../building/building.service';
import { buildingCellsOf, ownedCells } from '../map/world-index.service';
import type { Building, BuildingKind } from '../building/building.types';
import { distance } from '@the-big-war/game-engine/world-tile/world-tile.service';
import type { Axial } from '@the-big-war/game-engine/world-tile/world-tile.types';

const HOME_RANK = (building: Building): number => (building.kind === 'trench' ? 2 : building.kind === 'city' ? 1 : 0);

export interface DrawnTroops {
  readonly from: Axial;
  readonly troops: number;
}

export function encampmentCapacity(state: GameState, empire: EmpireId, building: Building): number {
  const { recruit, trench } = state.config;
  const base: Partial<Record<BuildingKind, number>> = {
    city: recruit.cityReserveCap,
    barracks: recruit.barracksReserveCap,
    fort: recruit.fortReserveCap,
    bunker: recruit.bunkerReserveCap,
    trench: trench.capacity,
  };
  return (base[building.kind] ?? 0) * (state.empires[empire]?.bonuses.reserveCap.mul ?? 1);
}

export function troopCapacity(state: GameState, empire: EmpireId): number {
  let total = 0;
  for (const cell of buildingCellsOf(state, empire)) {
    if (cell.building && isHousing(cell.building)) total += encampmentCapacity(state, empire, cell.building);
  }
  return total;
}

export function addToEncampments(state: GameState, empire: EmpireId, troops: number, except?: Building): void {
  const owner = state.empires[empire];
  if (!owner || !owner.alive || troops <= 0) return;
  let left = troops;
  for (const home of homesInOrder(state, empire, except)) {
    const placed = Math.min(left, encampmentCapacity(state, empire, home) - home.garrison);
    if (placed <= 0) continue;
    home.garrison += placed;
    owner.soldiers += placed;
    left -= placed;
    if (left <= 0) return;
  }
}

function homesInOrder(state: GameState, empire: EmpireId, except?: Building): Building[] {
  const homes: Building[] = [];
  for (const cell of buildingCellsOf(state, empire)) {
    if (cell.building && cell.building !== except && isHousing(cell.building)) homes.push(cell.building);
  }
  homes.sort((a, b) => HOME_RANK(a) - HOME_RANK(b) || a.garrison - b.garrison);
  if (except) homes.push(except);
  return homes;
}

function isHousing(building: Building): boolean {
  return isEncampment(building.kind) && building.buildRemaining <= 0 && building.demolishAt === null;
}

export function killExcessTroops(state: GameState, empire: EmpireId): void {
  const owner = state.empires[empire];
  if (!owner) return;
  const stationed: Building[] = [];
  for (const cell of buildingCellsOf(state, empire)) {
    const building = cell.building;
    if (!building || !isEncampment(building.kind)) continue;
    building.garrison = Math.min(building.garrison, encampmentCapacity(state, empire, building));
    stationed.push(building);
  }
  let excess = stationed.reduce((sum, b) => sum + b.garrison, 0) + deployedTroops(state, empire) - troopCapacity(state, empire);
  for (const building of stationed) {
    if (excess <= 0) break;
    const killed = Math.min(building.garrison, excess);
    building.garrison -= killed;
    excess -= killed;
  }
  owner.soldiers = stationed.reduce((sum, b) => sum + b.garrison, 0);
  if (excess <= 0) return;
  for (const offensive of state.offensives) {
    if (offensive.empire !== empire || excess <= 0) continue;
    const killed = Math.min(offensive.troops, excess);
    offensive.troops -= killed;
    excess -= killed;
  }
}

export function drawFromEncampments(
  state: GameState,
  empire: EmpireId,
  focus: Axial,
  troops: number,
  except?: Building,
): DrawnTroops | null {
  const owner = state.empires[empire];
  if (!owner || troops <= 0) return null;
  const sources = buildingCellsOf(state, empire)
    .filter(cell => {
      const building = cell.building;
      return !!building && building !== except && isEncampment(building.kind) && building.garrison > 0;
    })
    .sort((a, b) => distance(a, focus) - distance(b, focus));
  const first = sources[0];
  if (!first) return null;
  let drawn = 0;
  for (const cell of sources) {
    if (drawn >= troops) break;
    const building = cell.building!;
    const taken = Math.min(building.garrison, troops - drawn);
    building.garrison -= taken;
    drawn += taken;
  }
  owner.soldiers = Math.max(0, owner.soldiers - drawn);
  return { from: { q: first.q, r: first.r }, troops: drawn };
}

export function takeGarrison(state: GameState, cell: HexCell): number {
  const building = cell.building;
  if (!building || building.garrison <= 0) return 0;
  const troops = building.garrison;
  building.garrison = 0;
  const owner = state.empires[cell.owner];
  if (owner) owner.soldiers = Math.max(0, owner.soldiers - troops);
  return troops;
}

export function returnToReserve(state: GameState, empire: EmpireId, troops: number): void {
  addToEncampments(state, empire, troops);
}

export function deployedTroops(state: GameState, empire: EmpireId): number {
  let total = 0;
  for (const offensive of state.offensives) if (offensive.empire === empire) total += offensive.troops;
  return total + troopsAtSea(state, empire);
}

export function nearestOwnedHex(state: GameState, empire: EmpireId, target: Axial): Axial | null {
  let best: Axial | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const cell of ownedCells(state, empire)) {
    const d = distance(cell, target);
    if (d < bestDistance) {
      bestDistance = d;
      best = { q: cell.q, r: cell.r };
    }
  }
  return best;
}
