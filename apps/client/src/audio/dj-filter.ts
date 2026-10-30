import { MOOD_SCORES, scoreBar } from './soundtrack';
import type { Mood, SweepMove } from './audio.types';

const CENTRE = 0.5;
const LOWPASS_MIN_HZ = 150;
const LOWPASS_MAX_HZ = 20000;
const HIGHPASS_MIN_HZ = 20;
const HIGHPASS_MAX_HZ = 6000;
const BEATS_PER_BAR = 4;
const SNAP_BEATS = 0.05;
const KNOCK_THROW = 0.38;
const RUG_CHANCE = 0.15;
const RUG_BEATS = 1;
const WANDER_MOVES = 2;
const HOME_BEATS = 2;

const sweep = (from: number, to: number, x: number): number => from * (to / from) ** x;

export const djCutoffs = (position: number): { readonly lowpass: number; readonly highpass: number } => ({
  lowpass: position < CENTRE ? sweep(LOWPASS_MIN_HZ, LOWPASS_MAX_HZ, position * 2) : LOWPASS_MAX_HZ,
  highpass: position > CENTRE ? sweep(HIGHPASS_MIN_HZ, HIGHPASS_MAX_HZ, (position - CENTRE) * 2) : HIGHPASS_MIN_HZ,
});

function wander(depth: number, random: () => number): SweepMove[] {
  const moves: SweepMove[] = [];
  const beatsEach = BEATS_PER_BAR / WANDER_MOVES;
  for (let move = 0; move < WANDER_MOVES; move++) {
    const position = CENTRE + (random() * 2 - 1) * depth;
    moves.push({ beat: move * beatsEach, beats: beatsEach, position });
  }
  return moves;
}

function pullRug(moves: readonly SweepMove[], random: () => number): SweepMove[] {
  const beat = Math.floor(random() * (BEATS_PER_BAR - RUG_BEATS));
  const side = random() < CENTRE ? 1 : 0;
  const back = moves.at(-1)!.position;
  return [
    ...moves.filter(move => move.beat < beat),
    { beat, beats: SNAP_BEATS, position: side },
    { beat: beat + RUG_BEATS, beats: SNAP_BEATS, position: back },
  ];
}

export function composeSweep(mood: Mood, bar: number, random: () => number): readonly SweepMove[] {
  const { arpeggio, line, sun, hammered, bounce } = scoreBar(mood, bar);
  if (hammered) {
    return (line ?? []).map(([beat], index) => ({
      beat,
      beats: SNAP_BEATS,
      position: CENTRE + (index % 2 ? -KNOCK_THROW : KNOCK_THROW),
    }));
  }
  if (bounce) return [{ beat: 0, beats: BEATS_PER_BAR, position: 1 }];
  if (sun || (line && !arpeggio)) return [{ beat: 0, beats: HOME_BEATS, position: CENTRE }];
  if (!arpeggio) return [];
  const moves = wander(MOOD_SCORES[mood].sweepDepth, random);
  return random() < RUG_CHANCE ? pullRug(moves, random) : moves;
}
