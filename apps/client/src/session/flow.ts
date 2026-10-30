import { createSignal } from 'solid-js';
import type { MapPreset } from '../game/map/map.types';
import { FACTIONS } from '../game/faction/faction.constants';
import type { GameConfig } from '../game/config/config.types';
import { clamp } from '@the-big-war/game-engine/math/math.service';
import { DEFAULT_GAME_CONFIG } from '../game/config/config.constants';
import type {
  Difficulty,
  MapSize,
  MatchFlow,
  MatchResult,
  MatchSettings,
  NeutralStates,
  Screen,
} from './flow.types';

export type * from './flow.types';

export const MAP_SIZES: Readonly<Record<MapSize, { readonly width: number; readonly height: number }>> = {
  skirmish: { width: 120, height: 72 },
  regional: { width: 240, height: 140 },
  continental: { width: 360, height: 216 },
  world: { width: 500, height: 300 },
};

export const PRESET_MAP_SIZES: Readonly<Record<MapPreset, MapSize>> = {
  continents: 'continental',
  pangaea: 'world',
  twin_continents: 'continental',
  archipelago: 'regional',
  inland_sea: 'continental',
  atoll_ring: 'skirmish',
  river_delta: 'regional',
  straits: 'regional',
  skull: 'regional',
  snake: 'skirmish',
  crescent: 'regional',
};

export const NEUTRAL_STATES_ORDER: readonly NeutralStates[] = ['none', 'few', 'many'];

const NEUTRAL_STATE_COUNTS: Readonly<Record<NeutralStates, number>> = { none: 0, few: 3, many: 6 };

const NEUTRAL_SCALE: Readonly<Record<MapSize, number>> = { skirmish: 1, regional: 2, continental: 3, world: 4 };

export const DIFFICULTY_ORDER: readonly Difficulty[] = ['easy', 'normal', 'hard'];

const BOT_TICK_SCALE: Readonly<Record<Difficulty, number>> = { easy: 2, normal: 1, hard: 0.5 };

const BOT_AGGRESSION: Readonly<Record<Difficulty, number>> = { easy: 0.2, normal: 0.5, hard: 0.8 };

export const MIN_EMPIRES = 2;
export const MAX_EMPIRES = 16;

export const DEFAULT_PLAYER_NAME = 'Zombo';

const PLAYER_NAME_KEY = 'the-big-war:player-name';

export function loadPlayerName(): string {
  try {
    return globalThis.localStorage?.getItem(PLAYER_NAME_KEY) || DEFAULT_PLAYER_NAME;
  } catch {
    return DEFAULT_PLAYER_NAME;
  }
}

function savePlayerName(name: string): void {
  try {
    globalThis.localStorage?.setItem(PLAYER_NAME_KEY, name);
  } catch {
  }
}

export function rivalFactions(count: number): string[] {
  return Array.from({ length: count }, (_, i) => FACTIONS[(i + 1) % FACTIONS.length]!.id);
}

export function defaultSettings(seed = Math.floor(Math.random() * 1_000_000)): MatchSettings {
  return { bots: rivalFactions(3), mapSize: PRESET_MAP_SIZES.continents, preset: 'continents', difficulty: 'easy', neutralStates: 'few', seed };
}

export function configFromSettings(settings: MatchSettings, playerName = ''): GameConfig {
  const size = MAP_SIZES[settings.mapSize];
  return {
    ...DEFAULT_GAME_CONFIG,
    map: { width: size.width, height: size.height, hexSize: DEFAULT_GAME_CONFIG.map.hexSize, seed: settings.seed, preset: settings.preset },
    start: {
      ...DEFAULT_GAME_CONFIG.start,
      empireCount: clampEmpires(settings.bots.length + 1),
      humanName: playerName.trim() || undefined,
      neutralStates: NEUTRAL_STATE_COUNTS[settings.neutralStates ?? 'none'] * NEUTRAL_SCALE[settings.mapSize],
    },
    bot: {
      ...DEFAULT_GAME_CONFIG.bot,
      tickSeconds: DEFAULT_GAME_CONFIG.bot.tickSeconds * BOT_TICK_SCALE[settings.difficulty],
      aggression: BOT_AGGRESSION[settings.difficulty],
    },
  };
}

export function clampEmpires(count: number): number {
  return clamp(Math.round(count), MIN_EMPIRES, MAX_EMPIRES);
}

const PLAYER_COLOR_KEY = 'the-big-war:player-color';

function loadPlayerColorIndex(): number {
  try {
    const raw = globalThis.localStorage?.getItem(PLAYER_COLOR_KEY);
    if (raw === null || raw === undefined) return 0;
    const parsed = Number.parseInt(raw, 10);
    if (Number.isNaN(parsed)) return 0;
    return ((parsed % 8) + 8) % 8;
  } catch {
    return 0;
  }
}

function savePlayerColorIndex(colorIndex: number): void {
  try {
    globalThis.localStorage?.setItem(PLAYER_COLOR_KEY, String(colorIndex));
  } catch {
  }
}

const PLAYER_FACTION_KEY = 'the-big-war:player-faction';

function loadPlayerFaction(): string {
  try {
    const raw = globalThis.localStorage?.getItem(PLAYER_FACTION_KEY);
    return FACTIONS.find(faction => faction.id === raw)?.id ?? FACTIONS[0]!.id;
  } catch {
    return FACTIONS[0]!.id;
  }
}

function savePlayerFaction(factionId: string): void {
  try {
    globalThis.localStorage?.setItem(PLAYER_FACTION_KEY, factionId);
  } catch {
  }
}

export function createMatchFlow(random: () => number = Math.random): MatchFlow {
  const [screen, setScreen] = createSignal<Screen>('menu');
  const [settings, setSettings] = createSignal<MatchSettings>(defaultSettings(Math.floor(random() * 1_000_000)));
  const [playerFaction, setPlayerFaction] = createSignal(loadPlayerFaction());
  const [playerName, setPlayerNameSignal] = createSignal(loadPlayerName());
  const [playerColorIndex, setPlayerColorIndexSignal] = createSignal(loadPlayerColorIndex());
  const [lastResult, setLastResult] = createSignal<MatchResult | null>(null);

  return {
    screen,
    settings,
    playerFaction,
    playerName,
    playerColorIndex,
    lastResult,
    backToMenu: () => setScreen('menu'),
    updateSettings: patch => setSettings(current => ({ ...current, ...patch })),
    chooseFaction: factionId => {
      setPlayerFaction(factionId);
      savePlayerFaction(factionId);
    },
    setPlayerName: name => {
      setPlayerNameSignal(name);
      savePlayerName(name);
    },
    setPlayerColorIndex: (colorIndex: number) => {
      const clamped = ((colorIndex % 8) + 8) % 8;
      setPlayerColorIndexSignal(clamped);
      savePlayerColorIndex(clamped);
    },
    enterMatch: () => setScreen('match'),
    showResult: (winner, playerEmpire) => {
      setLastResult({ winner, playerWon: winner === playerEmpire });
      setScreen('end');
    },
  };
}
