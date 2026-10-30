import { stepShips } from './systems/ships.system';
import type { GameState } from '../state/state.types';
import { stepEconomy } from './systems/economy.system';
import { stepResearch } from './systems/research.system';
import { stepArtillery } from './systems/artillery.system';
import { stepBuildings } from './systems/buildings.system';
import { stepGathering } from './systems/gathering.system';
import { stepOffensives } from './systems/offensives.system';
import { checkWinConditions } from './systems/victory.system';
import { stepRecruitment } from './systems/recruitment.system';
import { stepHousekeeping } from './systems/housekeeping.system';
import { createStepper } from '@the-big-war/game-engine/simulation/simulation.service';
import type { Stepper, System } from '@the-big-war/game-engine/simulation/simulation.types';

export const GAME_SYSTEMS: readonly System<GameState>[] = [
  stepEconomy,
  stepGathering,
  stepResearch,
  stepRecruitment,
  stepBuildings,
  stepArtillery,
  stepShips,
  stepOffensives,
  stepHousekeeping,
  checkWinConditions,
];

const advance = createStepper(GAME_SYSTEMS);

export const step: Stepper<GameState> = (state, dt) => {
  if (state.spawnSites.length === 0) advance(state, dt);
};
