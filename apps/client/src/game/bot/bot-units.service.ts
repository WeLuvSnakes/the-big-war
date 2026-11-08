import type { Bot } from './bot.types';
import type { HexCell } from '../map/map.types';
import type { UnitKind } from '../unit/unit.types';
import { isClaimable } from '../map/terrain.service';
import type { Empire } from '../empire/empire.types';
import type { GameState } from '../state/state.types';
import type { Command } from '../commands/commands.types';
import { NEUTRAL_OWNER } from '../empire/empire.constants';
import { buildingCellsOf } from '../map/world-index.service';
import { pick } from '@the-big-war/game-engine/rng/rng.service';
import { UNIT_KINDS, UNIT_STATS, UNIT_TUNING } from '../unit/unit.constants';
import { gridIndex } from '@the-big-war/game-engine/world-tile/world-tile.service';
import { hostileUnits, isWalkable, populationCap, populationOf, unitsOf } from '../unit/unit.service';

const ORDER_SECONDS = 6;
const QUEUE_DEPTH = 2;
const GOLD_RESERVE = 160;
const ATTACK_GROUP = 6;
const TRAIN_WEIGHTS: Readonly<Record<UnitKind, number>> = {
  infantry: 5,
  assault: 3,
  mg: 2,
  sniper: 1,
  mrap: 2,
  tank: 1,
};

export function unitCommands(bot: Bot, state: GameState, empire: Empire): Command[] {
  const commands: Command[] = [];
  const train = trainCommand(bot, state, empire);
  if (train) commands.push(train);
  const last = bot.cooldowns.get('units') ?? -Infinity;
  if (bot.clock - last < ORDER_SECONDS) return commands;
  const order = armyCommand(state, empire);
  if (order) {
    bot.cooldowns.set('units', bot.clock);
    commands.push(order);
  }
  return commands;
}

function trainCommand(bot: Bot, state: GameState, empire: Empire): Command | null {
  let room = populationCap(state, empire.id) - populationOf(state, empire.id);
  if (room <= 0) return null;
  for (const cell of buildingCellsOf(state, empire.id)) {
    const building = cell.building;
    if (!building || building.buildRemaining > 0 || building.demolishAt !== null) continue;
    if (building.kind !== 'barracks' && building.kind !== 'factory') continue;
    const at = gridIndex(state.grid, cell.q, cell.r);
    const line = state.production.find(item => item.at === at && item.building === building.id);
    if ((line?.queue.length ?? 0) >= QUEUE_DEPTH) continue;
    const options = UNIT_KINDS.filter(
      kind =>
        UNIT_STATS[kind].producer === building.kind &&
        UNIT_STATS[kind].population <= room &&
        empire.gold >= UNIT_STATS[kind].gold + GOLD_RESERVE &&
        empire.civilians >= UNIT_STATS[kind].civilians,
    );
    const weighted = options.flatMap(kind => Array<UnitKind>(TRAIN_WEIGHTS[kind]).fill(kind));
    const kind = pick(bot.rng, weighted);
    if (!kind) continue;
    room -= UNIT_STATS[kind].population;
    return { type: 'TrainUnit', empire: empire.id, hex: { q: cell.q, r: cell.r }, kind };
  }
  return null;
}

function armyCommand(state: GameState, empire: Empire): Command | null {
  const idle = unitsOf(state, empire.id).filter(unit => !unit.moving && unit.target === null && unit.mode === 'amove');
  if (idle.length < ATTACK_GROUP) return null;
  const cx = idle.reduce((sum, unit) => sum + unit.x, 0) / idle.length;
  const cy = idle.reduce((sum, unit) => sum + unit.y, 0) / idle.length;
  const goal = nearestObjective(state, empire, cx, cy);
  if (!goal) return null;
  const size = state.config.map.hexSize;
  return {
    type: 'OrderUnits',
    empire: empire.id,
    units: idle.map(unit => unit.id),
    order: { kind: 'move', mode: 'amove', x: (goal.q + 0.5) * size, y: (goal.r + 0.5) * size, formation: 'wedge' },
  };
}

function nearestObjective(state: GameState, empire: Empire, x: number, y: number): HexCell | null {
  const size = state.config.map.hexSize;
  let hostile: HexCell | null = null;
  let hostileGap = Infinity;
  let neutral: HexCell | null = null;
  let neutralGap = Infinity;
  for (const cell of state.grid.cells) {
    if (cell.owner === empire.id || !isClaimable(cell.terrain) || !isWalkable(cell)) continue;
    const gap = Math.hypot((cell.q + 0.5) * size - x, (cell.r + 0.5) * size - y);
    if (cell.owner === NEUTRAL_OWNER) {
      if (gap < neutralGap) {
        neutralGap = gap;
        neutral = cell;
      }
    } else if (hostileUnits(state, empire.id, cell.owner) && gap < hostileGap) {
      hostileGap = gap;
      hostile = cell;
    }
  }
  return hostile ?? (neutralGap < UNIT_TUNING.captureClearRadius * 4 ? neutral : null);
}
