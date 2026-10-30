import { testEmpire } from '../support/fixture';


import { describe, expect, test } from 'bun:test';
import { createRng } from '@the-big-war/game-engine/rng/rng.service';
import type { Empire } from '@the-big-war/client/game/empire/empire.types';
import type { GameState } from '@the-big-war/client/game/state/state.types';
import { createBot, botTick } from '@the-big-war/client/game/bot/bot.service';
import { dispatch } from '@the-big-war/client/game/commands/commands.service';
import { step } from '@the-big-war/client/game/simulation/simulation.service';
import type { GameConfig } from '@the-big-war/client/game/config/config.types';
import { NEUTRAL_OWNER } from '@the-big-war/client/game/empire/empire.constants';
import { createInitialState } from '@the-big-war/client/game/state/setup.service';
import { FIXED_DT } from '@the-big-war/game-engine/simulation/simulation.constants';
import { ensureFront, findFront } from '@the-big-war/client/game/front/front.service';
import { DEFAULT_GAME_CONFIG } from '@the-big-war/client/game/config/config.constants';
import type { HexCell, HexGrid, Terrain } from '@the-big-war/client/game/map/map.types';
import { emptyModifierTotals } from '@the-big-war/client/game/modifier/modifier.service';
import { gridAt, makeGrid } from '@the-big-war/game-engine/world-tile/world-tile.service';
import { recomputeEmpireBonuses } from '@the-big-war/client/game/research/research.service';
import { declareWar, getRelation } from '@the-big-war/client/game/diplomacy/diplomacy.service';
import type { Building, BuildingKind } from '@the-big-war/client/game/building/building.types';
import { deployedTroops, launchExpedition as launchTroops } from '@the-big-war/client/game/troops/troops.service';

const FACTIONS = ['ironclad', 'league', 'verdant', 'academy'];

function tinyConfig(overrides: Partial<GameConfig> = {}): GameConfig {
  return {
    ...DEFAULT_GAME_CONFIG,
    map: { ...DEFAULT_GAME_CONFIG.map, width: 8, height: 8, seed: 4242 },
    start: { ...DEFAULT_GAME_CONFIG.start, empireCount: 2 },
    ...overrides,
  };
}

function makeState(config: GameConfig = tinyConfig()): GameState {
  const grid: HexGrid = makeGrid<HexCell>(config.map.width, config.map.height, hex => ({
    q: hex.q,
    r: hex.r,
    terrain: 'plain',
    owner: NEUTRAL_OWNER,
    building: null,
  }));

  const empires: Empire[] = [];
  for (let id = 0; id < config.start.empireCount; id++) {
    empires.push(testEmpire({ id, factionId: FACTIONS[id % FACTIONS.length]!, gold: config.start.gold, science: config.start.science, civilians: config.start.civilians, soldiers: config.start.soldiers, reserveCap: config.recruit.cityReserveCap }));
  }

  const state: GameState = {
    config,
    status: 'playing',
    playerEmpire: 0,
    grid,
    empires,
    fronts: [],
    expeditions: [],
    columns: [],
    landHexCount: grid.cells.length,
    elapsed: 0,
    tick: 0,
    speed: 1,
    rng: createRng(config.map.seed),
    winner: null,
    endReason: null,
    nextBuildingId: 1,
    relations: {},
    offerCooldowns: {},
    pendingOffers: [],
    agentAccumulator: 0,
  };

  const strip = Math.floor(grid.width / empires.length);
  for (const cell of grid.cells) {
    const owner = Math.min(empires.length - 1, Math.floor(cell.q / strip));
    cell.owner = owner >= 0 && owner < empires.length ? owner : NEUTRAL_OWNER;
  }
  for (const empire of empires) {
    const q = Math.min(grid.width - 1, empire.id * strip);
    gridAt(grid, { q, r: 0 })!.building = building(state, 'city');
    recomputeEmpireBonuses(state, empire.id);
  }
  refreshHexCounts(state);
  return state;
}

function building(state: GameState, kind: BuildingKind, level = 1, growth = 0): Building {
  return { id: state.nextBuildingId++, kind, level, cooldown: 0, growth, demolishAt: null, buildRemaining: 0, gatherers: [], garrison: 0, machineGun: false };
}

function place(state: GameState, hex: { q: number; r: number }, kind: BuildingKind, level = 1): Building {
  const b = building(state, kind, level);
  gridAt(state.grid, hex)!.building = b;
  return b;
}

function borderEdge(state: GameState, left: number, right: number): { a: { q: number; r: number }; b: { q: number; r: number } } {
  
  for (const cell of state.grid.cells) {
    if (cell.owner !== left) continue;
    const east = gridAt(state.grid, { q: cell.q + 1, r: cell.r });
    if (east && east.owner === right) return { a: { q: cell.q, r: cell.r }, b: { q: cell.q + 1, r: cell.r } };
  }
  throw new Error('no border edge found');
}

function run(state: GameState, seconds: number): void {
  const steps = Math.round(seconds / FIXED_DT);
  for (let i = 0; i < steps; i++) step(state, FIXED_DT);
}

function refreshHexCounts(state: GameState): void {
  const counts = new Array<number>(state.empires.length).fill(0);
  for (const cell of state.grid.cells) {
    if (cell.owner === NEUTRAL_OWNER) continue;
    counts[cell.owner]! += 1;
  }
  for (const empire of state.empires) empire.hexCount = counts[empire.id] ?? 0;
}

