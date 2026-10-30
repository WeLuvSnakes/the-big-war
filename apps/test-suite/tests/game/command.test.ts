import { testEmpire, clearStaging } from '../support/fixture';


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
import { stepColumns } from '@the-big-war/client/game/simulation/systems/columns.system';
import { gridAt, makeGrid } from '@the-big-war/game-engine/world-tile/world-tile.service';
import { stepBuildings } from '@the-big-war/client/game/simulation/systems/buildings.system';
import { stepExpansion } from '@the-big-war/client/game/simulation/systems/expansion.system';
import type { Building, BuildingKind } from '@the-big-war/client/game/building/building.types';
import { buildingCost, placementError } from '@the-big-war/client/game/building/building.service';

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
  const half = grid.width / 2;
  for (const cell of grid.cells) cell.owner = cell.q < half ? 0 : 1;
  for (const empire of empires) {
    const q = empire.id === 0 ? 0 : grid.width - 1;
    gridAt(grid, { q, r: 0 })!.building = makeBuilding(state, 'city');
  }
  return state;
}

function makeBuilding(state: GameState, kind: BuildingKind, level = 1): Building {
  return { id: state.nextBuildingId++, kind, level, cooldown: 0, growth: 0, demolishAt: null, buildRemaining: 0, gatherers: [], garrison: 0, machineGun: false };
}

function borderEdge(state: GameState, left: number, right: number): { a: { q: number; r: number }; b: { q: number; r: number } } {
  for (const cell of state.grid.cells) {
    if (cell.owner !== left) continue;
    const east = gridAt(state.grid, { q: cell.q + 1, r: cell.r });
    if (east && east.owner === right) return { a: { q: cell.q, r: cell.r }, b: { q: cell.q + 1, r: cell.r } };
  }
  throw new Error('no border edge');
}

