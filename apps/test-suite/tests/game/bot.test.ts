import { testEmpire } from '../support/fixture';


import { describe, expect, test } from 'bun:test';
import { createRng } from '@the-big-war/game-engine/rng/rng.service';
import type { Empire } from '@the-big-war/client/game/empire/empire.types';
import { findSite } from '@the-big-war/client/game/bot/bot-queries.service';
import type { GameState } from '@the-big-war/client/game/state/state.types';
import { botTick, createBot } from '@the-big-war/client/game/bot/bot.service';
import { dispatch } from '@the-big-war/client/game/commands/commands.service';
import { step } from '@the-big-war/client/game/simulation/simulation.service';
import type { GameConfig } from '@the-big-war/client/game/config/config.types';
import type { HexCell, HexGrid } from '@the-big-war/client/game/map/map.types';
import { NEUTRAL_OWNER } from '@the-big-war/client/game/empire/empire.constants';
import type { Building } from '@the-big-war/client/game/building/building.types';
import { FIXED_DT } from '@the-big-war/game-engine/simulation/simulation.constants';
import { RESEARCH_NODES } from '@the-big-war/client/game/research/research.constants';
import { DEFAULT_GAME_CONFIG } from '@the-big-war/client/game/config/config.constants';
import { gridAt, makeGrid } from '@the-big-war/game-engine/world-tile/world-tile.service';
import { BOT_PERSONALITIES, BOT_TUNING } from '@the-big-war/client/game/bot/bot.constants';
import { recomputeEmpireBonuses } from '@the-big-war/client/game/research/research.service';
import { declareWar, getRelation, pendingOffer } from '@the-big-war/client/game/diplomacy/diplomacy.service';

const FACTION_IDS = ['ironclad', 'league', 'verdant', 'academy'];

