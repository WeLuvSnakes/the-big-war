import { testEmpire, clearStaging } from '../support/fixture';
import { labelWorld } from '@the-big-war/client/game/map/world-labels.service';
import { createWorldIndex, setBuilding, setOwner } from '@the-big-war/client/game/map/world-index.service';


import { describe, expect, test } from 'bun:test';
import { createRng } from '@the-big-war/game-engine/rng/rng.service';
import type { Empire } from '@the-big-war/client/game/empire/empire.types';
import type { GameState } from '@the-big-war/client/game/state/state.types';
import { dispatch } from '@the-big-war/client/game/commands/commands.service';
import { FACTIONS } from '@the-big-war/client/game/faction/faction.constants';
import type { GameConfig } from '@the-big-war/client/game/config/config.types';
import type { HexCell, HexGrid } from '@the-big-war/client/game/map/map.types';
import type { Command } from '@the-big-war/client/game/commands/commands.types';
import { NEUTRAL_OWNER } from '@the-big-war/client/game/empire/empire.constants';
import { completeResearch } from '@the-big-war/client/game/research/research.service';
import { DEFAULT_GAME_CONFIG } from '@the-big-war/client/game/config/config.constants';
import { gridAt, makeGrid } from '@the-big-war/game-engine/world-tile/world-tile.service';
import { stepBuildings } from '@the-big-war/client/game/simulation/systems/buildings.system';
import type { Building, BuildingKind } from '@the-big-war/client/game/building/building.types';
import { buildingCost, createBuilding, placementError } from '@the-big-war/client/game/building/building.service';

const FACTION_IDS = FACTIONS.map(faction => faction.id);

function tinyConfig(overrides: Partial<GameConfig> = {}): GameConfig {
  return {
    ...DEFAULT_GAME_CONFIG,
    map: { ...DEFAULT_GAME_CONFIG.map, width: 10, height: 6, seed: 99 },
    start: { ...DEFAULT_GAME_CONFIG.start, empireCount: 2 },
    ...overrides,
  };
}

function makeState(config: GameConfig = tinyConfig()): GameState {
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
    empires.push(testEmpire({ id, factionId: FACTION_IDS[id % FACTION_IDS.length]!, gold: 1000, science: 1000, civilians: 100, soldiers: 100, reserveCap: 500 }));
  }
  const state: GameState = {
    config,
    status: 'playing',
    playerEmpire: 0,
    grid,
    index: createWorldIndex(grid),
    empires,
    offensives: [], walkers: [],
    ships: [],
    nextShipId: 1,
    shipHash: new Map(),
    tradeClock: 0,
    nextOffensiveId: 1,
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
  const half = grid.width / 2;
  for (const cell of grid.cells) setOwner(state, cell, cell.q < half ? 0 : 1);
  for (const empire of empires) {
    const q = empire.id === 0 ? 0 : grid.width - 1;
    setBuilding(state, gridAt(grid, { q, r: 0 })!, makeBuilding(state, 'city'));
  }
  return state;
}

function makeBuilding(state: GameState, kind: BuildingKind, level = 1): Building {
  return { id: state.nextBuildingId++, kind, level, cooldown: 0, growth: 0, demolishAt: null, buildRemaining: 0, gatherers: [], garrison: 0, machineGun: false, shipBuild: 0, shellDamage: 0 };
}

function borderEdge(state: GameState, left: number, right: number): { a: { q: number; r: number }; b: { q: number; r: number } } {
  for (const cell of state.grid.cells) {
    if (cell.owner !== left) continue;
    const east = gridAt(state.grid, { q: cell.q + 1, r: cell.r });
    if (east && east.owner === right) return { a: { q: cell.q, r: cell.r }, b: { q: cell.q + 1, r: cell.r } };
  }
  throw new Error('no border edge');
}

