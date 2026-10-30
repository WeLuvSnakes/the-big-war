import type { HexCell } from '../map/map.types';
import type { GameState } from '../state/state.types';
import type { EmpireId } from '../empire/empire.types';
import { portWaterBody } from '../map/port-site.service';
import { NEUTRAL_OWNER } from '../empire/empire.constants';
import { buildingCellsOf } from '../map/world-index.service';
import { findSeaRoute, seaIndex } from './sea-route.service';
import { getRelation } from '../diplomacy/diplomacy.service';
import type { CommandError } from '../commands/commands.types';
import type { Building, BuildingId } from '../building/building.types';
import type { Axial } from '@the-big-war/game-engine/world-tile/world-tile.types';
import type { CoastTile, LandingPlan, Ship, ShipId, ShipKind } from './ship.types';
import { isClaimable, isPassable, isWater, tileScale } from '../map/terrain.service';
import { distance, gridCoord, gridIndex, neighbors, gridAt } from '@the-big-war/game-engine/world-tile/world-tile.service';

const HASH_SHIFT = 4;
const HASH_ROW = 1 << 16;

function hashKey(q: number, r: number): number {
  return (q >> HASH_SHIFT) + (r >> HASH_SHIFT) * HASH_ROW;
}

export function rebuildShipHash(state: GameState): void {
  state.shipHash.clear();
  for (const ship of state.ships) {
    const key = hashKey(ship.pos.q, ship.pos.r);
    const bucket = state.shipHash.get(key);
    if (bucket) bucket.push(ship);
    else state.shipHash.set(key, [ship]);
  }
}

export function shipsNear(state: GameState, at: Axial, radius: number): Ship[] {
  const found: Ship[] = [];
  const low = -radius;
  for (let r = (at.r + low) >> HASH_SHIFT; r <= (at.r + radius) >> HASH_SHIFT; r++) {
    for (let q = (at.q + low) >> HASH_SHIFT; q <= (at.q + radius) >> HASH_SHIFT; q++) {
      for (const ship of state.shipHash.get(q + r * HASH_ROW) ?? []) {
        if (ship.hp > 0 && distance(ship.pos, at) <= radius) found.push(ship);
      }
    }
  }
  return found;
}

export function shipById(state: GameState, id: ShipId): Ship | undefined {
  return state.ships.find(ship => ship.id === id);
}

export function atWar(state: GameState, a: EmpireId, b: EmpireId): boolean {
  return a !== b && getRelation(state, a, b).status === 'war';
}

export function troopsAtSea(state: GameState, empire: EmpireId): number {
  let total = 0;
  for (const ship of state.ships) if (ship.empire === empire) total += ship.troops;
  return total;
}

export function isFinishedPort(cell: HexCell): boolean {
  const building = cell.building;
  return building?.kind === 'port' && building.buildRemaining <= 0 && building.demolishAt === null;
}

export function finishedPorts(state: GameState, empire: EmpireId): HexCell[] {
  return buildingCellsOf(state, empire).filter(isFinishedPort);
}

export function hasPort(state: GameState, empire: EmpireId): boolean {
  return buildingCellsOf(state, empire).some(cell => cell.building?.kind === 'port');
}

export function portBoatLimit(state: GameState, building: Building): number {
  return state.config.ship.boatsPerPort + (building.level - 1) * state.config.ship.boatsPerUpgrade;
}

export function boatsFrom(state: GameState, port: BuildingId, kind: ShipKind = 'transport'): number {
  let count = 0;
  for (const ship of state.ships) if (ship.homePort === port && ship.kind === kind && ship.hp > 0) count += 1;
  return count;
}

export function isBlockaded(state: GameState, port: HexCell): boolean {
  let enemy = false;
  for (const ship of shipsNear(state, port, state.config.ship.blockadeRadius)) {
    if (ship.kind !== 'battleship') continue;
    if (ship.empire === port.owner) return false;
    if (atWar(state, ship.empire, port.owner)) enemy = true;
  }
  return enemy;
}

export function portDock(state: GameState, port: HexCell): number | null {
  const body = portWaterBody(state.grid, state.map, port);
  if (body < 0) return null;
  for (const hex of neighbors(port)) {
    const cell = gridAt(state.grid, hex);
    if (!cell || !isWater(cell.terrain)) continue;
    const at = gridIndex(state.grid, hex.q, hex.r);
    if (state.map.waterBody[at] === body) return at;
  }
  return null;
}

function beachChoice(state: GameState, focus: Axial, wanted: EmpireId, bodies: ReadonlySet<number>): CoastTile | null {
  const landmass = state.map.landmass[gridIndex(state.grid, focus.q, focus.r)]!;
  const coast = seaIndex(state.grid, state.map).coastByLandmass.get(landmass) ?? [];
  let best: CoastTile | null = null;
  let bestScore = Infinity;
  for (const tile of coast) {
    if (!bodies.has(tile.body)) continue;
    const cell = state.grid.cells[tile.beach]!;
    if (!isPassable(cell.terrain) || (cell.owner !== wanted && cell.owner !== NEUTRAL_OWNER)) continue;
    const penalty = cell.owner === wanted ? 0 : state.grid.width + state.grid.height;
    const score = distance(cell, focus) + penalty;
    if (score >= bestScore) continue;
    best = tile;
    bestScore = score;
  }
  return best;
}