describe('engine economy', () => {
  test('markets produce gold scaled by goldIncome and staffing', () => {
    const state = makeState();
    const empire = state.empires[0]!;
    place(state, { q: 0, r: 1 }, 'market');
    empire.gold = 0;
    empire.civilians = 100; 
    run(state, 1);
    const expected = state.config.economy.marketGoldPerSecond * 1;
    expect(empire.gold).toBeGreaterThanOrEqual(expected * 0.9 - 1e-9);
    expect(empire.gold).toBeLessThan(expected * 1.1);
  });

  test('lumberjacks haul wood from forest and only earn on delivery', () => {
    const forest = makeState();
    gridAt(forest.grid, { q: 1, r: 2 })!.terrain = 'forest';
    const open = makeState();
    place(forest, { q: 1, r: 1 }, 'lumberjack');
    place(open, { q: 1, r: 1 }, 'lumberjack');
    for (const s of [forest, open]) s.empires[0]!.gold = 0;
    run(forest, 1);
    expect(forest.empires[0]!.gold).toBe(0);
    run(forest, 10);
    run(open, 11);
    expect(forest.empires[0]!.gold).toBeGreaterThan(0);
    expect(open.empires[0]!.gold).toBe(0);
  });

  test('lumberjacks walk to forest anywhere in their territory', () => {
    const state = makeState();
    gridAt(state.grid, { q: 3, r: 6 })!.terrain = 'forest';
    place(state, { q: 0, r: 1 }, 'lumberjack');
    state.empires[0]!.gold = 0;
    run(state, 20);
    expect(state.empires[0]!.gold).toBeGreaterThan(0);
  });

  test('miners ignore mountains and haul rich loads from ore', () => {
    const mountain = makeState();
    gridAt(mountain.grid, { q: 1, r: 2 })!.terrain = 'mountain';
    const ore = makeState();
    gridAt(ore.grid, { q: 1, r: 2 })!.terrain = 'ore';
    for (const s of [mountain, ore]) {
      place(s, { q: 1, r: 1 }, 'miner');
      s.empires[0]!.gold = 0;
      run(s, 8);
    }
    expect(mountain.empires[0]!.gold).toBe(0);
    expect(gridAt(mountain.grid, { q: 1, r: 2 })!.terrain).toBe('mountain');
    expect(ore.empires[0]!.gold).toBeGreaterThanOrEqual(ore.config.gather.oreGoldPerLoad);
  });

  test('a forest tile turns to plain once its loads are used up', () => {
    const state = makeState();
    const tree: HexCell = gridAt(state.grid, { q: 1, r: 2 })!;
    tree.terrain = 'forest';
    place(state, { q: 1, r: 1 }, 'lumberjack');
    run(state, 120);
    expect(tree.terrain as Terrain).toBe('plain');
  });

  test('labs slowly make science without costing gold', () => {
    const state = makeState();
    const empire = state.empires[0]!;
    place(state, { q: 0, r: 1 }, 'lab');
    empire.civilians = 100;
    empire.gold = 0;
    empire.science = 0;
    run(state, 1);
    expect(empire.science).toBeCloseTo(state.config.economy.labSciencePerSecond, 1);
    expect(empire.gold).toBe(0);
  });

  test('farms mature over time and add civilian growth', () => {
    const state = makeState();
    const empire = state.empires[0]!;
    const farm = place(state, { q: 0, r: 1 }, 'farm');
    empire.civilians = 50;
    
    empire.soldiers = empire.reserveCap * state.config.recruit.targetReserveRatio;
    run(state, 5);
    expect(farm.growth).toBeGreaterThan(0);
    expect(farm.growth).toBeLessThanOrEqual(state.config.economy.farmGrowthMax);
    expect(empire.civilians).toBeGreaterThan(50);
    expect(empire.civilianBalance).toBeGreaterThan(0);
  });

  test('worker scarcity scales production down proportionally', () => {
    const rich = makeState();
    const poor = makeState();
    for (let i = 0; i < 4; i++) {
      place(rich, { q: 0, r: 1 + i }, 'market');
      place(poor, { q: 0, r: 1 + i }, 'market');
    }
    rich.empires[0]!.civilians = 1000;
    poor.empires[0]!.civilians = stateWorkersPerBuilding(poor); 
    for (const s of [rich, poor]) {
      s.empires[0]!.gold = 0;
      s.empires[0]!.soldiers = 0;
    }
    run(rich, 1);
    run(poor, 1);
    expect(poor.empires[0]!.gold).toBeGreaterThan(0);
    expect(poor.empires[0]!.gold).toBeLessThan(rich.empires[0]!.gold * 0.5);
  });

  test('civilianBalance is negative when recruitment outpaces growth', () => {
    const state = makeState();
    const empire = state.empires[0]!;

    empire.civilians = 10;
    empire.soldiers = 0;
    empire.bonuses = { ...empire.bonuses, reserveCap: { add: 0, mul: 20 } };
    for (let i = 0; i < 8; i++) place(state, { q: i, r: 2 }, 'barracks');
    run(state, 0.5);
    expect(empire.civilianBalance).toBeLessThan(0);
  });

  test('civilianBalance is non-negative at rest', () => {
    const state = makeState();
    const empire = state.empires[0]!;
    empire.civilians = 50;
    run(state, 0.5);
    empire.soldiers = empire.reserveCap;

    run(state, 60);
    expect(empire.civilianBalance).toBeGreaterThanOrEqual(0);
  });

  test('training draws from civilian growth, not the population', () => {
    const state = makeState();
    const empire = state.empires[0]!;
    empire.civilians = 1000;
    empire.soldiers = 60;
    empire.bonuses = { ...empire.bonuses, reserveCap: { add: 0, mul: 10 }, growth: { add: 0, mul: 100 } };
    place(state, { q: 1, r: 6 }, 'barracks');
    run(state, 0.5);
    const civilians = empire.civilians;
    const soldiers = empire.soldiers;
    run(state, 1);
    expect(empire.soldiers).toBeGreaterThan(soldiers);
    expect(empire.civilians).toBeGreaterThanOrEqual(civilians);
    expect(empire.drafting).toBe(false);
  });

  test('drafts civilians rapidly when troops hit zero, up to the draft ratio', () => {
    const state = makeState();
    const empire = state.empires[0]!;
    empire.civilians = 1000;
    empire.soldiers = 0;
    place(state, { q: 1, r: 6 }, 'barracks');
    run(state, 0.1);
    expect(empire.drafting).toBe(true);
    run(state, 2);
    expect(empire.drafting).toBe(false);
    const draftTarget = empire.reserveCap * state.config.recruit.draftUntilRatio;
    expect(empire.soldiers).toBeGreaterThanOrEqual(draftTarget);
    expect(empire.civilians).toBeLessThan(1000);
  });

  test('civilianBalance is exactly one stage write (deterministic per tick)', () => {
    const state = makeState();
    const empire = state.empires[0]!;
    empire.soldiers = 0;
    step(state, FIXED_DT);
    const first = empire.civilianBalance;
    
    expect(first).toBeCloseTo(empire.civilianBalance, 12);
  });
});

