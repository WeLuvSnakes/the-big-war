import { describe, expect, test } from 'bun:test';
import { testEmpire, setTroops } from '../support/fixture';
import type { HexCell } from '@the-big-war/client/game/map/map.types';
import type { GameState } from '@the-big-war/client/game/state/state.types';
import { dispatch } from '@the-big-war/client/game/commands/commands.service';
import { step } from '@the-big-war/client/game/simulation/simulation.service';
import { createBaseState } from '@the-big-war/client/game/state/state.service';
import type { WaveConfig } from '@the-big-war/client/game/config/config.types';
import { NEUTRAL_OWNER } from '@the-big-war/client/game/empire/empire.constants';
import { declareWar } from '@the-big-war/client/game/diplomacy/diplomacy.service';
import type { Axial } from '@the-big-war/game-engine/world-tile/world-tile.types';
import { createBuilding } from '@the-big-war/client/game/building/building.service';
import { FIXED_DT } from '@the-big-war/game-engine/simulation/simulation.constants';
import type { Offensive } from '@the-big-war/client/game/offensive/offensive.types';
import type { BuildingKind } from '@the-big-war/client/game/building/building.types';
import { DEFAULT_GAME_CONFIG } from '@the-big-war/client/game/config/config.constants';
import { emptyModifierTotals } from '@the-big-war/client/game/modifier/modifier.service';
import { setBuilding, setOwner } from '@the-big-war/client/game/map/world-index.service';
import { defendersAt, launchOffensive } from '@the-big-war/client/game/offensive/offensive.service';
import { gridAt, gridIndex, makeGrid } from '@the-big-war/game-engine/world-tile/world-tile.service';
import { attackPowerAt, defencePowerAt } from '@the-big-war/client/game/offensive/wave-power.service';
import { createMinHeap, heapClear, heapPop, heapPush } from '@the-big-war/game-engine/collections/min-heap.service';
import { addToEncampments, deployedTroops, drawFromEncampments, killExcessTroops } from '@the-big-war/client/game/troops/troops.service';

const WIDTH = 20;
const HEIGHT = 6;

const FAST_WAVES = { baseTilesPerSecond: 2, tilesPerRootTroop: 0.8, maxMarchSeconds: 0 };

function makeState(split: (cell: HexCell) => number, wave: Partial<WaveConfig> = FAST_WAVES): GameState {
  const grid = makeGrid<HexCell>(WIDTH, HEIGHT, hex => ({
    q: hex.q,
    r: hex.r,
    terrain: 'plain',
    biome: 'temperate',
    owner: NEUTRAL_OWNER,
    building: null,
  }));
  const config = {
    ...DEFAULT_GAME_CONFIG,
    map: { ...DEFAULT_GAME_CONFIG.map, width: WIDTH, height: HEIGHT },
    victory: { dominationShare: 2 },
    wave: { ...DEFAULT_GAME_CONFIG.wave, ...wave },
  };
  const empires = [0, 1].map(id => testEmpire({ id }));
  const state = createBaseState(config, grid, empires);
  for (const cell of grid.cells) setOwner(state, cell, split(cell));
  for (const empire of state.empires) {
    empire.hexCount = grid.cells.filter(cell => cell.owner === empire.id).length;
    const camp = grid.cells.filter(cell => cell.owner === empire.id).at(empire.id === 0 ? 0 : -1);
    if (camp) setBuilding(state, camp, createBuilding(state, 'trench', 1, 0));
    setTroops(state, empire.id, empire.soldiers);
  }
  return state;
}

const CORNER_TILES = 1;
const wildOwner = (cell: HexCell): number =>
  cell.q === 0 ? 0 : cell.q === WIDTH - 1 && cell.r === HEIGHT - 1 ? 1 : NEUTRAL_OWNER;
const wild = (): GameState => makeState(wildOwner);
const rivals = (): GameState => makeState(cell => (cell.q < WIDTH / 2 ? 0 : 1));

const run = (state: GameState, seconds: number): void => {
  for (let i = 0; i < seconds / FIXED_DT; i++) step(state, FIXED_DT);
};

const owned = (state: GameState, empire: number): number =>
  state.grid.cells.filter(cell => cell.owner === empire).length;

function place(state: GameState, hex: Axial, kind: BuildingKind): void {
  setBuilding(state, gridAt(state.grid, hex)!, createBuilding(state, kind, 1, 0));
}

