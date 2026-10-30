import { describe, expect, test } from 'bun:test';
import { setTroops, testEmpire } from '../support/fixture';
import type { Ship } from '@the-big-war/client/game/ship/ship.types';
import type { HexCell } from '@the-big-war/client/game/map/map.types';
import { isWater } from '@the-big-war/client/game/map/terrain.service';
import { aStar } from '@the-big-war/game-engine/pathfinding/a-star.service';
import type { GameState } from '@the-big-war/client/game/state/state.types';
import { botTick, createBot } from '@the-big-war/client/game/bot/bot.service';
import { dispatch } from '@the-big-war/client/game/commands/commands.service';
import { step } from '@the-big-war/client/game/simulation/simulation.service';
import { createBaseState } from '@the-big-war/client/game/state/state.service';
import { findSeaRoute } from '@the-big-war/client/game/ship/sea-route.service';
import { deployedTroops } from '@the-big-war/client/game/troops/troops.service';
import { NEUTRAL_OWNER } from '@the-big-war/client/game/empire/empire.constants';
import { createInitialState } from '@the-big-war/client/game/state/setup.service';
import { declareWar } from '@the-big-war/client/game/diplomacy/diplomacy.service';
import { createBuilding } from '@the-big-war/client/game/building/building.service';
import { FIXED_DT } from '@the-big-war/game-engine/simulation/simulation.constants';
import { DEFAULT_GAME_CONFIG } from '@the-big-war/client/game/config/config.constants';
import { setBuilding, setOwner } from '@the-big-war/client/game/map/world-index.service';
import { gridAt, gridIndex, makeGrid } from '@the-big-war/game-engine/world-tile/world-tile.service';
import { hasPort, isBlockaded, rebuildShipHash, shipsNear } from '@the-big-war/client/game/ship/ship.service';

const WIDTH = 30;
const HEIGHT = 12;
const WEST_COAST = 6;
const EAST_COAST = 23;

function seaState(): GameState {
  const grid = makeGrid<HexCell>(WIDTH, HEIGHT, hex => ({
    q: hex.q,
    r: hex.r,
    terrain: hex.q > WEST_COAST && hex.q < EAST_COAST ? 'water' : 'plain',
    biome: 'temperate',
    owner: NEUTRAL_OWNER,
    building: null,
  }));
  const config = {
    ...DEFAULT_GAME_CONFIG,
    map: { ...DEFAULT_GAME_CONFIG.map, width: WIDTH, height: HEIGHT },
    victory: { dominationShare: 2 },
  };
  const state = createBaseState(config, grid, [testEmpire({ id: 0 }), testEmpire({ id: 1 })]);
  for (const cell of grid.cells) if (cell.q <= WEST_COAST) setOwner(state, cell, 0);
  for (const cell of grid.cells) if (cell.q >= EAST_COAST + 4) setOwner(state, cell, 1);
  for (const empire of state.empires) empire.hexCount = grid.cells.filter(cell => cell.owner === empire.id).length;
  for (const empire of state.empires) setTroops(state, empire.id, empire.soldiers);
  return state;
}

function port(state: GameState, q: number, r: number): HexCell {
  const cell = gridAt(state.grid, { q, r })!;
  setBuilding(state, cell, createBuilding(state, 'port', 1, 0));
  return cell;
}

function run(state: GameState, seconds: number): void {
  for (let i = 0; i < seconds / FIXED_DT; i++) step(state, FIXED_DT);
}

function battleship(state: GameState, empire: number, q: number, r: number): Ship {
  const ship: Ship = {
    id: state.nextShipId++,
    kind: 'battleship',
    empire,
    homePort: -1,
    hp: state.config.ship.battleship.hp,
    pos: { q, r },
    next: null,
    progress: 0,
    path: [],
    pathAt: 0,
    cooldown: 0,
    troops: 0,
    beach: null,
    focus: null,
    destination: null,
    routeTiles: 0,
  };
  state.ships.push(ship);
  rebuildShipHash(state);
  return ship;
}

const send = (state: GameState) => dispatch(state, { type: 'SendTroops', empire: 0, target: { q: 26, r: 5 }, percent: 50 });

