import { testEmpire } from '../support/fixture';
import { describe, expect, test } from 'bun:test';
import type { HexCell } from '@the-big-war/client/game/map/map.types';
import type { UnitKind } from '@the-big-war/client/game/unit/unit.types';
import { UNIT_STATS } from '@the-big-war/client/game/unit/unit.constants';
import type { GameState } from '@the-big-war/client/game/state/state.types';
import { dispatch } from '@the-big-war/client/game/commands/commands.service';
import { createBaseState } from '@the-big-war/client/game/state/state.service';
import { NEUTRAL_OWNER } from '@the-big-war/client/game/empire/empire.constants';
import { declareWar } from '@the-big-war/client/game/diplomacy/diplomacy.service';
import { createBuilding } from '@the-big-war/client/game/building/building.service';
import { stepUnits } from '@the-big-war/client/game/simulation/systems/units.system';
import { DEFAULT_GAME_CONFIG } from '@the-big-war/client/game/config/config.constants';
import { setBuilding, setOwner } from '@the-big-war/client/game/map/world-index.service';
import { gridAt, makeGrid } from '@the-big-war/game-engine/world-tile/world-tile.service';
import { createUnit, formationSlot, orderGroup, populationCap, weaponDamage } from '@the-big-war/client/game/unit/unit.service';

const WIDTH = 30;
const HEIGHT = 12;
const SIZE = DEFAULT_GAME_CONFIG.map.hexSize;

function fieldState(): GameState {
  const grid = makeGrid<HexCell>(WIDTH, HEIGHT, hex => ({
    q: hex.q,
    r: hex.r,
    terrain: 'plain',
    biome: 'temperate',
    owner: NEUTRAL_OWNER,
    building: null,
  }));
  const config = { ...DEFAULT_GAME_CONFIG, map: { ...DEFAULT_GAME_CONFIG.map, width: WIDTH, height: HEIGHT } };
  const state = createBaseState(config, grid, [testEmpire({ id: 0 }), testEmpire({ id: 1 })]);
  for (const cell of grid.cells) setOwner(state, cell, cell.q < WIDTH / 2 ? 0 : 1);
  return state;
}

function producer(state: GameState, q: number, r: number, kind: 'barracks' | 'factory'): void {
  setBuilding(state, gridAt(state.grid, { q, r })!, createBuilding(state, kind, 1, 0));
}

function spawn(state: GameState, kind: UnitKind, empire: number, q: number, r: number) {
  const unit = createUnit(state, kind, empire, (q + 0.5) * SIZE, (r + 0.5) * SIZE);
  state.units.push(unit);
  return unit;
}

function run(state: GameState, seconds: number): void {
  for (let t = 0; t < seconds; t += 0.1) stepUnits(state, 0.1);
}

describe('unit production', () => {
  test('barracks train infantry types and factories train vehicles', () => {
    const state = fieldState();
    producer(state, 2, 2, 'barracks');
    producer(state, 4, 2, 'factory');
    const gold = state.empires[0]!.gold;
    expect(dispatch(state, { type: 'TrainUnit', empire: 0, hex: { q: 2, r: 2 }, kind: 'sniper' }).ok).toBe(true);
    expect(dispatch(state, { type: 'TrainUnit', empire: 0, hex: { q: 4, r: 2 }, kind: 'tank' }).ok).toBe(true);
    expect(dispatch(state, { type: 'TrainUnit', empire: 0, hex: { q: 2, r: 2 }, kind: 'tank' }).ok).toBe(false);
    expect(dispatch(state, { type: 'TrainUnit', empire: 0, hex: { q: 4, r: 2 }, kind: 'infantry' }).ok).toBe(false);
    expect(state.empires[0]!.gold).toBe(gold - UNIT_STATS.sniper.gold - UNIT_STATS.tank.gold);
    run(state, UNIT_STATS.tank.trainSeconds + 0.5);
    expect(state.units.map(unit => unit.kind).sort()).toEqual(['sniper', 'tank']);
  });

  test('cancelling refunds the last queued unit', () => {
    const state = fieldState();
    producer(state, 2, 2, 'barracks');
    const gold = state.empires[0]!.gold;
    dispatch(state, { type: 'TrainUnit', empire: 0, hex: { q: 2, r: 2 }, kind: 'mg' });
    expect(dispatch(state, { type: 'CancelUnit', empire: 0, hex: { q: 2, r: 2 } }).ok).toBe(true);
    expect(state.empires[0]!.gold).toBe(gold);
  });

  test('the unit limit grows with barracks and factories', () => {
    const state = fieldState();
    const base = populationCap(state, 0);
    producer(state, 2, 2, 'barracks');
    producer(state, 4, 2, 'factory');
    expect(populationCap(state, 0)).toBeGreaterThan(base);
    state.empires[0]!.gold = 1e6;
    let refused = false;
    for (let i = 0; i < 40 && !refused; i++) {
      const result = dispatch(state, { type: 'TrainUnit', empire: 0, hex: { q: 4, r: 2 }, kind: 'tank' });
      refused = !result.ok;
    }
    expect(refused).toBe(true);
  });
});

