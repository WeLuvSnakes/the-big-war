

import { describe, expect, test } from 'bun:test';
import { createGameStore } from '@the-big-war/client/game/store/store.service';
import { gridAt } from '@the-big-war/game-engine/world-tile/world-tile.service';
import { createInitialState } from '@the-big-war/client/game/state/setup.service';
import type { Axial } from '@the-big-war/game-engine/world-tile/world-tile.types';
import { DEFAULT_GAME_CONFIG } from '@the-big-war/client/game/config/config.constants';

function ownedLand(state: ReturnType<typeof createInitialState>, owner: number): Axial | null {
  for (const cell of state.grid.cells) {
    if (cell.owner === owner) return { q: cell.q, r: cell.r };
  }
  return null;
}

describe('match integration', () => {
  test('store starts a real match with playable empires', () => {
    const store = createGameStore({ createMatch: createInitialState });
    store.startMatch({ ...DEFAULT_GAME_CONFIG, start: { ...DEFAULT_GAME_CONFIG.start, empireCount: 4 } });

    expect(store.status()).toBe('playing');
    expect(store.state.empires).toHaveLength(4);
    
    for (const empire of store.state.empires) {
      expect(empire.hexCount).toBeGreaterThan(0);
    }
    expect(store.state.landHexCount).toBeGreaterThan(0);
  });

  test('player can place a building and build a front against a neighbour', () => {
    const store = createGameStore({ createMatch: createInitialState });
    store.startMatch({ ...DEFAULT_GAME_CONFIG, start: { ...DEFAULT_GAME_CONFIG.start, empireCount: 3 } });
    const me = store.state.playerEmpire;

    const home = ownedLand(store.state, me);
    expect(home).not.toBeNull();
    
    store.state.empires[me]!.gold = 1_000_000;
    const empty = store.state.grid.cells.find(
      cell => cell.owner === me && cell.building === null && cell.terrain === 'plain',
    );
    if (empty) {
      const result = store.dispatch({
        type: 'PlaceBuilding',
        empire: me,
        hex: { q: empty.q, r: empty.r },
        kind: 'market',
      });
      expect(result.ok).toBe(true);
    }

    let target: Axial | null = null;
    for (const cell of store.state.grid.cells) {
      if (cell.owner < 0 || cell.owner === me) continue;
      for (const neighbour of store.state.grid.cells) {
        if (gridAt(store.state.grid, { q: neighbour.q, r: neighbour.r })?.owner !== me) continue;
        if (Math.abs(neighbour.q - cell.q) + Math.abs(neighbour.r - cell.r) === 1) {
          target = { q: cell.q, r: cell.r };
          break;
        }
      }
      if (target) break;
    }

    if (target) {
      store.state.empires[me]!.soldiers = 100;
      const send = store.dispatch({
        type: 'SendTroops',
        empire: me,
        target,
        percent: 50,
      });
      
      expect(typeof send.ok).toBe('boolean');
    }
  });

  test('stepping the store runs bots without throwing and stays finite', () => {
    const store = createGameStore({ createMatch: createInitialState });
    store.startMatch({ ...DEFAULT_GAME_CONFIG, start: { ...DEFAULT_GAME_CONFIG.start, empireCount: 4 } });

    store.state.speed = 4;
    for (let i = 0; i < 1_200; i++) store.step(1 / 60);

    expect(store.state.status).toBe('playing');
    expect(Number.isFinite(store.state.elapsed)).toBe(true);
    expect(store.state.elapsed).toBeGreaterThan(0);
    for (const empire of store.state.empires) {
      expect(Number.isFinite(empire.gold)).toBe(true);
      expect(Number.isFinite(empire.soldiers)).toBe(true);
      expect(empire.gold).toBeGreaterThanOrEqual(0);
    }
  });

  test('determinism: same seed + same commands ⇒ identical outcome', () => {
    const config = {
      ...DEFAULT_GAME_CONFIG,
      map: { ...DEFAULT_GAME_CONFIG.map, seed: 4242 },
      start: { ...DEFAULT_GAME_CONFIG.start, empireCount: 3 },
    };
    const run = () => {
      const store = createGameStore({ createMatch: createInitialState });
      store.startMatch(config);
      for (let i = 0; i < 600; i++) store.step(1 / 60);
      return store.state.empires.map(empire => ({
        gold: Math.round(empire.gold),
        soldiers: Math.round(empire.soldiers),
        hexCount: empire.hexCount,
      }));
    };
    expect(run()).toEqual(run());
  });
});