describe('ports', () => {
  test('port needs a coast and no research, within starting gold', () => {
    const state = seaState();
    expect(dispatch(state, { type: 'PlaceBuilding', empire: 0, hex: { q: 2, r: 2 }, kind: 'port' }).ok).toBe(false);
    expect(dispatch(state, { type: 'PlaceBuilding', empire: 0, hex: { q: WEST_COAST, r: 2 }, kind: 'port' }).ok).toBe(true);
    expect(state.config.buildings.port.cost).toBeLessThanOrEqual(state.config.start.gold);
    expect(state.config.buildings.port.requiresResearch).toBeNull();
  });

  test('fishery is coast only and pays', () => {
    const state = seaState();
    expect(dispatch(state, { type: 'PlaceBuilding', empire: 0, hex: { q: 2, r: 2 }, kind: 'fishery' }).ok).toBe(false);
    expect(dispatch(state, { type: 'PlaceBuilding', empire: 0, hex: { q: WEST_COAST, r: 2 }, kind: 'fishery' }).ok).toBe(true);
    const before = state.empires[0]!.gold;
    run(state, state.config.buildings.fishery.buildSeconds + 5);
    expect(state.empires[0]!.gold).toBeGreaterThan(before);
  });
});

describe('sea routes', () => {
  test('A* finds shortest paths in the engine', () => {
    const path = aStar({
      start: 0,
      goal: 3,
      heuristic: node => 3 - node,
      neighbors: (node, visit) => {
        if (node < 3) visit(node + 1, 1);
      },
    });
    expect(path).toEqual([0, 1, 2, 3]);
  });

  test('routes stay on water and refuse other bodies', () => {
    const state = seaState();
    const from = gridIndex(state.grid, 7, 0);
    const to = gridIndex(state.grid, 22, 11);
    const route = findSeaRoute(state.grid, state.map, from, to)!;
    expect(route.at(-1)).toBe(to);
    for (const at of route) expect(isWater(state.grid.cells[at]!.terrain)).toBe(true);
    expect(findSeaRoute(state.grid, state.map, from, gridIndex(state.grid, 0, 0))).toBeNull();
  });
});

describe('transports', () => {
  test('a port-less empire cannot launch', () => {
    const state = seaState();
    const result = send(state);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('no_port');
    expect(state.ships.length).toBe(0);
    expect(state.empires[0]!.soldiers).toBe(100);
  });

  test('landing takes the beach and starts an offensive; troops count as deployed', () => {
    const state = seaState();
    port(state, WEST_COAST, 5);
    expect(send(state).ok).toBe(true);
    expect(state.ships[0]!.kind).toBe('transport');
    expect(deployedTroops(state, 0)).toBe(50);
    for (let i = 0; i < 3000 && state.ships.length > 0; i++) step(state, FIXED_DT);
    expect(state.ships.length).toBe(0);
    run(state, 5);
    expect(state.grid.cells.some(cell => cell.q >= EAST_COAST && cell.owner === 0)).toBe(true);
  });

  test('boat limit per port', () => {
    const state = seaState();
    port(state, WEST_COAST, 5);
    expect(send(state).ok).toBe(true);
    expect(send(state).ok).toBe(true);
    const result = send(state);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('port_busy');
  });

  test('a sunk transport loses its troops', () => {
    const state = seaState();
    port(state, WEST_COAST, 5);
    send(state);
    declareWar(state, 1, 0);
    const ship = state.ships[0]!;
    ship.hp = 10;
    const hunter = battleship(state, 1, 8, 5);
    run(state, 0.1);
    expect(hunter.cooldown).toBeGreaterThan(0);
    run(state, 12);
    expect(state.ships.some(item => item.id === ship.id)).toBe(false);
    expect(deployedTroops(state, 0)).toBe(0);
    expect(state.empires[0]!.soldiers).toBeLessThan(100);
  });
});