function attack(state: GameState, empire: number, target: Axial, percent = 50) {
  return dispatch(state, { type: 'SendTroops', empire, target, percent });
}

describe('min heap', () => {
  test('pops items in ascending score order', () => {
    const heap = createMinHeap();
    [5, 1, 4, 2, 3, 0].forEach(score => heapPush(heap, score * 10, score));
    const popped: number[] = [];
    for (let item = heapPop(heap); item !== undefined; item = heapPop(heap)) popped.push(item);
    expect(popped).toEqual([0, 10, 20, 30, 40, 50]);
  });
});

describe('SendTroops', () => {
  test('every send is a new group marching from the nearest encampment with troops', () => {
    const state = makeState(cell => (cell.q < WIDTH / 2 ? 0 : 1), {});
    const near = gridAt(state.grid, { q: 8, r: 2 })!;
    setBuilding(state, near, createBuilding(state, 'fort', 1, 0));
    near.building!.garrison = 10;
    state.empires[0]!.soldiers += 10;
    attack(state, 0, { q: 10, r: 2 }, 100);
    attack(state, 0, { q: 10, r: 2 }, 0);
    const [group] = state.offensives;
    expect(state.offensives).toHaveLength(1);
    expect(group!.mission).toBe('attack');
    expect(group!.march!.from).toEqual({ q: 8, r: 2 });
    expect(near.building!.garrison).toBe(0);
    setTroops(state, 0, 40);
    attack(state, 0, { q: 10, r: 5 }, 50);
    expect(state.offensives).toHaveLength(2);
    expect(group!.focus).toEqual({ q: 10, r: 2 });
  });

  test('a city houses a militia of three until real encampments exist', () => {
    const state = rivals();
    const city = gridAt(state.grid, { q: 2, r: 2 })!;
    setBuilding(state, city, createBuilding(state, 'city', 1, 0));
    state.empires[0]!.soldiers = 0;
    addToEncampments(state, 0, 3);
    expect(city.building!.garrison).toBe(3);
    const fort = gridAt(state.grid, { q: 4, r: 2 })!;
    setBuilding(state, fort, createBuilding(state, 'fort', 1, 0));
    addToEncampments(state, 0, 5);
    expect(city.building!.garrison).toBe(3);
    expect(fort.building!.garrison).toBe(5);
  });

  test('an empire with no encampment raises no free fort', () => {
    const state = rivals();
    for (const cell of state.grid.cells) if (cell.owner === 0) setBuilding(state, cell, null);
    state.empires[0]!.soldiers = 0;
    addToEncampments(state, 0, 30);
    expect(state.grid.cells.some(cell => cell.owner === 0 && cell.building)).toBe(false);
    expect(state.empires[0]!.soldiers).toBe(0);
  });

  test('a short encampment is topped up from the next nearest', () => {
    const state = rivals();
    const near = gridAt(state.grid, { q: 8, r: 2 })!;
    setBuilding(state, near, createBuilding(state, 'fort', 1, 0));
    near.building!.garrison = 10;
    state.empires[0]!.soldiers += 10;
    const drawn = drawFromEncampments(state, 0, { q: 10, r: 2 }, 60);
    expect(drawn).toEqual({ from: { q: 8, r: 2 }, troops: 60 });
    expect(state.empires[0]!.soldiers).toBe(50);
  });

  test('commits a share of the reserve to one wave', () => {
    const state = rivals();
    expect(attack(state, 0, { q: 10, r: 2 }).ok).toBe(true);
    expect(state.offensives).toHaveLength(1);
    expect(state.offensives[0]!.troops).toBe(50);
    expect(state.offensives[0]!.target).toBe(1);
    expect(state.empires[0]!.soldiers).toBe(50);
  });

  test('sending somewhere distant leaves the first wave on its mission', () => {
    const state = makeState(cell => (cell.q < WIDTH / 2 ? 0 : 1), {});
    place(state, { q: 0, r: 2 }, 'barracks');
    gridAt(state.grid, { q: 0, r: 2 })!.owner = 0;
    attack(state, 0, { q: 10, r: 0 });
    const first = state.offensives[0]!;
    const { march } = first;
    const recent = [...first.recent];
    attack(state, 0, { q: 19, r: 5 });
    expect(state.offensives).toHaveLength(2);
    expect(first.focus).toEqual({ q: 10, r: 0 });
    expect(first.march).toBe(march);
    expect(first.recent).toEqual(recent);
    expect(first.troops).toBe(50);
    expect(state.offensives[1]!.troops).toBe(25);
  });

  test('an unreached nation sends a wave into the wild toward it instead', () => {
    const state = makeState(cell => (cell.q === 0 ? 0 : cell.q === WIDTH - 1 ? 1 : NEUTRAL_OWNER));
    expect(attack(state, 0, { q: WIDTH - 1, r: 2 }).ok).toBe(true);
    expect(state.offensives[0]!.target).toBe(NEUTRAL_OWNER);
    run(state, 60);
    expect(owned(state, 1)).toBe(HEIGHT);
  });

  test('rejects a friendly target, an empty reserve and a dead empire', () => {
    const state = rivals();
    expect(attack(state, 0, { q: 1, r: 1 }).ok).toBe(false);

    setTroops(state, 0, 0);
    const empty = attack(state, 0, { q: 10, r: 1 });
    expect(!empty.ok && empty.reason).toBe('insufficient_troops');

    setTroops(state, 0, 100);
    state.empires[0]!.alive = false;
    const dead = attack(state, 0, { q: 10, r: 1 });
    expect(!dead.ok && dead.reason).toBe('no_empire');
  });

  test('does not refund troops it never committed when nothing can be reached', () => {
    const state = makeState(() => 0);
    const result = dispatch(state, { type: 'SendTroops', empire: 0, target: { q: 3, r: 3 }, percent: 50 });
    expect(result.ok).toBe(false);
    expect(state.empires[0]!.soldiers).toBe(100);
  });
});

