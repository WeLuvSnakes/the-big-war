import type { Ship } from '../ship/ship.types';
import type { GameState } from '../state/state.types';
import { rebuildShipHash } from '../ship/ship.service';
import { createBaseState } from '../state/state.service';
import type { GameConfig } from '../config/config.types';
import { NEUTRAL_OWNER } from '../empire/empire.constants';
import type { Offensive } from '../offensive/offensive.types';
import type { Biome, HexCell, HexGrid, Terrain } from '../map/map.types';
import { createMinHeap } from '@the-big-war/game-engine/collections/min-heap.service';
import type { FrameMessage, OffensiveView, ShipView, SnapshotMessage } from './sim.types';
import { drainChangedTiles, markTile, setBuilding, setOwner } from '../map/world-index.service';
import type { Building, BuildingKind, Gatherer, GathererPhase } from '../building/building.types';

const TERRAINS: readonly Terrain[] = ['plain', 'forest', 'mountain', 'ore', 'water'];
const BIOMES: readonly Biome[] = ['temperate', 'steppe', 'desert', 'tundra', 'taiga', 'jungle', 'swamp', 'volcanic'];
const PHASES: readonly GathererPhase[] = ['idle', 'outbound', 'working', 'returning'];
const KINDS: readonly BuildingKind[] = [
  'city',
  'market',
  'lumberjack',
  'miner',
  'farm',
  'lab',
  'port',
  'fishery',
  'barracks',
  'fort',
  'cannon',
  'trench',
  'machine_gun',
  'battery',
  'bunker',
  'tank',
];

const TILE_STRIDE = 4;
const BUILDING_STRIDE = 13;
const GATHERER_STRIDE = 7;

const orNaN = (value: number | null | undefined): number => value ?? Number.NaN;
const orNull = (value: number): number | null => (Number.isNaN(value) ? null : value);

export type ShipPaths = WeakMap<Ship, number[]>;

function encodeTiles(state: GameState): Float64Array<ArrayBuffer> {
  const tiles = new Float64Array(state.index.changedTiles.length * TILE_STRIDE);
  let cursor = 0;
  drainChangedTiles(state.index, at => {
    const cell = state.grid.cells[at]!;
    tiles[cursor++] = at;
    tiles[cursor++] = cell.owner;
    tiles[cursor++] = TERRAINS.indexOf(cell.terrain);
    tiles[cursor++] = orNaN(cell.harvested);
  });
  return tiles;
}

function encodeBuildings(state: GameState): Pick<FrameMessage, 'buildings' | 'gatherers'> {
  const places = state.index.buildings;
  const buildings = new Float64Array(places.length * BUILDING_STRIDE);
  let gathererCount = 0;
  for (const at of places) gathererCount += state.grid.cells[at]!.building!.gatherers.length;
  const gatherers = new Float64Array(gathererCount * GATHERER_STRIDE);
  let row = 0;
  let next = 0;
  for (const at of places) {
    const building = state.grid.cells[at]!.building!;
    buildings[row++] = at;
    buildings[row++] = building.id;
    buildings[row++] = KINDS.indexOf(building.kind);
    buildings[row++] = building.level;
    buildings[row++] = building.cooldown;
    buildings[row++] = building.growth;
    buildings[row++] = orNaN(building.demolishAt);
    buildings[row++] = building.buildRemaining;
    buildings[row++] = building.garrison;
    buildings[row++] = building.machineGun ? 1 : 0;
    buildings[row++] = building.shipBuild;
    buildings[row++] = building.shellDamage;
    buildings[row++] = building.gatherers.length;
    for (const gatherer of building.gatherers) {
      gatherers[next++] = gatherer.pos.q;
      gatherers[next++] = gatherer.pos.r;
      gatherers[next++] = orNaN(gatherer.target?.q);
      gatherers[next++] = orNaN(gatherer.target?.r);
      gatherers[next++] = PHASES.indexOf(gatherer.phase);
      gatherers[next++] = gatherer.progress;
      gatherers[next++] = gatherer.duration;
    }
  }
  return { buildings, gatherers };
}

function shipView(ship: Ship, paths: ShipPaths): ShipView {
  const { path, ...view } = ship;
  if (paths.get(ship) === path) return view;
  paths.set(ship, path);
  return { ...view, path };
}

function offensiveView(offensive: Offensive): OffensiveView {
  const { frontier: _frontier, queued: _queued, ...view } = offensive;
  return view;
}

