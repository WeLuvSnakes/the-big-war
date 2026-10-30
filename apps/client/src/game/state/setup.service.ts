import type { GameState } from './state.types';
import { MAP_SHAPE } from '../map/map.constants';
import { createBaseState } from './state.service';
import { empireNames } from '../names/names.service';
import type { Empire } from '../empire/empire.types';
import type { GameConfig } from '../config/config.types';
import { NEUTRAL_OWNER } from '../empire/empire.constants';
import { addToEncampments } from '../troops/troops.service';
import { scaleConfigToMap } from '../config/config.service';
import { createBuilding } from '../building/building.service';
import { defaultFactionId } from '../faction/faction.service';
import type { BuildingKind } from '../building/building.types';
import { isClaimable, isPassable } from '../map/terrain.service';
import type { Rng } from '@the-big-war/game-engine/rng/rng.types';
import { isPortSite, portWaterBody } from '../map/port-site.service';
import type { HexCell, HexGrid, WorldLabels } from '../map/map.types';
import { createEmpire, refreshHexCounts } from '../empire/empire.service';
import { createRng, nextInt } from '@the-big-war/game-engine/rng/rng.service';
import { NEUTRAL_PLOT, START_CITY_LEVEL, START_PLOT } from './setup.constants';
import { ownedCells, setBuilding, setOwner } from '../map/world-index.service';
import { generateWorld, pruneLoneMountains } from '../map/map-generator.service';
import type { Axial } from '@the-big-war/game-engine/world-tile/world-tile.types';
import { recomputeAllBonuses, recomputeEmpireBonuses } from '../research/research.service';
import { distance, gridAt, gridIndex } from '@the-big-war/game-engine/world-tile/world-tile.service';

function startPlot(capital: Axial, size = START_PLOT): Axial[] {
  const before = Math.floor((size - 1) / 2);
  const after = size - 1 - before;
  const plot: Axial[] = [];
  for (let r = capital.r - before; r <= capital.r + after; r++) {
    for (let q = capital.q - before; q <= capital.q + after; q++) plot.push({ q, r });
  }
  return plot;
}

interface CapitalSite {
  readonly hex: Axial;
  readonly tier: number;
}

function capitalSite(grid: HexGrid, labels: WorldLabels, cell: HexCell, ocean: number): CapitalSite | null {
  if (!isClaimable(cell.terrain) || !isPassable(cell.terrain)) return null;
  let land = 0;
  let body = -1;
  for (const hex of startPlot(cell)) {
    const other = gridAt(grid, hex);
    if (!other || !isClaimable(other.terrain)) continue;
    land += 1;
    if (other === cell) continue;
    const reached = portWaterBody(grid, labels, other);
    if (reached !== -1 && body !== ocean) body = reached;
  }
  const hex = { q: cell.q, r: cell.r };
  if (land < MAP_SHAPE.minStartLand) return { hex, tier: 3 };
  if (body === -1) return { hex, tier: 2 };
  const size = labels.landSizes[labels.landmass[gridIndex(grid, cell.q, cell.r)]!]!;
  return { hex, tier: body === ocean && size >= MAP_SHAPE.minCapitalLandmass ? 0 : 1 };
}

function chooseCapitals(grid: HexGrid, labels: WorldLabels, rng: Rng, count: number, extra = 0): Axial[] {
  const ocean = labels.waterSizes.indexOf(Math.max(...labels.waterSizes, 0));
  const tiers: Axial[][] = [[], [], [], []];
  for (const cell of grid.cells) {
    const site = capitalSite(grid, labels, cell, ocean);
    if (site) tiers[site.tier]!.push(site.hex);
  }

  const needed = Math.max(1, count) + extra;
  const pool: Axial[] = [];
  for (const tier of tiers) {
    if (pool.length >= needed * 2) break;
    pool.push(...tier);
  }
  if (pool.length === 0) return [];

  const chosen: Axial[] = [pool[nextInt(rng, pool.length)]!];
  for (let pickIndex = 1; pickIndex < needed; pickIndex++) {
    let best: Axial | undefined;
    let bestSpacing = 0;
    for (let sample = 0; sample < MAP_SHAPE.capitalSamples; sample++) {
      const candidate = pool[nextInt(rng, pool.length)]!;
      let separation = Infinity;
      for (const existing of chosen) separation = Math.min(separation, distance(existing, candidate));
      if (separation > bestSpacing) {
        bestSpacing = separation;
        best = candidate;
      }
    }
    if (best) chosen.push(best);
  }

  const contenders = chosen.slice(0, needed - extra).sort((a, b) => a.q - b.q || a.r - b.r);
  return [...contenders, ...chosen.slice(needed - extra, needed)];
}

function neutralStateCount(config: GameConfig): number {
  return Math.max(0, Math.floor(config.start.neutralStates ?? 0));
}