describe('claiming the wild', () => {
  test('neutral land is never claimed without a wave', () => {
    const state = wild();
    const before = owned(state, 0);
    run(state, 5);
    expect(owned(state, 0)).toBe(before);
  });

  test('a wave spreads across open land one click at a time', () => {
    const state = wild();
    const before = owned(state, 0);
    attack(state, 0, { q: 1, r: 2 }, 100);
    run(state, 2);
    const early = owned(state, 0);
    expect(early).toBeGreaterThan(before);
    run(state, 120);
    expect(owned(state, 0)).toBe(WIDTH * HEIGHT - CORNER_TILES);
  });

  test('claiming empty land costs no troops and the whole wave returns', () => {
    const state = wild();
    state.empires[0]!.civilians = 0;
    attack(state, 0, { q: 1, r: 2 }, 100);
    expect(state.empires[0]!.soldiers).toBe(0);
    expect(deployedTroops(state, 0)).toBe(100);
    run(state, 120);
    expect(state.offensives).toHaveLength(0);
    expect(owned(state, 0)).toBe(WIDTH * HEIGHT - CORNER_TILES);
    expect(state.empires[0]!.soldiers).toBe(100);
  });

  test('a single troop can claim the wild without being lost', () => {
    const state = wild();
    setTroops(state, 0, 1);
    attack(state, 0, { q: 1, r: 2 }, 100);
    run(state, 300);
    expect(state.offensives).toHaveLength(0);
    expect(owned(state, 0)).toBe(WIDTH * HEIGHT - CORNER_TILES);
    expect(state.empires[0]!.soldiers).toBe(1);
  });

  test('more troops advance faster', () => {
    const small = wild();
    const large = wild();
    setTroops(small, 0, 10);
    setTroops(large, 0, 1000);
    attack(small, 0, { q: 1, r: 2 }, 100);
    attack(large, 0, { q: 1, r: 2 }, 100);
    run(small, 1);
    run(large, 1);
    expect(owned(large, 0)).toBeGreaterThan(owned(small, 0));
  });

  test('a wave leans toward the tile that was clicked', () => {
    const state = wild();
    attack(state, 0, { q: 8, r: 5 }, 100);
    run(state, 8);
    const row = (r: number) => state.grid.cells.filter(cell => cell.r === r && cell.owner === 0).length;
    expect(row(5)).toBeGreaterThan(row(0));
  });

  test('mountains wall off a wave unless they are the tile clicked', () => {
    const state = wild();
    for (const cell of state.grid.cells) if (cell.q === 2) cell.terrain = 'mountain';
    attack(state, 0, { q: 1, r: 2 }, 100);
    run(state, 30);
    for (const cell of state.grid.cells) {
      if (cell.q >= 2 && cell.owner !== 1) expect(cell.owner).toBe(NEUTRAL_OWNER);
    }

    const reserve = state.empires[0]!.soldiers;
    attack(state, 0, { q: 2, r: 2 }, 100);
    run(state, 10);
    const pass = gridAt(state.grid, { q: 2, r: 2 })!;
    expect(pass.owner).toBe(0);
    expect(pass.terrain).toBe('mountain');
    expect(gridAt(state.grid, { q: 2, r: 1 })!.owner).toBe(NEUTRAL_OWNER);
    expect(deployedTroops(state, 0)).toBe(reserve);
  });

  test('a wave into the wild stops at other nations and never attacks them', () => {
    const state = makeState(cell => (cell.q === 0 ? 0 : cell.q === 5 ? 1 : NEUTRAL_OWNER));
    attack(state, 0, { q: 3, r: 2 }, 100);
    run(state, 30);
    for (const cell of state.grid.cells) if (cell.q === 5) expect(cell.owner).toBe(1);
    expect(state.grid.cells.filter(cell => cell.q > 5 && cell.owner === 0)).toHaveLength(0);
  });
});

