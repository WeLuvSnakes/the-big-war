import { createGameStore } from '@the-big-war/client/game/store/store.service';
import { FIXED_DT } from '@the-big-war/game-engine/simulation/simulation.constants';
import { DEFAULT_GAME_CONFIG } from '@the-big-war/client/game/config/config.constants';

interface BenchCase {
  readonly width: number;
  readonly height: number;
  readonly empires: number;
}

const CASES: readonly BenchCase[] = [
  { width: 72, height: 42, empires: 4 },
  { width: 240, height: 140, empires: 8 },
  { width: 500, height: 300, empires: 16 },
];

const WARMUP_TICKS = 1800;
const SAMPLE_TICKS = 900;
const TICKS_PER_SECOND_AT_4X = 120;

function percentile(sorted: readonly number[], share: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * share))] ?? 0;
}

function run({ width, height, empires }: BenchCase): void {
  const config = {
    ...DEFAULT_GAME_CONFIG,
    map: { ...DEFAULT_GAME_CONFIG.map, width, height },
    start: { ...DEFAULT_GAME_CONFIG.start, empireCount: empires },
  };

  const store = createGameStore({ config });
  const generateStart = performance.now();
  store.startMatch(config);
  const generateMs = performance.now() - generateStart;

  for (let tick = 0; tick < WARMUP_TICKS; tick++) store.step(FIXED_DT);

  const samples: number[] = [];
  for (let tick = 0; tick < SAMPLE_TICKS; tick++) {
    const start = performance.now();
    store.step(FIXED_DT);
    samples.push(performance.now() - start);
  }

  const total = samples.reduce((sum, sample) => sum + sample, 0);
  samples.sort((a, b) => a - b);
  const mean = total / samples.length;
  const load = (mean * TICKS_PER_SECOND_AT_4X) / 10;
  console.log(
    `${width}x${height} ${empires} empires: generate ${generateMs.toFixed(0)}ms, ` +
      `tick mean ${mean.toFixed(2)}ms p50 ${percentile(samples, 0.5).toFixed(2)}ms ` +
      `p95 ${percentile(samples, 0.95).toFixed(2)}ms max ${samples[samples.length - 1]!.toFixed(2)}ms, ` +
      `${load.toFixed(0)}% of a core at 4x, ` +
      `${store.state.offensives.length} offensives`,
  );
}

for (const benchCase of CASES) run(benchCase);