export function encodeFrame(state: GameState, paused: boolean, paths: ShipPaths): FrameMessage {
  return {
    type: 'frame',
    status: state.status,
    playerEmpire: state.playerEmpire,
    paused,
    speed: state.speed,
    tick: state.tick,
    elapsed: state.elapsed,
    winner: state.winner,
    endReason: state.endReason,
    tradeClock: state.tradeClock,
    landHexCount: state.landHexCount,
    spawnSites: state.spawnSites,
    agentAccumulator: state.agentAccumulator,
    nextOffensiveId: state.nextOffensiveId,
    nextShipId: state.nextShipId,
    nextBuildingId: state.nextBuildingId,
    tiles: encodeTiles(state),
    ...encodeBuildings(state),
    empires: state.empires,
    offensives: state.offensives.map(offensiveView),
    ships: state.ships.map(ship => shipView(ship, paths)),
    relations: state.relations,
    offerCooldowns: state.offerCooldowns,
    pendingOffers: state.pendingOffers,
  };
}

export function encodeSnapshot(state: GameState, paused: boolean, paths: ShipPaths, seq: number, match: number): SnapshotMessage {
  const { cells, width, height } = state.grid;
  const owners = new Int32Array(cells.length);
  const terrains = new Uint8Array(cells.length);
  const biomes = new Uint8Array(cells.length);
  const harvested = new Float64Array(cells.length);
  cells.forEach((cell, at) => {
    owners[at] = cell.owner;
    terrains[at] = TERRAINS.indexOf(cell.terrain);
    biomes[at] = BIOMES.indexOf(cell.biome);
    harvested[at] = orNaN(cell.harvested);
  });
  return {
    type: 'snapshot',
    seq,
    match,
    config: state.config,
    width,
    height,
    owners,
    terrains,
    biomes,
    harvested,
    landmass: state.map.landmass.slice() as Int32Array<ArrayBuffer>,
    waterBody: state.map.waterBody.slice() as Int32Array<ArrayBuffer>,
    landSizes: state.map.landSizes,
    waterSizes: state.map.waterSizes,
    frame: encodeFrame(state, paused, paths),
  };
}

export function frameTransfer(frame: FrameMessage): Transferable[] {
  return [frame.tiles.buffer, frame.buildings.buffer, frame.gatherers.buffer];
}

export function snapshotTransfer(snapshot: SnapshotMessage): Transferable[] {
  return [
    snapshot.owners.buffer,
    snapshot.terrains.buffer,
    snapshot.biomes.buffer,
    snapshot.harvested.buffer,
    snapshot.landmass.buffer,
    snapshot.waterBody.buffer,
    ...frameTransfer(snapshot.frame),
  ];
}

function applyTiles(state: GameState, tiles: Float64Array): void {
  for (let row = 0; row < tiles.length; row += TILE_STRIDE) {
    const cell = state.grid.cells[tiles[row]!]!;
    setOwner(state, cell, tiles[row + 1]!);
    cell.terrain = TERRAINS[tiles[row + 2]!]!;
    const harvested = orNull(tiles[row + 3]!);
    if (harvested === null) delete cell.harvested;
    else cell.harvested = harvested;
    markTile(state, cell);
  }
}

function readGatherers(gatherers: Float64Array, start: number, count: number): Gatherer[] {
  const list: Gatherer[] = [];
  for (let item = 0; item < count; item++) {
    const at = start + item * GATHERER_STRIDE;
    const targetQ = orNull(gatherers[at + 2]!);
    list.push({
      pos: { q: gatherers[at]!, r: gatherers[at + 1]! },
      target: targetQ === null ? null : { q: targetQ, r: gatherers[at + 3]! },
      phase: PHASES[gatherers[at + 4]!]!,
      progress: gatherers[at + 5]!,
      duration: gatherers[at + 6]!,
    });
  }
  return list;
}

function emptyBuilding(id: number, kind: BuildingKind): Building {
  return {
    id,
    kind,
    level: 0,
    cooldown: 0,
    growth: 0,
    demolishAt: null,
    buildRemaining: 0,
    gatherers: [],
    garrison: 0,
    machineGun: false,
    shipBuild: 0,
    shellDamage: 0,
  };
}

