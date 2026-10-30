import { describe, expect, test } from 'bun:test';
import type { GameState } from '@the-big-war/client/game/state/state.types';
import { createGameStore } from '@the-big-war/client/game/store/store.service';
import { NEUTRAL_OWNER } from '@the-big-war/client/game/empire/empire.constants';
import { FIXED_DT } from '@the-big-war/game-engine/simulation/simulation.constants';
import { DEFAULT_GAME_CONFIG } from '@the-big-war/client/game/config/config.constants';
import { createWorldIndex, setBuilding, setOwner, ownedCells } from '@the-big-war/client/game/map/world-index.service';

function expectIndexMatchesGrid(state: GameState): void {
  const rebuilt = createWorldIndex(state.grid);
  expect(state.index.buildings).toEqual(rebuilt.buildings);
  for (const empire of state.empires) {
    expect([...(state.index.tiles.get(empire.id) ?? [])].sort((a, b) => a - b)).toEqual(
      [...(rebuilt.tiles.get(empire.id) ?? [])].sort((a, b) => a - b),
    );
    expect(state.index.empireBuildings.get(empire.id) ?? []).toEqual(rebuilt.empireBuildings.get(empire.id) ?? []);
    expect(ownedCells(state, empire.id)).toEqual(state.grid.cells.filter(cell => cell.owner === empire.id));
  }
}

describe('world index', () => {
  test('matches a full rescan throughout a seeded bot match', () => {
    const config = { ...DEFAULT_GAME_CONFIG, start: { ...DEFAULT_GAME_CONFIG.start, empireCount: 6 } };
    const store = createGameStore({ config });
    store.startMatch(config);
    const first = store.state.grid.cells.filter(cell => cell.owner >= 0).length;

    for (let tick = 0; tick < 9000; tick++) {
      store.step(FIXED_DT);
      if (tick % 300 === 0) expectIndexMatchesGrid(store.state);
    }

    expectIndexMatchesGrid(store.state);
    expect(store.state.grid.cells.filter(cell => cell.owner >= 0).length).toBeGreaterThan(first);
    expect(store.state.index.buildings.length).toBeGreaterThan(config.start.empireCount);
  });

  test('moves a building between empires when its tile changes hands', () => {
    const store = createGameStore();
    store.startMatch();
    const { state } = store;
    const capital = state.grid.cells.find(cell => cell.owner === 0 && cell.building)!;
    const before = state.index.buildings.length;

    setOwner(state, capital, 1);
    expect(state.index.buildings).toHaveLength(before);
    expectIndexMatchesGrid(state);

    setOwner(state, capital, NEUTRAL_OWNER);
    expectIndexMatchesGrid(state);

    setBuilding(state, capital, null);
    expect(state.index.buildings).toHaveLength(before - 1);
    expectIndexMatchesGrid(state);
  });
});