export function planLanding(state: GameState, empire: EmpireId, focus: Axial, wanted: EmpireId): LandingPlan | CommandError {
  const ports = finishedPorts(state, empire);
  if (ports.length === 0) return 'no_port';
  const bodies = new Set(ports.map(port => portWaterBody(state.grid, state.map, port)));
  const coast = beachChoice(state, focus, wanted, bodies);
  if (!coast) return 'no_sea_route';
  const shore = state.grid.cells[coast.beach]!;

  const docked = ports.filter(port => portWaterBody(state.grid, state.map, port) === coast.body);
  const open = docked.filter(port => !isBlockaded(state, port));
  if (open.length === 0) return 'blockaded';
  const free = open
    .filter(port => boatsFrom(state, port.building!.id) < portBoatLimit(state, port.building!))
    .sort((a, b) => distance(a, shore) - distance(b, shore));
  const port = free[0];
  if (!port) return 'port_busy';
  const dock = portDock(state, port);
  const route = dock === null ? null : findSeaRoute(state.grid, state.map, dock, coast.water);
  if (dock === null || !route) return 'no_sea_route';
  return { port: { q: port.q, r: port.r }, coast, route: [dock, ...route] };
}

function spawnShip(state: GameState, kind: ShipKind, empire: EmpireId, port: Building, path: readonly number[]): Ship {
  const at = gridCoord(state.grid, path[0]!);
  const ship: Ship = {
    id: state.nextShipId++,
    kind,
    empire,
    homePort: port.id,
    hp: state.config.ship[kind].hp,
    pos: at,
    next: null,
    progress: 0,
    path: path.slice(1),
    pathAt: 0,
    cooldown: 0,
    troops: 0,
    beach: null,
    focus: null,
    destination: null,
    routeTiles: path.length,
  };
  state.ships.push(ship);
  rebuildShipHash(state);
  return ship;
}

export function launchTransport(state: GameState, empire: EmpireId, plan: LandingPlan, focus: Axial, troops: number): Ship {
  const building = gridAt(state.grid, plan.port)!.building!;
  const ship = spawnShip(state, 'transport', empire, building, plan.route);
  ship.troops = troops;
  ship.beach = gridCoord(state.grid, plan.coast.beach);
  ship.focus = { q: focus.q, r: focus.r };
  return ship;
}

export function launchTrade(state: GameState, port: HexCell, destination: HexCell, path: readonly number[]): Ship {
  const ship = spawnShip(state, 'trade', port.owner, port.building!, path);
  ship.destination = { q: destination.q, r: destination.r };
  return ship;
}

export function launchBattleship(state: GameState, port: HexCell): Ship | null {
  const dock = portDock(state, port);
  return dock === null ? null : spawnShip(state, 'battleship', port.owner, port.building!, [dock]);
}

export function setShipCourse(state: GameState, ship: Ship, target: Axial): boolean {
  const from = ship.next ?? ship.pos;
  const start = gridIndex(state.grid, from.q, from.r);
  const route = findSeaRoute(state.grid, state.map, start, gridIndex(state.grid, target.q, target.r));
  if (!route) return false;
  ship.path = ship.next ? [start, ...route] : route;
  ship.pathAt = 0;
  return true;
}

export function shipSpeed(state: GameState, ship: Ship): number {
  return state.config.ship[ship.kind].speed * Math.max(1, tileScale(state));
}

export function damageShip(ship: Ship, damage: number): void {
  ship.hp -= damage;
  if (ship.hp > 0) return;
  ship.hp = 0;
  ship.troops = 0;
}

export function shellShips(state: GameState, shooter: EmpireId, at: Axial, radius: number, damage: number): number {
  let hits = 0;
  for (const ship of shipsNear(state, at, radius)) {
    if (!atWar(state, shooter, ship.empire)) continue;
    damageShip(ship, damage);
    hits += 1;
  }
  return hits;
}

export function removeSunkShips(state: GameState): void {
  if (state.ships.every(ship => ship.hp > 0)) return;
  state.ships = state.ships.filter(ship => ship.hp > 0);
}

export function removeShipsOf(state: GameState, empire: EmpireId): void {
  for (const ship of state.ships) if (ship.empire === empire) damageShip(ship, ship.hp);
  removeSunkShips(state);
  rebuildShipHash(state);
}

export function isCoastal(state: GameState, cell: HexCell): boolean {
  if (!isClaimable(cell.terrain)) return false;
  return neighbors(cell).some(hex => {
    const next = gridAt(state.grid, hex);
    return !!next && isWater(next.terrain);
  });
}