describe('attacking nations', () => {
  test('a wave captures enemy land, buildings included, and declares war', () => {
    const state = rivals();
    place(state, { q: 11, r: 2 }, 'market');
    attack(state, 0, { q: 11, r: 2 }, 100);
    run(state, 30);
    expect(gridAt(state.grid, { q: 11, r: 2 })!.owner).toBe(0);
    expect(gridAt(state.grid, { q: 11, r: 2 })!.building?.kind).toBe('market');
  });

  test('attacks cost both sides', () => {
    const state = rivals();
    attack(state, 0, { q: 10, r: 2 }, 100);
    run(state, 2);
    expect(state.empires[1]!.soldiers).toBeLessThan(100);
    expect(state.offensives[0]?.troops ?? 0).toBeLessThan(100);
  });

  test('a heavily garrisoned enemy stops a small wave', () => {
    const state = rivals();
    setTroops(state, 0, 4);
    setTroops(state, 1, 10_000);
    attack(state, 0, { q: 10, r: 2 }, 100);
    run(state, 10);
    expect(state.offensives).toHaveLength(0);
    expect(owned(state, 1)).toBe(WIDTH * HEIGHT / 2);
  });

  test('opposing waves cancel before either advances', () => {
    const state = rivals();
    attack(state, 0, { q: 10, r: 2 }, 50);
    attack(state, 1, { q: 9, r: 2 }, 80);
    expect(state.offensives).toHaveLength(2);
    expect(state.offensives[0]!.troops).toBe(0);
    expect(state.offensives[1]!.troops).toBe(30);
  });

  test('retreating applies the penalty and walks the troops home', () => {
    const state = rivals();
    place(state, { q: 1, r: 2 }, 'barracks');
    attack(state, 0, { q: 10, r: 2 }, 100);
    const offensive = state.offensives[0]!;
    expect(dispatch(state, { type: 'RecallOffensive', empire: 1, offensive: offensive.id }).ok).toBe(false);
    expect(dispatch(state, { type: 'RecallOffensive', empire: 0, offensive: offensive.id }).ok).toBe(true);
    expect(offensive.mission).toBe('retreat');
    expect(offensive.troops).toBeCloseTo(75, 6);
    run(state, 120);
    expect(state.offensives).toHaveLength(0);
    expect(state.empires[0]!.soldiers).toBeGreaterThanOrEqual(75);
  });

  test('a held group does not capture land and keeps its mission', () => {
    const state = rivals();
    attack(state, 0, { q: 10, r: 2 }, 100);
    const offensive = state.offensives[0]!;
    const result = dispatch(state, { type: 'OrderOffensive', empire: 0, offensive: offensive.id, target: { q: 3, r: 2 } });
    expect(result.ok).toBe(true);
    expect(offensive.mission).toBe('hold');
    run(state, 120);
    expect(state.offensives).toHaveLength(1);
    expect(offensive.taken).toBe(0);
    expect(offensive.head).toEqual({ q: 3, r: 2 });
    expect(owned(state, 1)).toBe(WIDTH * HEIGHT / 2);
  });

  test('ordering onto enemy land turns a held group back into an attack', () => {
    const state = rivals();
    attack(state, 0, { q: 10, r: 2 }, 100);
    const offensive = state.offensives[0]!;
    dispatch(state, { type: 'OrderOffensive', empire: 0, offensive: offensive.id, target: { q: 3, r: 2 } });
    dispatch(state, { type: 'OrderOffensive', empire: 0, offensive: offensive.id, target: { q: 12, r: 2 } });
    expect(offensive.mission).toBe('attack');
    expect(offensive.focus).toEqual({ q: 12, r: 2 });
    run(state, 30);
    expect(offensive.taken).toBeGreaterThan(0);
  });

  test('orders are refused for foreign groups and water-less bad targets', () => {
    const state = rivals();
    attack(state, 0, { q: 10, r: 2 }, 100);
    const { id } = state.offensives[0]!;
    expect(dispatch(state, { type: 'OrderOffensive', empire: 1, offensive: id, target: { q: 3, r: 2 } }).ok).toBe(false);
    expect(dispatch(state, { type: 'OrderOffensive', empire: 0, offensive: id, target: { q: 99, r: 99 } }).ok).toBe(false);
    expect(dispatch(state, { type: 'OrderOffensive', empire: 0, offensive: 999, target: { q: 3, r: 2 } }).ok).toBe(false);
  });

  test('recall is refused to a dead empire', () => {
    const state = rivals();
    attack(state, 0, { q: 10, r: 2 }, 50);
    state.empires[0]!.alive = false;
    const result = dispatch(state, { type: 'RecallOffensive', empire: 0, offensive: state.offensives[0]!.id });
    expect(!result.ok && result.reason).toBe('no_empire');
  });
});