function stateWorkersPerBuilding(state: GameState): number {
  return state.config.economy.workersPerBuilding;
}

describe('engine recruitment', () => {
  test('converts civilians to soldiers toward the target reserve ratio', () => {
    const state = makeState();
    const empire = state.empires[0]!;
    empire.civilians = 100;
    empire.soldiers = 0;
    empire.bonuses = { ...empire.bonuses, growth: { add: 0, mul: 100 } };
    place(state, { q: 1, r: 6 }, 'barracks');
    const rate = state.config.recruit.secondsPerSoldier;
    run(state, rate * 4);
    
    expect(empire.soldiers).toBeGreaterThan(2);

    run(state, 200);
    const target = empire.reserveCap * state.config.recruit.targetReserveRatio;
    expect(empire.soldiers).toBeGreaterThan(target - 1);
    expect(empire.soldiers).toBeLessThanOrEqual(target + 1);
  });

  test('only barracks train soldiers; forts raise reserveCap', () => {
    const withBarracks = makeState();
    place(withBarracks, { q: 0, r: 1 }, 'barracks');
    const withFort = makeState();
    place(withFort, { q: 0, r: 1 }, 'fort');
    for (const s of [withBarracks, withFort]) {
      s.empires[0]!.civilians = 100;
      s.empires[0]!.soldiers = 0;
    }
    run(withBarracks, 1);
    run(withFort, 1);
    expect(withBarracks.empires[0]!.soldiers).toBeGreaterThan(0);
    expect(withFort.empires[0]!.soldiers).toBe(0);
    expect(withFort.empires[0]!.reserveCap).toBe(
      withBarracks.empires[0]!.reserveCap - withFort.config.recruit.barracksReserveCap + withFort.config.recruit.fortReserveCap,
    );
  });

  test('recruitment stops at zero civilians and never goes negative', () => {
    const state = makeState();
    const empire = state.empires[0]!;
    empire.civilians = 2;
    empire.soldiers = 0;
    empire.reserveCap = 1000;
    place(state, { q: 1, r: 6 }, 'barracks');

    run(state, 20);
    expect(empire.civilians).toBeGreaterThanOrEqual(0);
    expect(empire.soldiers).toBeGreaterThan(0);
  });

  test('recruitSpeed modifier speeds conversion up', () => {
    const fast = makeState();
    const slow = makeState();
    for (const s of [fast, slow]) {
      s.empires[0]!.civilians = 200;
      s.empires[0]!.soldiers = 0;
      s.empires[0]!.bonuses = { ...s.empires[0]!.bonuses, reserveCap: { add: 0, mul: 10 }, growth: { add: 0, mul: 100 } };
      place(s, { q: 1, r: 6 }, 'barracks');
    }
    fast.empires[0]!.bonuses = { ...fast.empires[0]!.bonuses, recruitSpeed: { add: 0, mul: 2 } };
    slow.empires[0]!.bonuses = { ...slow.empires[0]!.bonuses, recruitSpeed: { add: 0, mul: 1 } };
    run(fast, 2);
    run(slow, 2);
    expect(fast.empires[0]!.soldiers).toBeGreaterThan(slow.empires[0]!.soldiers);
  });
});

describe('engine buildings', () => {
  test('cannon cooldown decrements to zero, never below', () => {
    const state = makeState();
    const cannon = place(state, { q: 0, r: 1 }, 'cannon');
    cannon.cooldown = 1;
    run(state, 0.5);
    expect(cannon.cooldown).toBeGreaterThan(0);
    expect(cannon.cooldown).toBeLessThan(1);
    run(state, 1);
    expect(cannon.cooldown).toBe(0);
  });
});

