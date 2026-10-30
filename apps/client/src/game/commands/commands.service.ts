import type { GameState } from '../state/state.types';
import { handleFireCannon } from './handlers/cannon.handler';
import type { Command, CommandResult } from './commands.types';
import { handleStartResearch } from './handlers/research.handler';
import { handleBuildShip, handleOrderShip } from './handlers/ship.handler';
import { createDispatcher } from '@the-big-war/game-engine/commands/command.service';
import { handleLeaveTrench, handleManTrench, handleTrenchAttack } from './handlers/trench.handler';
import { handleOrderOffensive, handleRecallOffensive, handleSendTroops } from './handlers/troops.handler';
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
  SendTroops: handleSendTroops,
  RecallOffensive: handleRecallOffensive,
  OrderOffensive: handleOrderOffensive,
  PlaceBuilding: handlePlaceBuilding,
  DemolishBuilding: handleDemolishBuilding,
  UpgradeBuilding: handleUpgradeBuilding,
  ManTrench: handleManTrench,
  LeaveTrench: handleLeaveTrench,
  TrenchAttack: handleTrenchAttack,
  FireCannon: handleFireCannon,
  BuildShip: handleBuildShip,
  OrderShip: handleOrderShip,
  StartResearch: handleStartResearch,
  OfferPeace: handleOfferPeace,
  DeclareWar: handleDeclareWar,
  RespondOffer: handleRespondOffer,
});

export function dispatchAll(state: GameState, commands: readonly Command[]): CommandResult[] {
  return commands.map(command => dispatch(state, command));
}
