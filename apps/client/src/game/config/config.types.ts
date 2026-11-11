import type { BuildingKind } from '../building/building.types';
import type { Biome, MapPreset, Terrain } from '../map/map.types';

export type GameSpeed = 1 | 2 | 4;
export interface MapConfig {
  readonly width: number;
  readonly height: number;

  readonly hexSize: number;

  readonly seed: number;

  readonly preset?: MapPreset;
}

export interface BiomeConfig {
  readonly defence: number;
  readonly speed: number;
  readonly population: number;
}

export interface VictoryConfig {
  readonly dominationShare: number;
}

export interface BuildingConfig {
  readonly cost: number;

  readonly buildSeconds: number;

  readonly requiresResearch: string | null;
}

export interface StartConfig {
  readonly gold: number;
  readonly civilians: number;
  readonly science: number;

  readonly empireCount: number;
  readonly neutralStates?: number;
  readonly pickSpawns?: boolean;

  readonly humanName?: string;
}

export interface UpgradeConfig {
  readonly maxLevel: number;
  readonly costMultiplier: number;
}

export interface DemolishConfig {

  readonly durationSeconds: number;

  readonly refund: 0;
}

export interface CannonConfig {
  readonly cost: number;

  readonly cooldown: number;

  readonly range: number;

  readonly damage: number;

  readonly blastRadius: number;

  readonly destroysTerrain: readonly Terrain[];
}

export interface TrenchConfig {
  readonly capacity: number;
}

export interface BatteryConfig {
  readonly cooldown: number;

  readonly range: number;

  readonly damage: number;
}

export interface CombatConfig {
  readonly terrainDefence: Readonly<Record<Terrain, number>>;
}

export interface EconomyConfig {

  readonly baseGrowthPerSecond: number;

  readonly growthPerTile: number;

  readonly cityGrowthPerCity: number;

  readonly farmGrowthPerFarm: number;
  readonly farmGrowthMax: number;
  readonly marketGoldPerSecond: number;
  readonly fisheryGoldPerSecond: number;

  readonly labSciencePerSecond: number;
  readonly labGoldPerSecond: number;

  readonly workersPerBuilding: number;

  readonly buildingCostStep: number;
  readonly tilesPerFreeBuilding: number;
  readonly taxGoldPerTile: number;
}

export interface GatherConfig {
  readonly workersPerBuilding: number;

  readonly loadsPerTile: number;

  readonly workSeconds: number;
  readonly walkSecondsPerHex: number;

  readonly roadWalkFactor: number;

  readonly goldPerLoad: number;

  readonly oreLoadsPerTile: number;
  readonly oreGoldPerLoad: number;
}

export interface BotConfig {

  readonly tickSeconds: number;

  readonly aggression: number;
}

export interface DiplomacyConfig {

  readonly treatySeconds: number;
  readonly rejectCooldownSeconds: number;

  readonly offerExpirySeconds: number;
  readonly totalWarSecondsPerScale: number;
  readonly totalWarPeaceRatio: number;
}

export interface ShipKindConfig {
  readonly hp: number;
  readonly speed: number;
}

export interface ShipConfig {
  readonly transport: ShipKindConfig;
  readonly battleship: ShipKindConfig;
  readonly trade: ShipKindConfig;

  readonly boatsPerPort: number;
  readonly boatsPerUpgrade: number;
  readonly portUpgradeCost: number;

  readonly battleshipCost: number;
  readonly battleshipSeconds: number;

  readonly range: number;
  readonly damage: number;
  readonly cooldown: number;
  readonly coastTroopDamage: number;
  readonly coastBuildingHits: number;
  readonly blockadeRadius: number;

  readonly tradeIntervalSeconds: number;
  readonly tradeShipsPerPort: number;
  readonly tradeBaseGold: number;
  readonly tradeGoldPerTile: number;
}

export interface GameConfig {
  readonly map: MapConfig;
  readonly start: StartConfig;
  readonly upgrades: UpgradeConfig;
  readonly demolish: DemolishConfig;
  readonly cannon: CannonConfig;
  readonly battery: BatteryConfig;
  readonly trench: TrenchConfig;
  readonly ship: ShipConfig;
  readonly combat: CombatConfig;
  readonly biomes: Readonly<Record<Biome, BiomeConfig>>;
  readonly victory: VictoryConfig;
  readonly economy: EconomyConfig;
  readonly gather: GatherConfig;
  readonly bot: BotConfig;
  readonly diplomacy: DiplomacyConfig;
  readonly buildings: Readonly<Record<BuildingKind, BuildingConfig>>;
}

