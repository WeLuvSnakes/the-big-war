import { createBotAgents } from '@the-big-war/client/game/bot/bot.service';
import { dispatch } from '@the-big-war/client/game/commands/commands.service';
import { createInitialState } from '@the-big-war/client/game/state/setup.service';
import { FIXED_DT } from '@the-big-war/game-engine/simulation/simulation.constants';
import { GAME_SYSTEMS } from '@the-big-war/client/game/simulation/simulation.service';
import { DEFAULT_GAME_CONFIG } from '@the-big-war/client/game/config/config.constants';

const WARMUP_TICKS = 1800;
const SAMPLE_TICKS = 300;

const config = {
  ...DEFAULT_GAME_CONFIG,
  map: { ...DEFAULT_GAME_CONFIG.map, width: 500, height: 300 },
  start: { ...DEFAULT_GAME_CONFIG.start, empireCount: 16 },
};

const state = createInitialState(config);
const agents = createBotAgents(state);
const totals = new Map<string, number>();
let agentClock = 0;

function tick(record: boolean): void {
  state.elapsed += FIXED_DT;
  state.tick += 1;
  for (const system of GAME_SYSTEMS) {
    const start = performance.now();
    system(state, FIXED_DT);
    if (record) totals.set(system.name, (totals.get(system.name) ?? 0) + performance.now() - start);
  }
  agentClock += FIXED_DT;
  if (agentClock < state.config.bot.tickSeconds) return;
  const elapsed = agentClock;
  agentClock = 0;
  const start = performance.now();
  for (const agent of agents) for (const command of agent(state, elapsed)) dispatch(state, command);
  if (record) totals.set('bots', (totals.get('bots') ?? 0) + performance.now() - start);
}

for (let i = 0; i < WARMUP_TICKS; i++) tick(false);
for (let i = 0; i < SAMPLE_TICKS; i++) tick(true);

const rows = [...totals].sort((a, b) => b[1] - a[1]);
const sum = rows.reduce((all, [, ms]) => all + ms, 0);
for (const [name, ms] of rows) {
  console.log(`${name.padEnd(22)} ${(ms / SAMPLE_TICKS).toFixed(3).padStart(8)}ms/tick ${((ms / sum) * 100).toFixed(1).padStart(5)}%`);
}
console.log(`${'total'.padEnd(22)} ${(sum / SAMPLE_TICKS).toFixed(3).padStart(8)}ms/tick`);
console.log(`offensives: ${state.offensives.length}`);
