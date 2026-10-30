import { describe, expect, test } from 'bun:test';
import { foreignTarget } from '../support/mirror-fixture';
import type { GameState } from '@the-big-war/client/game/state/state.types';
import { createInProcessSim } from '@the-big-war/client/game/sim/sim-host.service';
import { FIXED_DT } from '@the-big-war/game-engine/simulation/simulation.constants';
import { DEFAULT_GAME_CONFIG } from '@the-big-war/client/game/config/config.constants';

function view(state: GameState): unknown {
  return {
    status: state.status,
    tick: state.tick,
    elapsed: state.elapsed,
    speed: state.speed,
    winner: state.winner,
    playerEmpire: state.playerEmpire,
    landHexCount: state.landHexCount,
    cells: state.grid.cells,
    empires: state.empires,
    offensives: state.offensives.map(({ frontier: _f, queued: _q, ...rest }) => rest),
    ships: state.ships,
    relations: state.relations,
    offerCooldowns: state.offerCooldowns,
    pendingOffers: state.pendingOffers,
    buildings: state.index.buildings,
    population: [...state.index.population].sort((a, b) => a[0] - b[0]),
    tiles: [...state.index.tiles].map(([id, set]) => [id, [...set].sort((a, b) => a - b)]).sort((a, b) => Number(a[0]) - Number(b[0])),
    owned: [...state.index.empireBuildings].filter(entry => entry[1].length > 0).sort((a, b) => a[0] - b[0]),
  };
}

describe('sim mirror', () => {
  test('a seeded match mirror equals the sim through commands, pause, speed and restart', async () => {
    const { host, store } = createInProcessSim();
    const config = {
      ...DEFAULT_GAME_CONFIG,
      map: { ...DEFAULT_GAME_CONFIG.map, width: 120, height: 72, seed: 1914 },
      start: { ...DEFAULT_GAME_CONFIG.start, empireCount: 5 },
    };
    await store.startMatch(config);
    expect(view(store.state)).toEqual(view(host.state));

    store.setSpeed(4);
    for (let round = 0; round < 40; round++) {
      for (let tick = 0; tick < 30; tick++) {
        host.advance(FIXED_DT);
        host.publish();
      }
      expect(view(store.state)).toEqual(view(host.state));
      if (round % 8 === 0) {
        const target = foreignTarget(store.state);
        if (target) await store.dispatch({ type: 'SendTroops', empire: store.state.playerEmpire, target, percent: 60 });
      }
    }
    expect(store.state.index.buildings.length).toBeGreaterThan(0);

    store.setPaused(true);
    expect(store.paused()).toBe(true);
    const frozen = store.state.tick;
    host.advance(1);
    host.publish();
    expect(store.state.tick).toBe(frozen);
    store.setPaused(false);

    const bad = await store.dispatch({ type: 'SendTroops', empire: 99, target: { q: 0, r: 0 }, percent: 50 });
    expect(bad.ok).toBe(false);

    const previous = store.state;
    await store.startMatch({ ...config, map: { ...config.map, seed: 7 } });
    expect(store.state).not.toBe(previous);
    expect(view(store.state)).toEqual(view(host.state));
  });
});

describe('match identity', () => {
  test('a command posted for the last match cannot land on the new one', async () => {
    const { host, store } = createInProcessSim();
    await store.startMatch();
    const stale = { type: 'command' as const, seq: 9000, match: 0, command: { type: 'SendTroops' as const, empire: 0, target: { q: 0, r: 0 }, percent: 100 } };
    const soldiers = host.state.empires[0]!.soldiers;
    host.handle(stale);
    expect(host.state.empires[0]!.soldiers).toBe(soldiers);
    expect(host.state.offensives).toHaveLength(0);
  });
});