function applyBuildings(state: GameState, buildings: Float64Array, gatherers: Float64Array): void {
  const present = new Set<number>();
  let nextGatherer = 0;
  for (let row = 0; row < buildings.length; row += BUILDING_STRIDE) {
    const at = buildings[row]!;
    const cell: HexCell = state.grid.cells[at]!;
    const id = buildings[row + 1]!;
    present.add(at);
    let building = cell.building;
    if (building?.id !== id) {
      building = emptyBuilding(id, KINDS[buildings[row + 2]!]!);
      setBuilding(state, cell, building);
    }
    building.level = buildings[row + 3]!;
    building.cooldown = buildings[row + 4]!;
    building.growth = buildings[row + 5]!;
    building.demolishAt = orNull(buildings[row + 6]!);
    building.buildRemaining = buildings[row + 7]!;
    building.garrison = buildings[row + 8]!;
    building.machineGun = buildings[row + 9]! === 1;
    building.shipBuild = buildings[row + 10]!;
    building.shellDamage = buildings[row + 11]!;
    const count = buildings[row + 12]!;
    building.gatherers = readGatherers(gatherers, nextGatherer, count);
    nextGatherer += count * GATHERER_STRIDE;
  }
  for (const at of [...state.index.buildings]) {
    if (!present.has(at)) setBuilding(state, state.grid.cells[at]!, null);
  }
}

function reconcile<Live extends { readonly id: number }, View extends { readonly id: number }>(
  current: readonly Live[],
  views: readonly View[],
  create: (view: View) => Live,
): Live[] {
  const known = new Map(current.map(item => [item.id, item]));
  return views.map(view => {
    const existing = known.get(view.id);
    return existing ? Object.assign(existing, view) : create(view);
  });
}

export function applyFrame(state: GameState, frame: FrameMessage): void {
  state.status = frame.status;
  state.playerEmpire = frame.playerEmpire;
  state.speed = frame.speed;
  state.tick = frame.tick;
  state.elapsed = frame.elapsed;
  state.winner = frame.winner;
  state.endReason = frame.endReason;
  state.tradeClock = frame.tradeClock;
  state.landHexCount = frame.landHexCount;
  state.spawnSites = frame.spawnSites;
  state.agentAccumulator = frame.agentAccumulator;
  state.nextOffensiveId = frame.nextOffensiveId;
  state.nextShipId = frame.nextShipId;
  state.nextBuildingId = frame.nextBuildingId;
  applyTiles(state, frame.tiles);
  applyBuildings(state, frame.buildings, frame.gatherers);
  frame.empires.forEach((empire, at) => {
    if (state.empires[at] === undefined) state.empires[at] = empire;
    else Object.assign(state.empires[at], empire);
  });
  state.offensives = reconcile(state.offensives, frame.offensives, view => ({
    ...view,
    frontier: createMinHeap(),
    queued: new Set<number>(),
  }));
  state.ships = reconcile(state.ships, frame.ships, view => ({ ...view, path: view.path ?? [] }));
  rebuildShipHash(state);
  state.relations = frame.relations;
  state.offerCooldowns = frame.offerCooldowns;
  state.pendingOffers = [...frame.pendingOffers];
}

export function emptyMirror(config: GameConfig): GameState {
  const grid: HexGrid = { width: 0, height: 0, cells: [] };
  const map = { landmass: new Int32Array(0), waterBody: new Int32Array(0), landSizes: [], waterSizes: [] };
  const state = createBaseState(config, grid, [], map);
  state.status = 'menu';
  return state;
}

export function applySnapshot(snapshot: SnapshotMessage): GameState {
  const { width, height, owners, terrains, biomes, harvested } = snapshot;
  const cells: HexCell[] = [];
  for (let at = 0; at < owners.length; at++) {
    const cell: HexCell = {
      q: at % width,
      r: Math.floor(at / width),
      terrain: TERRAINS[terrains[at]!]!,
      biome: BIOMES[biomes[at]!]!,
      owner: owners[at] ?? NEUTRAL_OWNER,
      building: null,
    };
    const load = orNull(harvested[at]!);
    if (load !== null) cell.harvested = load;
    cells.push(cell);
  }
  const state = createBaseState(snapshot.config, { width, height, cells }, [], {
    landmass: snapshot.landmass,
    waterBody: snapshot.waterBody,
    landSizes: snapshot.landSizes,
    waterSizes: snapshot.waterSizes,
  });
  applyFrame(state, snapshot.frame);
  return state;
}
