import type { Mood, MoodScore, ScoreBar, ScoreLine, ScoreNote } from './audio.types';

const BEATS_PER_BAR = 4;
const TRIPLETS_PER_BAR = 12;
const BASS_VELOCITY = 0.7;
const ARPEGGIO_VELOCITY = 0.32;
const ARPEGGIO_ACCENT = 0.42;
const ARPEGGIO_PEDAL_BEATS = 2;
const LINE_VELOCITY = 0.9;
const SUN_BEATS = 6;
const SUN_VELOCITY = 0.8;
const OCTAVE = 12;
const HAND_STAGGER_BEATS = 0.08;
const LATE_HAND_BEATS = 0.14;
const VELOCITY_SWAY = 0.3;
const SLIP_CHANCE = 0.14;
const SLIP_BEATS = 0.14;
const SLIP_VELOCITY = 0.55;
const SLAM_CHANCE = 0.09;
const SLAM_BEATS = 0.4;
const SLAM_LATEST_BEAT = 2;
const MACHINE_DELAY_BEATS = 0.5;
const MACHINE_STEP_BEATS = 1 / 24;
const MACHINE_LEAP = 5;
const MACHINE_VELOCITY = 0.45;
const MACHINE_OCTAVES = [-12, 0, 12, 24] as const;
const BOUNCE_FIRST_GAP_BEATS = 0.75;
const BOUNCE_DECAY = 0.82;
const BOUNCE_MIN_GAP_BEATS = 0.03;
const SOURNESS_SEMITONES = 0.18;
const HARMONIC_TONIC = 2;
const HARMONIC_CENTS = [0, 5, 4, -2, -14, 51, 28, 2, 41, 6, -31, -12] as const;
const LOST_CHANCE = 0.08;
const LOST_BARS = 2;
const FINAL_DRAG = 1.4;
const AGARTHA_DRAG = 1.2;

const TONIC: ScoreBar = { bass: [37, 49], arpeggio: [56, 61, 64] };
const TONIC_OVER_B: ScoreBar = { bass: [35, 47], arpeggio: [56, 61, 64] };
const SUBMEDIANT: ScoreBar = { bass: [33, 45], arpeggio: [57, 61, 64] };
const NEAPOLITAN: ScoreBar = { bass: [38, 50], arpeggio: [57, 62, 66] };
const DOMINANT: ScoreBar = { bass: [32, 44], arpeggio: [56, 60, 63] };
const DOMINANT_OVER_B_SHARP: ScoreBar = { ...DOMINANT, bass: [36, 48] };

const quarters = (...midi: readonly number[]): ScoreLine => midi.map((note, beat) => [beat, 1, note]);

const ode = (one: number, two: number, three: number, four: number, five: number): readonly ScoreLine[] => [
  quarters(three, three, four, five),
  quarters(five, four, three, two),
  quarters(one, one, two, three),
  [[0, 1.5, three], [1.5, 0.5, two], [2, 2, two]],
  [[0, 1.5, two], [1.5, 0.5, one], [2, 2, one]],
];

const fate = (short: number, long: number): ScoreBar => ({
  hammered: true,
  line: [[0.5, 0.4, short], [1, 0.4, short], [1.5, 0.4, short], [2, 2, long]],
});

const VIGIL: ScoreLine = [[0, 2.75, 68], [2.75, 0.25, 68], [3, 1, 68]];

const MOONLIGHT: readonly ScoreBar[] = [
  TONIC,
  TONIC_OVER_B,
  SUBMEDIANT,
  NEAPOLITAN,
  { ...DOMINANT, line: VIGIL },
  { ...DOMINANT, line: VIGIL },
  TONIC,
  { ...TONIC, drag: FINAL_DRAG },
];

const [RISE, FALL_BACK, ROOT, HALF_CADENCE, HOME] = ode(73, 75, 76, 78, 80) as [ScoreLine, ScoreLine, ScoreLine, ScoreLine, ScoreLine];

const ODE: readonly ScoreBar[] = [
  { ...TONIC, line: RISE },
  { ...DOMINANT, line: FALL_BACK },
  { ...TONIC, line: ROOT },
  { ...DOMINANT, line: HALF_CADENCE },
  { ...TONIC, line: RISE },
  { ...DOMINANT, line: FALL_BACK },
  { ...TONIC, line: ROOT },
  { ...TONIC, line: HOME, drag: FINAL_DRAG },
];