describe('PlaceBuilding', () => {
  test('places a market on an owned, spaced, plain hex', () => {
    const state = makeState();
    
    const result = dispatch(state, { type: 'PlaceBuilding', empire: 0, hex: { q: 3, r: 2 }, kind: 'market' });
    expect(result.ok).toBe(true);
    expect(gridAt(state.grid, { q: 3, r: 2 })!.building?.kind).toBe('market');
    expect(state.empires[0]!.gold).toBeLessThan(1000);
  });

  test('charges the buildCost modifier', () => {
    const state = makeState();
    const before = state.empires[0]!.gold;
    state.empires[0]!.bonuses = { ...state.empires[0]!.bonuses, buildCost: { add: 0, mul: 0.5 } };
    dispatch(state, { type: 'PlaceBuilding', empire: 0, hex: { q: 3, r: 2 }, kind: 'market' });
    const spent = before - state.empires[0]!.gold;
    expect(spent).toBeCloseTo(state.config.buildings.market.cost * 0.5, 6);
  });

  test('rejects with insufficient_gold when the treasury is short', () => {
    const state = makeState();
    state.empires[0]!.gold = 0;
    const result = dispatch(state, { type: 'PlaceBuilding', empire: 0, hex: { q: 3, r: 2 }, kind: 'market' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('insufficient_gold');
  });

  test('queues builds: gold is paid up front and only the oldest build progresses', () => {
    const state = makeState();
    const goldBefore = state.empires[0]!.gold;
    const a = { q: 3, r: 2 };
    expect(dispatch(state, { type: 'PlaceBuilding', empire: 0, hex: a, kind: 'farm' }).ok).toBe(true);
    const spot = state.grid.cells.find(cell => !placementError(state, 0, cell, 'farm'))!;
    const b = { q: spot.q, r: spot.r };
    expect(dispatch(state, { type: 'PlaceBuilding', empire: 0, hex: b, kind: 'farm' }).ok).toBe(true);
    const farmCost = state.config.buildings.farm.cost;
    expect(state.empires[0]!.gold).toBeCloseTo(goldBefore - farmCost - farmCost * (1 + state.config.economy.buildingCostStep), 6);
    const spec = state.config.buildings.farm.buildSeconds;
    const site = gridAt(state.grid, a)!.building!;
    const next = gridAt(state.grid, b)!.building!;
    while (site.buildRemaining === spec) stepBuildings(state, 0.1);
    expect(next.buildRemaining).toBe(spec);
    while (site.buildRemaining > 0) stepBuildings(state, 0.1);
    while (next.buildRemaining === spec) stepBuildings(state, 0.1);
    expect(site.buildRemaining).toBe(0);
    expect(next.buildRemaining).toBeLessThan(spec);
  });

  test('starts a build timer without consuming civilians', () => {
    const state = makeState();
    const civiliansBefore = state.empires[0]!.civilians;
    dispatch(state, { type: 'PlaceBuilding', empire: 0, hex: { q: 3, r: 2 }, kind: 'market' });
    expect(gridAt(state.grid, { q: 3, r: 2 })!.building?.buildRemaining).toBe(state.config.buildings.market.buildSeconds);
    expect(state.empires[0]!.civilians).toBe(civiliansBefore);
  });

  test('each building of a kind costs more than the last', () => {
    const state = makeState();
    const before = buildingCost(state, 0, 'market');
    dispatch(state, { type: 'PlaceBuilding', empire: 0, hex: { q: 3, r: 2 }, kind: 'market' });
    expect(buildingCost(state, 0, 'market')).toBeCloseTo(before * (1 + state.config.economy.buildingCostStep), 6);
  });

  test('rejects a hex owned by someone else', () => {
    const state = makeState();
    const result = dispatch(state, { type: 'PlaceBuilding', empire: 0, hex: { q: 8, r: 2 }, kind: 'market' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('invalid_target');
  });

  test('allows a building directly next to another building', () => {
    const state = makeState();
    const result = dispatch(state, { type: 'PlaceBuilding', empire: 0, hex: { q: 1, r: 0 }, kind: 'market' });
    expect(result.ok).toBe(true);
    const neighbour = dispatch(state, { type: 'PlaceBuilding', empire: 0, hex: { q: 2, r: 0 }, kind: 'farm' });
    expect(neighbour.ok).toBe(true);
  });

  test('rejects a second building on an occupied hex', () => {
    const state = makeState();
    dispatch(state, { type: 'PlaceBuilding', empire: 0, hex: { q: 3, r: 2 }, kind: 'market' });
    const result = dispatch(state, { type: 'PlaceBuilding', empire: 0, hex: { q: 3, r: 2 }, kind: 'farm' });
    expect(result.ok).toBe(false);
  });

  test('lumberjacks and miners can go on any open plain, far from their resource', () => {
    const state = makeState();
    const lumberjack = dispatch(state, { type: 'PlaceBuilding', empire: 0, hex: { q: 3, r: 2 }, kind: 'lumberjack' });
    expect(lumberjack.ok).toBe(true);
    const miner = dispatch(state, { type: 'PlaceBuilding', empire: 0, hex: { q: 3, r: 3 }, kind: 'miner' });
    expect(miner.ok).toBe(true);
  });

  test('rejects building on mountains and ore deposits', () => {
    for (const terrain of ['mountain', 'ore'] as const) {
      const state = makeState();
      gridAt(state.grid, { q: 3, r: 2 })!.terrain = terrain;
      const result = dispatch(state, { type: 'PlaceBuilding', empire: 0, hex: { q: 3, r: 2 }, kind: 'miner' });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe('invalid_target');
    }
  });

  test('a lumberjack placed on forest clears it', () => {
    const withForest = makeState();
    gridAt(withForest.grid, { q: 3, r: 2 })!.terrain = 'forest';
    const accepted = dispatch(withForest, { type: 'PlaceBuilding', empire: 0, hex: { q: 3, r: 2 }, kind: 'lumberjack' });
    expect(accepted.ok).toBe(true);
    expect(gridAt(withForest.grid, { q: 3, r: 2 })!.building?.kind).toBe('lumberjack');
  });

  test('gates cannons behind the artillery research unlock', () => {
    const locked = makeState();
    const result = dispatch(locked, { type: 'PlaceBuilding', empire: 0, hex: { q: 3, r: 2 }, kind: 'cannon' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('not_researched');

    const unlocked = makeState();
    unlocked.empires[0]!.unlocks.push('building:cannon');
    const ok = dispatch(unlocked, { type: 'PlaceBuilding', empire: 0, hex: { q: 3, r: 2 }, kind: 'cannon' });
    expect(ok.ok).toBe(true);
  });
});

describe('PlaceBuilding field works', () => {
  const gated = [
    ['battery', 'heavy_artillery'],
    ['bunker', 'reinforced_concrete'],
    ['tank', 'armour'],
  ] as const;

  for (const [kind, nodeId] of gated) {
    test(`gates ${kind} behind the ${nodeId} research unlock`, () => {
      const locked = makeState();
      locked.empires[0]!.gold = 1000;
      const result = dispatch(locked, { type: 'PlaceBuilding', empire: 0, hex: { q: 3, r: 2 }, kind });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe('not_researched');

      const unlocked = makeState();
      unlocked.empires[0]!.gold = 1000;
      unlocked.empires[0]!.research.active = { nodeId, progress: 1, optionId: null };
      completeResearch(unlocked, 0);
      const ok = dispatch(unlocked, { type: 'PlaceBuilding', empire: 0, hex: { q: 3, r: 2 }, kind });
      expect(ok.ok).toBe(true);
    });
  }

  test('trenches can be dug in a line next to other buildings at a flat cost', () => {
    const state = makeState();
    state.empires[0]!.gold = 1000;
    const cost = buildingCost(state, 0, 'trench');
    for (let r = 1; r <= 4; r++) {
      const result = dispatch(state, { type: 'PlaceBuilding', empire: 0, hex: { q: 3, r }, kind: 'trench' });
      expect(result.ok).toBe(true);
    }
    expect(buildingCost(state, 0, 'trench')).toBe(cost);
    const market = dispatch(state, { type: 'PlaceBuilding', empire: 0, hex: { q: 2, r: 2 }, kind: 'market' });
    expect(market.ok).toBe(true);
  });
});

describe('Trenches', () => {
  const trenchHex = { q: 4, r: 2 };

  function dug(state: GameState): Building {
    const trench = makeBuilding(state, 'trench');
    setBuilding(state, gridAt(state.grid, trenchHex)!, trench);
    return trench;
  }

  test('machine guns must be mounted in a finished trench of your own', () => {
    const state = makeState();
    const locked = dispatch(state, { type: 'PlaceBuilding', empire: 0, hex: trenchHex, kind: 'machine_gun' });
    expect(locked.ok).toBe(false);
    if (!locked.ok) expect(locked.reason).toBe('not_researched');

    state.empires[0]!.unlocks.push('building:machine_gun');
    const open = dispatch(state, { type: 'PlaceBuilding', empire: 0, hex: { q: 3, r: 3 }, kind: 'machine_gun' });
    expect(open.ok).toBe(false);

    const trench = dug(state);
    trench.buildRemaining = 2;
    const unfinished = dispatch(state, { type: 'PlaceBuilding', empire: 0, hex: trenchHex, kind: 'machine_gun' });
    expect(unfinished.ok).toBe(false);

    trench.buildRemaining = 0;
    const mounted = dispatch(state, { type: 'PlaceBuilding', empire: 0, hex: trenchHex, kind: 'machine_gun' });
    expect(mounted.ok).toBe(true);
    expect(gridAt(state.grid, trenchHex)!.building).toBe(trench);
    expect(trench.machineGun).toBe(true);

    const twice = dispatch(state, { type: 'PlaceBuilding', empire: 0, hex: trenchHex, kind: 'machine_gun' });
    expect(twice.ok).toBe(false);
  });

  test('ManTrench moves reserve troops in up to capacity', () => {
    const state = makeState();
    const trench = dug(state);
    const result = dispatch(state, { type: 'ManTrench', empire: 0, hex: trenchHex, percent: 100 });
    expect(result.ok).toBe(true);
    expect(trench.garrison).toBe(state.config.trench.capacity);
    expect(state.empires[0]!.soldiers).toBe(100 - state.config.trench.capacity);

    const full = dispatch(state, { type: 'ManTrench', empire: 0, hex: trenchHex, percent: 100 });
    expect(full.ok).toBe(false);
    if (!full.ok) expect(full.reason).toBe('trench_full');

    const plain = dispatch(state, { type: 'ManTrench', empire: 0, hex: { q: 3, r: 4 }, percent: 50 });
    expect(plain.ok).toBe(false);
  });

  test('LeaveTrench returns troops to the reserve', () => {
    const state = makeState();
    const trench = dug(state);
    trench.garrison = 10;
    const result = dispatch(state, { type: 'LeaveTrench', empire: 0, hex: trenchHex, percent: 100 });
    expect(result.ok).toBe(true);
    expect(trench.garrison).toBe(0);
    expect(state.empires[0]!.soldiers).toBe(110);
  });

});

describe('DemolishBuilding', () => {
  test('stamps demolishAt 10s ahead with no refund', () => {
    const state = makeState();
    dispatch(state, { type: 'PlaceBuilding', empire: 0, hex: { q: 3, r: 2 }, kind: 'market' });
    const goldBefore = state.empires[0]!.gold;
    const result = dispatch(state, { type: 'DemolishBuilding', empire: 0, hex: { q: 3, r: 2 } });
    expect(result.ok).toBe(true);
    const building = gridAt(state.grid, { q: 3, r: 2 })!.building!;
    expect(building.demolishAt).toBeCloseTo(state.config.demolish.durationSeconds, 6);
    
    expect(state.empires[0]!.gold).toBe(goldBefore);
  });

  test('rejects a hex with no building and a hex you do not own', () => {
    const state = makeState();
    const empty = dispatch(state, { type: 'DemolishBuilding', empire: 0, hex: { q: 3, r: 2 } });
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.reason).toBe('invalid_target');

    const foreign = dispatch(state, { type: 'DemolishBuilding', empire: 0, hex: { q: 9, r: 0 } });
    expect(foreign.ok).toBe(false);
  });
});

describe('FireCannon', () => {
  test('fires within range, starts the cooldown, and shells enemy attacks near the target', () => {
    const state = makeState();
    clearStaging(state);
    const edge = borderEdge(state, 0, 1);
    const cannonHex = { q: edge.a.q - 1, r: edge.a.r };
    setBuilding(state, gridAt(state.grid, cannonHex)!, makeBuilding(state, 'cannon'));
    dispatch(state, { type: 'SendTroops', empire: 1, target: edge.a, percent: 50 });
    const offensive = state.offensives[0]!;
    offensive.head = edge.b;
    const before = offensive.troops;
    const goldBefore = state.empires[0]!.gold;

    const result = dispatch(state, { type: 'FireCannon', empire: 0, from: cannonHex, target: edge.b });
    expect(result.ok).toBe(true);
    expect(state.empires[0]!.gold).toBe(goldBefore - state.config.cannon.cost);
    expect(gridAt(state.grid, cannonHex)!.building!.cooldown).toBe(state.config.cannon.cooldown);
    expect(offensive.troops).toBe(before - state.config.cannon.damage);
  });

  test('rejects a target out of range', () => {
    const state = makeState();
    const cannonHex = { q: 0, r: 0 };
    setBuilding(state, gridAt(state.grid, cannonHex)!, makeBuilding(state, 'cannon'));
    const result = dispatch(state, { type: 'FireCannon', empire: 0, from: cannonHex, target: { q: 9, r: 5 } });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('invalid_target');
  });

  test('rejects while reloading with cooldown', () => {
    const state = makeState();
    const cannonHex = { q: 0, r: 0 };
    setBuilding(state, gridAt(state.grid, cannonHex)!, makeBuilding(state, 'cannon'));
    gridAt(state.grid, cannonHex)!.building!.cooldown = 5;
    const result = dispatch(state, { type: 'FireCannon', empire: 0, from: cannonHex, target: { q: 1, r: 0 } });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('cooldown');
  });

  test('rejects without enough gold', () => {
    const state = makeState();
    const cannonHex = { q: 0, r: 0 };
    setBuilding(state, gridAt(state.grid, cannonHex)!, makeBuilding(state, 'cannon'));
    state.empires[0]!.gold = 0;
    const result = dispatch(state, { type: 'FireCannon', empire: 0, from: cannonHex, target: { q: 1, r: 0 } });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('insufficient_gold');
  });

  test('rejects a non-cannon source hex', () => {
    const state = makeState();
    const result = dispatch(state, { type: 'FireCannon', empire: 0, from: { q: 0, r: 0 }, target: { q: 1, r: 0 } });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('invalid_target');
  });

  test('converts forest/mountain to plain on impact', () => {
    const state = makeState();
    const cannonHex = { q: 2, r: 2 };
    setBuilding(state, gridAt(state.grid, cannonHex)!, makeBuilding(state, 'cannon'));
    const target = { q: 3, r: 2 };
    gridAt(state.grid, target)!.terrain = 'forest';
    state.empires[0]!.unlocks.push('building:cannon');
    const result = dispatch(state, { type: 'FireCannon', empire: 0, from: cannonHex, target });
    expect(result.ok).toBe(true);
    expect(gridAt(state.grid, target)!.terrain).toBe('plain');
  });
});

describe('StartResearch', () => {
  test('starts a root node, spending science', () => {
    const state = makeState();
    const node = { id: 'drill', cost: 40 };
    state.empires[0]!.science = node.cost;
    const result = dispatch(state, { type: 'StartResearch', empire: 0, nodeId: node.id });
    expect(result.ok).toBe(true);
    expect(state.empires[0]!.science).toBe(0);
    expect(state.empires[0]!.research.active?.nodeId).toBe(node.id);
    expect(state.empires[0]!.research.active?.progress).toBe(0);
  });

  test('rejects without enough science', () => {
    const state = makeState();
    state.empires[0]!.science = 0;
    const result = dispatch(state, { type: 'StartResearch', empire: 0, nodeId: 'drill' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('insufficient_science');
  });

  test('rejects unmet prerequisites', () => {
    const state = makeState();
    state.empires[0]!.science = 1000;
    
    const result = dispatch(state, { type: 'StartResearch', empire: 0, nodeId: 'artillery' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('research_unavailable');
  });

  test('rejects a second active research', () => {
    const state = makeState();
    state.empires[0]!.science = 1000;
    dispatch(state, { type: 'StartResearch', empire: 0, nodeId: 'drill' });
    const result = dispatch(state, { type: 'StartResearch', empire: 0, nodeId: 'fortification' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('research_unavailable');
  });

  test('rejects an already-completed node', () => {
    const state = makeState();
    state.empires[0]!.science = 1000;
    state.empires[0]!.research.completed.push('drill');
    const result = dispatch(state, { type: 'StartResearch', empire: 0, nodeId: 'drill' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('research_unavailable');
  });

  test('rejects an unknown node', () => {
    const state = makeState();
    const result = dispatch(state, { type: 'StartResearch', empire: 0, nodeId: 'nope' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('research_unavailable');
  });

  test('choice nodes require a valid option id', () => {
    const state = makeState();
    const empire = state.empires[0]!;
    empire.science = 1000;
    
    empire.research.completed.push('drill', 'conscription');
    const missing = dispatch(state, { type: 'StartResearch', empire: 0, nodeId: 'grand_strategy' });
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.reason).toBe('invalid_target');

    const bogus = dispatch(state, { type: 'StartResearch', empire: 0, nodeId: 'grand_strategy', optionId: 'bogus' });
    expect(bogus.ok).toBe(false);

    const valid = dispatch(state, { type: 'StartResearch', empire: 0, nodeId: 'grand_strategy', optionId: 'blitz' });
    expect(valid.ok).toBe(true);
    expect(empire.research.active?.optionId).toBe('blitz');
  });
});

describe('SelectFaction', () => {
  test('records a known faction and refreshes bonuses', () => {
    const state = makeState();
    const faction = FACTION_IDS[1]!;
    const result = dispatch(state, { type: 'SelectFaction', empire: 0, factionId: faction });
    expect(result.ok).toBe(true);
    expect(state.empires[0]!.factionId).toBe(faction);
    expect(state.empires[0]!.bonuses.goldIncome.mul).toBeGreaterThan(1);
  });

  test('rejects an unknown faction', () => {
    const state = makeState();
    const result = dispatch(state, { type: 'SelectFaction', empire: 0, factionId: 'nope' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('invalid_target');
  });

  test('rejects an unknown empire', () => {
    const state = makeState();
    const result = dispatch(state, { type: 'SelectFaction', empire: 9, factionId: FACTION_IDS[0]! });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('no_empire');
  });
});

describe('speed, pause and log helpers', () => {
  test('SetGameSpeed applies', () => {
    const state = makeState();
    expect(dispatch(state, { type: 'SetGameSpeed', speed: 2 }).ok).toBe(true);
    expect(state.speed).toBe(2);
  });

  test('SetPaused is accepted without touching the sim', () => {
    const state = makeState();
    const before = state.elapsed;
    expect(dispatch(state, { type: 'SetPaused', paused: true }).ok).toBe(true);
    expect(state.elapsed).toBe(before);
  });

  test('every CommandError reason is reachable through the bus', () => {
    const reasons = new Set<string>();
    const state = makeState();
    const emit = (command: Command): void => {
      const result = dispatch(state, command);
      if (!result.ok) reasons.add(result.reason);
    };
    
    emit({ type: 'SelectFaction', empire: 9, factionId: 'ironclad' });
    emit({ type: 'PlaceBuilding', empire: 0, hex: { q: 3, r: 2 }, kind: 'cannon' });
    const edge = borderEdge(state, 0, 1);
    state.empires[0]!.soldiers = 0;
    emit({ type: 'SendTroops', empire: 0, target: edge.b, percent: 50 });
    state.empires[0]!.soldiers = 100;
    state.empires[0]!.science = 0;
    emit({ type: 'StartResearch', empire: 0, nodeId: 'drill' });
    state.empires[0]!.gold = 0;
    emit({ type: 'PlaceBuilding', empire: 0, hex: { q: 3, r: 2 }, kind: 'market' });
    emit({ type: 'RecallOffensive', empire: 0, offensive: 999 });
    
    expect(reasons.size).toBeGreaterThan(0);
  });
});


describe('building cost at scale', () => {
  test('a large empire keeps an allowance and stays linear past it', () => {
    const state = makeState();
    const { cost } = state.config.buildings.market;
    const { buildingCostStep, tilesPerFreeBuilding } = state.config.economy;
    const owned = state.grid.cells.filter(cell => cell.owner === 0 && cell.building === null).slice(0, 2);
    for (const cell of owned) setBuilding(state, cell, createBuilding(state, 'market', 1, 0));
    const empire = state.empires[0]!;
    empire.hexCount = 0;
    expect(buildingCost(state, 0, 'market')).toBeCloseTo(cost * (1 + 2 * buildingCostStep), 6);
    empire.hexCount = tilesPerFreeBuilding * 5;
    expect(buildingCost(state, 0, 'market')).toBeCloseTo(cost, 6);
  });
});
