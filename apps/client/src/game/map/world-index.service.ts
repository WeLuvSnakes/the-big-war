import type { GameState } from '../state/state.types';
import type { WorldIndex } from './world-index.types';
import type { EmpireId } from '../empire/empire.types';
import type { BiomeConfig } from '../config/config.types';
import { NEUTRAL_OWNER } from '../empire/empire.constants';
import type { Biome, HexCell, HexGrid } from './map.types';
import type { Building } from '../building/building.types';
import { gridIndex } from '@the-big-war/game-engine/world-tile/world-tile.service';

function insertionPoint(sorted: readonly number[], value: number): number {
  let low = 0;
  let high = sorted.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (sorted[middle]! < value) low = middle + 1;
    else high = middle;
  }
  return low;
}

function insertSorted(sorted: number[], value: number): void {
  const at = insertionPoint(sorted, value);
  if (sorted[at] !== value) sorted.splice(at, 0, value);
}

function removeSorted(sorted: number[], value: number): void {
  const at = insertionPoint(sorted, value);
  if (sorted[at] === value) sorted.splice(at, 1);
}

function buildingsOf(index: WorldIndex, empire: EmpireId): number[] {
  let list = index.empireBuildings.get(empire);
  if (!list) {
    list = [];
    index.empireBuildings.set(empire, list);
  }
  return list;
}

type BiomeTable = Readonly<Record<Biome, BiomeConfig>>;

function tilePopulation(biomes: BiomeTable | undefined, cell: HexCell): number {
  return biomes?.[cell.biome]?.population ?? 1;
}

function addTile(index: WorldIndex, owner: EmpireId, at: number, population: number): void {
  if (owner === NEUTRAL_OWNER) return;
  index.population.set(owner, (index.population.get(owner) ?? 0) + population);
  let tiles = index.tiles.get(owner);
  if (!tiles) {
    tiles = new Set();
    index.tiles.set(owner, tiles);
  }
  tiles.add(at);
  index.sortedTiles.delete(owner);
}

function removeTile(index: WorldIndex, owner: EmpireId, at: number, population: number): void {
  if (owner === NEUTRAL_OWNER) return;
  index.population.set(owner, (index.population.get(owner) ?? 0) - population);
  index.tiles.get(owner)?.delete(at);
  index.sortedTiles.delete(owner);
}

function markChanged(index: WorldIndex, at: number): void {
  if (index.changedFlags[at]) return;
  index.changedFlags[at] = 1;
  index.changedTiles.push(at);
}

export function markTile(state: GameState, cell: HexCell): void {
  markChanged(state.index, gridIndex(state.grid, cell.q, cell.r));
}

export function drainChangedTiles(index: WorldIndex, visit: (at: number) => void): void {
  for (const at of index.changedTiles) {
    index.changedFlags[at] = 0;
    visit(at);
  }
  index.changedTiles.length = 0;
}

export function createWorldIndex(grid: HexGrid, biomes?: BiomeTable): WorldIndex {
  const index: WorldIndex = {
    tiles: new Map(),
    sortedTiles: new Map(),
    buildings: [],
    empireBuildings: new Map(),
    population: new Map(),
    changedTiles: [],
    changedFlags: new Uint8Array(grid.cells.length),
  };
  grid.cells.forEach((cell, at) => {
    addTile(index, cell.owner, at, tilePopulation(biomes, cell));
    if (!cell.building) return;
    index.buildings.push(at);
    buildingsOf(index, cell.owner).push(at);
  });
  return index;
}

export function setOwner(state: GameState, cell: HexCell, owner: EmpireId): void {
  if (cell.owner === owner) return;
  const at = gridIndex(state.grid, cell.q, cell.r);
  const { index } = state;
  const population = tilePopulation(state.config.biomes, cell);
  removeTile(index, cell.owner, at, population);
  addTile(index, owner, at, population);
  if (cell.building) {
    removeSorted(buildingsOf(index, cell.owner), at);
    insertSorted(buildingsOf(index, owner), at);
  }
  cell.owner = owner;
  markChanged(index, at);
}

export function setBuilding(state: GameState, cell: HexCell, building: Building | null): void {
  const at = gridIndex(state.grid, cell.q, cell.r);
  const { index } = state;
  if (building && !cell.building) {
    insertSorted(index.buildings, at);
    insertSorted(buildingsOf(index, cell.owner), at);
  }
  if (!building && cell.building) {
    removeSorted(index.buildings, at);
    removeSorted(buildingsOf(index, cell.owner), at);
  }
  cell.building = building;
  markChanged(index, at);
}

export function ownedTileCount(state: GameState, empire: EmpireId): number {
  return state.index.tiles.get(empire)?.size ?? 0;
}

export function populationWeight(state: GameState, empire: EmpireId): number {
  return state.index.population.get(empire) ?? 0;
}

export function ownedCells(state: GameState, empire: EmpireId): readonly HexCell[] {
  const cached = state.index.sortedTiles.get(empire);
  if (cached) return cached;
  const tiles = state.index.tiles.get(empire);
  if (!tiles) return [];
  const sorted = [...tiles].sort((a, b) => a - b).map(at => state.grid.cells[at]!);
  state.index.sortedTiles.set(empire, sorted);
  return sorted;
}

export function allBuildingCells(state: GameState): HexCell[] {
  return state.index.buildings.map(at => state.grid.cells[at]!);
}

export function buildingCellsOf(state: GameState, empire: EmpireId): HexCell[] {
  const list = state.index.empireBuildings.get(empire);
  return list ? list.map(at => state.grid.cells[at]!) : [];
}