function createEmpires(config: GameConfig): Empire[] {
  const empires: Empire[] = [];
  const total = config.start.empireCount + neutralStateCount(config);
  const humanName = config.start.humanName?.trim() || 'Zombo';
  const names = empireNames(config.map.seed, total, [humanName]);
  for (let id = 0; id < total; id++) {
    empires.push(
      createEmpire(config, {
        id,
        name: id === 0 ? humanName : (names[id] ?? `Empire ${id}`),
        factionId: '',
        isHuman: id === 0,
        neutralState: id >= config.start.empireCount,
      }),
    );
  }
  return empires;
}

export function assignBotFactions(state: GameState, factionIds: readonly string[]): void {
  for (const empire of state.empires) {
    if (empire.isHuman && empire.factionId !== '') continue;
    empire.factionId = defaultFactionId(empire.id, factionIds);
    recomputeEmpireBonuses(state, empire.id);
  }
}

export function createInitialState(baseConfig: GameConfig): GameState {
  const config = scaleConfigToMap(baseConfig);
  const mapRng = createRng(config.map.seed);
  const { grid, labels } = generateWorld(config, mapRng);
  const state = createBaseState(config, grid, createEmpires(config), labels);

  const capitals = chooseCapitals(grid, labels, mapRng, config.start.empireCount, neutralStateCount(config));
  const sites = state.empires.map((_, id) => capitals[id] ?? null);
  if (config.start.pickSpawns) state.spawnSites = sites;
  else claimSites(state, sites);

  pruneLoneMountains(grid);
  recomputeAllBonuses(state);
  refreshHexCounts(state);

  return state;
}

function claimSites(state: GameState, sites: readonly (Axial | null)[]): void {
  sites.forEach((site, id) => {
    if (site) claimTerritory(state, id, site, state.empires[id]!.neutralState ? NEUTRAL_PLOT : START_PLOT);
  });
}

export function claimSpawns(state: GameState): boolean {
  if (state.spawnSites.length === 0) return false;
  claimSites(state, state.spawnSites);
  state.spawnSites = [];
  recomputeAllBonuses(state);
  refreshHexCounts(state);
  return true;
}

function plotsOverlap(a: Axial, b: Axial): boolean {
  return Math.abs(a.q - b.q) < START_PLOT && Math.abs(a.r - b.r) < START_PLOT;
}

export function moveSpawn(state: GameState, empireId: number, target: Axial): boolean {
  const centre = gridAt(state.grid, target);
  if (!centre || !isClaimable(centre.terrain) || !isPassable(centre.terrain)) return false;
  let land = 0;
  for (const hex of startPlot(target)) {
    const cell = gridAt(state.grid, hex);
    if (!cell || !isClaimable(cell.terrain)) continue;
    if (cell.owner !== NEUTRAL_OWNER && cell.owner !== empireId) return false;
    land += 1;
  }
  if (land < MAP_SHAPE.minStartLand) return false;

  if (state.spawnSites.length > 0) {
    if (state.spawnSites.some((site, id) => id !== empireId && site && plotsOverlap(site, target))) return false;
    state.spawnSites[empireId] = { q: target.q, r: target.r };
    return true;
  }

  for (const cell of [...ownedCells(state, empireId)]) {
    if (cell.building) setBuilding(state, cell, null);
    setOwner(state, cell, NEUTRAL_OWNER);
  }
  claimTerritory(state, empireId, target, START_PLOT);
  refreshHexCounts(state);
  return true;
}

function claimTerritory(state: GameState, empireId: number, capital: Axial, size: number): void {
  for (const hex of startPlot(capital, size)) {
    const cell = gridAt(state.grid, hex);
    if (!cell || cell.owner !== NEUTRAL_OWNER) continue;
    if (!isClaimable(cell.terrain)) continue;
    if (!isPassable(cell.terrain)) cell.terrain = 'plain';
    setOwner(state, cell, empireId);
  }
  if (gridAt(state.grid, capital)?.owner === empireId) placeStartBuilding(state, capital, 'city', START_CITY_LEVEL);
  clearPortSite(state, empireId, capital, size);
  garrisonStart(state, empireId);
}

function garrisonStart(state: GameState, empireId: number): void {
  const empire = state.empires[empireId]!;
  const troops = empire.soldiers;
  empire.soldiers = 0;
  addToEncampments(state, empireId, troops);
}

function clearPortSite(state: GameState, empireId: number, capital: Axial, size: number): void {
  for (const hex of startPlot(capital, size)) {
    const cell = gridAt(state.grid, hex);
    if (!cell || cell.owner !== empireId || !isPortSite(state.grid, state.map, cell)) continue;
    cell.terrain = 'plain';
    return;
  }
}

function placeStartBuilding(state: GameState, hex: Axial, kind: BuildingKind, level = 1): void {
  const cell = gridAt(state.grid, hex);
  if (!cell || cell.building || !isClaimable(cell.terrain)) return;
  cell.terrain = 'plain';
  setBuilding(state, cell, createBuilding(state, kind, level, 0));
}
