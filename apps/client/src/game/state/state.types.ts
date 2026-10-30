import type { Ship, ShipId } from '../ship/ship.types';
import type { Walker } from '../building/building.types';
import type { WorldIndex } from '../map/world-index.types';
import type { BuildingId } from '../building/building.types';
import type { HexGrid, WorldLabels } from '../map/map.types';
import type { Empire, EmpireId } from '../empire/empire.types';
import type { Rng } from '@the-big-war/game-engine/rng/rng.types';
import type { GameConfig, GameSpeed } from '../config/config.types';
import type { Offensive, OffensiveId } from '../offensive/offensive.types';
import type { Axial } from '@the-big-war/game-engine/world-tile/world-tile.types';
import type { SimulationState } from '@the-big-war/game-engine/simulation/simulation.types';
import type { DiplomaticRelation, OfferCooldown, PendingOffer } from '../diplomacy/diplomacy.types';

export type EndReason = 'elimination' | 'domination';

export interface GameState extends SimulationState {
  readonly config: GameConfig;
  playerEmpire: EmpireId;
  grid: HexGrid;
  map: WorldLabels;
  readonly index: WorldIndex;

  empires: Empire[];
  offensives: Offensive[];
  walkers: Walker[];
  nextOffensiveId: OffensiveId;
  ships: Ship[];
  nextShipId: ShipId;
  shipHash: Map<number, Ship[]>;
  tradeClock: number;

  landHexCount: number;

  spawnSites: (Axial | null)[];

  speed: GameSpeed;
  rng: Rng;
  winner: EmpireId | null;
  endReason: EndReason | null;

  nextBuildingId: BuildingId;

  relations: Record<string, DiplomaticRelation>;
  offerCooldowns: Record<string, OfferCooldown>;
  pendingOffers: PendingOffer[];
}

export type CreateState = (config: GameConfig) => GameState;
