import type { GameState } from '../state/state.types';
import { handleFireCannon } from './handlers/cannon.handler';
import type { Command, CommandResult } from './commands.types';
import { handleStartResearch } from './handlers/research.handler';
import { handleBuildShip, handleOrderShip } from './handlers/ship.handler';
import { createDispatcher } from '@the-big-war/game-engine/commands/command.service';
import { handleCancelUnit, handleOrderUnits, handleTrainUnit } from './handlers/unit.handler';
import {
  handleDeclareWar,
  handleOfferPeace,
  handleRespondOffer,
} from './handlers/diplomacy.handler';
import { handleDemolishBuilding, handlePlaceBuilding, handleUpgradeBuilding } from './handlers/building.handler';
import { handleChooseSpawn, handleConfirmSpawn, handleSelectFaction, handleSetGameSpeed, handleSetPaused } from './handlers/match.handler';

export const dispatch = createDispatcher<GameState, Command, CommandResult>({
  SetGameSpeed: handleSetGameSpeed,
  SetPaused: handleSetPaused,
  SelectFaction: handleSelectFaction,
  ChooseSpawn: handleChooseSpawn,
  ConfirmSpawn: handleConfirmSpawn,
  PlaceBuilding: handlePlaceBuilding,
  DemolishBuilding: handleDemolishBuilding,
  UpgradeBuilding: handleUpgradeBuilding,
  FireCannon: handleFireCannon,
  TrainUnit: handleTrainUnit,
  CancelUnit: handleCancelUnit,
  OrderUnits: handleOrderUnits,
  BuildShip: handleBuildShip,
  OrderShip: handleOrderShip,
  StartResearch: handleStartResearch,
  OfferPeace: handleOfferPeace,
  DeclareWar: handleDeclareWar,
  RespondOffer: handleRespondOffer,
});