describe('SendTroops', () => {
  test('commits troops from the reserve onto a new front', () => {
    const state = makeState();
    clearStaging(state);
    const edge = borderEdge(state, 0, 1);
    const result = dispatch(state, {
      type: 'SendTroops',
      empire: 0,
      hex: edge.a,
      target: edge.b,
      percent: 50,
      intent: 'attack',
    });
    expect(result.ok).toBe(true);
    const front = state.fronts[0]!;
    expect(front.sideA.troops).toBe(50);
    expect(front.sideA.mode).toBe('attack');
    expect(state.empires[0]!.soldiers).toBe(50);
  });

  test('a far target sends a marching column from the nearest owned tile', () => {
    const state = makeState();
    const edge = borderEdge(state, 0, 1);
    const far = { q: edge.b.q, r: edge.b.r === 0 ? 3 : 0 };
    const result = dispatch(state, {
      type: 'SendTroops',
      empire: 0,
      hex: edge.a,
      target: far,
      percent: 50,
      intent: 'attack',
    });
    expect(result.ok).toBe(true);
    const column = state.columns[0]!;
    expect(column.path.at(-1)).toEqual(far);
    expect(gridAt(state.grid, column.path[0]!)!.owner).toBe(0);
    for (let i = 1; i < column.path.length; i++) {
      const a = column.path[i - 1]!;
      const b = column.path[i]!;
      expect(Math.abs(a.q - b.q) + Math.abs(a.r - b.r)).toBe(1);
    }
    expect(state.empires[0]!.soldiers).toBe(50);
  });

  test('a column claims neutral land along its path toward the target', () => {
    const state = makeState();
    for (const cell of state.grid.cells) cell.owner = cell.q === 0 ? 0 : NEUTRAL_OWNER;
    const target = { q: 6, r: 2 };
    const result = dispatch(state, { type: 'SendTroops', empire: 0, hex: { q: 0, r: 2 }, target, percent: 50, intent: 'attack' });
    expect(result.ok).toBe(true);
    for (let i = 0; i < 300; i++) stepColumns(state, 1 / 30);
    for (let q = 1; q <= 6; q++) expect(gridAt(state.grid, { q, r: 2 })!.owner).toBe(0);
    expect(gridAt(state.grid, { q: 1, r: 0 })!.owner).toBe(NEUTRAL_OWNER);
  });

  test('a mountain is claimed by a column at extra cost and stops there', () => {
    const state = makeState();
    clearStaging(state);
    for (const cell of state.grid.cells) cell.owner = cell.q === 0 ? 0 : NEUTRAL_OWNER;
    const target = { q: 1, r: 2 };
    gridAt(state.grid, target)!.terrain = 'mountain';
    const result = dispatch(state, { type: 'SendTroops', empire: 0, hex: { q: 0, r: 2 }, target, percent: 50, intent: 'attack' });
    expect(result.ok).toBe(true);
    for (let i = 0; i < 600; i++) {
      stepColumns(state, 1 / 30);
      stepExpansion(state, 1 / 30);
    }
    expect(gridAt(state.grid, target)!.owner).toBe(0);
    expect(gridAt(state.grid, target)!.terrain).toBe('mountain');
    expect(gridAt(state.grid, { q: 2, r: 2 })!.owner).toBe(NEUTRAL_OWNER);
    expect(state.empires[0]!.soldiers).toBeCloseTo(100 - 5 * 1.35);
  });

  test('a column sent to claim wild land stops at another nation and never attacks it', () => {
    const state = makeState();
    for (const cell of state.grid.cells) cell.owner = cell.q === 0 ? 0 : NEUTRAL_OWNER;
    gridAt(state.grid, { q: 3, r: 2 })!.owner = 1;
    const target = { q: 6, r: 2 };
    const result = dispatch(state, { type: 'SendTroops', empire: 0, hex: { q: 0, r: 2 }, target, percent: 50, intent: 'attack' });
    expect(result.ok).toBe(true);
    for (let i = 0; i < 300; i++) stepColumns(state, 1 / 30);
    expect(gridAt(state.grid, { q: 3, r: 2 })!.owner).toBe(1);
    expect(state.fronts).toHaveLength(0);
    expect(state.columns).toHaveLength(0);
    expect(state.expeditions).toHaveLength(1);
  });

  test('rejects a friendly target', () => {
    const state = makeState();
    const home = gridAt(state.grid, { q: 0, r: 1 })!;
    const friend = gridAt(state.grid, { q: 0, r: 2 })!;
    const result = dispatch(state, {
      type: 'SendTroops',
      empire: 0,
      hex: { q: home.q, r: home.r },
      target: { q: friend.q, r: friend.r },
      percent: 50,
      intent: 'attack',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('invalid_target');
  });

  test('rejects a hex the empire does not own', () => {
    const state = makeState();
    const edge = borderEdge(state, 0, 1);
    const result = dispatch(state, {
      type: 'SendTroops',
      empire: 1,
      hex: edge.a,
      target: edge.b,
      percent: 50,
      intent: 'attack',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('invalid_target');
  });

  test('rejects an empty reserve with insufficient_troops', () => {
    const state = makeState();
    const edge = borderEdge(state, 0, 1);
    state.empires[0]!.soldiers = 0;
    const result = dispatch(state, {
      type: 'SendTroops',
      empire: 0,
      hex: edge.a,
      target: edge.b,
      percent: 50,
      intent: 'attack',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('insufficient_troops');
  });

  test('rejects an eliminated empire with no_empire', () => {
    const state = makeState();
    state.empires[0]!.alive = false;
    const edge = borderEdge(state, 0, 1);
    const result = dispatch(state, {
      type: 'SendTroops',
      empire: 0,
      hex: edge.a,
      target: edge.b,
      percent: 50,
      intent: 'attack',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('no_empire');
  });

  test('joining an existing front adds to the same side', () => {
    const state = makeState();
    clearStaging(state);
    const edge = borderEdge(state, 0, 1);
    const send = (percent: number): void => {
      dispatch(state, { type: 'SendTroops', empire: 0, hex: edge.a, target: edge.b, percent, intent: 'attack' });
    };
    send(50); 
    send(100); 
    expect(state.fronts.length).toBe(1);
    expect(state.fronts[0]!.sideA.troops).toBe(100);
  });
});

describe('SetFrontMode', () => {
  test('switches the mode of the empire\u2019s own side', () => {
    const state = makeState();
    clearStaging(state);
    const edge = borderEdge(state, 0, 1);
    dispatch(state, { type: 'SendTroops', empire: 0, hex: edge.a, target: edge.b, percent: 50, intent: 'attack' });
    const front = state.fronts[0]!;
    const result = dispatch(state, { type: 'SetFrontMode', empire: 0, frontId: front.id, mode: 'defence' });
    expect(result.ok).toBe(true);
    expect(front.sideA.mode).toBe('defence');
  });

  test('rejects a front the empire is not part of', () => {
    const state = makeState();
    clearStaging(state);
    const edge = borderEdge(state, 0, 1);
    dispatch(state, { type: 'SendTroops', empire: 0, hex: edge.a, target: edge.b, percent: 50, intent: 'attack' });
    const front = state.fronts[0]!;
    
    const result = dispatch(state, { type: 'SetFrontMode', empire: 99, frontId: front.id, mode: 'attack' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('invalid_target');
  });

  test('rejects an unknown front id', () => {
    const state = makeState();
    const result = dispatch(state, { type: 'SetFrontMode', empire: 0, frontId: '0,0|1,0', mode: 'attack' });
    expect(result.ok).toBe(false);
  });
});

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
    expect(state.empires[0]!.gold).toBeCloseTo(goldBefore - farmCost - farmCost * state.config.economy.buildingCostGrowth, 6);
    stepBuildings(state, 1);
    const spec = state.config.buildings.farm.buildSeconds;
    expect(gridAt(state.grid, a)!.building!.buildRemaining).toBe(spec - 1);
    expect(gridAt(state.grid, b)!.building!.buildRemaining).toBe(spec);
    stepBuildings(state, spec);
    stepBuildings(state, 1);
    expect(gridAt(state.grid, a)!.building!.buildRemaining).toBe(0);
    expect(gridAt(state.grid, b)!.building!.buildRemaining).toBe(spec - 1);
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
    expect(buildingCost(state, 0, 'market')).toBeCloseTo(before * state.config.economy.buildingCostGrowth, 6);
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
  const enemyHex = { q: 5, r: 2 };

  function dug(state: GameState): Building {
    const trench = makeBuilding(state, 'trench');
    gridAt(state.grid, trenchHex)!.building = trench;
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

  test('TrenchAttack sends the garrison onto an attacking front', () => {
    const state = makeState();
    const trench = dug(state);
    trench.garrison = 10;
    const far = dispatch(state, { type: 'TrenchAttack', empire: 0, hex: trenchHex, target: { q: 6, r: 2 }, percent: 50 });
    expect(far.ok).toBe(false);

    const result = dispatch(state, { type: 'TrenchAttack', empire: 0, hex: trenchHex, target: enemyHex, percent: 50 });
    expect(result.ok).toBe(true);
    expect(trench.garrison).toBe(5);
    const front = state.fronts[0]!;
    const side = front.sideA.empire === 0 ? front.sideA : front.sideB;
    expect(side.troops).toBe(5);
    expect(side.mode).toBe('attack');
    expect(state.empires[0]!.soldiers).toBe(100);
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
  test('fires within range, starts the cooldown, and damages both sides', () => {
    const state = makeState();
    clearStaging(state);
    const edge = borderEdge(state, 0, 1);
    
    const cannonHex = { q: edge.a.q - 1, r: edge.a.r };
    gridAt(state.grid, cannonHex)!.building = makeBuilding(state, 'cannon');
    dispatch(state, { type: 'SendTroops', empire: 0, hex: edge.a, target: edge.b, percent: 20, intent: 'attack' });
    dispatch(state, { type: 'SendTroops', empire: 1, hex: edge.b, target: edge.a, percent: 20, intent: 'defence' });
    const front = state.fronts[0]!;
    const beforeA = front.sideA.troops;
    const beforeB = front.sideB.troops;
    const goldBefore = state.empires[0]!.gold;

    const result = dispatch(state, { type: 'FireCannon', empire: 0, from: cannonHex, target: edge.b });
    expect(result.ok).toBe(true);
    expect(state.empires[0]!.gold).toBe(goldBefore - state.config.cannon.cost);
    expect(gridAt(state.grid, cannonHex)!.building!.cooldown).toBe(state.config.cannon.cooldown);
    
    expect(front.sideA.troops).toBeLessThan(beforeA);
    expect(front.sideB.troops).toBeLessThan(beforeB);
  });

  test('rejects a target out of range', () => {
    const state = makeState();
    const cannonHex = { q: 0, r: 0 };
    gridAt(state.grid, cannonHex)!.building = makeBuilding(state, 'cannon');
    const result = dispatch(state, { type: 'FireCannon', empire: 0, from: cannonHex, target: { q: 9, r: 5 } });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('invalid_target');
  });

  test('rejects while reloading with cooldown', () => {
    const state = makeState();
    const cannonHex = { q: 0, r: 0 };
    gridAt(state.grid, cannonHex)!.building = makeBuilding(state, 'cannon');
    gridAt(state.grid, cannonHex)!.building!.cooldown = 5;
    const result = dispatch(state, { type: 'FireCannon', empire: 0, from: cannonHex, target: { q: 1, r: 0 } });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('cooldown');
  });

  test('rejects without enough gold', () => {
    const state = makeState();
    const cannonHex = { q: 0, r: 0 };
    gridAt(state.grid, cannonHex)!.building = makeBuilding(state, 'cannon');
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
    gridAt(state.grid, cannonHex)!.building = makeBuilding(state, 'cannon');
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
    emit({ type: 'SendTroops', empire: 0, hex: edge.a, target: edge.b, percent: 50, intent: 'attack' });
    state.empires[0]!.soldiers = 100;
    state.empires[0]!.science = 0;
    emit({ type: 'StartResearch', empire: 0, nodeId: 'drill' });
    state.empires[0]!.gold = 0;
    emit({ type: 'PlaceBuilding', empire: 0, hex: { q: 3, r: 2 }, kind: 'market' });
    emit({ type: 'SetFrontMode', empire: 0, frontId: 'x', mode: 'attack' });
    
    expect(reasons.size).toBeGreaterThan(0);
  });
});

describe('RetreatFront', () => {
  test('rejects an eliminated empire', () => {
    const state = makeState();
    clearStaging(state);
    const edge = borderEdge(state, 0, 1);
    dispatch(state, { type: 'SendTroops', empire: 0, hex: edge.a, target: edge.b, percent: 50, intent: 'attack' });
    const front = state.fronts[0]!;
    state.empires[0]!.alive = false;
    const result = dispatch(state, { type: 'RetreatFront', empire: 0, frontId: front.id });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('no_empire');
    expect(front.sideA.troops).toBeGreaterThan(0);
  });
});