describe('battleships', () => {
  test('gated by research, built at a port, moved by order', () => {
    const state = seaState();
    const hex = { q: WEST_COAST, r: 5 };
    port(state, hex.q, hex.r);
    expect(dispatch(state, { type: 'BuildShip', empire: 0, hex }).ok).toBe(false);
    state.empires[0]!.unlocks.push('ship:battleship');
    expect(dispatch(state, { type: 'BuildShip', empire: 0, hex }).ok).toBe(true);
    run(state, state.config.ship.battleshipSeconds + 0.2);
    const ship = state.ships.find(item => item.kind === 'battleship')!;
    expect(dispatch(state, { type: 'OrderShip', empire: 0, ship: ship.id, target: { q: 2, r: 2 } }).ok).toBe(false);
    expect(dispatch(state, { type: 'OrderShip', empire: 0, ship: ship.id, target: { q: 15, r: 9 } }).ok).toBe(true);
    for (let i = 0; i < 2000; i++) {
      step(state, FIXED_DT);
      expect(isWater(gridAt(state.grid, ship.pos)!.terrain)).toBe(true);
    }
    expect(ship.pos).toEqual({ q: 15, r: 9 });
  });

  test('fires at transports before battleships', () => {
    const state = seaState();
    declareWar(state, 0, 1);
    const gunner = battleship(state, 0, 12, 5);
    const big = battleship(state, 1, 11, 5);
    const boat = battleship(state, 1, 15, 5);
    (boat as { kind: string }).kind = 'transport';
    boat.hp = 500;
    boat.path = [gridIndex(state.grid, 15, 6), gridIndex(state.grid, 15, 7)];
    boat.beach = { q: 3, r: 3 };
    boat.focus = { q: 3, r: 3 };
    run(state, FIXED_DT);
    expect(gunner.cooldown).toBeGreaterThan(0);
    expect(boat.hp).toBeLessThan(500);
    expect(big.hp).toBe(state.config.ship.battleship.hp);
  });

  test('coastal fire hurts defenders and destroys buildings', () => {
    const state = seaState();
    declareWar(state, 0, 1);
    const market = gridAt(state.grid, { q: 28, r: 5 })!;
    setBuilding(state, market, createBuilding(state, 'market', 1, 0));
    battleship(state, 0, 22, 5);
    run(state, 12);
    expect(state.empires[1]!.soldiers).toBeLessThan(100);
    expect(market.building).toBeNull();
  });

  test('a blockading battleship shells the port it shuts', () => {
    const state = seaState();
    declareWar(state, 0, 1);
    const target = port(state, 27, 5);
    battleship(state, 0, 22, 5);
    rebuildShipHash(state);
    expect(isBlockaded(state, target)).toBe(true);
    run(state, 12);
    expect(target.building).toBeNull();
  });

  test('bots research dreadnoughts, build battleships and sail them at the enemy', () => {
    const state = seaState();
    declareWar(state, 0, 1);
    state.empires[0]!.isHuman = false;
    const home = port(state, 6, 5);
    for (const cell of state.grid.cells) if (cell.q === EAST_COAST) setOwner(state, cell, 1);
    Object.assign(state.empires[0]!, { gold: 5000, science: 500, soldiers: 0 });
    const bot = createBot({ empire: 0, seed: 1 });
    for (let i = 0; i < 700 && !state.ships.some(ship => ship.kind === 'battleship' && ship.path.length > 0); i++) {
      for (const command of botTick(bot, state, 0.5)) dispatch(state, command);
      run(state, 0.5);
    }
    expect(state.empires[0]!.research.completed).toContain('dreadnoughts');
    expect(home.building?.kind).toBe('port');
    expect(state.ships.some(ship => ship.empire === 0 && ship.kind === 'battleship' && ship.path.length > 0)).toBe(true);
  });

  test('cannons and batteries hit ships', () => {
    const state = seaState();
    declareWar(state, 0, 1);
    const site = gridAt(state.grid, { q: WEST_COAST, r: 5 })!;
    const cannon = createBuilding(state, 'cannon', 1, 0);
    setBuilding(state, site, cannon);
    const ship = battleship(state, 1, 9, 5);
    expect(dispatch(state, { type: 'FireCannon', empire: 0, from: site, target: ship.pos }).ok).toBe(true);
    expect(ship.hp).toBeLessThan(state.config.ship.battleship.hp);

    const gun = gridAt(state.grid, { q: WEST_COAST, r: 7 })!;
    setBuilding(state, gun, createBuilding(state, 'battery', 1, 0));
    const before = ship.hp;
    run(state, FIXED_DT);
    expect(ship.hp).toBeLessThan(before);
  });
});

