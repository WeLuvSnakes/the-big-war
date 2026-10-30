import type { Accessor } from 'solid-js';
import type { MenuDeck } from './MenuScreen.types';
import type { MapPreset } from '../../game/map/map.types';
import { FACTIONS } from '../../game/faction/faction.constants';
import { MAP_PRESET_ORDER } from '../../game/map/map.constants';
import type { FactionDef } from '../../game/faction/faction.types';
import type { Modifier } from '../../game/modifier/modifier.types';
import { signed, signedPercent } from '@the-big-war/frontend/ui/format/format';
import { PRESET_MAP_SIZES, type Difficulty, type MapSize, type MatchSettings, type NeutralStates } from '../../session/flow';

export const COLOR_OPTIONS = [0, 1, 2, 3, 4, 5, 6, 7] as const;

export const RIVAL_COUNTS = [1, 3, 7, 15] as const;

const WORLD_SIZE_LABELS: Readonly<Record<MapSize, string>> = {
  skirmish: 'Small',
  regional: 'Medium',
  continental: 'Large',
  world: 'Huge',
};

const WORLD_TRAITS: Readonly<Record<MapPreset, string>> = {
  continents: 'Mixed lands',
  pangaea: 'One landmass',
  twin_continents: 'Two shores',
  archipelago: 'Island hopping',
  inland_sea: 'Central sea',
  atoll_ring: 'Ring of islands',
  river_delta: 'Rivers and swamp',
  straits: 'Narrow crossings',
  skull: 'Silhouette',
  snake: 'Silhouette',
  crescent: 'Silhouette',
};

const MODIFIER_LABELS: Readonly<Record<string, string>> = {
  attack: 'attack',
  defence: 'defence',
  goldIncome: 'gold',
  buildCost: 'build cost',
  growth: 'growth',
  scienceRate: 'science',
  frontDefence: 'wave defence',
  reserveCap: 'reserve cap',
};

export function difficultyLabel(difficulty: Difficulty): string {
  return difficulty === 'easy' ? 'City Sim' : difficulty === 'normal' ? 'Nothing Personal' : 'Hurt Me';
}

export function difficultyHint(difficulty: Difficulty): string {
  return difficulty === 'easy' ? 'Rivals sit back' : difficulty === 'normal' ? 'A fair fight' : 'No mercy';
}

export function neutralStatesLabel(amount: NeutralStates): string {
  return amount === 'none' ? 'None' : amount === 'few' ? 'Few' : 'Many';
}

export function neutralStatesHint(amount: NeutralStates): string {
  return amount === 'none' ? 'Rivals only' : amount === 'few' ? 'Some to swallow' : 'A crowded world';
}

export function rivalsLabel(count: number): string {
  return count === 1 ? 'Duel' : count === 3 ? 'Melee' : count === 7 ? 'Great War' : 'World War';
}

export function rivalsHint(count: number): string {
  return count === 1 ? '1 rival' : `${count} rivals`;
}

export function worldSizeLabel(preset: MapPreset): string {
  return WORLD_SIZE_LABELS[PRESET_MAP_SIZES[preset]];
}

export function worldTrait(preset: MapPreset): string {
  return WORLD_TRAITS[preset];
}

export function factionById(id: string): FactionDef {
  return FACTIONS.find(faction => faction.id === id) ?? FACTIONS[0]!;
}

export function bonusLine(modifier: Modifier): string {
  const name = MODIFIER_LABELS[modifier.key] ?? modifier.key;
  if (modifier.mul !== undefined) return `${signedPercent(Math.round((modifier.mul - 1) * 100))} ${name}`;
  if (modifier.add !== undefined) return `${signed(modifier.add)} ${name}`;
  return name;
}

export function isBuff(modifier: Modifier): boolean {
  return modifier.key === 'buildCost'
    ? (modifier.mul ?? 1) < 1
    : (modifier.mul ?? 1) >= 1 && (modifier.add ?? 0) >= 0;
}

export function worldSettings(settings: MatchSettings, preset: MapPreset): MatchSettings {
  return { ...settings, preset, mapSize: PRESET_MAP_SIZES[preset] };
}

export function createMenuDeck(
  settings: Accessor<MatchSettings>,
  onChange: (patch: Partial<MatchSettings>) => void,
): MenuDeck {
  const count = MAP_PRESET_ORDER.length;
  const selected = () => Math.max(0, MAP_PRESET_ORDER.indexOf(settings().preset));
  const go = (index: number) => {
    const preset = MAP_PRESET_ORDER[(index + count) % count]!;
    onChange({ preset, mapSize: PRESET_MAP_SIZES[preset] });
  };
  const offsetOf = (index: number): number => {
    const offset = (index - selected() + count) % count;
    return offset > count / 2 ? offset - count : offset;
  };
  return { selected, offsetOf, go, goBy: (delta: number) => go(selected() + delta) };
}
