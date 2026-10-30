import type { Bot } from './bot.types';
import { BOT_TUNING } from './bot.constants';
import { sideOf } from '../front/front.service';
import type { Empire } from '../empire/empire.types';
import type { FrontMode } from '../front/front.types';
import type { GameState } from '../state/state.types';
import type { Command } from '../commands/commands.types';
import { clamp } from '@the-big-war/game-engine/math/math.service';
import { effectiveAggression, hostileEdges, troopsOnFrontsAgainst } from './bot-queries.service';

export function troopCommand(bot: Bot, state: GameState, empire: Empire): Command | null {
  const edges = hostileEdges(state, bot.empire);

  const aggression = effectiveAggression(bot, state);
  const floor = empire.reserveCap * BOT_TUNING.reserveFloorRatio;
  const surplusShare = aggression >= 0.85 ? 1 : aggression >= 0.5 ? 0.7 : 0.4;
  const spendable = empire.soldiers - floor;
  if (spendable < 1 || edges.length === 0) return null;

  const send = Math.floor(spendable * surplusShare);
  const percent = clamp(Math.ceil((send / empire.soldiers) * 100), 1, 100);

  let best = edges[0]!;
  let bestDefence = Infinity;
  for (const edge of edges) {
    const defence = troopsOnFrontsAgainst(state, edge.defender, bot.empire);
    if (defence < bestDefence) {
      bestDefence = defence;
      best = edge;
    }
  }
  const localTroops = troopsOnFrontsAgainst(state, bot.empire, best.defender);
  const ratio = (localTroops + empire.soldiers) / Math.max(bestDefence, 1);
  const wantsAttack = ratio >= BOT_TUNING.attackSuperiority || aggression >= 0.85;
  return {
    type: 'SendTroops',
    empire: bot.empire,
    hex: best.from,
    target: best.target,
    percent,
    intent: wantsAttack ? 'attack' : 'defence',
  };
}

export function frontModeCommands(bot: Bot, state: GameState): Command[] {
  const commands: Command[] = [];
  const aggression = effectiveAggression(bot, state);
  for (const front of state.fronts) {
    const side = sideOf(front, bot.empire);
    if (!side) continue;
    const other = side === front.sideA ? front.sideB : front.sideA;
    const losing = side.troops < other.troops * BOT_TUNING.defenceThreshold;
    const mode: FrontMode = losing ? 'defence' : aggression >= 0.85 ? 'counterattack' : 'attack';
    if (side.mode !== mode) commands.push({ type: 'SetFrontMode', empire: bot.empire, frontId: front.id, mode });
  }
  return commands;
}