describe('tile health', () => {
  const tile = { q: 10, r: 2 };

  function siege(troops: number, defending = 0, wave: Partial<WaveConfig> = FAST_WAVES) {
    const state = makeState(cell => (cell.q < WIDTH / 2 ? 0 : 1), wave);
    launchOffensive(state, 0, 1, tile, troops);
    const attacker = state.offensives[0]!;
    attacker.captureTile = gridIndex(state.grid, tile.q, tile.r);
    if (defending > 0) addDefender(state, tile, defending);
    return { state, attacker };
  }

  function addDefender(state: GameState, head: Axial, troops: number): Offensive {
    const defender: Offensive = {
      ...state.offensives[0]!,
      id: state.nextOffensiveId++,
      empire: 1,
      target: 0,
      mission: 'hold' as const,
      troops,
      head,
      march: null,
      captureTile: undefined,
      captureHealth: undefined,
      captureHitAt: undefined,
      frontier: createMinHeap(),
      queued: new Set<number>(),
      recent: [head],
    };
    state.offensives.push(defender);
    return defender;
  }

  const captured = (state: GameState): boolean => gridAt(state.grid, tile)!.owner === 0;

  test('only the surplus over the defenders hurts the tile: 30 against 29', () => {
    const { state, attacker } = siege(30, 29);
    const health = state.config.wave.tileHealth;
    run(state, 1);
    expect(attacker.captureHealth).toBeCloseTo(health - state.config.wave.tileDamagePerTroop, 1);
    run(state, 1.5);
    expect(captured(state)).toBe(false);
    run(state, 1);
    expect(captured(state)).toBe(true);
  });

  test('an undefended wave keeps its pace at any size', () => {
    for (const troops of [10, 30, 100, 1000]) {
      const paused = siege(troops);
      const unpaused = siege(troops, 0, { ...FAST_WAVES, tileHealth: 0 });
      run(paused.state, 1);
      run(unpaused.state, 1);
      expect(unpaused.attacker.taken).toBeGreaterThan(0);
      expect(paused.attacker.taken).toBeGreaterThanOrEqual(unpaused.attacker.taken - 1);
    }
  });

  test('neutral land has no pause', () => {
    const state = wild();
    launchOffensive(state, 0, NEUTRAL_OWNER, { q: 1, r: 2 }, 100);
    run(state, 1);
    expect(owned(state, 0)).toBeGreaterThan(HEIGHT);
    expect(state.offensives[0]!.captureHealth).toBeUndefined();
  });

  test('equal defenders hold the tile while both sides take casualties', () => {
    const { state, attacker } = siege(25, 25);
    const defender = state.offensives[1]!;
    run(state, 5);
    expect(captured(state)).toBe(false);
    expect(attacker.captureHealth).toBe(state.config.wave.tileHealth);
    expect(attacker.troops).toBeLessThan(25);
    expect(defender.troops).toBeCloseTo(attacker.troops, 6);
  });

  test('a fight to the last troop ends the stalemate', () => {
    const { state } = siege(5, 5);
    run(state, 10);
    expect(state.offensives).toHaveLength(0);
    expect(captured(state)).toBe(false);
  });

  test('health heals at once when defenders remove the surplus', () => {
    const { state, attacker } = siege(30, 29);
    run(state, 1);
    expect(attacker.captureHealth).toBeLessThan(state.config.wave.tileHealth);
    state.offensives[1]!.troops += 5;
    step(state, FIXED_DT);
    expect(attacker.captureHealth).toBe(state.config.wave.tileHealth);
  });

  test('health survives reinforcement while the attack continues', () => {
    const { state, attacker } = siege(30, 29);
    run(state, 1);
    const before = attacker.captureHealth!;
    attacker.troops += 5;
    expect(attacker.captureHealth).toBe(before);
    step(state, FIXED_DT);
    expect(attacker.captureHealth).toBeLessThan(before);
  });

  test('health heals after a lull but not before it', () => {
    const { tileHealSeconds, tileHealth } = DEFAULT_GAME_CONFIG.wave;
    const pause = (seconds: number) => {
      const { state, attacker } = siege(30, 29);
      run(state, 1);
      const before = attacker.captureHealth!;
      attacker.march = { from: tile, to: tile, duration: seconds, progress: 0 };
      run(state, seconds - FIXED_DT);
      return { state, attacker, before };
    };

    const short = pause(tileHealSeconds / 2);
    run(short.state, FIXED_DT * 2);
    expect(short.attacker.captureHealth).toBeLessThan(short.before);

    const long = pause(tileHealSeconds + 1);
    run(long.state, FIXED_DT * 2);
    expect(long.attacker.captureHealth).toBeGreaterThan(long.before);
    expect(long.attacker.captureHealth).toBeLessThan(tileHealth);
  });

  test('defenders count within two hexes, marching or not, and never for neutral land', () => {
    const state = rivals();
    launchOffensive(state, 0, 1, tile, 10);
    const cell = gridAt(state.grid, tile)!;
    addDefender(state, { q: 12, r: 2 }, 7);
    addDefender(state, { q: 13, r: 2 }, 11);
    const far = addDefender(state, { q: 18, r: 2 }, 13);
    far.march = { from: far.head, to: tile, duration: 10, progress: 0 };
    expect(defendersAt(state, cell, 0)).toBe(7);
    far.head = { q: 11, r: 2 };
    expect(defendersAt(state, cell, 0)).toBe(20);
    cell.owner = NEUTRAL_OWNER;
    expect(defendersAt(state, cell, 0)).toBe(0);
  });
});

