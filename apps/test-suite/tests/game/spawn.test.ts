import { describe, expect, test } from 'bun:test';
import { dispatch } from '@the-big-war/client/game/commands/commands.service';
import { step } from '@the-big-war/client/game/simulation/simulation.service';
import { createInitialState } from '@the-big-war/client/game/state/setup.service';
import { DEFAULT_GAME_CONFIG } from '@the-big-war/client/game/config/config.constants';

const fresh = () => createInitialState(DEFAULT_GAME_CONFIG);

describe('ChooseSpawn', () => {
  test('moves the capital to open land and clears the old plot', () => {
    const state = fresh();
    const old = state.grid.cells.find(cell => cell.building?.kind === 'city' && cell.owner === 0)!;
    const target = state.grid.cells.find(cell => {
      const result = dispatch(state, { type: 'ChooseSpawn', empire: 0, target: { q: cell.q, r: cell.r } });
      return result.ok && (cell.q !== old.q || cell.r !== old.r);
    })!;
    expect(target.owner).toBe(0);
    expect(target.building?.kind).toBe('city');
    expect(state.grid.cells.filter(cell => cell.owner === 0 && cell.building?.kind === 'city' && cell.building).length).toBe(1);
  });

  test('refuses water and rival land, and refuses once the match has run', () => {
    const state = fresh();
    const water = state.grid.cells.find(cell => cell.terrain === 'water')!;
    const rival = state.grid.cells.find(cell => cell.owner === 1)!;
    expect(dispatch(state, { type: 'ChooseSpawn', empire: 0, target: water }).ok).toBe(false);
    expect(dispatch(state, { type: 'ChooseSpawn', empire: 0, target: rival }).ok).toBe(false);
    state.elapsed = 1;
    const land = state.grid.cells.find(cell => cell.terrain === 'plain' && cell.owner < 0)!;
    expect(dispatch(state, { type: 'ChooseSpawn', empire: 0, target: land }).ok).toBe(false);
  });
});

describe('spawn phase', () => {
  const picking = () => createInitialState({ ...DEFAULT_GAME_CONFIG, start: { ...DEFAULT_GAME_CONFIG.start, pickSpawns: true } });
  const owned = (state: ReturnType<typeof fresh>, empire: number) => state.grid.cells.filter(cell => cell.owner === empire).length;

  test('nobody owns land until the spawn is confirmed', () => {
    const state = picking();
    expect(state.grid.cells.every(cell => cell.owner < 0 && !cell.building)).toBe(true);
    expect(state.spawnSites.filter(Boolean).length).toBeGreaterThan(1);
    step(state, 5);
    expect(state.elapsed).toBe(0);
    expect(state.empires.every(empire => empire.alive)).toBe(true);

    expect(dispatch(state, { type: 'ConfirmSpawn' }).ok).toBe(true);
    expect(state.spawnSites).toEqual([]);
    expect(owned(state, 0)).toBeGreaterThan(0);
    expect(owned(state, 1)).toBeGreaterThan(0);
    expect(dispatch(state, { type: 'ConfirmSpawn' }).ok).toBe(false);
  });

  test('the player claims the clicked plot and cannot overlap a rival', () => {
    const state = picking();
    const rival = state.spawnSites[1]!;
    expect(dispatch(state, { type: 'ChooseSpawn', empire: 0, target: rival }).ok).toBe(false);
    const target = state.grid.cells.find(cell => dispatch(state, { type: 'ChooseSpawn', empire: 0, target: { q: cell.q, r: cell.r } }).ok)!;
    expect(state.grid.cells.every(cell => cell.owner < 0)).toBe(true);
    dispatch(state, { type: 'ConfirmSpawn' });
    expect(target.owner).toBe(0);
    expect(target.building?.kind).toBe('city');
  });
});