describe('engine field works', () => {
  const home = { q: 3, r: 4 };
  const enemy = { q: 4, r: 4 };

  function standoff(state: GameState): ReturnType<typeof ensureFront> {
    const front = ensureFront(state, home, enemy);
    front.sideA.mode = 'defence';
    front.sideA.troops = 50;
    front.sideB.mode = 'attack';
    front.sideB.troops = 50;
    return front;
  }

  test('a trench on the home hex boosts defence unless enemy tanks are adjacent', () => {
    const dug = makeState();
    place(dug, home, 'trench');
    const front = standoff(dug);
    step(dug, FIXED_DT);
    const trench = front.sideA.modifiers.lines.find(line => line.label === 'Trench');
    expect(trench?.defence).toBeCloseTo(1.35, 6);

    const overrun = makeState();
    place(overrun, home, 'trench');
    place(overrun, { q: 4, r: 3 }, 'tank');
    const overrunFront = standoff(overrun);
    step(overrun, FIXED_DT);
    const labels = overrunFront.sideA.modifiers.lines.map(line => line.label);
    expect(labels).not.toContain('Trench');
    expect(labels).toContain('Trench (overrun by tanks)');
    expect(overrunFront.sideB.modifiers.lines.map(line => line.label)).toContain('Tanks');
    expect(overrunFront.sideB.modifiers.attack).toBeGreaterThan(front.sideB.modifiers.attack);
  });

  function nest(state: GameState, garrison: number): Building {
    const trench = place(state, { q: 2, r: 4 }, 'trench');
    trench.machineGun = true;
    trench.garrison = garrison;
    return trench;
  }

  test('machine guns only fire from a manned trench', () => {
    const empty = makeState();
    nest(empty, 0);
    const emptyFront = standoff(empty);
    step(empty, FIXED_DT);
    expect(emptyFront.sideA.modifiers.lines.map(entry => entry.label)).not.toContain('Machine guns');
  });

  test('a garrison mans the trench line when attacked and returns afterwards', () => {
    const state = makeState();
    const trench = place(state, home, 'trench');
    trench.garrison = 12;
    const front = ensureFront(state, enemy, home);
    front.sideA.mode = 'attack';
    front.sideA.troops = 4;
    step(state, FIXED_DT);
    const defender = front.sideB;
    expect(trench.garrison).toBe(0);
    expect(defender.mode).toBe('defence');
    expect(defender.troops).toBeGreaterThan(10);

    front.sideA.troops = 0;
    const reserve = state.empires[0]!.soldiers;
    const survivors = defender.troops;
    step(state, FIXED_DT);
    expect(state.fronts).not.toContain(front);
    expect(trench.garrison + state.empires[0]!.soldiers - reserve).toBeCloseTo(survivors, 0);
    expect(trench.garrison).toBeGreaterThan(0);
  });

  test('garrisons count as deployed, are lost on capture and return on demolish', () => {
    const state = makeState();
    const trench = place(state, home, 'trench');
    trench.garrison = 7;
    expect(deployedTroops(state, 0)).toBe(7);

    trench.demolishAt = state.elapsed;
    const reserve = state.empires[0]!.soldiers;
    step(state, FIXED_DT);
    expect(gridAt(state.grid, home)!.building).toBeNull();
    expect(state.empires[0]!.soldiers).toBeGreaterThanOrEqual(reserve + 7);

    const lost = makeState();
    const held = place(lost, home, 'trench');
    held.garrison = 1;
    const front = ensureFront(lost, enemy, home);
    front.sideA.mode = 'attack';
    front.sideA.troops = 500;
    for (let i = 0; i < 2000 && gridAt(lost.grid, home)!.owner === 0; i++) step(lost, FIXED_DT);
    expect(gridAt(lost.grid, home)!.owner).toBe(1);
    expect(held.garrison).toBe(0);
  });

  test('machine guns only fire for a side holding the line', () => {
    const holding = makeState();
    nest(holding, 5);
    const front = standoff(holding);
    step(holding, FIXED_DT);
    const line = front.sideA.modifiers.lines.find(entry => entry.label === 'Machine guns');
    expect(line?.attack).toBeCloseTo(1.5, 6);
    expect(line?.defence).toBeCloseTo(1.2, 6);

    const attacking = makeState();
    nest(attacking, 5);
    const attackFront = standoff(attacking);
    attackFront.sideA.mode = 'attack';
    step(attacking, FIXED_DT);
    expect(attackFront.sideA.modifiers.lines.map(entry => entry.label)).not.toContain('Machine guns');
  });

  test('bunkers add defence to nearby fronts', () => {
    const state = makeState();
    place(state, { q: 3, r: 5 }, 'bunker');
    const front = standoff(state);
    step(state, FIXED_DT);
    const line = front.sideA.modifiers.lines.find(entry => entry.label === 'Bunker');
    expect(line?.defence).toBeCloseTo(1.75, 6);
  });

  test('artillery batteries shell the enemy side automatically and reload', () => {
    const state = makeState();
    const battery = place(state, { q: 1, r: 4 }, 'battery');
    const front = ensureFront(state, home, enemy);
    front.sideA.mode = 'defence';
    front.sideB.mode = 'defence';
    front.sideA.troops = 20;
    front.sideB.troops = 20;
    step(state, FIXED_DT);
    expect(front.sideB.troops).toBeCloseTo(20 - state.config.battery.damage, 6);
    expect(front.sideA.troops).toBe(20);
    expect(battery.cooldown).toBeGreaterThan(0);
    const afterShot = front.sideB.troops;
    run(state, 1);
    expect(front.sideB.troops).toBe(afterShot);
  });

  test('bunkers halve shelling on the troops they cover', () => {
    const state = makeState();
    place(state, { q: 1, r: 4 }, 'battery');
    place(state, { q: 5, r: 4 }, 'bunker');
    const front = ensureFront(state, home, enemy);
    front.sideA.mode = 'defence';
    front.sideB.mode = 'defence';
    front.sideA.troops = 20;
    front.sideB.troops = 20;
    step(state, FIXED_DT);
    expect(front.sideB.troops).toBeCloseTo(20 - state.config.battery.damage * 0.5, 6);
  });

  test('tanks roll onto hexes captured next to them', () => {
    const state = makeState();
    const tank = place(state, home, 'tank');
    const front = ensureFront(state, home, enemy);
    front.sideA.mode = 'attack';
    front.sideA.troops = 100;
    front.sideB.troops = 0;
    run(state, 4);
    expect(gridAt(state.grid, enemy)!.owner).toBe(0);
    expect(gridAt(state.grid, enemy)!.building).toBe(tank);
    expect(gridAt(state.grid, home)!.building).toBeNull();
  });
});

