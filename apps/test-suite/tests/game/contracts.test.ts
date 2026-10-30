

import { describe, expect, test } from 'bun:test';
import { dispatch } from '@the-big-war/client/game/commands/commands.service';
import { FACTIONS } from '@the-big-war/client/game/faction/faction.constants';
import { step } from '@the-big-war/client/game/simulation/simulation.service';
import { createGameStore } from '@the-big-war/client/game/store/store.service';
import { gridAt } from '@the-big-war/game-engine/world-tile/world-tile.service';
import { createDevState } from '@the-big-war/client/game/state/devstate.service';
import { NEUTRAL_OWNER } from '@the-big-war/client/game/empire/empire.constants';
import { RESEARCH_NODES } from '@the-big-war/client/game/research/research.constants';
import { DEFAULT_GAME_CONFIG } from '@the-big-war/client/game/config/config.constants';
import { MAX_GAME_SECONDS_PER_STEP } from '@the-big-war/game-engine/store/store.constants';

describe('devstate', () => {
  test('fabricates a plausible, renderable map', () => {
    const state = createDevState();
    expect(state.grid.cells.length).toBe(state.config.map.width * state.config.map.height);
    expect(state.empires.length).toBe(state.config.start.empireCount);
    expect(state.status).toBe('playing');
    expect(state.landHexCount).toBeGreaterThan(0);
    expect(state.landHexCount).toBe(state.grid.cells.filter(cell => cell.terrain !== 'water').length);

    const owned = state.grid.cells.filter(cell => cell.owner !== NEUTRAL_OWNER);
    expect(owned.length).toBeGreaterThan(0);
    
    for (const empire of state.empires) {
      expect(empire.hexCount).toBeGreaterThan(0);
      expect(state.grid.cells.some(cell => cell.owner === empire.id && cell.building?.kind === 'city')).toBe(true);
    }
    
    const city = state.grid.cells.find(cell => cell.building?.kind === 'city')!.building!;
    expect(city.level).toBeGreaterThanOrEqual(1);
    expect(city.demolishAt).toBeNull();
    expect(typeof city.cooldown).toBe('number');
  });

  test('is deterministic for a given seed', () => {
    const a = createDevState();
    const b = createDevState();
    const ownersOf = (s: ReturnType<typeof createDevState>) => s.grid.cells.map(c => c.owner).join(',');
    expect(ownersOf(a)).toBe(ownersOf(b));
  });
});

describe('command bus contract', () => {
  test('SetGameSpeed applies and SelectFaction records the faction', () => {
    const state = createDevState();
    expect(dispatch(state, { type: 'SetGameSpeed', speed: 4 }).ok).toBe(true);
    expect(state.speed).toBe(4);
    const result = dispatch(state, { type: 'SelectFaction', empire: 1, factionId: FACTIONS[2]!.id });
    expect(result.ok).toBe(true);
    expect(state.empires[1]!.factionId).toBe(FACTIONS[2]!.id);
  });

  test('SendTroops reports insufficient_troops for an empty reserve', () => {
    const state = createDevState();
    const empire = state.empires[0]!;
    const foreign = state.grid.cells.find(c => c.owner !== empire.id && c.owner !== NEUTRAL_OWNER);
    if (!foreign) return;
    empire.soldiers = 0;
    const result = dispatch(state, {
      type: 'SendTroops',
      empire: 0,
      target: foreign,
      percent: 50,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('insufficient_troops');
  });

  test('StartResearch rejects without science and accepts with enough', () => {
    const state = createDevState();
    const empire = state.empires[0]!;
    const node = RESEARCH_NODES.find(n => n.requires.length === 0)!;
    empire.science = 0;
    expect(dispatch(state, { type: 'StartResearch', empire: 0, nodeId: node.id }).ok).toBe(false);
    empire.science = node.cost;
    expect(dispatch(state, { type: 'StartResearch', empire: 0, nodeId: node.id }).ok).toBe(true);
  });
});

describe('engine + store', () => {
  test('step advances elapsed by dt and is skipped outside playing', () => {
    const state = createDevState();
    step(state, 1 / 30);
    expect(state.tick).toBe(1);
    expect(state.elapsed).toBeCloseTo(1 / 30, 6);
    state.status = 'menu';
    step(state, 1 / 30);
    expect(state.tick).toBe(1);
  });

  test('store multiplies real time by game speed', () => {
    const store = createGameStore();
    store.startMatch();
    const startElapsed = store.state.elapsed;
    store.setSpeed(4);

    for (let i = 0; i < 15; i++) store.step(1 / 60);
    expect(store.state.elapsed - startElapsed).toBeCloseTo(1, 2);
    expect(store.state.tick).toBe(30);
  });

  test('per-step clamp stops a stalled tab simulating minutes at once', () => {
    const store = createGameStore();
    store.startMatch();
    store.setSpeed(4);

    store.step(10);
    expect(store.state.elapsed).toBeLessThanOrEqual(MAX_GAME_SECONDS_PER_STEP + 1e-9);
    expect(store.state.elapsed).toBeGreaterThan(0);
  });

  test('paused store does not advance', () => {
    const store = createGameStore();
    store.startMatch();
    store.setPaused(true);
    const before = store.state.elapsed;
    store.step(1);
    expect(store.state.elapsed).toBe(before);
  });

  test('version signal bumps on dispatch and step', () => {
    const store = createGameStore();
    store.startMatch();
    const v0 = store.version();
    store.dispatch({ type: 'SetGameSpeed', speed: 2 });
    expect(store.version()).toBeGreaterThan(v0);
    const v1 = store.version();
    store.step(1 / 60);
    expect(store.version()).toBeGreaterThan(v1);
  });

  test('returnToMenu yields a menu-phase state', () => {
    const store = createGameStore();
    store.startMatch();
    expect(store.status()).toBe('playing');
    store.returnToMenu();
    expect(store.status()).toBe('menu');
  });
});

describe('config sanity', () => {
  test('faction bonuses only use known modifier behaviour', () => {
    expect(FACTIONS.length).toBe(4);
    for (const faction of FACTIONS) {
      expect(faction.bonuses.length).toBeGreaterThan(0);
      for (const mod of faction.bonuses) {
        expect(mod.add !== undefined || mod.mul !== undefined).toBe(true);
      }
    }
  });

  test('research tree references only existing nodes and covers three branches', () => {
    const ids = new Set(RESEARCH_NODES.map(n => n.id));
    const branches = new Set<string>();
    for (const node of RESEARCH_NODES) {
      branches.add(node.branch);
      for (const req of node.requires) expect(ids.has(req)).toBe(true);
      if (node.kind === 'choice') expect((node.options?.length ?? 0)).toBeGreaterThan(1);
    }
    expect(branches.size).toBe(3);
    expect(RESEARCH_NODES.length).toBeGreaterThanOrEqual(10);
  });

  test('default config matches the v1 brief', () => {
    expect(DEFAULT_GAME_CONFIG.cannon.cost).toBe(100);
    expect(DEFAULT_GAME_CONFIG.cannon.cooldown).toBe(30);
    expect(DEFAULT_GAME_CONFIG.demolish.durationSeconds).toBe(10);
    expect(DEFAULT_GAME_CONFIG.diplomacy.treatySeconds).toBe(60);
    expect(gridAt(createDevState().grid, { q: 0, r: 0 })).toBeDefined();
  });
});
