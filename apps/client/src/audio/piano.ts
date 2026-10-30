import { midiToHz } from './soundtrack';

const LOW_MIDI = 30;
const HIGH_MIDI = 96;
const SOURNESS_SEMITONES = 0.18;
const UNISON_RATIO = 1.0016;
const LOW_DAMPING = 0.55;
const HIGH_DAMPING = 0.95;
const DAMPING_STEP = 0.001;
const LOW_RING_SECONDS = 7;
const HIGH_RING_SECONDS = 3;
const HAMMER_SOFTNESS = 0.35;
const HAMMER_PASSES = 3;
const STRIKE_POINT = 1 / 7;
const NOTE_SECONDS = 4;
const FADE_SECONDS = 0.3;
const ATTACK_SECONDS = 0.1;
const ATTACK_LOUDNESS = 0.3;

const registerOf = (midi: number): number => Math.min(1, Math.max(0, (midi - LOW_MIDI) / (HIGH_MIDI - LOW_MIDI)));

export const sourness = (midi: number): number => Math.sin(midi * 12.9898) * SOURNESS_SEMITONES;

function strike(length: number, random: () => number): Float32Array {
  const felt = new Float32Array(length);
  for (let i = 0; i < length; i++) felt[i] = random() * 2 - 1;
  for (let pass = 0; pass < HAMMER_PASSES; pass++) {
    for (let i = 1; i < length; i++) felt[i] = felt[i - 1]! + HAMMER_SOFTNESS * (felt[i]! - felt[i - 1]!);
  }
  const shape = new Float32Array(length);
  const point = Math.max(1, Math.floor(length * STRIKE_POINT));
  for (let i = 0; i < length; i++) shape[i] = felt[i]! - (i >= point ? felt[i - point]! : 0);
  const mean = shape.reduce((sum, value) => sum + value, 0) / length;
  return shape.map(value => value - mean);
}

function renderString(hz: number, midi: number, sampleRate: number, samples: Float32Array, random: () => number): void {
  const register = registerOf(midi);
  const ringSeconds = LOW_RING_SECONDS + (HIGH_RING_SECONDS - LOW_RING_SECONDS) * register;
  const omega = (2 * Math.PI * hz) / sampleRate;
  const targetGain = 10 ** (-3 / (ringSeconds * hz));
  const filterGain = (amount: number): number =>
    amount / Math.hypot(1 - (1 - amount) * Math.cos(omega), (1 - amount) * Math.sin(omega));
  let damping = LOW_DAMPING + (HIGH_DAMPING - LOW_DAMPING) * register;
  while (damping < 1 && filterGain(damping) < targetGain) damping = Math.min(1, damping + DAMPING_STEP);
  const loss = Math.min(1, targetGain / filterGain(damping));
  const held = 1 - damping;
  const filterDelay = Math.atan2(held * Math.sin(omega), 1 - held * Math.cos(omega)) / omega;
  const delay = sampleRate / hz - filterDelay;
  const whole = Math.floor(delay - 0.5);
  const fraction = delay - whole;
  const allpass = (1 - fraction) / (1 + fraction);

  const voice = new Float32Array(samples.length);
  voice.set(strike(whole + 1, random));
  let filtered = 0;
  let tuned = 0;
  for (let i = whole + 1; i < voice.length; i++) {
    tuned = allpass * (voice[i - whole]! - tuned) + voice[i - whole - 1]!;
    filtered += damping * (tuned - filtered);
    voice[i] = filtered * loss;
  }
  for (let i = 0; i < samples.length; i++) samples[i]! += voice[i]!;
}

export function renderPianoNote(midi: number, sampleRate: number, random: () => number): Float32Array<ArrayBuffer> {
  const samples = new Float32Array(Math.floor(sampleRate * NOTE_SECONDS));
  const hz = midiToHz(midi + sourness(midi));
  renderString(hz / UNISON_RATIO, midi, sampleRate, samples, random);
  renderString(hz * UNISON_RATIO, midi, sampleRate, samples, random);

  const attack = samples.subarray(0, Math.floor(sampleRate * ATTACK_SECONDS));
  const power = attack.reduce((sum, value) => sum + value * value, 0) / attack.length;
  const scale = ATTACK_LOUDNESS / (Math.sqrt(power) || 1);
  const fade = Math.floor(sampleRate * FADE_SECONDS);
  for (let i = 0; i < samples.length; i++) {
    samples[i] = samples[i]! * scale * Math.min(1, (samples.length - i) / fade);
  }
  return samples;
}