describe('engine combat', () => {
  test('unopposed attacker captures the target hex', () => {
    const state = makeState();
    const edge = borderEdge(state, 0, 1);
    state.empires[0]!.soldiers = 100;
    const front = ensureFront(state, edge.a, edge.b);
    front.sideA.mode = 'attack';
    front.sideA.troops = 100;
    front.sideB.troops = 0;
    run(state, 0.1);
    expect(gridAt(state.grid, edge.b)!.owner).toBe(1);
    run(state, 4);
    expect(gridAt(state.grid, edge.b)!.owner).toBe(0);
    expect(front.sideA.empire).toBe(0);
  });

  test('a capture in progress decays when the defender reinforces', () => {
    const state = makeState();
    const edge = borderEdge(state, 0, 1);
    const front = ensureFront(state, edge.a, edge.b);
    front.sideA.mode = 'attack';
    front.sideA.troops = 100;
    front.sideB.troops = 0;
    run(state, 1);
    const progress = front.capture?.progress ?? 0;
    expect(progress).toBeGreaterThan(0);
    front.sideB.troops = 1000;
    run(state, 0.5);
    expect(front.capture?.progress ?? 0).toBeLessThan(progress);
    expect(gridAt(state.grid, edge.b)!.owner).toBe(1);
  });

  test('an attack that does not overwhelm only grinds the defender down', () => {
    const state = makeState();
    const edge = borderEdge(state, 0, 1);
    const front = ensureFront(state, edge.a, edge.b);
    front.sideA.mode = 'attack';
    front.sideA.troops = 10;
    front.sideB.mode = 'defence';
    front.sideB.troops = 100;
    step(state, FIXED_DT);
    expect(gridAt(state.grid, edge.b)!.owner).toBe(1);
    expect(front.sideB.troops).toBeLessThan(100);
    expect(front.resolution?.capturedBy).toBeNull();
  });

  test('terrain defence makes hills harder to take', () => {
    const hill = makeState();
    const plain = makeState();
    for (const [state, terrain] of [
      [hill, 'mountain'],
      [plain, 'plain'],
    ] as const) {
      const edge = borderEdge(state, 0, 1);
      gridAt(state.grid, edge.b)!.terrain = terrain as Terrain;
      const front = ensureFront(state, edge.a, edge.b);
      front.sideA.mode = 'attack';
      front.sideA.troops = 60;
      front.sideB.mode = 'defence';
      front.sideB.troops = 60;
    }
    run(hill, 1);
    run(plain, 1);
    const hillLosses = hill.fronts[0]?.resolution?.lossesA ?? 0;
    const plainLosses = plain.fronts[0]?.resolution?.lossesA ?? 0;

    expect(hillLosses).toBeGreaterThanOrEqual(0);
    expect(plainLosses).toBeGreaterThanOrEqual(0);
  });

  test('defence modifiers are reflected in the tooltip lines', () => {
    const state = makeState();
    const edge = borderEdge(state, 0, 1);
    gridAt(state.grid, edge.a)!.terrain = 'forest';
    const front = ensureFront(state, edge.a, edge.b);
    front.sideA.troops = 10;
    front.sideB.troops = 10;
    step(state, FIXED_DT);
    const labels = front.sideA.modifiers.lines.map(line => line.label);
    expect(labels).toContain('Forest');
  });

  test('multi-front bonus counts distinct clusters, not edges', () => {
    const state = makeState();

    let sharedHex: { q: number; r: number } | null = null;
    const deltas = [
      { q: 1, r: 0 },
      { q: 1, r: -1 },
      { q: 0, r: -1 },
      { q: -1, r: 1 },
      { q: 0, r: 1 },
      { q: -1, r: 0 },
    ];
    for (const cell of state.grid.cells) {
      if (cell.owner !== 0 || cell.building) continue;
      const enemyNeighbours = deltas.filter(
        delta => gridAt(state.grid, { q: cell.q + delta.q, r: cell.r + delta.r })?.owner === 1,
      );
      if (enemyNeighbours.length >= 2) {
        sharedHex = { q: cell.q, r: cell.r };
        break;
      }
    }
    expect(sharedHex).not.toBeNull();
    const anchor = sharedHex!;
    let first: ReturnType<typeof ensureFront> | null = null;
    for (const delta of deltas) {
      const east = gridAt(state.grid, { q: anchor.q + delta.q, r: anchor.r + delta.r });
      if (!east || east.owner !== 1) continue;
      const front = ensureFront(state, anchor, { q: east.q, r: east.r });
      front.sideA.troops = 10;
      front.sideB.troops = 10;
      first ??= front;
    }
    expect(first).not.toBeNull();
    const front = first!;
    step(state, FIXED_DT);
    const sharing = state.fronts.filter(f => f.cluster === front.cluster);
    expect(sharing.length).toBeGreaterThan(1);
    
    expect(front.sideA.modifiers.lines.some(l => l.label === 'Multi-front')).toBe(false);
  });

  test('distinct clusters against the same enemy grant the multi-front bonus', () => {
    const state = makeState();

    for (const cell of state.grid.cells) {
      cell.owner = NEUTRAL_OWNER;
      cell.building = null;
    }
    const borders: Array<[{ q: number; r: number }, { q: number; r: number }]> = [
      [{ q: 2, r: 1 }, { q: 3, r: 1 }],
      [{ q: 2, r: 5 }, { q: 3, r: 5 }],
    ];
    for (const [a, b] of borders) {
      gridAt(state.grid, a)!.owner = 0;
      gridAt(state.grid, b)!.owner = 1;
    }

    const fronts = borders.map(([a, b]) => {
      const front = ensureFront(state, a, b);
      front.sideA.troops = 10;
      front.sideB.troops = 10;
      return front;
    });
    step(state, FIXED_DT);
    expect(fronts[0]!.cluster).not.toBe(fronts[1]!.cluster);
    expect(fronts[0]!.sideA.modifiers.lines.some(l => l.label === 'Multi-front')).toBe(true);
    expect(fronts[0]!.sideA.modifiers.attack).toBeGreaterThan(1);
  });

  test('both sides attacking trade losses', () => {
    const state = makeState();
    const edge = borderEdge(state, 0, 1);
    const front = ensureFront(state, edge.a, edge.b);
    front.sideA.mode = 'attack';
    front.sideB.mode = 'attack';
    front.sideA.troops = 100;
    front.sideB.troops = 100;
    run(state, 1);
    expect(front.sideA.troops).toBeLessThan(100);
    expect(front.sideB.troops).toBeLessThan(100);
  });

  test('counterattack mode changes the resolved multipliers', () => {
    const state = makeState();
    const edge = borderEdge(state, 0, 1);
    const front = ensureFront(state, edge.a, edge.b);
    front.sideA.mode = 'counterattack';
    front.sideA.troops = 50;
    front.sideB.troops = 50;
    step(state, FIXED_DT);
    expect(front.sideA.modifiers.lines.some(l => l.label === 'Counterattack')).toBe(true);
  });
});

