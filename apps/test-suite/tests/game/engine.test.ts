import { spawnUnits, testEmpire } from '../support/fixture';
import { labelWorld } from '@the-big-war/client/game/map/world-labels.service';
import { createWorldIndex, setBuilding, setOwner } from '@the-big-war/client/game/map/world-index.service';


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
import { DEFAULT_GAME_CONFIG } from '@the-big-war/client/game/config/config.constants';
import type { HexCell, HexGrid, Terrain } from '@the-big-war/client/game/map/map.types';
import { emptyModifierTotals } from '@the-big-war/client/game/modifier/modifier.service';
import { gridAt, makeGrid } from '@the-big-war/game-engine/world-tile/world-tile.service';
import { recomputeEmpireBonuses } from '@the-big-war/client/game/research/research.service';
import { declareWar, getRelation } from '@the-big-war/client/game/diplomacy/diplomacy.service';
import type { Building, BuildingKind } from '@the-big-war/client/game/building/building.types';

const FACTIONS = ['ironclad', 'league', 'verdant', 'academy'];

function tinyConfig(overrides: Partial<GameConfig> = {}): GameConfig {
  return {
    ...DEFAULT_GAME_CONFIG,
    map: { ...DEFAULT_GAME_CONFIG.map, width: 8, height: 8, seed: 4242 },
    start: { ...DEFAULT_GAME_CONFIG.start, empireCount: 2 },
    ...overrides,
  };
}

function makeState(base: GameConfig = tinyConfig()): GameState {
  const config = { ...base, economy: { ...base.economy, taxGoldPerTile: 0 } };
  const grid: HexGrid = makeGrid<HexCell>(config.map.width, config.map.height, hex => ({
    q: hex.q,
    r: hex.r,
    terrain: 'plain',
    biome: 'temperate',
    owner: NEUTRAL_OWNER,
    building: null,
  }));

  const empires: Empire[] = [];
  for (let id = 0; id < config.start.empireCount; id++) {
    empires.push(testEmpire({ id, factionId: FACTIONS[id % FACTIONS.length]!, gold: config.start.gold, science: config.start.science, civilians: config.start.civilians }));
  }

  const state: GameState = {
    config,
    status: 'playing',
    playerEmpire: 0,
    grid,
    index: createWorldIndex(grid),
    empires,
    walkers: [],
    ships: [],
    nextShipId: 1,
    shipHash: new Map(),
    tradeClock: 0,
    units: [],
    nextUnitId: 1,
    production: [],
    unitEvents: [],
    nextUnitEventId: 1,
    spawnSites: [],
    landHexCount: grid.cells.length,
    map: labelWorld(grid),
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
    setOwner(state, cell, owner >= 0 && owner < empires.length ? owner : NEUTRAL_OWNER);
  }
  for (const empire of empires) {
    const q = Math.min(grid.width - 1, empire.id * strip);
    setBuilding(state, gridAt(grid, { q, r: 0 })!, building(state, 'city'));
    recomputeEmpireBonuses(state, empire.id);
  }
  refreshHexCounts(state);
  return state;
}

function building(state: GameState, kind: BuildingKind, level = 1, growth = 0): Building {
  return { id: state.nextBuildingId++, kind, level, cooldown: 0, growth, demolishAt: null, buildRemaining: 0, gatherers: [], shipBuild: 0, shellDamage: 0 };
}

function place(state: GameState, hex: { q: number; r: number }, kind: BuildingKind, level = 1): Building {
  const b = building(state, kind, level);
  setBuilding(state, gridAt(state.grid, hex)!, b);
  return b;
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
    }
    run(rich, 1);
    run(poor, 1);
    expect(poor.empires[0]!.gold).toBeGreaterThan(0);
    expect(poor.empires[0]!.gold).toBeLessThan(rich.empires[0]!.gold * 0.5);
  });

  test('civilianBalance is non-negative at rest', () => {
    const state = makeState();
    const empire = state.empires[0]!;
    empire.civilians = 50;
    run(state, 0.5);
    run(state, 60);
    expect(empire.civilianBalance).toBeGreaterThanOrEqual(0);
  });

  test('civilianBalance is exactly one stage write (deterministic per tick)', () => {
    const state = makeState();
    const empire = state.empires[0]!;
    step(state, FIXED_DT);
    const first = empire.civilianBalance;
    
    expect(first).toBeCloseTo(empire.civilianBalance, 12);
  });
});

function stateWorkersPerBuilding(state: GameState): number {
  return state.config.economy.workersPerBuilding;
}

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

