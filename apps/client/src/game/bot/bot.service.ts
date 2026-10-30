import type { Bot, BotOptions } from './bot.types';
import { BOT_PERSONALITIES } from './bot.constants';
import type { GameState } from '../state/state.types';
import type { Command } from '../commands/commands.types';
import { evaluateDiplomacy } from './bot-diplomacy.service';
import { createRng } from '@the-big-war/game-engine/rng/rng.service';
import { fleetCommands, troopCommand } from './bot-military.service';
import type { Agent } from '@the-big-war/game-engine/agent/agent.types';
import { cannonCommand, constructionCommands, researchCommand, trenchCommands } from './bot-economy.service';

export function createBot(options: BotOptions): Bot {
  const personality =
    options.personality ?? BOT_PERSONALITIES[(options.seed + options.empire) % BOT_PERSONALITIES.length]!;
  return {
    empire: options.empire,
    personality,
    rng: createRng((options.seed + options.empire * 0x9e3779b9) >>> 0),
  };
}

export function botTick(bot: Bot, state: GameState, _dt: number): Command[] {
  const empire = state.empires[bot.empire];
  if (!empire || !empire.alive || state.status !== 'playing') return [];

  const commands: Command[] = [];

  const diplomacyCommand = evaluateDiplomacy(bot, state, empire);
  if (diplomacyCommand) commands.push(diplomacyCommand);

  const research = researchCommand(bot, state, empire);
  if (research) commands.push(research);

  commands.push(...constructionCommands(bot, state, empire));
  commands.push(...trenchCommands(bot, state, empire));
  commands.push(...fleetCommands(bot, state, empire));

  const cannon = cannonCommand(bot, state, empire);
  if (cannon) commands.push(cannon);

  const troops = troopCommand(bot, state, empire);
  if (troops) commands.push(troops);

  return commands;
}

export function createBotAgents(state: GameState): Agent<GameState, Command>[] {
  return state.empires
    .filter(empire => !empire.isHuman)
    .map(empire => {
      const bot = createBot({ empire: empire.id, seed: state.config.map.seed });
      return (current: GameState, dt: number) => botTick(bot, current, dt);
    });
}