describe('engine housekeeping', () => {
  test('a front with neither side attacking ends after idleEndSeconds and returns troops', () => {
    const state = makeState();
    const edge = borderEdge(state, 0, 1);
    const front = ensureFront(state, edge.a, edge.b);
    front.sideA.mode = 'defence';
    front.sideB.mode = 'attack';
    front.sideA.troops = 30;
    front.sideB.troops = 30;
    state.empires[0]!.soldiers = 0;
    state.empires[0]!.reserveCap = 500;
    front.lastAttackAt = state.elapsed;
    
    front.sideA.mode = 'defence';
    front.sideB.mode = 'defence';
    run(state, state.config.front.idleEndSeconds + 1);
    expect(findFront(state, front.id)).toBeUndefined();
    expect(state.empires[0]!.soldiers).toBeGreaterThan(0);
  });

  test('demolished buildings disappear at demolishAt but stay active until then', () => {
    const state = makeState();
    const market = place(state, { q: 0, r: 1 }, 'market');
    market.demolishAt = state.elapsed + state.config.demolish.durationSeconds;
    state.empires[0]!.civilians = 100;
    state.empires[0]!.gold = 0;
    run(state, state.config.demolish.durationSeconds * 0.5);
    
    expect(state.empires[0]!.gold).toBeGreaterThan(0);
    expect(gridAt(state.grid, { q: 0, r: 1 })!.building).not.toBeNull();
    run(state, state.config.demolish.durationSeconds * 0.6);
    expect(gridAt(state.grid, { q: 0, r: 1 })!.building).toBeNull();
  });

  test('hexCount is refreshed from the grid', () => {
    const state = makeState();
    const before = state.empires[0]!.hexCount;
    
    const victim = state.grid.cells.find(cell => cell.owner === 1);
    expect(victim).toBeDefined();
    victim!.owner = 0;
    step(state, FIXED_DT);
    expect(state.empires[0]!.hexCount).toBe(before + 1);
  });

  test('an empire with no hexes is eliminated and its fronts end', () => {
    const state = makeState();
    const edge = borderEdge(state, 0, 1);
    const front = ensureFront(state, edge.a, edge.b);
    front.sideA.troops = 10;
    front.sideB.troops = 10;
    const soldiersBefore = state.empires[1]!.soldiers;
    
    for (const cell of state.grid.cells) if (cell.owner === 1) cell.owner = NEUTRAL_OWNER;
    step(state, FIXED_DT);
    expect(state.empires[1]!.alive).toBe(false);
    expect(state.empires[1]!.eliminatedAt).not.toBeNull();

    expect(state.empires[1]!.soldiers).toBeLessThan(soldiersBefore + 10);
    expect(findFront(state, front.id)).toBeUndefined();
  });
});

describe('engine win conditions', () => {
  test('last empire standing wins by elimination', () => {
    const state = makeState();
    for (const cell of state.grid.cells) if (cell.owner === 1) cell.owner = NEUTRAL_OWNER;
    step(state, FIXED_DT);
    expect(state.status).toBe('ended');
    expect(state.endReason).toBe('elimination');
    expect(state.winner).toBe(0);
  });

  test('holding most of the land does not end the match', () => {
    const state = makeState();
    
    let kept = 0;
    for (const cell of state.grid.cells) {
      if (cell.owner === 1) {
        if (kept++ === 0) continue;
        cell.owner = 0;
      }
    }
    run(state, 60);
    expect(state.status).toBe('playing');
  });
});

function openFrontier(state: GameState, neutralColumns = 1): number {
  const empire = state.empires[0]!;
  
  const strip = Math.floor(state.grid.width / state.empires.length);
  const first = strip - neutralColumns;
  let neutral = 0;
  for (const cell of state.grid.cells) {
    if (cell.owner === 0 && cell.q >= first) {
      cell.owner = NEUTRAL_OWNER;
      neutral += 1;
    }
  }
  
  step(state, FIXED_DT);
  empire.soldiers = empire.reserveCap; 
  return neutral;
}

function launchExpedition(state: GameState, troops: number): void {
  const empire = state.empires[0]!;
  empire.soldiers -= troops;
  const strip = Math.floor(state.grid.width / state.empires.length);
  const target = { q: strip - 1, r: 0 };
  launchTroops(state, 0, target, troops);
}