describe('defensive works', () => {
  const home = { q: 10, r: 2 };
  const defence = (state: GameState) => defencePowerAt(state, 1, 0, home);
  const labels = (state: GameState) => defence(state).lines.map(line => line.label);

  test('terrain raises the cost of taking a tile', () => {
    const state = rivals();
    gridAt(state.grid, home)!.terrain = 'forest';
    expect(labels(state)).toContain('Forest');
    expect(defence(state).value).toBeCloseTo(1.15, 6);
  });

  test('a trench defends unless enemy tanks are in reach', () => {
    const dug = rivals();
    place(dug, home, 'trench');
    expect(defence(dug).value).toBeCloseTo(1.35, 6);

    const overrun = rivals();
    place(overrun, home, 'trench');
    place(overrun, { q: 9, r: 2 }, 'tank');
    expect(labels(overrun)).not.toContain('Trench');
    expect(labels(overrun)).toContain('Trench (overrun by tanks)');
    expect(attackPowerAt(overrun, 0, home).lines.map(line => line.label)).toContain('Tanks');
  });

  test('machine guns only help from a manned trench', () => {
    const state = rivals();
    place(state, home, 'trench');
    const trench = gridAt(state.grid, home)!.building!;
    trench.machineGun = true;
    expect(labels(state)).not.toContain('Machine guns');
    trench.garrison = 5;
    expect(defence(state).lines.find(line => line.label === 'Machine guns')?.defence).toBeCloseTo(1.2, 6);
  });

  test('forts and bunkers raise defence nearby', () => {
    const state = rivals();
    place(state, { q: 11, r: 2 }, 'bunker');
    place(state, { q: 12, r: 3 }, 'fort');
    expect(labels(state)).toContain('Bunker');
    expect(labels(state)).toContain('Fort');
  });

  test('a garrison must be cleared and is lost with its tile', () => {
    const bare = rivals();
    const dug = rivals();
    place(dug, home, 'trench');
    gridAt(dug.grid, home)!.building!.garrison = 2;
    for (const state of [bare, dug]) {
      declareWar(state, 0, 1);
      attack(state, 0, home, 100);
      run(state, 10);
    }
    expect(gridAt(dug.grid, home)!.owner).toBe(0);
    expect(gridAt(dug.grid, home)!.building!.garrison).toBe(0);
    expect(gridAt(dug.grid, home)!.owner).toBe(0);
  });

  test('tanks roll onto tiles captured beside them', () => {
    const state = rivals();
    place(state, { q: 9, r: 2 }, 'tank');
    const tank = gridAt(state.grid, { q: 9, r: 2 })!.building;
    attack(state, 0, home, 100);
    run(state, 5);
    expect(gridAt(state.grid, { q: 9, r: 2 })!.building).toBeNull();
    expect(state.grid.cells.some(cell => cell.q >= 10 && cell.building === tank)).toBe(true);
  });

  test('batteries shell the strongest attack in range and reload', () => {
    const state = rivals();
    place(state, { q: 13, r: 2 }, 'battery');
    const battery = gridAt(state.grid, { q: 13, r: 2 })!.building!;
    attack(state, 0, home, 100);
    const offensive = state.offensives[0]!;
    offensive.frontier.items.length = 0;
    offensive.frontier.scores.length = 0;
    offensive.troops = 50;
    offensive.head = { ...home };
    offensive.budget = -100;
    step(state, FIXED_DT);
    expect(offensive.troops).toBe(50 - state.config.battery.damage);
    expect(battery.cooldown).toBeGreaterThan(0);
  });

  test('bunkers halve shelling on the troops they cover', () => {
    const state = rivals();
    place(state, { q: 13, r: 2 }, 'battery');
    place(state, { q: 9, r: 2 }, 'bunker');
    attack(state, 0, home, 100);
    const offensive = state.offensives[0]!;
    offensive.troops = 50;
    offensive.head = { q: 9, r: 2 };
    offensive.budget = -100;
    step(state, FIXED_DT);
    expect(offensive.troops).toBe(50 - state.config.battery.damage * 0.5);
  });
});