function tinyConfig(overrides: Partial<GameConfig> = {}): GameConfig {
  return {
    ...DEFAULT_GAME_CONFIG,
    map: { ...DEFAULT_GAME_CONFIG.map, width: 9, height: 6, seed: 7 },
    start: { ...DEFAULT_GAME_CONFIG.start, empireCount: 3 },
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
    empires.push(testEmpire({ id, factionId: FACTION_IDS[id % FACTION_IDS.length]!, gold: config.start.gold, science: config.start.science, civilians: config.start.civilians, soldiers: config.start.soldiers, reserveCap: config.recruit.cityReserveCap }));
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
  const strip = Math.floor(grid.width / empires.length);
  for (const cell of grid.cells) {
    const owner = Math.floor(cell.q / strip);
    cell.owner = owner >= 0 && owner < empires.length ? owner : NEUTRAL_OWNER;
  }
  for (const empire of empires) {
    const q = Math.min(grid.width - 1, empire.id * strip);
    gridAt(grid, { q, r: 0 })!.building = city(state);
    recomputeEmpireBonuses(state, empire.id);
    countHexes(state, empire.id);
  }
  return state;
}

function city(state: GameState, level = 1): Building {
  return { id: state.nextBuildingId++, kind: 'city', level, cooldown: 0, growth: 0, demolishAt: null, buildRemaining: 0, gatherers: [], garrison: 0, machineGun: false };
}

function countHexes(state: GameState, empireId: number): void {
  let count = 0;
  for (const cell of state.grid.cells) if (cell.owner === empireId) count += 1;
  state.empires[empireId]!.hexCount = count;
}

function clone(state: GameState): string {
  return JSON.stringify(state);
}

describe('createBot', () => {
  test('derives the same personality and rng from the same seed/empire', () => {
    const a = createBot({ empire: 2, seed: 1234 });
    const b = createBot({ empire: 2, seed: 1234 });
    expect(a.personality).toEqual(b.personality);
    expect(a.rng.state).toBe(b.rng.state);
  });

  test('different empires get different private rng seeds', () => {
    const a = createBot({ empire: 0, seed: 1234 });
    const b = createBot({ empire: 1, seed: 1234 });
    expect(a.rng.state).not.toBe(b.rng.state);
  });

  test('picks a preset personality deterministically when none is supplied', () => {
    const seed = 99;
    for (let empire = 0; empire < 8; empire++) {
      const bot = createBot({ empire, seed });
      expect(bot.personality).toEqual(
        BOT_PERSONALITIES[(seed + empire) % BOT_PERSONALITIES.length]!,
      );
    }
  });

  test('honours an explicitly supplied personality', () => {
    const personality = { aggression: 0.99, economy: 0.01, expansion: 0.4 };
    const bot = createBot({ empire: 1, seed: 5, personality });
    expect(bot.personality).toBe(personality);
  });
});

describe('botTick discipline', () => {
  test('never mutates the state it inspects', () => {
    const state = makeState();
    state.empires[1]!.gold = 500;
    state.empires[1]!.science = 200;
    const before = clone(state);
    const bot = createBot({ empire: 1, seed: 7 });
    botTick(bot, state, 0.5);
    expect(clone(state)).toBe(before);
  });

  test('only emits commands addressed to its own empire', () => {
    const state = makeState();
    state.empires[1]!.gold = 500;
    const bot = createBot({ empire: 1, seed: 7 });
    for (let i = 0; i < 40; i++) {
      const commands = botTick(bot, state, 0.5);
      for (const command of commands) {
        if (command.type === 'SendTroops' || command.type === 'SetFrontMode' ||
            command.type === 'PlaceBuilding' || command.type === 'FireCannon' ||
            command.type === 'StartResearch' || command.type === 'OfferPeace' ||
            command.type === 'DeclareWar') {
          expect(command.empire).toBe(1);
        } else {
          throw new Error(`bot emitted an unexpected command: ${command.type}`);
        }
      }
    }
  });

  test('emits structurally valid commands that the bus accepts or rejects cleanly', () => {
    const state = makeState();
    state.empires[1]!.gold = 500;
    state.empires[1]!.science = 200;
    const bot = createBot({ empire: 1, seed: 7 });
    for (let i = 0; i < 40; i++) {
      const commands = botTick(bot, state, 0.5);
      
      for (const command of commands) {
        const result = dispatch(state, command);
        expect(typeof result.ok).toBe('boolean');
        if (!result.ok) expect(typeof result.reason).toBe('string');
      }
    }
  });

  test('the same bot and state yield the same command list', () => {
    const state = makeState();
    state.empires[1]!.gold = 500;
    state.empires[1]!.science = 200;
    const a = createBot({ empire: 1, seed: 42 });
    const b = createBot({ empire: 1, seed: 42 });
    const first = botTick(a, state, 0.5);
    const second = botTick(b, state, 0.5);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  test('does nothing when the empire is eliminated', () => {
    const state = makeState();
    state.empires[1]!.alive = false;
    state.empires[1]!.gold = 9999;
    const bot = createBot({ empire: 1, seed: 7 });
    expect(botTick(bot, state, 0.5)).toHaveLength(0);
  });

  test('does nothing when the match is not playing', () => {
    const state = makeState();
    state.status = 'ended';
    state.empires[1]!.gold = 9999;
    const bot = createBot({ empire: 1, seed: 7 });
    expect(botTick(bot, state, 0.5)).toHaveLength(0);
  });
});

describe('botTick behaviour', () => {
  test('a bot only mounts machine guns in its own trenches, and mans border trenches', () => {
    const state = makeState();
    state.empires[1]!.unlocks.push('building:machine_gun');
    expect(findSite(state, 1, 'machine_gun')).toBeNull();

    const site = findSite(state, 1, 'trench');
    expect(site).not.toBeNull();
    const cell = gridAt(state.grid, site!)!;
    cell.building = { ...city(state), kind: 'trench' };
    expect(findSite(state, 1, 'machine_gun')).toEqual(site);

    state.empires[1]!.soldiers = state.empires[1]!.reserveCap;
    const bot = createBot({ empire: 1, seed: 7 });
    const man = botTick(bot, state, 0.5).find(command => command.type === 'ManTrench');
    expect(man).toBeDefined();
    if (man && man.type === 'ManTrench') expect(man.hex).toEqual(site);
  });

  test('an economy bot places a building when gold and a site allow', () => {
    const state = makeState();
    const empire = state.empires[1]!;
    empire.gold = 500;
    const bot = createBot({ empire: 1, seed: 7, personality: { aggression: 0.2, economy: 0.9 } });
    const commands = botTick(bot, state, 0.5);
    const place = commands.find(command => command.type === 'PlaceBuilding');
    expect(place).toBeDefined();
    if (place && place.type === 'PlaceBuilding') {
      expect(place.kind).not.toBe('cannon'); 
      expect(place.empire).toBe(1);
    }
  });

  test('a scholar bot starts research once science is banked', () => {
    const state = makeState();
    state.empires[1]!.science = BOT_TUNING.researchScienceFloor + 100;
    const bot = createBot({ empire: 1, seed: 7 });
    const commands = botTick(bot, state, 0.5);
    expect(commands.some(command => command.type === 'StartResearch')).toBe(true);
  });

  test('a choice node is started with a valid option id', () => {
    const state = makeState();
    const empire = state.empires[1]!;
    empire.science = 1000;

    for (const node of RESEARCH_NODES) {
      if (node.id !== 'grand_strategy') empire.research.completed.push(node.id);
    }
    const bot = createBot({ empire: 1, seed: 7, personality: { aggression: 1, economy: 0 } });
    const commands = botTick(bot, state, 0.5);
    const research = commands.find(command => command.type === 'StartResearch');
    expect(research).toBeDefined();
    if (research && research.type === 'StartResearch') {
      expect(research.nodeId).toBe('grand_strategy');
      expect(research.optionId).toBeDefined();
      
      const result = dispatch(state, research);
      expect(result.ok).toBe(true);
    }
  });

  test('an aggressive bot with plenty of reserve sends troops at a hostile edge', () => {
    const state = makeState();
    const empire = state.empires[1]!;
    empire.soldiers = 400; 
    empire.reserveCap = 500;
    declareWar(state, 1, 2);
    const bot = createBot({ empire: 1, seed: 7, personality: { aggression: 1, economy: 0 } });
    const commands = botTick(bot, state, 0.5);
    const send = commands.find(command => command.type === 'SendTroops');
    expect(send).toBeDefined();
    if (send && send.type === 'SendTroops') {
      expect(send.intent).toBe('attack');
      expect(gridAt(state.grid, send.hex)!.owner).toBe(1);
      expect(gridAt(state.grid, send.target)!.owner).not.toBe(1);
    }
  });

  test('a bot never marches into an empire it is not at war with', () => {
    const state = makeState();
    const empire = state.empires[1]!;
    empire.soldiers = 400;
    empire.reserveCap = 500;
    const bot = createBot({ empire: 1, seed: 7, personality: { aggression: 0.3, economy: 0.7 } });
    const commands = botTick(bot, state, 0.5);
    expect(commands.some(command => command.type === 'SendTroops')).toBe(false);
  });

  test('a turtle bot with a reserve at the floor sends nothing', () => {
    const state = makeState();
    const empire = state.empires[1]!;
    empire.soldiers = Math.floor(empire.reserveCap * BOT_TUNING.reserveFloorRatio);
    const bot = createBot({ empire: 1, seed: 7, personality: { aggression: 0.1, economy: 0.9 } });
    const commands = botTick(bot, state, 0.5);
    expect(commands.some(command => command.type === 'SendTroops')).toBe(false);
  });
  test('verified commands all dispatch successfully on a live, peaceful tick', () => {
    const state = makeState();
    const empire = state.empires[1]!;
    empire.gold = 500;
    empire.science = 500;
    empire.soldiers = 300;
    const bot = createBot({ empire: 1, seed: 7, personality: { aggression: 0.6, economy: 0.6 } });
    const commands = botTick(bot, state, 0.5);
    for (const command of commands) {
      const result = dispatch(state, command);
      
      expect(result.ok).toBe(true);
    }
  });
});

describe('botTick in a running match', () => {
  test('a short multi-empire loop runs clean and ends with finite numbers', () => {
    const state = makeState();
    
    for (const empire of state.empires) {
      empire.gold = 300;
      empire.science = 120;
      empire.soldiers = 120;
    }
    const bots = state.empires.map(empire => createBot({ empire: empire.id, seed: state.config.map.seed }));

    const tickSeconds = state.config.bot.tickSeconds;
    let accumulator = 0;
    const steps = Math.round(120 * state.speed / FIXED_DT); 
    for (let i = 0; i < steps; i++) {
      step(state, FIXED_DT);
      accumulator += FIXED_DT;
      while (accumulator >= tickSeconds) {
        accumulator -= tickSeconds;
        for (const bot of bots) {
          for (const command of botTick(bot, state, tickSeconds)) dispatch(state, command);
        }
      }
    }

    for (const empire of state.empires) {
      expect(Number.isFinite(empire.gold)).toBe(true);
      expect(Number.isFinite(empire.science)).toBe(true);
      expect(Number.isFinite(empire.civilians)).toBe(true);
      expect(Number.isFinite(empire.soldiers)).toBe(true);
    }
  });

  test('the whole loop is deterministic for a fixed seed', () => {
    const run = (): string => {
      const state = makeState();
      for (const empire of state.empires) {
        empire.gold = 300;
        empire.science = 120;
        empire.soldiers = 120;
      }
      const bots = state.empires.map(empire => createBot({ empire: empire.id, seed: state.config.map.seed }));
      const tickSeconds = state.config.bot.tickSeconds;
      let accumulator = 0;
      for (let i = 0; i < 300; i++) {
        step(state, FIXED_DT);
        accumulator += FIXED_DT;
        while (accumulator >= tickSeconds) {
          accumulator -= tickSeconds;
          for (const bot of bots) for (const command of botTick(bot, state, tickSeconds)) dispatch(state, command);
        }
      }
      return clone(state);
    };
    expect(run()).toBe(run());
  });
});

describe('bot diplomacy & naval actions', () => {
  test('bot evaluates diplomacy and offers peace when outnumbered at war', () => {
    const state = makeState();
    
    declareWar(state, 1, 0);
    
    state.empires[0]!.soldiers = 200;
    state.empires[1]!.soldiers = 10;
    const bot = createBot({ empire: 1, seed: 7, personality: { aggression: 0.3, economy: 0.7 } });
    const commands = botTick(bot, state, 0.5);
    const peaceCmd = commands.find(c => c.type === 'OfferPeace');
    expect(peaceCmd).toBeDefined();
    expect(peaceCmd?.type).toBe('OfferPeace');
    if (peaceCmd && peaceCmd.type === 'OfferPeace') {
      expect(peaceCmd.target).toBe(0);
      const res = dispatch(state, peaceCmd);
      expect(res.ok).toBe(true);
      expect(getRelation(state, 1, 0).status).toBe('war');
      expect(pendingOffer(state, 1, 0)).not.toBeNull();
      expect(botTick(bot, state, 0.5).some(c => c.type === 'OfferPeace')).toBe(false);

      expect(dispatch(state, { type: 'RespondOffer', empire: 0, from: 1, accept: true }).ok).toBe(true);
      expect(getRelation(state, 1, 0).status).toBe('peace');
    }
  });

  test('a bot on easy difficulty never declares war on its own', () => {
    const state = makeState(tinyConfig({ bot: { ...DEFAULT_GAME_CONFIG.bot, aggression: 0.2 } }));
    state.empires[1]!.soldiers = 400;
    const bot = createBot({ empire: 1, seed: 7, personality: { aggression: 0.6, economy: 0.2 } });
    for (let tick = 0; tick < 500; tick++) {
      expect(botTick(bot, state, 0.5).some(c => c.type === 'DeclareWar')).toBe(false);
    }
  });

  test('a bot on hard difficulty declares war on a weaker neighbour', () => {
    const state = makeState(tinyConfig({ bot: { ...DEFAULT_GAME_CONFIG.bot, aggression: 0.8 } }));
    state.empires[1]!.soldiers = 400;
    const bot = createBot({ empire: 1, seed: 7, personality: { aggression: 0.6, economy: 0.2 } });
    let war = null;
    for (let tick = 0; tick < 2000 && !war; tick++) {
      war = botTick(bot, state, 0.5).find(c => c.type === 'DeclareWar') ?? null;
    }
    expect(war).not.toBeNull();
    if (war && war.type === 'DeclareWar') {
      expect(dispatch(state, war).ok).toBe(true);
      expect(getRelation(state, 1, war.target).status).toBe('war');
    }
  });
});