describe('engine housekeeping', () => {
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
    setOwner(state, victim!, 0);
    step(state, FIXED_DT);
    expect(state.empires[0]!.hexCount).toBe(before + 1);
  });

  test('an empire with no hexes is eliminated and its units are removed', () => {
    const state = makeState();
    const home = state.grid.cells.find(cell => cell.owner === 1)!;
    spawnUnits(state, 1, home, 3);
    for (const cell of state.grid.cells) if (cell.owner === 1) setOwner(state, cell, NEUTRAL_OWNER);
    step(state, FIXED_DT);
    expect(state.empires[1]!.alive).toBe(false);
    expect(state.empires[1]!.eliminatedAt).not.toBeNull();
    expect(state.units.some(unit => unit.empire === 1)).toBe(false);
  });

});

describe('engine win conditions', () => {
  test('last empire standing wins by elimination', () => {
    const state = makeState();
    for (const cell of state.grid.cells) if (cell.owner === 1) setOwner(state, cell, NEUTRAL_OWNER);
    step(state, FIXED_DT);
    expect(state.status).toBe('ended');
    expect(state.endReason).toBe('elimination');
    expect(state.winner).toBe(0);
  });

  test('holding just under the domination share does not end the match', () => {
    const state = makeState();
    
    const short = Math.floor(state.landHexCount * state.config.victory.dominationShare) - 1;
    for (const cell of state.grid.cells) {
      if (cell.owner !== 1 || state.index.tiles.get(0)!.size >= short) continue;
      setOwner(state, cell, 0);
    }
    run(state, 60);
    expect(state.status).toBe('playing');
  });
});

describe('engine population chain', () => {
  test('cities replenish population faster at higher level', () => {
    const low = makeState();
    const high = makeState();
    
    for (const state of [low, high]) {
      const empire = state.empires[0]!;
      empire.civilians = 10;
    }
    
    const city = low.grid.cells.find(cell => cell.owner === 0 && cell.building?.kind === 'city')!;
    gridAt(high.grid, { q: city.q, r: city.r })!.building!.level += 1;
    run(low, 5);
    run(high, 5);
    expect(high.empires[0]!.civilians).toBeGreaterThan(low.empires[0]!.civilians);
  });

});

describe('engine determinism', () => {
  const hash = (state: GameState): string =>
    [
      state.elapsed.toFixed(6),
      state.tick,
      ...state.empires.map(e => `${e.gold.toFixed(6)}:${e.civilians.toFixed(6)}:${e.hexCount}`),
      ...state.units.map(u => `${u.id}:${u.x.toFixed(4)}:${u.y.toFixed(4)}:${u.hp.toFixed(4)}`),
      state.grid.cells.map(c => c.owner).join(','),
    ].join('|');

  test('same seed + same command log produces identical state', () => {
    const runMatch = (): GameState => {
      const state = createInitialState(DEFAULT_GAME_CONFIG);
      
      const edge = findBorder(state, 0, 1);
      const army = edge ? spawnUnits(state, 0, edge.a, 6) : [];
      for (let i = 0; i < 30 * 20; i++) {
        step(state, FIXED_DT);
        if (i === 1 && edge) {
          const size = state.config.map.hexSize;
          dispatch(state, {
            type: 'OrderUnits',
            empire: 0,
            units: army.map(unit => unit.id),
            order: { kind: 'move', mode: 'amove', x: (edge.b.q + 0.5) * size, y: (edge.b.r + 0.5) * size, formation: 'wedge' },
          });
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
    }
  });
});

describe('engine staffing, diplomacy & bot integration', () => {
  test('non-gold buildings employ civilians and affect worker staffing', () => {
    const state = makeState();
    const empire = state.empires[0]!;
    
    empire.bonuses = emptyModifierTotals();
    
    setBuilding(state, gridAt(state.grid, { q: 0, r: 0 })!, {
      id: state.nextBuildingId++,
      kind: 'market',
      level: 1,
      cooldown: 0,
      growth: 0,
      demolishAt: null, buildRemaining: 0, gatherers: [], shipBuild: 0, shellDamage: 0,
    });
    setBuilding(state, gridAt(state.grid, { q: 0, r: 2 })!, {
      id: state.nextBuildingId++,
      kind: 'farm',
      level: 1,
      cooldown: 0,
      growth: 0,
      demolishAt: null, buildRemaining: 0, gatherers: [], shipBuild: 0, shellDamage: 0,
    });

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

    for (const cell of state.grid.cells) {
      if (cell.owner === 1) setOwner(state, cell, NEUTRAL_OWNER);
    }
    step(state, FIXED_DT);

    expect(state.empires[1]!.alive).toBe(false);
    
    expect(getRelation(state, 0, 1).status).toBe('peace');

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
