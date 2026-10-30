import type { ShipId } from '../ship/ship.types';
import type { EmpireId } from '../empire/empire.types';
import type { GameSpeed } from '../config/config.types';
import type { BuildingKind } from '../building/building.types';
import type { OffensiveId } from '../offensive/offensive.types';
import type { Axial } from '@the-big-war/game-engine/world-tile/world-tile.types';
import type { CommandOutcome, CommandLogEntry as EngineCommandLogEntry } from '@the-big-war/game-engine/commands/command.types';

export type CommandError =
  | 'not_playing'
  | 'no_empire'
  | 'insufficient_gold'
  | 'insufficient_civilians'
  | 'insufficient_science'
  | 'insufficient_troops'
  | 'reserve_full'
  | 'trench_full'
  | 'invalid_target'
  | 'not_researched'
  | 'cooldown'
  | 'research_unavailable'
  | 'in_peace'
  | 'already_at_war'
  | 'invalid_diplomacy'
  | 'offer_rejected'
  | 'offer_cooldown'
  | 'offer_pending'
  | 'offer_missing'
  | 'no_port'
  | 'port_busy'
  | 'blockaded'
  | 'no_sea_route'
  | 'stale_match';

export interface SendTroopsCommand {
  readonly type: 'SendTroops';
  readonly empire: EmpireId;

  readonly target: Axial;

  readonly percent: number;
}

export interface RecallOffensiveCommand {
  readonly type: 'RecallOffensive';
  readonly empire: EmpireId;
  readonly offensive: OffensiveId;
}

export interface OrderOffensiveCommand {
  readonly type: 'OrderOffensive';
  readonly empire: EmpireId;
  readonly offensive: OffensiveId;
  readonly target: Axial;
}

export interface PlaceBuildingCommand {
  readonly type: 'PlaceBuilding';
  readonly empire: EmpireId;
  readonly hex: Axial;
  readonly kind: BuildingKind;
}

export interface DemolishBuildingCommand {
  readonly type: 'DemolishBuilding';
  readonly empire: EmpireId;
  readonly hex: Axial;
}

export interface UpgradeBuildingCommand {
  readonly type: 'UpgradeBuilding';
  readonly empire: EmpireId;
  readonly hex: Axial;
}

export interface ManTrenchCommand {
  readonly type: 'ManTrench';
  readonly empire: EmpireId;
  readonly hex: Axial;
  readonly percent: number;
}

export interface LeaveTrenchCommand {
  readonly type: 'LeaveTrench';
  readonly empire: EmpireId;
  readonly hex: Axial;
  readonly percent: number;
}

export interface TrenchAttackCommand {
  readonly type: 'TrenchAttack';
  readonly empire: EmpireId;
  readonly hex: Axial;
  readonly target: Axial;
  readonly percent: number;
}

export interface BuildShipCommand {
  readonly type: 'BuildShip';
  readonly empire: EmpireId;
  readonly hex: Axial;
}

export interface OrderShipCommand {
  readonly type: 'OrderShip';
  readonly empire: EmpireId;
  readonly ship: ShipId;
  readonly target: Axial;
}

export interface FireCannonCommand {
  readonly type: 'FireCannon';
  readonly empire: EmpireId;

  readonly from: Axial;
  readonly target: Axial;
}

export interface StartResearchCommand {
  readonly type: 'StartResearch';
  readonly empire: EmpireId;
  readonly nodeId: string;

  readonly optionId?: string;
}

export interface SetGameSpeedCommand {
  readonly type: 'SetGameSpeed';
  readonly speed: GameSpeed;
}

export interface SelectFactionCommand {
  readonly type: 'SelectFaction';
  readonly empire: EmpireId;
  readonly factionId: string;
}

export interface ChooseSpawnCommand {
  readonly type: 'ChooseSpawn';
  readonly empire: EmpireId;
  readonly target: Axial;
}

export interface ConfirmSpawnCommand {
  readonly type: 'ConfirmSpawn';
}

export interface SetPausedCommand {
  readonly type: 'SetPaused';
  readonly paused: boolean;
}

export interface OfferPeaceCommand {
  readonly type: 'OfferPeace';
  readonly empire: EmpireId;
  readonly target: EmpireId;
}

export interface DeclareWarCommand {
  readonly type: 'DeclareWar';
  readonly empire: EmpireId;
  readonly target: EmpireId;
}

export interface RespondOfferCommand {
  readonly type: 'RespondOffer';
  readonly empire: EmpireId;
  readonly from: EmpireId;
  readonly accept: boolean;
}

export type Command =
  | SendTroopsCommand
  | RecallOffensiveCommand
  | OrderOffensiveCommand
  | PlaceBuildingCommand
  | DemolishBuildingCommand
  | UpgradeBuildingCommand
  | ManTrenchCommand
  | LeaveTrenchCommand
  | TrenchAttackCommand
  | FireCannonCommand
  | BuildShipCommand
  | OrderShipCommand
  | StartResearchCommand
  | SetGameSpeedCommand
  | SelectFactionCommand
  | ChooseSpawnCommand
  | ConfirmSpawnCommand
  | SetPausedCommand
  | OfferPeaceCommand
  | DeclareWarCommand
  | RespondOfferCommand;

export type CommandType = Command['type'];

export type CommandResult = CommandOutcome<Command, CommandError>;

export type CommandLogEntry = EngineCommandLogEntry<Command, CommandResult>;