const FATE: readonly ScoreBar[] = [
  fate(68, 64),
  fate(66, 63),
  { bounce: 63 },
  { drag: FINAL_DRAG },
  { line: [[0, 4, 50], [0.5, 3.5, 57], [1, 3, 62], [1.5, 2.5, 66], [2, 2, 74]], drag: FINAL_DRAG },
];

const [SUN_RISE, SUN_BACK, SUN_ROOT, SUN_HALF, SUN_HOME] = ode(86, 88, 90, 91, 93) as [ScoreLine, ScoreLine, ScoreLine, ScoreLine, ScoreLine];
const SUN_TONIC = [74, 78, 81, 86];
const SUN_DOMINANT = [73, 76, 81, 88];

const AGARTHA: readonly ScoreBar[] = [
  { line: SUN_RISE, sun: SUN_TONIC, drag: AGARTHA_DRAG },
  { line: SUN_BACK, sun: SUN_DOMINANT, drag: AGARTHA_DRAG },
  { line: SUN_ROOT, sun: SUN_TONIC, drag: AGARTHA_DRAG },
  { line: SUN_HALF, sun: SUN_DOMINANT, drag: AGARTHA_DRAG },
  { line: SUN_RISE, sun: SUN_TONIC, drag: AGARTHA_DRAG },
  { line: SUN_BACK, sun: SUN_DOMINANT, drag: AGARTHA_DRAG },
  { line: SUN_ROOT, sun: SUN_TONIC, drag: AGARTHA_DRAG },
  { line: SUN_HOME, sun: SUN_TONIC, drag: FINAL_DRAG },
];

const FALL: readonly ScoreBar[] = [
  { ...NEAPOLITAN, line: [[0, 2, 74], [2, 2, 73]] },
  { ...TONIC, line: [[0, 2, 69], [2, 2, 68]] },
  { ...DOMINANT_OVER_B_SHARP, line: [[0, 2, 66], [2, 2, 64]] },
  { ...DOMINANT, line: VIGIL, drag: FINAL_DRAG },
];

export const MOOD_SCORES: Readonly<Record<Mood, MoodScore>> = {
  menu: { bpm: 46, dynamics: 0.6, sweepDepth: 0.2, timpaniBeats: [], form: [...MOONLIGHT, ...AGARTHA, ...FALL] },
  peace: { bpm: 58, dynamics: 0.75, sweepDepth: 0.32, timpaniBeats: [], form: [...MOONLIGHT, ...ODE, ...FATE, ...AGARTHA, ...FALL] },
  war: { bpm: 84, dynamics: 1, sweepDepth: 0.42, timpaniBeats: [0, 2], form: [...FATE, ...ODE, ...FATE, ...AGARTHA, ...FALL] },
  aftermath: { bpm: 40, dynamics: 0.5, sweepDepth: 0.25, timpaniBeats: [], form: [...FALL, ...MOONLIGHT] },
};

export const midiToHz = (midi: number): number => 440 * 2 ** ((midi - 69) / 12);

export const sourness = (midi: number): number => Math.sin(midi * 12.9898) * SOURNESS_SEMITONES;

const soberCents = (midi: number): number => -sourness(midi) * 100;

export const harmonicCents = (midi: number): number => HARMONIC_CENTS[(midi - HARMONIC_TONIC) % HARMONIC_CENTS.length]!;

export const scoreBar = (mood: Mood, bar: number): ScoreBar => {
  const { form } = MOOD_SCORES[mood];
  return form[bar % form.length]!;
};

export const barSeconds = (mood: Mood, bar: number): number =>
  ((BEATS_PER_BAR * 60) / MOOD_SCORES[mood].bpm) * (scoreBar(mood, bar).drag ?? 1);

export function nextBar(mood: Mood, bar: number, random: () => number): number {
  const { line, hammered } = scoreBar(mood, bar);
  const lost = line && !hammered && random() < LOST_CHANCE;
  return lost ? Math.max(0, bar - LOST_BARS) : bar + 1;
}

const piano = (beat: number, beats: number, midi: number, velocity: number): ScoreNote => ({
  voice: 'piano',
  beat,
  beats,
  midi,
  velocity: Math.min(1, velocity),
});

const stagger = (beat: number, random: () => number): number =>
  Math.max(0, beat + (random() - 0.5) * HAND_STAGGER_BEATS);

const sway = (velocity: number, random: () => number): number => velocity * (1 - random() * VELOCITY_SWAY);

