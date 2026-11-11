import type { Terrain } from '../game/map/map.types';
import type { Formation } from '../game/unit/unit.types';
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
  cannon: 'Cannon',
  trench: 'Trench',
  battery: 'Artillery Battery',
  factory: 'Factory',
};

const FORMATION_LABELS: Readonly<Record<Formation, string>> = {
  wedge: 'Wedge',
  column: 'Column',
  file: 'File',
  vee: 'Vee',
};

export function formationLabel(formation: Formation): string {
  return FORMATION_LABELS[formation];
}

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
  port: 'Coast only. Ships your units to land they cannot reach on foot, sends trade ships to friendly ports and builds battleships once researched. Upgrade it for more boats at sea. An enemy battleship nearby with no escort of yours blockades it.',
  fishery: 'Coast only. A cheap steady gold income, no fleet needed.',
  barracks: 'Trains soldiers you command directly: Infantry, Assault, Machine Gun and Sniper squads. Each barracks also raises your unit limit.',
  cannon: 'Fires at distant hexes to damage defenders and clear forests and blast passes through mountains. Needs a reload between shots. Unlocked through research.',
  trench: 'Dug into the ground and links up with neighbouring trenches. Select infantry and click it to station up to 4 of them inside, where they hold position and are much harder to hit.',
  battery: 'Shells the strongest enemy attack in range on its own, with no gold per shot. Unlocked through research.',
  factory: 'Builds armour you command directly: fast MRAPs with a .50 cal turret and heavy tanks with a main gun and a machine gun. Each factory also raises your unit limit.',
};

export function buildingDescription(kind: BuildingKind): string {
  return BUILDING_DESCRIPTIONS[kind];
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
  unit_limit: 'Unit limit reached: build more barracks or factories',
  queue_full: 'Production queue is full',
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
