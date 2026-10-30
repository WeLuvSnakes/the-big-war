import type { HexCell } from '../map/map.types';
import { ownTrench } from '../trench/trench.service';
import type { GameState } from '../state/state.types';
import { portWaterBody } from '../map/port-site.service';
import { buildingCellsOf } from '../map/world-index.service';
import { isPassable, isWater } from '../map/terrain.service';
import type { CommandError } from '../commands/commands.types';
import type { Empire, EmpireId } from '../empire/empire.types';
import type { BarracksTierConfig } from '../config/config.types';
import { ENGINE_TUNING } from '../simulation/simulation.constants';
import { hasUnlock, isComplete } from '../research/research.service';
import type { Axial } from '@the-big-war/game-engine/world-tile/world-tile.types';
import { resolveModifier } from '@the-big-war/game-engine/modifier/modifier.service';
import type { Building, BuildingId, BuildingKind, OwnedBuilding } from './building.types';
import { area, gridAt, neighbors } from '@the-big-war/game-engine/world-tile/world-tile.service';
import { CLEARS_TERRAIN, FLAT_COST_BUILDINGS, PRODUCTION_BUILDINGS } from './building.constants';

export function createBuilding(state: GameState, kind: BuildingKind, level: number, buildRemaining: number): Building {
  return {
    id: state.nextBuildingId++,
    kind,
    level,
    cooldown: 0,
    growth: 0,
    demolishAt: null,
    buildRemaining,
    gatherers: [],
    garrison: 0,
    machineGun: false,
    shipBuild: 0,
    shellDamage: 0,
  };
}

export function isProductionBuilding(kind: BuildingKind): boolean {
  return PRODUCTION_BUILDINGS.has(kind);
}

export function buildingCost(state: GameState, empireId: EmpireId, kind: BuildingKind): number {
  const empire = state.empires[empireId];
  const { buildingCostStep, tilesPerFreeBuilding } = state.config.economy;
  const placed = FLAT_COST_BUILDINGS.has(kind) ? 0 : countPlacedOfKind(state, empireId, kind);
  const excess = Math.max(0, placed - Math.floor((empire?.hexCount ?? 0) / tilesPerFreeBuilding));
  const base = state.config.buildings[kind].cost * (1 + buildingCostStep * excess);
  return empire ? resolveModifier(base, empire.bonuses.buildCost) : base;
}

export function buildingIdAt(state: GameState, hex: Axial): BuildingId | null {
  return gridAt(state.grid, hex)?.building?.id ?? null;
}

export function ownedBuildings(state: GameState, empireId: EmpireId): OwnedBuilding[] {
  const out: OwnedBuilding[] = [];
  for (const cell of buildingCellsOf(state, empireId)) {
    if (!cell.building || cell.building.buildRemaining > 0) continue;
    out.push({ hex: { q: cell.q, r: cell.r }, cell, building: cell.building });
  }
  return out;
}

export function countBuildingsOfKind(state: GameState, empireId: EmpireId, kind: BuildingKind): number {
  let count = 0;
  for (const cell of buildingCellsOf(state, empireId)) {
    if (!cell.building || cell.building.buildRemaining > 0) continue;
    if (kind === 'machine_gun' ? cell.building.machineGun : cell.building.kind === kind) count += 1;
  }
  return count;
}

function countPlacedOfKind(state: GameState, empireId: EmpireId, kind: BuildingKind): number {
  let count = 0;
  for (const cell of buildingCellsOf(state, empireId)) {
    if (!cell.building) continue;
    if (kind === 'machine_gun' ? cell.building.machineGun : cell.building.kind === kind) count += 1;
  }
  return count;
}

export function countSupport(
  state: GameState,
  empireId: EmpireId,
  hex: Axial,
  radius: number,
  predicate: (kind: BuildingKind, cell: HexCell) => boolean,
  minLevel = 1,
  square = false,
): number {
  let count = 0;
  for (const candidate of square ? squareArea(hex, radius) : area(hex, radius)) {
    const cell = gridAt(state.grid, candidate);
    if (!cell || cell.owner !== empireId || !cell.building || cell.building.buildRemaining > 0) continue;
    if (predicate(cell.building.kind, cell) && cell.building.level >= minLevel) count += 1;
  }
  return count;
}

