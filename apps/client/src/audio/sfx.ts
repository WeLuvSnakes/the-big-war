import type { SoundId } from './audio.types';

export interface SfxTarget {
  readonly context: AudioContext;
  readonly output: AudioNode;
  readonly noise: AudioBuffer;
}

interface ToneOptions {
  readonly type: OscillatorType;
  readonly from: number;
  readonly to?: number;
  readonly at?: number;
  readonly seconds: number;
  readonly gain: number;
}

interface NoiseOptions {
  readonly filter: BiquadFilterType;
  readonly hz: number;
  readonly at?: number;
  readonly seconds: number;
  readonly gain: number;
}

const envelope = (target: SfxTarget, start: number, seconds: number, gain: number): GainNode => {
  const node = target.context.createGain();
  node.gain.setValueAtTime(0.0001, start);
  node.gain.exponentialRampToValueAtTime(gain, start + Math.min(0.01, seconds / 4));
  node.gain.exponentialRampToValueAtTime(0.0001, start + seconds);
  node.connect(target.output);
  return node;
};

export function tone(target: SfxTarget, options: ToneOptions): void {
  const start = target.context.currentTime + (options.at ?? 0);
  const oscillator = target.context.createOscillator();
  oscillator.type = options.type;
  oscillator.frequency.setValueAtTime(options.from, start);
  if (options.to) oscillator.frequency.exponentialRampToValueAtTime(options.to, start + options.seconds);
  oscillator.connect(envelope(target, start, options.seconds, options.gain));
  oscillator.start(start);
  oscillator.stop(start + options.seconds);
}

export function noise(target: SfxTarget, options: NoiseOptions): void {
  const start = target.context.currentTime + (options.at ?? 0);
  const source = target.context.createBufferSource();
  source.buffer = target.noise;
  source.loop = true;
  const filter = target.context.createBiquadFilter();
  filter.type = options.filter;
  filter.frequency.value = options.hz;
  source.connect(filter).connect(envelope(target, start, options.seconds, options.gain));
  source.start(start, Math.random() * target.noise.duration);
  source.stop(start + options.seconds);
}

interface ShoutOptions {
  readonly from: number;
  readonly to: number;
  readonly at: number;
  readonly seconds: number;
  readonly gain: number;
  readonly vowelHz: number;
}

const shout = (target: SfxTarget, options: ShoutOptions): void => {
  const { context } = target;
  const start = context.currentTime + options.at;
  const stop = start + options.seconds;
  const throat = context.createOscillator();
  throat.type = 'sawtooth';
  throat.frequency.setValueAtTime(options.from, start);
  throat.frequency.exponentialRampToValueAtTime(options.to, stop);
  const shake = context.createOscillator();
  shake.frequency.value = 7 + Math.random() * 6;
  const shakeDepth = context.createGain();
  shakeDepth.gain.value = options.from * 0.06;
  shake.connect(shakeDepth).connect(throat.frequency);
  const output = envelope(target, start, options.seconds, options.gain);
  for (const hz of [options.vowelHz, options.vowelHz * 1.7]) {
    const formant = context.createBiquadFilter();
    formant.type = 'bandpass';
    formant.frequency.value = hz;
    formant.Q.value = 5;
    throat.connect(formant).connect(output);
  }
  throat.start(start);
  shake.start(start);
  throat.stop(stop);
  shake.stop(stop);
};

const spread = (low: number, high: number): number => low + Math.random() * (high - low);

const fanfare = (target: SfxTarget, notes: readonly number[], step: number): void => {
  notes.forEach((hz, index) => {
    tone(target, { type: 'sawtooth', from: hz, at: index * step, seconds: step * 1.6, gain: 0.16 });
  });
};

export const SFX: Readonly<Record<SoundId, (target: SfxTarget) => void>> = {
  click: t => tone(t, { type: 'square', from: 900, to: 500, seconds: 0.04, gain: 0.08 }),
  error: t => tone(t, { type: 'square', from: 170, to: 120, seconds: 0.18, gain: 0.14 }),
  march: t => {
    noise(t, { filter: 'lowpass', hz: 500, seconds: 0.07, gain: 0.3 });
    noise(t, { filter: 'lowpass', hz: 500, at: 0.14, seconds: 0.07, gain: 0.25 });
  },
  warCry: t => {
    for (let voice = 0; voice < 6; voice++) {
      const from = spread(170, 300);
      shout(t, { from, to: from * 1.4, at: spread(0, 0.25), seconds: spread(0.8, 1.2), gain: 0.5, vowelHz: spread(700, 950) });
    }
  },
  pain: t => {
    const from = spread(520, 820);
    shout(t, { from, to: from * 0.45, at: 0, seconds: spread(0.45, 0.8), gain: 0.6, vowelHz: spread(900, 1300) });
  },
  rifle: t => {
    noise(t, { filter: 'highpass', hz: 700 + Math.random() * 900, seconds: 0.07, gain: 0.05 + Math.random() * 0.1 });
  },
  artillery: t => {
    tone(t, { type: 'sine', from: 130, to: 32, seconds: 0.55, gain: 0.5 });
    noise(t, { filter: 'lowpass', hz: 700, seconds: 0.65, gain: 0.4 });
  },
  capture: t => tone(t, { type: 'triangle', from: 520, to: 700, seconds: 0.1, gain: 0.07 }),
  hexLost: t => tone(t, { type: 'triangle', from: 300, to: 190, seconds: 0.18, gain: 0.1 }),
  battle: t => {
    [0, 0.16, 0.32, 0.5].forEach(at => {
      for (const hz of [466, 470, 622]) tone(t, { type: 'sawtooth', from: hz, at, seconds: at === 0.5 ? 0.5 : 0.13, gain: 0.09 });
    });
  },
  build: t => {
    noise(t, { filter: 'bandpass', hz: 1500, seconds: 0.05, gain: 0.3 });
    noise(t, { filter: 'bandpass', hz: 1100, at: 0.11, seconds: 0.05, gain: 0.25 });
  },
  buildDone: t => fanfare(t, [440, 587], 0.09),
  research: t => {
    [523, 659, 784, 1047].forEach((hz, index) => {
      tone(t, { type: 'sine', from: hz, at: index * 0.08, seconds: 0.35, gain: 0.13 });
    });
  },
  offer: t => {
    tone(t, { type: 'sine', from: 880, seconds: 0.25, gain: 0.14 });
    tone(t, { type: 'sine', from: 660, at: 0.16, seconds: 0.35, gain: 0.14 });
  },
  elimination: t => {
    tone(t, { type: 'sine', from: 90, to: 28, seconds: 1.4, gain: 0.5 });
    noise(t, { filter: 'lowpass', hz: 300, seconds: 1.5, gain: 0.35 });
  },
  victory: t => fanfare(t, [294, 370, 440, 587, 440, 587, 740], 0.2),
  defeat: t => fanfare(t, [440, 349, 294, 220], 0.45),
};
