import { BOT_TUNING } from './bot.constants';
import type { Bot, HostileEdge } from './bot.types';
import { finishedPorts } from '../ship/ship.service';
import type { Empire } from '../empire/empire.types';
import type { GameState } from '../state/state.types';
import { hasUnlock } from '../research/research.service';
import type { Command } from '../commands/commands.types';
import { clamp } from '@the-big-war/game-engine/math/math.service';
import { troopsCommittedAgainst } from '../offensive/offensive.service';
import { chance, nextInt } from '@the-big-war/game-engine/rng/rng.service';
import { gridIndex } from '@the-big-war/game-engine/world-tile/world-tile.service';
import { effectiveAggression, hasFreeBoat, hostileEdges, hostileWaters, overseasTarget } from './bot-queries.service';

export function troopCommand(bot: Bot, state: GameState, empire: Empire): Command | null {
  const edges = hostileEdges(state, bot.empire);

  const aggression = effectiveAggression(bot, state);
  const floor = empire.reserveCap * BOT_TUNING.reserveFloorRatio;
  const surplusShare = aggression >= 0.85 ? 1 : aggression >= 0.5 ? 0.7 : 0.4;
  const spendable = empire.soldiers - floor;
  if (spendable < 1) return null;

  const send = Math.floor(spendable * surplusShare);
  const percent = clamp(Math.ceil((send / empire.soldiers) * 100), 1, 100);
  if (edges.length === 0) return landingCommand(bot, state, empire, send, percent);

  let weakest: HostileEdge[] = [];
  let bestDefence = Infinity;
  for (const edge of edges) {
    const defence = troopsCommittedAgainst(state, edge.defender, bot.empire);
    if (defence < bestDefence) {
      bestDefence = defence;
      weakest = [];
    }
    if (defence === bestDefence) weakest.push(edge);
  }
  const best = weakest[nextInt(bot.rng, weakest.length)]!;
  const localTroops = troopsCommittedAgainst(state, bot.empire, best.defender);
  const ratio = (localTroops + empire.soldiers) / Math.max(bestDefence, 1);
  if (ratio < BOT_TUNING.attackSuperiority && aggression < 0.85) return null;
  return { type: 'SendTroops', empire: bot.empire, target: best.target, percent };
}

function landingCommand(bot: Bot, state: GameState, empire: Empire, send: number, percent: number): Command | null {
  const needed = Math.max(BOT_TUNING.minLandingTroops, empire.reserveCap * BOT_TUNING.landingReserveShare);
  if (send < needed || !hasFreeBoat(state, bot.empire)) return null;
  const target = overseasTarget(state, bot.empire);
  return target ? { type: 'SendTroops', empire: bot.empire, target, percent } : null;
}

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
