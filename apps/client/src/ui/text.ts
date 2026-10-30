import type { Terrain } from '../game/map/map.types';
import { FACTIONS } from '../game/faction/faction.constants';
import type { BuildingKind } from '../game/building/building.types';
import type { CommandError } from '../game/commands/commands.types';

const BUILDING_LABELS: Readonly<Record<BuildingKind, string>> = {
  city: 'City',
  market: 'Market',
  lumberjack: 'Lumberjack',
  miner: 'Miner',
  farm: 'Farm',
  lab: 'Lab',
  port: 'Port',
  fishery: 'Fishery',
  barracks: 'Barracks',
  fort: 'Fort',
  cannon: 'Cannon',
  trench: 'Trench',
  machine_gun: 'Machine Gun',
  battery: 'Artillery Battery',
  bunker: 'Bunker',
  tank: 'Tank',
};

export function buildingLabel(kind: BuildingKind): string {
  return BUILDING_LABELS[kind];
}

const BUILDING_DESCRIPTIONS: Readonly<Record<BuildingKind, string>> = {
  city: 'The heart of your territory. Claims the hexes around it, defends them and lets you attack from nearby. Upgrading widens the territory it claims.',
  market: 'Earns a steady stream of gold. Needs civilians to work it.',
  lumberjack: 'Workers walk to the nearest forest in your territory and bring back wood for gold. The further the trees, the longer each trip.',
  miner: 'Workers walk to the nearest ore deposit in your territory and haul back ore worth far more than wood. Ore is rare, so fight for it.',
  farm: 'Speeds up population growth. Each farm adds more, up to a cap.',
  lab: 'Produces science for research, plus a little gold.',
  port: 'Coast only. Launches troop transports at land you cannot reach on foot, sends trade ships to friendly ports and builds battleships once researched. Upgrade it for more boats at sea. An enemy battleship nearby with no escort of yours blockades it.',
  fishery: 'Coast only. A cheap steady gold income, no fleet needed.',
  barracks: 'Trains troops, raises how many you can hold in reserve and lets you attack from nearby hexes. Upgrade it to level II (Grenadiers) and III (Machine Gunners) once researched: better troops hit harder but train slower and cost more gold each.',
  fort: 'Troops within its radius fight 50% more effectively.',
  cannon: 'Fires at distant hexes to damage defenders and clear forests and blast passes through mountains. Needs a reload between shots. Unlocked through research.',
  trench: 'Dug into the ground and links up with neighbouring trenches. Click it to station up to 20 troops, who slow attackers down and defend 35% better. You can also attack straight out of it. Enemy tanks within 2 hexes cancel the bonus.',
  machine_gun: 'Mounted in one of your trenches. While the trench is manned, land within 2 hexes defends 20% better. Unlocked through research.',
  battery: 'Shells the strongest enemy attack in range on its own, with no gold per shot. Unlocked through research.',
  bunker: 'Troops on this hex and the hexes beside it defend 75% better and take half damage from shelling. Unlocked through research.',
  tank: 'Attacks into hexes within 2 of it are 60% stronger and ignore enemy trenches. When your troops take a hex next to it, the tank rolls forward onto it. Unlocked through research.',
};

export function buildingDescription(kind: BuildingKind): string {
  return BUILDING_DESCRIPTIONS[kind];
}

export function factionLabel(factionId: string): string {
  const faction = FACTIONS.find(entry => entry.id === factionId);
  return faction?.name ?? factionId;
}

const TERRAIN_LABELS: Readonly<Record<Terrain, string>> = {
  plain: 'Plain',
  forest: 'Forest',
  mountain: 'Mountain',
  ore: 'Ore',
  water: 'Water',
};

export function terrainLabel(terrain: Terrain): string {
  return TERRAIN_LABELS[terrain];
}

const ERROR_LABELS: Readonly<Record<CommandError, string>> = {
  insufficient_gold: 'Not enough gold',
  insufficient_civilians: 'No civilians free to build',
  insufficient_science: 'Not enough science',
  insufficient_troops: 'No troops free',
  reserve_full: 'Reserve full',
  trench_full: 'Trench is full',
  invalid_target: 'Invalid target',
  not_researched: 'Not researched yet',
  cooldown: 'Still reloading',
  not_playing: 'Match not running',
  no_empire: 'No empire',
  research_unavailable: 'Research unavailable',
  in_peace: 'Under peace treaty',
  already_at_war: 'Already at war',
  invalid_diplomacy: 'Invalid diplomatic action',
  offer_rejected: 'Offer rejected',
  offer_cooldown: 'Offer recently rejected',
  offer_pending: 'Offer awaiting a reply',
  offer_missing: 'Offer no longer stands',
  no_port: 'Build a port first: that land is overseas',
  port_busy: 'All boats from your port are at sea',
  blockaded: 'Port is blockaded',
  no_sea_route: 'No sea route from your ports',
  stale_match: 'That order belonged to the last match',
};

export function errorLabel(reason: CommandError): string {
  return ERROR_LABELS[reason] ?? reason;
}

const FACTION_ICONS: Readonly<Record<string, string>> = {
  ironclad: '⚔',
  league: '💰',
  verdant: '🔨',
  academy: '⚗',
};

export function factionIcon(factionId: string): string {
  return FACTION_ICONS[factionId] ?? '⚑';
}