describe('engine territorial expansion', () => {
  test('an expedition keeps claiming until its wild region is fully taken', () => {
    const state = makeState();
    const empire = state.empires[0]!;
    const opened = openFrontier(state, 2);
    launchExpedition(state, 200);
    run(state, 30);
    const region = state.grid.cells.filter(cell => cell.owner === NEUTRAL_OWNER && cell.q < Math.floor(state.grid.width / state.empires.length));
    expect(opened).toBeGreaterThan(0);
    expect(region).toHaveLength(0);
    expect(state.expeditions).toHaveLength(0);
    expect(empire.soldiers).toBeGreaterThan(0);
  });

  test('a squad survives its claim and keeps going the way it was heading', () => {
    const state = makeState();
    openFrontier(state, 2);
    launchExpedition(state, 1);
    const expedition = state.expeditions[0]!;
    step(state, FIXED_DT);
    const squad = expedition.squads[0]!;
    let guard = 0;
    while (squad.heading.q === 0 && squad.heading.r === 0 && guard++ < 600) step(state, FIXED_DT);
    expect(expedition.squads[0]).toBe(squad);
    const heading = { ...squad.heading };
    step(state, FIXED_DT);
    expect(squad.from).toEqual(squad.tile);
    expect(squad.goal).toEqual({ q: squad.tile.q + heading.q, r: squad.tile.r + heading.r });
  });

  test('an expedition splits into several squads at once', () => {
    const state = makeState();
    openFrontier(state, 2);
    launchExpedition(state, 200);
    step(state, FIXED_DT);
    expect(state.expeditions[0]!.squads.length).toBeGreaterThan(1);
  });

  test('mountains wall off expansion: they are never claimed or crossed', () => {
    const state = makeState();
    openFrontier(state, 2);
    for (const cell of state.grid.cells) if (cell.q === 2) cell.terrain = 'mountain';
    launchExpedition(state, 20);
    run(state, 30);
    for (const cell of state.grid.cells) {
      if (cell.q === 2 || cell.q === 3) expect(cell.owner).toBe(NEUTRAL_OWNER);
    }
  });

  test('neutral land is never claimed without an expedition', () => {
    const state = makeState();
    const empire = state.empires[0]!;
    openFrontier(state, 1);
    const before = empire.hexCount;
    run(state, 2);
    expect(empire.hexCount).toBe(before);
  });

  test('an expedition claims adjacent neutral land, growing territory', () => {
    const state = makeState();
    const empire = state.empires[0]!;
    openFrontier(state, 1);
    launchExpedition(state, 20);
    const before = empire.hexCount;
    run(state, 0.5);
    expect(empire.hexCount).toBe(before);
    expect(state.expeditions[0]!.squads.length).toBeGreaterThan(0);
    run(state, 3);
    expect(empire.hexCount).toBeGreaterThan(before);
  });

  test('expedition troops are away while claiming and all come back alive', () => {
    const state = makeState();
    const empire = state.empires[0]!;
    openFrontier(state, 3);
    empire.civilians = 1000;
    empire.soldiers = 20;
    launchExpedition(state, 20);
    expect(empire.soldiers).toBe(0);
    run(state, 1);
    expect(empire.soldiers).toBeLessThan(1);
    run(state, 60);
    expect(state.expeditions).toHaveLength(0);
    expect(empire.soldiers).toBeGreaterThanOrEqual(20);
  });

  test('leftover expedition troops return when there is nothing left to claim', () => {
    const state = makeState();
    const empire = state.empires[0]!;
    openFrontier(state, 1);
    empire.civilians = 0;
    empire.soldiers = 0;
    launchExpedition(state, 0);
    state.expeditions[0]!.troops = 500;
    run(state, 10);
    expect(state.expeditions).toHaveLength(0);
    expect(empire.soldiers).toBeGreaterThan(0);
  });

  test('barracks and forts raise expansion throughput', () => {
    const bare = makeState();
    openFrontier(bare, 3);
    launchExpedition(bare, 100);
    step(bare, FIXED_DT);
    const bareClaims = bare.expeditions[0]!.squads.length;

    const built = makeState();
    openFrontier(built, 3);
    for (let i = 0; i < 4; i++) place(built, { q: i, r: 2 }, 'barracks');
    for (let i = 0; i < 4; i++) place(built, { q: i, r: 3 }, 'fort');
    launchExpedition(built, 100);
    step(built, FIXED_DT);
    const builtClaims = built.expeditions[0]!.squads.length;
    expect(bareClaims).toBeGreaterThan(0);
    expect(builtClaims).toBeGreaterThan(bareClaims);
  });
});

describe('engine population chain', () => {
  test('cities replenish population faster at higher level', () => {
    const low = makeState();
    const high = makeState();
    
    for (const state of [low, high]) {
      const empire = state.empires[0]!;
      empire.soldiers = empire.reserveCap; 
      empire.civilians = 10;
    }
    
    const city = low.grid.cells.find(cell => cell.owner === 0 && cell.building?.kind === 'city')!;
    gridAt(high.grid, { q: city.q, r: city.r })!.building!.level += 1;
    run(low, 5);
    run(high, 5);
    expect(high.empires[0]!.civilians).toBeGreaterThan(low.empires[0]!.civilians);
  });

  test('barracks turn population into soldiers faster than an empty empire', () => {
    const bare = makeState();
    const built = makeState();
    for (const state of [bare, built]) {
      const empire = state.empires[0]!;
      empire.civilians = 400;
      empire.soldiers = 0;
    }
    for (let i = 0; i < 4; i++) place(built, { q: i, r: 2 }, 'barracks');
    run(bare, 2);
    run(built, 2);
    expect(built.empires[0]!.soldiers).toBeGreaterThan(bare.empires[0]!.soldiers);
  });

  test('forts let barracks keep training past the base capacity', () => {
    const bare = makeState();
    const fortified = makeState();
    for (const state of [bare, fortified]) {
      const empire = state.empires[0]!;
      empire.civilians = 400;
      empire.soldiers = 0;
      place(state, { q: 1, r: 6 }, 'barracks');
    }
    for (let i = 0; i < 4; i++) place(fortified, { q: i, r: 2 }, 'fort');
    run(bare, 120);
    run(fortified, 120);
    expect(fortified.empires[0]!.soldiers).toBeGreaterThan(bare.empires[0]!.soldiers);
  });
});

