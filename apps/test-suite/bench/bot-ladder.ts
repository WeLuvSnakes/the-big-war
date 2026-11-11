import type { Bot } from '@the-big-war/client/game/bot/bot.types';
import { unitsOf } from '@the-big-war/client/game/unit/unit.service';
import type { GameState } from '@the-big-war/client/game/state/state.types';
import { botTick, createBot } from '@the-big-war/client/game/bot/bot.service';
import { dispatch } from '@the-big-war/client/game/commands/commands.service';
import { step } from '@the-big-war/client/game/simulation/simulation.service';
import { createInitialState } from '@the-big-war/client/game/state/setup.service';
import { buildingCellsOf } from '@the-big-war/client/game/map/world-index.service';
import { FIXED_DT } from '@the-big-war/game-engine/simulation/simulation.constants';
import { DEFAULT_GAME_CONFIG } from '@the-big-war/client/game/config/config.constants';

const MINUTES = Number(process.argv[2] ?? 8);
const SEED = Number(process.argv[3] ?? 1337);
const LEVELS: Readonly<Record<string, number>> = { easy: 0.2, normal: 0.5, hard: 0.8 };
const DIFFICULTIES = (process.argv[4] ?? 'easy,normal,hard,easy').split(',').map(name => LEVELS[name] ?? 0.5);

function summary(state: GameState, bots: readonly Bot[]): string {
  return bots
    .map(bot => {
      const empire = state.empires[bot.empire]!;
      const kinds = new Map<string, number>();
      for (const cell of buildingCellsOf(state, bot.empire)) {
        const kind = cell.building!.kind;
        kinds.set(kind, (kinds.get(kind) ?? 0) + 1);
      }
      const built = [...kinds].map(([kind, count]) => `${kind}${count}`).join(' ');
      const label = Object.keys(LEVELS).find(name => LEVELS[name] === DIFFICULTIES[bot.empire]) ?? '?';
      return `  #${bot.empire} ${label} ${empire.alive ? '' : 'DEAD '}hex=${empire.hexCount} gold=${empire.gold.toFixed(0)} +${empire.goldBalance.toFixed(2)}/s civ=${empire.civilians.toFixed(1)} units=${unitsOf(state, bot.empire).length} | ${built}`;
    })
    .join('\n');
}

const config = {
  ...DEFAULT_GAME_CONFIG,
  map: { ...DEFAULT_GAME_CONFIG.map, seed: SEED },
  start: { ...DEFAULT_GAME_CONFIG.start, empireCount: DIFFICULTIES.length },
};
const state = createInitialState(config);
for (const empire of state.empires) empire.isHuman = false;
const bots = state.empires.map(empire => createBot({ empire: empire.id, seed: SEED, difficulty: DIFFICULTIES[empire.id] }));

const tickSeconds = config.bot.tickSeconds;
const stepsPerMinute = Math.round(60 / FIXED_DT);
let accumulator = 0;
for (let minute = 1; minute <= MINUTES && state.status === 'playing'; minute++) {
  for (let i = 0; i < stepsPerMinute; i++) {
    step(state, FIXED_DT);
    accumulator += FIXED_DT;
    while (accumulator >= tickSeconds) {
      accumulator -= tickSeconds;
      for (const bot of bots) for (const command of botTick(bot, state, tickSeconds)) dispatch(state, command);
    }
  }
  console.log(`minute ${minute}\n${summary(state, bots)}`);
}
console.log(`status=${state.status} winner=${state.winner} at ${state.elapsed.toFixed(0)}s`);