describe('unit combat', () => {
  test('armour shrugs off rifles but not tank guns', () => {
    expect(weaponDamage(UNIT_STATS.tank, UNIT_STATS.infantry.weapon.penetration, 100)).toBeCloseTo(20);
    expect(weaponDamage(UNIT_STATS.tank, UNIT_STATS.tank.weapon.penetration, 100)).toBe(100);
    expect(weaponDamage(UNIT_STATS.infantry, 0, 100)).toBe(100);
  });

  test('units at war fight until one side is gone', () => {
    const state = fieldState();
    declareWar(state, 0, 1);
    for (let i = 0; i < 4; i++) spawn(state, 'infantry', 0, 12, 3 + i);
    spawn(state, 'tank', 0, 11, 5);
    for (let i = 0; i < 4; i++) spawn(state, 'infantry', 1, 16, 3 + i);
    run(state, 90);
    expect(state.units.some(unit => unit.empire === 1)).toBe(false);
    expect(state.unitEvents.some(event => event.kind === 'shot')).toBe(true);
    expect(state.unitEvents.some(event => event.kind === 'death')).toBe(true);
  });

  test('units at peace hold fire', () => {
    const state = fieldState();
    spawn(state, 'infantry', 0, 13, 3);
    spawn(state, 'infantry', 1, 16, 3);
    run(state, 10);
    expect(state.units.every(unit => unit.hp === UNIT_STATS.infantry.hp)).toBe(true);
  });

  test('units capture enemy land they stand on uncontested', () => {
    const state = fieldState();
    declareWar(state, 0, 1);
    const unit = spawn(state, 'assault', 0, 20, 4);
    run(state, 4);
    expect(gridAt(state.grid, { q: 20, r: 4 })!.owner).toBe(0);
    expect(unit.capture).toBeLessThan(1);
  });
});

describe('unit orders', () => {
  test('formations give every unit its own slot facing the destination', () => {
    const state = fieldState();
    const group = [0, 1, 2, 3, 4].map(i => spawn(state, 'infantry', 0, 2, 2 + i));
    orderGroup(group, 300, 100, 'amove', 'wedge');
    const slots = new Set(group.map(unit => `${Math.round(unit.tx)},${Math.round(unit.ty)}`));
    expect(slots.size).toBe(group.length);
    expect(formationSlot('file', 3)).toEqual([0, 3]);
    expect(group.every(unit => unit.formation === 'wedge')).toBe(true);
  });

  test('units walk to their order and stop', () => {
    const state = fieldState();
    const unit = spawn(state, 'mrap', 0, 2, 2);
    expect(dispatch(state, { type: 'OrderUnits', empire: 0, units: [unit.id], order: { kind: 'move', mode: 'amove', x: 300, y: 200, formation: 'wedge' } }).ok).toBe(true);
    run(state, 10);
    expect(Math.hypot(unit.x - 300, unit.y - 200)).toBeLessThan(10);
    expect(dispatch(state, { type: 'OrderUnits', empire: 1, units: [unit.id], order: { kind: 'hold' } }).ok).toBe(false);
  });

  test('units cannot walk into water', () => {
    const state = fieldState();
    for (const cell of state.grid.cells) if (cell.q === 6) cell.terrain = 'water';
    const unit = spawn(state, 'infantry', 0, 3, 3);
    dispatch(state, { type: 'OrderUnits', empire: 0, units: [unit.id], order: { kind: 'move', mode: 'amove', x: 10 * SIZE, y: 3.5 * SIZE, formation: 'wedge' } });
    run(state, 15);
    expect(unit.x).toBeLessThan(6 * SIZE);
  });
});