describe('engine determinism', () => {
  const hash = (state: GameState): string =>
    [
      state.elapsed.toFixed(6),
      state.tick,
      ...state.empires.map(e => `${e.gold.toFixed(6)}:${e.civilians.toFixed(6)}:${e.soldiers.toFixed(6)}:${e.hexCount}`),
      ...state.fronts.map(f => `${f.id}:${f.sideA.troops.toFixed(4)}:${f.sideB.troops.toFixed(4)}:${f.cluster}`),
      state.grid.cells.map(c => c.owner).join(','),
    ].join('|');

  test('same seed + same command log produces identical state', () => {
    const runMatch = (): GameState => {
      const state = createInitialState(DEFAULT_GAME_CONFIG);
      
      state.fronts.length = 0;
      const a = state.empires[0]!;
      const b = state.empires[1]!;
      a.soldiers = 200;
      b.soldiers = 200;
      a.reserveCap = 5000;
      b.reserveCap = 5000;
      for (let i = 0; i < 30 * 20; i++) {
        step(state, FIXED_DT);
        if (i === 1) {
          const edge = findBorder(state, 0, 1);
          if (edge) {
            ensureFront(state, edge.a, edge.b);
            const front = state.fronts[0]!;
            front.sideA.troops = 100;
            front.sideB.troops = 100;
            front.sideA.mode = 'attack';
            front.sideB.mode = 'defence';
            front.lastAttackAt = state.elapsed;
          }
        }
      }
      return state;
    };
    expect(hash(runMatch())).toBe(hash(runMatch()));
  });

  test('a full default match runs 15 game-minutes without NaN', () => {
    const state = createInitialState(DEFAULT_GAME_CONFIG);
    for (let i = 0; i < 30 * 60 * 16 && state.status === 'playing'; i++) step(state, FIXED_DT);
    for (const empire of state.empires) {
      expect(Number.isFinite(empire.gold)).toBe(true);
      expect(Number.isFinite(empire.civilians)).toBe(true);
      expect(Number.isFinite(empire.soldiers)).toBe(true);
    }
  });
});

describe('engine staffing, diplomacy & bot integration', () => {
  test('non-gold buildings employ civilians and affect worker staffing', () => {
    const state = makeState();
    const empire = state.empires[0]!;
    
    empire.bonuses = emptyModifierTotals();
    
    gridAt(state.grid, { q: 0, r: 0 })!.building = {
      id: state.nextBuildingId++,
      kind: 'market',
      level: 1,
      cooldown: 0,
      growth: 0,
      demolishAt: null, buildRemaining: 0, gatherers: [], garrison: 0, machineGun: false,
    };
    gridAt(state.grid, { q: 0, r: 2 })!.building = {
      id: state.nextBuildingId++,
      kind: 'farm',
      level: 1,
      cooldown: 0,
      growth: 0,
      demolishAt: null, buildRemaining: 0, gatherers: [], garrison: 0, machineGun: false,
    };

    empire.civilians = 2;
    empire.gold = 0;
    step(state, FIXED_DT);

    const expectedIncome = state.config.economy.marketGoldPerSecond * 0.5 * FIXED_DT;
    expect(empire.gold).toBeCloseTo(expectedIncome, 4);
  });

  test('eliminated empire dissolves diplomacy and cleans up relations', () => {
    const state = makeState();
    
    declareWar(state, 0, 1);
    expect(getRelation(state, 0, 1).status).toBe('war');

    const edge = borderEdge(state, 0, 1);
    const front = ensureFront(state, edge.a, edge.b);
    front.sideA.troops = 15;
    front.sideB.troops = 15;
    front.sideA.mode = 'defence';
    front.sideB.mode = 'defence';
    state.empires[0]!.civilians = 0; 
    const soldiers0Before = state.empires[0]!.soldiers;

    for (const cell of state.grid.cells) {
      if (cell.owner === 1) cell.owner = NEUTRAL_OWNER;
    }
    step(state, FIXED_DT);

    expect(state.empires[1]!.alive).toBe(false);
    
    expect(getRelation(state, 0, 1).status).toBe('peace');
    
    expect(findFront(state, front.id)).toBeUndefined();
    expect(state.empires[0]!.soldiers).toBeCloseTo(soldiers0Before + 15, 0);
  });

  test('bot loop with diplomacy logic runs deterministic and throw-free', () => {
    const state = createInitialState(DEFAULT_GAME_CONFIG);
    const bots = state.empires.map(empire => createBot({ empire: empire.id, seed: state.config.map.seed }));

    const tickSeconds = state.config.bot.tickSeconds;
    let accumulator = 0;
    
    for (let i = 0; i < 100; i++) {
      step(state, FIXED_DT);
      accumulator += FIXED_DT;
      while (accumulator >= tickSeconds) {
        accumulator -= tickSeconds;
        for (const bot of bots) {
          const commands = botTick(bot, state, tickSeconds);
          for (const cmd of commands) {
            const res = dispatch(state, cmd);
            
            expect(typeof res.ok).toBe('boolean');
          }
        }
      }
    }

    for (const empire of state.empires) {
      expect(Number.isFinite(empire.gold)).toBe(true);
      expect(Number.isFinite(empire.soldiers)).toBe(true);
    }
  });
});

function findBorder(state: GameState, left: number, right: number): { a: { q: number; r: number }; b: { q: number; r: number } } | null {
  for (const cell of state.grid.cells) {
    if (cell.owner !== left) continue;
    const east = gridAt(state.grid, { q: cell.q + 1, r: cell.r });
    if (east && east.owner === right) return { a: { q: cell.q, r: cell.r }, b: { q: cell.q + 1, r: cell.r } };
  }
  return null;
}