function squareArea(center: Axial, radius: number): Axial[] {
  const results: Axial[] = [];
  for (let dr = -radius; dr <= radius; dr++) {
    for (let dq = -radius; dq <= radius; dq++) results.push({ q: center.q + dq, r: center.r + dr });
  }
  return results;
}

export function shellingFactor(state: GameState, empireId: EmpireId, hex: Axial): number {
  const bunkers = countSupport(state, empireId, hex, state.config.support.bunkerRadius, k => k === 'bunker');
  return bunkers > 0 ? ENGINE_TUNING.bunkerShelling : 1;
}

export function placementError(
  state: GameState,
  empireId: EmpireId,
  hex: Axial,
  kind: BuildingKind,
): CommandError | null {
  const empire = state.empires[empireId];
  if (!empire || !empire.alive) return 'no_empire';
  const cell = gridAt(state.grid, hex);
  if (!cell) return 'invalid_target';
  const spec = state.config.buildings[kind];
  if (empire.gold < buildingCost(state, empireId, kind)) return 'insufficient_gold';
  if (empire.civilians < ENGINE_TUNING.civiliansPerBuild) return 'insufficient_civilians';

  if (kind === 'machine_gun') return machineGunMountError(state, empire, hex);

  if (cell.owner !== empireId || cell.building !== null) return 'invalid_target';

  if (kind === 'port') {
    if (!isPassable(cell.terrain) || portWaterBody(state.grid, state.map, cell) === -1) return 'invalid_target';
  } else if (cell.terrain !== 'plain' && CLEARS_TERRAIN[kind] !== cell.terrain) return 'invalid_target';

  if (kind === 'fishery' && !touchesWater(state, cell)) return 'invalid_target';

  if (spec.requiresResearch !== null && !hasUnlock(empire, `building:${kind}`)) return 'not_researched';
  return null;
}

function touchesWater(state: GameState, cell: HexCell): boolean {
  return neighbors(cell).some(hex => {
    const next = gridAt(state.grid, hex);
    return !!next && isWater(next.terrain);
  });
}

function machineGunMountError(state: GameState, empire: Empire, hex: Axial): CommandError | null {
  if (!hasUnlock(empire, 'building:machine_gun')) return 'not_researched';
  const trench = ownTrench(state, empire.id, hex);
  if (!trench || trench.machineGun) return 'invalid_target';
  return null;
}

export function barracksTier(state: GameState, building: Building): BarracksTierConfig {
  const tiers = state.config.barracksTiers;
  return tiers[Math.min(tiers.length, Math.max(1, building.level)) - 1]!;
}

export function nextBarracksTier(state: GameState, building: Building): BarracksTierConfig | null {
  if (building.kind !== 'barracks') return null;
  return state.config.barracksTiers[building.level] ?? null;
}

export function portUpgradeCost(state: GameState, building: Building): number {
  return state.config.ship.portUpgradeCost * building.level;
}

export function upgradeCost(state: GameState, building: Building): number {
  if (building.kind === 'port') return portUpgradeCost(state, building);
  return nextBarracksTier(state, building)?.upgradeCost ?? 0;
}

export function upgradeError(state: GameState, empireId: EmpireId, hex: Axial): CommandError | null {
  const empire = state.empires[empireId];
  if (!empire || !empire.alive) return 'no_empire';
  const cell = gridAt(state.grid, hex);
  const building = cell?.building;
  if (!cell || cell.owner !== empireId || !building || building.buildRemaining > 0) return 'invalid_target';
  if (building.demolishAt !== null) return 'invalid_target';
  if (building.kind === 'port') {
    if (building.level >= state.config.upgrades.maxLevel) return 'invalid_target';
    return empire.gold < portUpgradeCost(state, building) ? 'insufficient_gold' : null;
  }
  const next = nextBarracksTier(state, building);
  if (!next) return 'invalid_target';
  if (next.requiresResearch !== null && !isComplete(empire.research, next.requiresResearch)) return 'not_researched';
  if (empire.gold < next.upgradeCost) return 'insufficient_gold';
  return null;
}
