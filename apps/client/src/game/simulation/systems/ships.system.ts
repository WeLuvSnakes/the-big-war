import type { Ship } from '../../ship/ship.types';
import type { HexCell } from '../../map/map.types';
import type { GameState } from '../../state/state.types';
import { findSeaRoute } from '../../ship/sea-route.service';
import { portWaterBody } from '../../map/port-site.service';
import { NEUTRAL_OWNER } from '../../empire/empire.constants';
import { orderGroup, shellUnits } from '../../unit/unit.service';
import { nextInt } from '@the-big-war/game-engine/rng/rng.service';
import { canAttack, declareWar } from '../../diplomacy/diplomacy.service';
import { allBuildingCells, setBuilding } from '../../map/world-index.service';
import { area, gridAt, gridCoord } from '@the-big-war/game-engine/world-tile/world-tile.service';
import {
  atWar,
  boatsFrom,
  damageShip,
  isBlockaded,
  isFinishedPort,
  launchBattleship,
  launchTrade,
  portDock,
  rebuildShipHash,
  removeSunkShips,
  shipSpeed,
  shipsNear,
} from '../../ship/ship.service';

const TARGET_RANK: Readonly<Record<Ship['kind'], number>> = { transport: 0, battleship: 1, trade: 2 };

export function stepShips(state: GameState, dt: number): void {
  rebuildShipHash(state);
  stepPortYards(state, dt);
  for (const ship of state.ships) {
    if (ship.hp <= 0) continue;
    ship.cooldown = Math.max(0, ship.cooldown - dt);
    sail(state, ship, dt);
    if (ship.hp > 0 && ship.kind === 'battleship' && ship.cooldown <= 0) fire(state, ship);
  }
  removeSunkShips(state);
  rebuildShipHash(state);
  stepTrade(state, dt);
}

function stepPortYards(state: GameState, dt: number): void {
  for (const cell of allBuildingCells(state)) {
    const building = cell.building;
    if (!building || building.shipBuild <= 0 || !isFinishedPort(cell) || isBlockaded(state, cell)) continue;
    building.shipBuild = Math.max(0, building.shipBuild - dt);
    if (building.shipBuild === 0) launchBattleship(state, cell);
  }
}

function sail(state: GameState, ship: Ship, dt: number): void {
  ship.next ??= nextTile(state, ship);
  if (!ship.next) {
    arrive(state, ship);
    return;
  }
  ship.progress += shipSpeed(state, ship) * dt;
  while (ship.progress >= 1 && ship.next) {
    ship.pos = ship.next;
    ship.pathAt += 1;
    ship.progress -= 1;
    ship.next = nextTile(state, ship);
  }
  if (ship.next) return;
  ship.progress = 0;
  arrive(state, ship);
}

function nextTile(state: GameState, ship: Ship) {
  const at = ship.path[ship.pathAt];
  return at === undefined ? null : gridCoord(state.grid, at);
}

function arrive(state: GameState, ship: Ship): void {
  if (ship.kind === 'transport') land(state, ship);
  if (ship.kind === 'trade') settleTrade(state, ship);
}

function land(state: GameState, ship: Ship): void {
  if (ship.cargo.length > 0) {
    disembark(state, ship);
    return;
  }
  ship.hp = 0;
}

function disembark(state: GameState, ship: Ship): void {
  const beach = gridAt(state.grid, ship.beach!)!;
  const focus = ship.focus!;
  const units = ship.cargo;
  ship.cargo = [];
  ship.hp = 0;
  const hostileBeach = beach.owner !== NEUTRAL_OWNER && beach.owner !== ship.empire;
  const blocked = hostileBeach && !canAttack(state, ship.empire, beach.owner).allowed;
  if (hostileBeach && !blocked) declareWar(state, ship.empire, beach.owner);
  const size = state.config.map.hexSize;
  const x = (beach.q + 0.5) * size;
  const y = (beach.r + 0.5) * size;
  for (const unit of units) {
    unit.x = x;
    unit.y = y;
    unit.tx = x;
    unit.ty = y;
    unit.gx = x;
    unit.gy = y;
    state.units.push(unit);
  }
  if (!blocked) orderGroup(units, (focus.q + 0.5) * size, (focus.r + 0.5) * size, 'amove', 'wedge');
}