function moonlight(arpeggio: readonly number[], dynamics: number, random: () => number): ScoreNote[] {
  const notes: ScoreNote[] = [];
  for (let step = 0; step < TRIPLETS_PER_BAR; step++) {
    const velocity = step % 3 === 0 ? ARPEGGIO_ACCENT : ARPEGGIO_VELOCITY;
    const midi = arpeggio[step % arpeggio.length]!;
    notes.push(piano(stagger(step / 3, random), ARPEGGIO_PEDAL_BEATS, midi, sway(velocity * dynamics, random)));
  }
  return notes;
}

function drunkenLine(line: ScoreLine, dynamics: number, random: () => number): ScoreNote[] {
  const notes: ScoreNote[] = [];
  for (const [beat, beats, midi] of line) {
    const at = beat + random() * LATE_HAND_BEATS;
    const velocity = sway(LINE_VELOCITY * dynamics, random);
    if (at >= SLIP_BEATS && random() < SLIP_CHANCE) {
      notes.push(piano(at - SLIP_BEATS, SLIP_BEATS, midi + (random() < 0.5 ? 1 : -1), velocity * SLIP_VELOCITY));
    }
    notes.push(piano(at, beats, midi, velocity));
  }
  return notes;
}

const hammeredLine = (line: ScoreLine): ScoreNote[] =>
  line.flatMap(([beat, beats, midi]) => [0, OCTAVE, 2 * OCTAVE].map(drop => piano(beat, beats, midi - drop, 1)));

function bouncingBall(midi: number): ScoreNote[] {
  const notes: ScoreNote[] = [];
  let gap = BOUNCE_FIRST_GAP_BEATS;
  let velocity = 1;
  for (let beat = 0; beat < BEATS_PER_BAR && gap > BOUNCE_MIN_GAP_BEATS; beat += gap, gap *= BOUNCE_DECAY) {
    notes.push(piano(beat, gap, midi, velocity), piano(beat, gap, midi - OCTAVE, velocity));
    velocity *= BOUNCE_DECAY;
  }
  return notes;
}

const slam = ({ bass = [], arpeggio = [] }: ScoreBar, beat: number): ScoreNote[] =>
  [...bass, ...arpeggio.map(midi => midi - OCTAVE)].map(midi => piano(beat, SLAM_BEATS, midi, 1));

function machine(arpeggio: readonly number[], from: number): ScoreNote[] {
  const keys = MACHINE_OCTAVES.flatMap(octave => arpeggio.map(midi => midi + octave));
  const notes: ScoreNote[] = [];
  for (let step = 0; from + step * MACHINE_STEP_BEATS < BEATS_PER_BAR; step++) {
    const midi = keys[(step * MACHINE_LEAP) % keys.length]!;
    const beat = from + step * MACHINE_STEP_BEATS;
    notes.push({ ...piano(beat, MACHINE_STEP_BEATS, midi, MACHINE_VELOCITY), cents: soberCents(midi) });
  }
  return notes;
}

const inHarmonics = (note: ScoreNote): ScoreNote => ({
  ...note,
  cents: harmonicCents(note.midi) + (note.voice === 'piano' ? soberCents(note.midi) : 0),
});

export function composeBar(mood: Mood, bar: number, random: () => number): readonly ScoreNote[] {
  const { dynamics, timpaniBeats } = MOOD_SCORES[mood];
  const current = scoreBar(mood, bar);
  const { bass, arpeggio, line, sun, hammered, bounce } = current;
  const notes: ScoreNote[] = [];

  for (const midi of bass ?? []) notes.push(piano(0, BEATS_PER_BAR, midi, BASS_VELOCITY * dynamics));
  if (arpeggio) notes.push(...moonlight(arpeggio, dynamics, random));
  if (line) notes.push(...(hammered ? hammeredLine(line) : drunkenLine(line, dynamics, random)));
  if (bounce) notes.push(...bouncingBall(bounce));
  for (const midi of sun ?? []) {
    notes.push({ voice: 'sun', beat: 0, beats: SUN_BEATS, midi, velocity: SUN_VELOCITY });
  }
  if (bass) {
    for (const beat of timpaniBeats) {
      notes.push({ voice: 'timpani', beat, beats: 0.8, midi: bass[0]! + OCTAVE, velocity: dynamics });
    }
  }
  if (sun) return notes.map(inHarmonics);
  if (arpeggio && random() < SLAM_CHANCE) {
    const beat = Math.floor(random() * SLAM_LATEST_BEAT);
    return [
      ...notes.filter(note => note.beat < beat),
      ...slam(current, beat),
      ...machine(arpeggio, beat + MACHINE_DELAY_BEATS),
    ];
  }
  return notes;
}
