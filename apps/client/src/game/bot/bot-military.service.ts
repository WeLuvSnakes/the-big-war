import type { Bot } from './bot.types';
import { BOT_TUNING } from './bot.constants';
import { finishedPorts } from '../ship/ship.service';
import type { Empire } from '../empire/empire.types';
import { hostileWaters } from './bot-queries.service';
import type { GameState } from '../state/state.types';
import { hasUnlock } from '../research/research.service';
import type { Command } from '../commands/commands.types';
import { chance } from '@the-big-war/game-engine/rng/rng.service';
import { gridIndex } from '@the-big-war/game-engine/world-tile/world-tile.service';

export function fleetCommands(bot: Bot, state: GameState, empire: Empire): Command[] {
  const commands: Command[] = [];
  const ports = finishedPorts(state, bot.empire);
  const fleet = state.ships.filter(ship => ship.empire === bot.empire && ship.kind === 'battleship');
  const port = ports.find(item => item.building!.shipBuild === 0);
  if (
    port &&
    hasUnlock(empire, 'ship:battleship') &&
    fleet.length < ports.length * BOT_TUNING.battleshipsPerPort &&
    empire.gold >= state.config.ship.battleshipCost * BOT_TUNING.battleshipGoldMargin
  ) {
    commands.push({ type: 'BuildShip', empire: bot.empire, hex: { q: port.q, r: port.r } });
  }
  const idle = fleet.find(ship => ship.next === null && ship.pathAt >= ship.path.length);
  if (!idle || !chance(bot.rng, BOT_TUNING.fleetOrderChance)) return commands;
  const body = state.map.waterBody[gridIndex(state.grid, idle.pos.q, idle.pos.r)]!;
  const target = hostileWaters(state, bot.empire, body);
  if (target) commands.push({ type: 'OrderShip', empire: bot.empire, ship: idle.id, target });
  return commands;
}