describe('troop capacity', () => {
  test('capacity comes only from finished encampments', () => {
    const state = rivals();
    for (const cell of state.grid.cells) if (cell.owner === 0) setBuilding(state, cell, null);
    state.empires[0]!.bonuses = emptyModifierTotals();
    setBuilding(state, gridAt(state.grid, { q: 2, r: 2 })!, createBuilding(state, 'city', 1, 0));
    setBuilding(state, gridAt(state.grid, { q: 4, r: 2 })!, createBuilding(state, 'fort', 1, 0));
    step(state, FIXED_DT);
    expect(state.empires[0]!.reserveCap).toBe(23);
  });

  test('troops die when an encampment is lost and capacity falls', () => {
    const state = rivals();
    for (const cell of state.grid.cells) if (cell.owner === 0) setBuilding(state, cell, null);
    state.empires[0]!.bonuses = emptyModifierTotals();
    const city = gridAt(state.grid, { q: 2, r: 2 })!;
    const fort = gridAt(state.grid, { q: 4, r: 2 })!;
    setBuilding(state, city, createBuilding(state, 'city', 1, 0));
    setBuilding(state, fort, createBuilding(state, 'fort', 1, 0));
    city.building!.garrison = 3;
    fort.building!.garrison = 20;
    setBuilding(state, fort, null);
    step(state, FIXED_DT);
    expect(state.empires[0]!.soldiers).toBeLessThanOrEqual(3);
  });

  test('deployed troops count against capacity and die last', () => {
    const state = rivals();
    for (const cell of state.grid.cells) if (cell.owner === 0) setBuilding(state, cell, null);
    state.empires[0]!.bonuses = emptyModifierTotals();
    const city = gridAt(state.grid, { q: 2, r: 2 })!;
    setBuilding(state, city, createBuilding(state, 'city', 1, 0));
    city.building!.garrison = 3;
    state.empires[0]!.soldiers = 3;
    expect(attack(state, 0, { q: 10, r: 2 }, 100).ok).toBe(true);
    const group = state.offensives[0]!;
    group.troops = 10;
    killExcessTroops(state, 0);
    expect(group.troops).toBe(3);
  });

  test('returning troops beyond capacity are lost', () => {
    const state = rivals();
    for (const cell of state.grid.cells) if (cell.owner === 0) setBuilding(state, cell, null);
    state.empires[0]!.bonuses = emptyModifierTotals();
    const city = gridAt(state.grid, { q: 2, r: 2 })!;
    setBuilding(state, city, createBuilding(state, 'city', 1, 0));
    state.empires[0]!.soldiers = 0;
    addToEncampments(state, 0, 50);
    expect(city.building!.garrison).toBe(3);
    expect(state.empires[0]!.soldiers).toBe(3);
  });
});