function settleTrade(state: GameState, ship: Ship): void {
  ship.hp = 0;
  const port = gridAt(state.grid, ship.destination!);
  if (!port || !isFinishedPort(port) || port.owner === ship.empire || atWar(state, ship.empire, port.owner)) return;
  if (isBlockaded(state, port)) return;
  const home = state.empires[ship.empire];
  const away = state.empires[port.owner];
  if (!home || !away) return;
  const { tradeBaseGold, tradeGoldPerTile } = state.config.ship;
  const payout = tradeBaseGold + tradeGoldPerTile * ship.routeTiles;
  home.gold += payout;
  away.gold += payout;
}

function fire(state: GameState, ship: Ship): void {
  const { range, damage, cooldown } = state.config.ship;
  const target = pickShip(state, ship, range);
  if (target) {
    damageShip(target, damage);
    ship.cooldown = cooldown;
    return;
  }
  if (shellCoast(state, ship, range)) ship.cooldown = cooldown;
}

function pickShip(state: GameState, ship: Ship, range: number): Ship | null {
  let best: Ship | null = null;
  let bestScore = Infinity;
  for (const other of shipsNear(state, ship.pos, range)) {
    if (!atWar(state, ship.empire, other.empire)) continue;
    const score = TARGET_RANK[other.kind] * 1000 + other.id * 1e-6 + distance2(ship, other);
    if (score >= bestScore) continue;
    best = other;
    bestScore = score;
  }
  return best;
}

function distance2(a: Ship, b: Ship): number {
  return Math.abs(a.pos.q - b.pos.q) + Math.abs(a.pos.r - b.pos.r);
}

function shellCoast(state: GameState, ship: Ship, range: number): boolean {
  let best: HexCell | null = null;
  for (const hex of area(ship.pos, range)) {
    const cell = gridAt(state.grid, hex);
    if (!cell || cell.owner === NEUTRAL_OWNER || !atWar(state, ship.empire, cell.owner)) continue;
    if (!best || (cell.building && !best.building)) best = cell;
    if (best.building) break;
  }
  if (!best) return false;
  const { coastTroopDamage, coastBuildingHits } = state.config.ship;
  shellUnits(state, ship.empire, best, 1, coastTroopDamage);
  const building = best.building;
  if (building) {
    building.shellDamage += 1;
    if (building.shellDamage >= coastBuildingHits * building.level) {
      setBuilding(state, best, null);
    }
  }
  return true;
}

function stepTrade(state: GameState, dt: number): void {
  state.tradeClock += dt;
  const { tradeIntervalSeconds, tradeShipsPerPort } = state.config.ship;
  if (state.tradeClock < tradeIntervalSeconds) return;
  state.tradeClock -= tradeIntervalSeconds;
  const ports = allBuildingCells(state).filter(cell => isFinishedPort(cell) && !isBlockaded(state, cell));
  for (const port of ports) {
    if (boatsFrom(state, port.building!.id, 'trade') >= tradeShipsPerPort) continue;
    const body = portWaterBody(state.grid, state.map, port);
    const partners = ports.filter(
      other =>
        other.owner !== port.owner &&
        !atWar(state, port.owner, other.owner) &&
        portWaterBody(state.grid, state.map, other) === body,
    );
    if (partners.length === 0) continue;
    const partner = partners[nextInt(state.rng, partners.length)]!;
    const from = portDock(state, port);
    const to = portDock(state, partner);
    if (from === null || to === null) continue;
    const route = findSeaRoute(state.grid, state.map, from, to);
    if (route) launchTrade(state, port, partner, [from, ...route]);
  }
}
