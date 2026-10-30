import type { GameState } from '../state/state.types';
import { handleFireCannon } from './handlers/cannon.handler';
import { handleSendTroops } from './handlers/troops.handler';
import type { Command, CommandResult } from './commands.types';
import { handleStartResearch } from './handlers/research.handler';
import { handleRetreatFront, handleSetFrontMode } from './handlers/front.handler';
import { createDispatcher } from '@the-big-war/game-engine/commands/command.service';
import { handleLeaveTrench, handleManTrench, handleTrenchAttack } from './handlers/trench.handler';
import { handleSelectFaction, handleSetGameSpeed, handleSetPaused } from './handlers/match.handler';
import {
  handleDeclareWar,
  handleOfferPeace,
  handleRespondOffer,
} from './handlers/diplomacy.handler';
import { handleDemolishBuilding, handlePlaceBuilding, handleUpgradeBuilding } from './handlers/building.handler';

export const dispatch = createDispatcher<GameState, Command, CommandResult>({
  SetGameSpeed: handleSetGameSpeed,
  SetPaused: handleSetPaused,
  SelectFaction: handleSelectFaction,
  SendTroops: handleSendTroops,
  SetFrontMode: handleSetFrontMode,
  RetreatFront: handleRetreatFront,
  PlaceBuilding: handlePlaceBuilding,
  DemolishBuilding: handleDemolishBuilding,
  UpgradeBuilding: handleUpgradeBuilding,
  ManTrench: handleManTrench,
  LeaveTrench: handleLeaveTrench,
  TrenchAttack: handleTrenchAttack,
  FireCannon: handleFireCannon,
  StartResearch: handleStartResearch,
  OfferPeace: handleOfferPeace,
  DeclareWar: handleDeclareWar,
  RespondOffer: handleRespondOffer,
});

export function dispatchAll(state: GameState, commands: readonly Command[]): CommandResult[] {
  return commands.map(command => dispatch(state, command));
}