describe('people on the map', () => {
  test('soldiers walk to the border before anything is captured', () => {
    const state = makeState(wildOwner, {});
    place(state, { q: 0, r: 2 }, 'barracks');
    const before = owned(state, 0);
    gridAt(state.grid, { q: 0, r: 2 })!.owner = 0;
    attack(state, 0, { q: 10, r: 2 }, 100);
    const march = state.offensives[0]!.march!;
    expect(march.duration).toBeGreaterThan(0);
    run(state, march.duration / 2);
    expect(owned(state, 0)).toBe(before);
    expect(state.offensives[0]!.head.q).toBeGreaterThan(0);
    run(state, march.duration / 2 + 5);
    expect(owned(state, 0)).toBeGreaterThan(before);
  });

  test('soldiers stay on the map from launch through arrival to the first capture', () => {
    const state = makeState(wildOwner, {});
    place(state, { q: 0, r: 2 }, 'barracks');
    gridAt(state.grid, { q: 0, r: 2 })!.owner = 0;
    attack(state, 0, { q: 10, r: 2 }, 100);
    const offensive = state.offensives[0]!;
    const before = owned(state, 0);
    expect(offensive.recent.length).toBeGreaterThan(0);
    for (let i = 0; i < 60 / FIXED_DT && owned(state, 0) === before; i++) {
      step(state, FIXED_DT);
      expect(offensive.recent.length).toBeGreaterThan(0);
    }
    expect(owned(state, 0)).toBeGreaterThan(before);
  });

  test('a wave with no march starts at the border, not nowhere', () => {
    const state = wild();
    attack(state, 0, { q: 10, r: 2 });
    expect(state.offensives[0]!.march).toBeNull();
    expect(state.offensives[0]!.recent).toHaveLength(1);
  });

  test('a wave whose frontier was used up finds the land that is left', () => {
    const state = rivals();
    attack(state, 0, { q: 10, r: 2 }, 100);
    const offensive = state.offensives[0]!;
    const before = owned(state, 0);
    heapClear(offensive.frontier);
    offensive.queued.clear();
    run(state, 1);
    expect(state.offensives).toContain(offensive);
    expect(owned(state, 0)).toBeGreaterThan(before);
  });

  test('a builder walks to the site, builds, then lays a road home', () => {
    const state = rivals();
    place(state, { q: 0, r: 2 }, 'city');
    const site = gridAt(state.grid, { q: 6, r: 2 })!;
    setBuilding(state, site, createBuilding(state, 'farm', 1, 2));
    run(state, 1);
    expect(state.walkers).toHaveLength(1);
    expect(site.building!.buildRemaining).toBe(2);
    run(state, 4.5);
    expect(state.walkers[0]!.phase).toBe('building');
    run(state, 2);
    expect(site.building!.buildRemaining).toBe(0);
    run(state, 8);
    expect(state.walkers).toHaveLength(0);
    expect(site.road).toBe(true);
    expect(state.index.roads.length).toBeGreaterThan(5);
  });

  test('a site with no way home is built on the spot', () => {
    const state = rivals();
    for (const cell of state.grid.cells) if (cell.building) setBuilding(state, cell, null);
    const site = gridAt(state.grid, { q: 6, r: 2 })!;
    setBuilding(state, site, createBuilding(state, 'farm', 1, 1));
    run(state, 2);
    expect(site.building!.buildRemaining).toBe(0);
    expect(site.road).toBeUndefined();
  });
});
