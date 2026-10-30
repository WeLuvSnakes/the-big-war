import { describe, expect, test } from 'bun:test';
import { testEmpire, setTroops } from '../support/fixture';
import { createRng } from '@the-big-war/game-engine/rng/rng.service';
import type { Empire } from '@the-big-war/client/game/empire/empire.types';
import type { GameState } from '@the-big-war/client/game/state/state.types';
import { dispatch } from '@the-big-war/client/game/commands/commands.service';
import { labelWorld } from '@the-big-war/client/game/map/world-labels.service';
import type { GameConfig } from '@the-big-war/client/game/config/config.types';
import type { HexCell, HexGrid } from '@the-big-war/client/game/map/map.types';
import { makeGrid } from '@the-big-war/game-engine/world-tile/world-tile.service';
import { createWorldIndex } from '@the-big-war/client/game/map/world-index.service';
import { DEFAULT_GAME_CONFIG } from '@the-big-war/client/game/config/config.constants';
import { acceptsOffer, agreePeace, declareWar, expireOffers, getRelation, isProtected, offerCooldown, pendingOffer, relationKey } from '@the-big-war/client/game/diplomacy/diplomacy.service';

function createTestState(configOverrides: Partial<GameConfig> = {}): GameState {
  const config: GameConfig = {
    ...DEFAULT_GAME_CONFIG,
    map: { ...DEFAULT_GAME_CONFIG.map, width: 8, height: 6, seed: 123 },
    start: { ...DEFAULT_GAME_CONFIG.start, empireCount: 3 },
    ...configOverrides,
  };

  const grid: HexGrid = makeGrid<HexCell>(config.map.width, config.map.height, hex => ({
    q: hex.q,
    r: hex.r,
    terrain: 'plain',
    biome: 'temperate',
    owner: -1,
    building: null,
  }));

  const empires: Empire[] = [];
  for (let id = 0; id < config.start.empireCount; id++) {
    empires.push(testEmpire({ id, factionId: 'ironclad', gold: 500, science: 500, civilians: 50, soldiers: 100, reserveCap: 200 }));
  }

  for (const cell of grid.cells) {
    if (cell.q < 4) cell.owner = 0;
    else cell.owner = 1;
  }

  return {
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
}

describe('diplomacy contracts', () => {
  test('relationKey is canonical and symmetric', () => {
    expect(relationKey(0, 1)).toBe('0:1');
    expect(relationKey(1, 0)).toBe('0:1');
    expect(relationKey(2, 5)).toBe('2:5');
    expect(relationKey(5, 2)).toBe('2:5');
  });

  test('all nations start at peace with no treaty', () => {
    const state = createTestState();
    expect(getRelation(state, 0, 1).status).toBe('peace');
    expect(getRelation(state, 1, 0).status).toBe('peace');
    expect(isProtected(state, 0, 1)).toBe(false);
  });

  test('attacking another nation declares war', () => {
    const state = createTestState();
    setTroops(state, 0, 100);
    const result = dispatch(state, {
      type: 'SendTroops',
      empire: 0,
      target: { q: 4, r: 0 },
      percent: 50,
    });
    expect(result.ok).toBe(true);
    expect(getRelation(state, 0, 1).status).toBe('war');
    expect(getRelation(state, 1, 0).status).toBe('war');
  });

  test('cannot offer peace when not at war', () => {
    const state = createTestState();
    const result = dispatch(state, {
      type: 'OfferPeace',
      empire: 0,
      target: 1,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('invalid_diplomacy');
  });

  test('offer peace during war dissolves fronts and starts a treaty', () => {
    const state = createTestState();
    setTroops(state, 0, 100);
    
    dispatch(state, {
      type: 'SendTroops',
      empire: 0,
      target: { q: 4, r: 0 },
      percent: 50,
    });
    expect(state.offensives.length).toBe(1);
    expect(state.empires[0]!.soldiers).toBe(50);
    setTroops(state, 1, 40);

    const peaceResult = dispatch(state, {
      type: 'OfferPeace',
      empire: 0,
      target: 1,
    });
    expect(peaceResult.ok).toBe(true);

    const rel = getRelation(state, 0, 1);
    expect(rel.status).toBe('peace');
    expect(rel.treatyUntil).toBe(state.elapsed + state.config.diplomacy.treatySeconds);

    expect(state.offensives.length).toBe(0);
    expect(state.empires[0]!.soldiers).toBe(100);

    const attackBlocked = dispatch(state, {
      type: 'SendTroops',
      empire: 0,
      target: { q: 4, r: 0 },
      percent: 50,
    });
    expect(attackBlocked.ok).toBe(false);
    if (!attackBlocked.ok) expect(attackBlocked.reason).toBe('in_peace');
  });

  test('the treaty lapses but peace holds', () => {
    const state = createTestState();
    agreePeace(state, 0, 1);
    expect(isProtected(state, 0, 1)).toBe(true);

    state.elapsed = state.config.diplomacy.treatySeconds + 1;
    expect(getRelation(state, 0, 1).status).toBe('peace');
    expect(isProtected(state, 0, 1)).toBe(false);
  });

  test('a much stronger bot rejects peace and the offer goes on cooldown', () => {
    const state = createTestState();
    declareWar(state, 0, 1);
    setTroops(state, 0, 10);

    const first = dispatch(state, { type: 'OfferPeace', empire: 0, target: 1 });
    expect(first.ok).toBe(false);
    if (!first.ok) expect(first.reason).toBe('offer_rejected');
    expect(getRelation(state, 0, 1).status).toBe('war');
    expect(offerCooldown(state, 0, 1)?.rejectedBy).toBe(1);

    const retry = dispatch(state, { type: 'OfferPeace', empire: 0, target: 1 });
    if (!retry.ok) expect(retry.reason).toBe('offer_cooldown');

    state.elapsed += state.config.diplomacy.rejectCooldownSeconds;
    expect(offerCooldown(state, 0, 1)).toBeNull();
  });

  test('declare war works at peace but not during a treaty', () => {
    const state = createTestState();
    expect(dispatch(state, { type: 'DeclareWar', empire: 0, target: 1 }).ok).toBe(true);
    expect(getRelation(state, 0, 1).status).toBe('war');

    const repeat = dispatch(state, { type: 'DeclareWar', empire: 0, target: 1 });
    if (!repeat.ok) expect(repeat.reason).toBe('already_at_war');

    agreePeace(state, 0, 2);
    const blocked = dispatch(state, { type: 'DeclareWar', empire: 0, target: 2 });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.reason).toBe('in_peace');
  });

  test('peace offers to the player wait for the player to accept', () => {
    const state = createTestState();
    declareWar(state, 0, 1);
    expect(dispatch(state, { type: 'OfferPeace', empire: 1, target: 0 }).ok).toBe(true);
    expect(getRelation(state, 0, 1).status).toBe('war');
    expect(pendingOffer(state, 1, 0)).not.toBeNull();

    const repeat = dispatch(state, { type: 'OfferPeace', empire: 1, target: 0 });
    if (!repeat.ok) expect(repeat.reason).toBe('offer_pending');

    expect(dispatch(state, { type: 'RespondOffer', empire: 0, from: 1, accept: true }).ok).toBe(true);
    expect(getRelation(state, 0, 1).status).toBe('peace');
    expect(isProtected(state, 0, 1)).toBe(true);
    expect(pendingOffer(state, 1, 0)).toBeNull();
  });

  test('declining an offer puts the offerer on cooldown', () => {
    const state = createTestState();
    declareWar(state, 0, 1);
    dispatch(state, { type: 'OfferPeace', empire: 1, target: 0 });
    expect(dispatch(state, { type: 'RespondOffer', empire: 0, from: 1, accept: false }).ok).toBe(true);
    expect(getRelation(state, 0, 1).status).toBe('war');
    expect(offerCooldown(state, 1, 0)?.rejectedBy).toBe(0);

    const stale = dispatch(state, { type: 'RespondOffer', empire: 0, from: 1, accept: true });
    if (!stale.ok) expect(stale.reason).toBe('offer_missing');
  });

  test('unanswered offers expire as rejections', () => {
    const state = createTestState();
    declareWar(state, 0, 1);
    dispatch(state, { type: 'OfferPeace', empire: 1, target: 0 });
    state.elapsed += state.config.diplomacy.offerExpirySeconds;
    expireOffers(state);
    expect(pendingOffer(state, 1, 0)).toBeNull();
    expect(offerCooldown(state, 1, 0)).not.toBeNull();
    expect(getRelation(state, 0, 1).status).toBe('war');
  });

  test('a stale offer cannot be accepted once the war is over', () => {
    const state = createTestState();
    declareWar(state, 0, 1);
    dispatch(state, { type: 'OfferPeace', empire: 1, target: 0 });
    agreePeace(state, 0, 1);
    const result = dispatch(state, { type: 'RespondOffer', empire: 0, from: 1, accept: true });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('invalid_diplomacy');
  });

  test('aggressive bots are harder to make peace with', () => {
    const calm = createTestState({ bot: { ...DEFAULT_GAME_CONFIG.bot, aggression: 0.2 } });
    const angry = createTestState({ bot: { ...DEFAULT_GAME_CONFIG.bot, aggression: 0.8 } });
    for (const state of [calm, angry]) {
      setTroops(state, 0, 80);
      setTroops(state, 1, 100);
    }
    expect(acceptsOffer(calm, 0, 1)).toBe(true);
    expect(acceptsOffer(angry, 0, 1)).toBe(false);
  });
});