describe('trade and blockade', () => {
  function tradePorts(): { state: GameState; a: HexCell; b: HexCell } {
    const state = seaState();
    const b = gridAt(state.grid, { q: EAST_COAST, r: 5 })!;
    setOwner(state, b, 1);
    setBuilding(state, b, createBuilding(state, 'port', 1, 0));
    return { state, a: port(state, WEST_COAST, 5), b };
  }

  test('trade pays both sides more for distance', () => {
    const { state } = tradePorts();
    state.empires[0]!.gold = 0;
    state.empires[1]!.gold = 0;
    run(state, state.config.ship.tradeIntervalSeconds + 0.1);
    expect(state.ships.filter(ship => ship.kind === 'trade').length).toBe(2);
    run(state, 8);
    const expected = state.config.ship.tradeBaseGold + state.config.ship.tradeGoldPerTile * 17;
    expect(state.empires[0]!.gold).toBeGreaterThanOrEqual(expected);
    expect(state.empires[1]!.gold).toBeGreaterThanOrEqual(expected);
  });

  test('no trade at war', () => {
    const { state } = tradePorts();
    declareWar(state, 0, 1);
    run(state, state.config.ship.tradeIntervalSeconds + 0.1);
    expect(state.ships.length).toBe(0);
  });

  test('blockade stops trade and ship output; an escort lifts it', () => {
    const { state, a } = tradePorts();
    state.empires.push(testEmpire({ id: 2 }));
    setOwner(state, gridAt(state.grid, { q: 29, r: 0 })!, 2);
    declareWar(state, 2, 0);
    battleship(state, 2, 8, 5).cooldown = 999;
    expect(isBlockaded(state, a)).toBe(true);
    expect(send(state).ok).toBe(false);
    run(state, state.config.ship.tradeIntervalSeconds + 0.1);
    expect(state.ships.filter(ship => ship.homePort === a.building!.id).length).toBe(0);
    battleship(state, 0, 9, 5);
    expect(isBlockaded(state, a)).toBe(false);
  });

  test('ship spatial hash finds neighbours only', () => {
    const state = seaState();
    battleship(state, 0, 8, 1);
    battleship(state, 0, 20, 10);
    expect(shipsNear(state, { q: 8, r: 2 }, 3).length).toBe(1);
  });
});

describe('bots at sea', () => {
  const config = (seed: number) => ({
    ...DEFAULT_GAME_CONFIG,
    map: { ...DEFAULT_GAME_CONFIG.map, width: 120, height: 72, seed, preset: 'archipelago' as const },
    start: { ...DEFAULT_GAME_CONFIG.start, empireCount: 3 },
  });

  test('bot-only Archipelago match builds ports, lands troops and finds a winner', () => {
    const state = createInitialState(config(3));
    for (const empire of state.empires) empire.isHuman = false;
    const bots = state.empires.map(empire => createBot({ empire: empire.id, seed: 3 }));
    const ports = new Set<number>();
    let landed = false;
    let since = 0;
    const limit = 3600 / FIXED_DT;
    for (let i = 0; i < limit && state.status === 'playing'; i++) {
      step(state, FIXED_DT);
      since += FIXED_DT;
      if (since < state.config.bot.tickSeconds) continue;
      since = 0;
      for (const bot of bots) {
        for (const command of botTick(bot, state, since)) dispatch(state, command);
        if (hasPort(state, bot.empire)) ports.add(bot.empire);
      }
      landed ||= state.ships.some(ship => ship.kind === 'transport');
    }
    expect(ports.size).toBeGreaterThan(0);
    expect(landed).toBe(true);
    expect(state.status).toBe('ended');
    expect(state.winner).not.toBeNull();
  });

  test('every capital on many seeds has a route to a port site', () => {
    for (let seed = 1; seed <= 6; seed++) {
      const state = createInitialState(config(seed));
      for (const empire of state.empires) {
        const site = state.grid.cells.some(cell => cell.owner === empire.id && dispatchable(state, cell));
        expect(site).toBe(true);
      }
    }
  });
});

function dispatchable(state: GameState, cell: HexCell): boolean {
  const empire = state.empires[cell.owner]!;
  const copy = empire.gold;
  empire.gold = 1000;
  const result = dispatch(state, { type: 'PlaceBuilding', empire: cell.owner, hex: cell, kind: 'port' });
  empire.gold = copy;
  return result.ok;
}
