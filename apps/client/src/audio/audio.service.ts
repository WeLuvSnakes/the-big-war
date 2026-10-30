import { renderPianoNote } from './piano';
import { SFX, type SfxTarget } from './sfx';
import { createRoot, createSignal } from 'solid-js';
import { composeSweep, djCutoffs } from './dj-filter';
import type { Mood, ScoreNote, SoundId } from './audio.types';
import { barSeconds, composeBar, midiToHz, nextBar } from './soundtrack';

const MUSIC_KEY = 'the-big-war:music';
const SFX_KEY = 'the-big-war:sfx';
const MUSIC_LEVEL = 0.32;
const BEATS_PER_BAR = 4;
const SFX_LEVEL = 0.7;
const FADE_SECONDS = 0.4;
const SCHEDULE_MS = 250;
const LOOKAHEAD_SECONDS = 1.5;
const LEAD_IN_SECONDS = 0.1;
const NOISE_SECONDS = 2;
const BAR_LURCH = 0.16;
const WARBLE_HZ = 0.17;
const WARBLE_CENTS = 22;
const CAVERN_SECONDS = 5;
const CAVERN_PREDELAY_SECONDS = 0.07;
const CAVERN_DARKNESS = 0.82;
const CAVERN_LEVEL = 0.6;
const PIANO_LEVEL = 0.8;
const PIANO_DULL_HZ = 700;
const PIANO_BRIGHT_HZ = 5200;
const DAMPER_SECONDS = 0.12;
const SUN_LEVEL = 0.1;
const SUN_FILTER_HZ = 3000;
const SUN_ATTACK = 0.4;
const TIMPANI_LEVEL = 0.55;
const DRONE_MIDI = 37;
const DRONE_DETUNE = 1.004;
const DRONE_LEVEL = 0.09;
const DRONE_FILTER_HZ = 240;
const BREATH_HZ = 0.06;
const BREATH_DEPTH = 0.03;
const KICK_LEVEL = 0.7;
const KICK_START_HZ = 110;
const KICK_END_HZ = 44;
const KICK_DROP_SECONDS = 0.09;
const SNARE_LEVEL = 0.3;
const SNARE_HZ = 1800;
const HAT_LEVEL = 0.07;
const HAT_HZ = 7000;
const SUB_LEVEL = 0.4;
const SUB_FILTER_HZ = 320;
const SUB_FALL = 0.94;
const SUB_RELEASE_SECONDS = 0.06;
const DUB_BEATS = 0.75;
const DUB_FEEDBACK = 0.58;
const DUB_LOW_HZ = 300;
const DUB_HIGH_HZ = 1800;
const DUB_SEND = 0.5;
const DUB_MAX_SECONDS = 2;
const CRACKLE_SECONDS = 7;
const CRACKLE_CHANCE = 0.00035;
const CRACKLE_LEVEL = 0.05;
const CRACKLE_DECAY = 0.86;
const CRACKLE_HISS = 0.012;
const DJ_RESONANCE = 6;
const STEREO_CHANNELS = 2;
const KNOB_SETTLE = 3;

const MIN_GAP_SECONDS: Partial<Record<SoundId, number>> = {
  click: 0.03,
  capture: 0.25,
  hexLost: 0.5,
  battle: 6,
  warCry: 1.5,
  pain: 0.7,
  artillery: 0.2,
  build: 0.1,
  error: 0.3,
};

const loadEnabled = (key: string): boolean => {
  try {
    return globalThis.localStorage?.getItem(key) !== 'off';
  } catch {
    return true;
  }
};

const saveEnabled = (key: string, enabled: boolean): void => {
  try {
    globalThis.localStorage?.setItem(key, enabled ? 'on' : 'off');
  } catch {
  }
};

const createNoise = (context: AudioContext): AudioBuffer => {
  const buffer = context.createBuffer(1, context.sampleRate * NOISE_SECONDS, context.sampleRate);
  const samples = buffer.getChannelData(0);
  for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
  return buffer;
};

const createCavern = (context: AudioContext): AudioBuffer => {
  const length = Math.floor(context.sampleRate * CAVERN_SECONDS);
  const predelay = Math.floor(context.sampleRate * CAVERN_PREDELAY_SECONDS);
  const buffer = context.createBuffer(2, length, context.sampleRate);
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const samples = buffer.getChannelData(channel);
    let dark = 0;
    for (let i = predelay; i < length; i++) {
      const decay = (1 - (i - predelay) / (length - predelay)) ** 4;
      dark += (1 - CAVERN_DARKNESS) * (Math.random() * 2 - 1 - dark);
      samples[i] = dark * decay;
    }
  }
  return buffer;
};

const createCrackle = (context: AudioContext): AudioBuffer => {
  const buffer = context.createBuffer(2, context.sampleRate * CRACKLE_SECONDS, context.sampleRate);
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const samples = buffer.getChannelData(channel);
    let pop = 0;
    for (let i = 0; i < samples.length; i++) {
      if (Math.random() < CRACKLE_CHANCE) pop = (Math.random() < 0.5 ? -1 : 1) * Math.random();
      pop *= CRACKLE_DECAY;
      samples[i] = pop + (Math.random() - 0.5) * CRACKLE_HISS;
    }
  }
  return buffer;
};

interface DjChannel {
  readonly lowpass: BiquadFilterNode;
  readonly highpass: BiquadFilterNode;
}

const createDjChannel = (context: AudioContext): DjChannel => {
  const lowpass = context.createBiquadFilter();
  lowpass.type = 'lowpass';
  const highpass = context.createBiquadFilter();
  highpass.type = 'highpass';
  const { lowpass: lowHz, highpass: highHz } = djCutoffs(0.5);
  lowpass.frequency.value = lowHz;
  highpass.frequency.value = highHz;
  lowpass.Q.value = highpass.Q.value = DJ_RESONANCE;
  lowpass.connect(highpass);
  return { lowpass, highpass };
};

const turnKnob = ({ lowpass, highpass }: DjChannel, position: number, at: number, seconds: number): void => {
  const cutoffs = djCutoffs(position);
  lowpass.frequency.setTargetAtTime(cutoffs.lowpass, at, seconds / KNOB_SETTLE);
  highpass.frequency.setTargetAtTime(cutoffs.highpass, at, seconds / KNOB_SETTLE);
};

function createAudio() {
  const [musicOn, setMusicOn] = createRoot(() => createSignal(loadEnabled(MUSIC_KEY)));
  const [sfxOn, setSfxOn] = createRoot(() => createSignal(loadEnabled(SFX_KEY)));

  let context: AudioContext | null = null;
  let musicBus: GainNode | null = null;
  let voiceBus: GainNode | null = null;
  let drumBus: GainNode | null = null;
  let dubSend: GainNode | null = null;
  let dubDelay: DelayNode | null = null;
  let cavern: ConvolverNode | null = null;
  let warble: GainNode | null = null;
  let djChannels: readonly [DjChannel, DjChannel] | null = null;
  let sfxTarget: SfxTarget | null = null;
  let mood: Mood = 'menu';
  let ducked = false;
  let bar = 0;
  let nextBarAt = 0;
  const lastPlayed = new Map<SoundId, number>();
  const pianoNotes = new Map<number, AudioBuffer>();

  const applyMusicLevel = (): void => {
    if (!context || !musicBus) return;
    const level = musicOn() && !ducked ? MUSIC_LEVEL : 0;
    musicBus.gain.setTargetAtTime(level, context.currentTime, FADE_SECONDS);
  };

  const pianoNote = (ctx: AudioContext, midi: number): AudioBuffer => {
    const cached = pianoNotes.get(midi);
    if (cached) return cached;
    const samples = renderPianoNote(midi, ctx.sampleRate, Math.random);
    const buffer = ctx.createBuffer(1, samples.length, ctx.sampleRate);
    buffer.copyToChannel(samples, 0);
    pianoNotes.set(midi, buffer);
    return buffer;
  };

  const playPiano = (ctx: AudioContext, bus: AudioNode, note: ScoreNote, at: number, seconds: number): void => {
    const level = note.velocity * PIANO_LEVEL;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(level, at);
    gain.gain.setValueAtTime(level, at + seconds);
    gain.gain.setTargetAtTime(0, at + seconds, DAMPER_SECONDS);
    const felt = ctx.createBiquadFilter();
    felt.type = 'lowpass';
    felt.frequency.value = PIANO_DULL_HZ + note.velocity * PIANO_BRIGHT_HZ;
    const source = ctx.createBufferSource();
    source.buffer = pianoNote(ctx, note.midi);
    source.detune.value = note.cents ?? 0;
    if (warble) warble.connect(source.detune);
    source.connect(felt).connect(gain).connect(bus);
    source.start(at);
    source.stop(at + seconds + DAMPER_SECONDS * 5);
  };

  const playSun = (ctx: AudioContext, bus: AudioNode, note: ScoreNote, at: number, seconds: number): void => {
    const peak = note.velocity * SUN_LEVEL;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.linearRampToValueAtTime(peak, at + seconds * SUN_ATTACK);
    gain.gain.linearRampToValueAtTime(0.0001, at + seconds);
    const haze = ctx.createBiquadFilter();
    haze.type = 'lowpass';
    haze.frequency.value = SUN_FILTER_HZ;
    const oscillator = ctx.createOscillator();
    oscillator.type = 'triangle';
    oscillator.frequency.value = midiToHz(note.midi);
    oscillator.detune.value = note.cents ?? 0;
    if (warble) warble.connect(oscillator.detune);
    oscillator.connect(haze).connect(gain).connect(bus);
    oscillator.start(at);
    oscillator.stop(at + seconds);
  };

  const playTimpani = (ctx: AudioContext, bus: AudioNode, note: ScoreNote, at: number, seconds: number): void => {
    const hz = midiToHz(note.midi);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(note.velocity * TIMPANI_LEVEL, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
    const oscillator = ctx.createOscillator();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(hz * 1.6, at);
    oscillator.frequency.exponentialRampToValueAtTime(hz, at + 0.08);
    oscillator.connect(gain).connect(bus);
    oscillator.start(at);
    oscillator.stop(at + seconds);
  };

  const playKick = (ctx: AudioContext, bus: AudioNode, note: ScoreNote, at: number, seconds: number): void => {
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(note.velocity * KICK_LEVEL, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
    const oscillator = ctx.createOscillator();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(KICK_START_HZ, at);
    oscillator.frequency.exponentialRampToValueAtTime(KICK_END_HZ, at + KICK_DROP_SECONDS);
    oscillator.connect(gain).connect(bus);
    oscillator.start(at);
    oscillator.stop(at + seconds);
  };

  const playNoise = (noise: AudioBuffer, bus: AudioNode, note: ScoreNote, at: number, seconds: number): GainNode => {
    const { context: ctx } = bus;
    const snare = note.voice === 'snare';
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(note.velocity * (snare ? SNARE_LEVEL : HAT_LEVEL), at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
    const filter = ctx.createBiquadFilter();
    filter.type = snare ? 'bandpass' : 'highpass';
    filter.frequency.value = snare ? SNARE_HZ : HAT_HZ;
    const source = ctx.createBufferSource();
    source.buffer = noise;
    source.loop = true;
    source.connect(filter).connect(gain).connect(bus);
    source.start(at, Math.random() * noise.duration);
    source.stop(at + seconds);
    return gain;
  };

  const playSub = (ctx: AudioContext, bus: AudioNode, note: ScoreNote, at: number, seconds: number): void => {
    const hz = midiToHz(note.midi);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.linearRampToValueAtTime(note.velocity * SUB_LEVEL, at + SUB_RELEASE_SECONDS);
    gain.gain.setValueAtTime(note.velocity * SUB_LEVEL, at + seconds - SUB_RELEASE_SECONDS);
    gain.gain.linearRampToValueAtTime(0.0001, at + seconds);
    const warmth = ctx.createBiquadFilter();
    warmth.type = 'lowpass';
    warmth.frequency.value = SUB_FILTER_HZ;
    const oscillator = ctx.createOscillator();
    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(hz, at);
    oscillator.frequency.exponentialRampToValueAtTime(hz * SUB_FALL, at + seconds);
    oscillator.connect(warmth).connect(gain).connect(bus);
    oscillator.start(at);
    oscillator.stop(at + seconds);
  };

  const schedule = (): void => {
    if (!context || !voiceBus || !cavern || !drumBus || !dubSend || !dubDelay || !sfxTarget || context.state !== 'running' || !musicOn()) return;
    nextBarAt = Math.max(nextBarAt, context.currentTime + LEAD_IN_SECONDS);
    while (nextBarAt < context.currentTime + LOOKAHEAD_SECONDS) {
      const seconds = barSeconds(mood, bar);
      const beatSeconds = seconds / BEATS_PER_BAR;
      dubDelay.delayTime.setTargetAtTime(beatSeconds * DUB_BEATS, nextBarAt, FADE_SECONDS);
      for (const note of composeBar(mood, bar, Math.random)) {
        const at = nextBarAt + note.beat * beatSeconds;
        const noteSeconds = note.beats * beatSeconds;
        if (note.voice === 'piano') playPiano(context, voiceBus, note, at, noteSeconds);
        if (note.voice === 'sun') playSun(context, cavern, note, at, noteSeconds);
        if (note.voice === 'timpani') playTimpani(context, voiceBus, note, at, noteSeconds);
        if (note.voice === 'kick') playKick(context, drumBus, note, at, noteSeconds);
        if (note.voice === 'sub') playSub(context, drumBus, note, at, noteSeconds);
        if (note.voice === 'hat') playNoise(sfxTarget.noise, drumBus, note, at, noteSeconds);
        if (note.voice === 'snare') playNoise(sfxTarget.noise, drumBus, note, at, noteSeconds).connect(dubSend);
      }
      for (const move of composeSweep(mood, bar, Math.random)) {
        const at = nextBarAt + move.beat * beatSeconds;
        const moveSeconds = move.beats * beatSeconds;
        if (!djChannels) continue;
        turnKnob(djChannels[0], move.position, at, moveSeconds);
        turnKnob(djChannels[1], 1 - move.position, at, moveSeconds);
      }
      bar = nextBar(mood, bar, Math.random);
      nextBarAt += seconds * (1 + (Math.random() - 0.5) * BAR_LURCH);
    }
  };

  const create = (): void => {
    const Context = globalThis.AudioContext;
    if (!Context) return;
    context = new Context();
    const limiter = context.createDynamicsCompressor();
    limiter.connect(context.destination);
    musicBus = context.createGain();
    musicBus.gain.value = 0;
    musicBus.connect(limiter);
    const rack = context.createGain();
    rack.channelCount = STEREO_CHANNELS;
    rack.channelCountMode = 'explicit';
    const splitter = context.createChannelSplitter(STEREO_CHANNELS);
    const merger = context.createChannelMerger(STEREO_CHANNELS);
    rack.connect(splitter);
    djChannels = [createDjChannel(context), createDjChannel(context)];
    djChannels.forEach((channel, index) => {
      splitter.connect(channel.lowpass, index);
      channel.highpass.connect(merger, 0, index);
    });
    merger.connect(musicBus);
    voiceBus = context.createGain();
    voiceBus.connect(rack);
    drumBus = context.createGain();
    drumBus.connect(rack);
    dubSend = context.createGain();
    dubSend.gain.value = DUB_SEND;
    dubDelay = context.createDelay(DUB_MAX_SECONDS);
    const dubFeedback = context.createGain();
    dubFeedback.gain.value = DUB_FEEDBACK;
    const dubLow = context.createBiquadFilter();
    dubLow.type = 'highpass';
    dubLow.frequency.value = DUB_LOW_HZ;
    const dubHigh = context.createBiquadFilter();
    dubHigh.type = 'lowpass';
    dubHigh.frequency.value = DUB_HIGH_HZ;
    dubSend.connect(dubDelay).connect(dubLow).connect(dubHigh).connect(dubFeedback).connect(dubDelay);
    dubHigh.connect(rack);
    const crackle = context.createBufferSource();
    crackle.buffer = createCrackle(context);
    crackle.loop = true;
    const crackleLevel = context.createGain();
    crackleLevel.gain.value = CRACKLE_LEVEL;
    crackle.connect(crackleLevel).connect(rack);
    crackle.start();
    cavern = context.createConvolver();
    cavern.buffer = createCavern(context);
    const cavernLevel = context.createGain();
    cavernLevel.gain.value = CAVERN_LEVEL;
    voiceBus.connect(cavern).connect(cavernLevel).connect(rack);
    const warbleLfo = context.createOscillator();
    warbleLfo.frequency.value = WARBLE_HZ;
    warble = context.createGain();
    warble.gain.value = WARBLE_CENTS;
    warbleLfo.connect(warble);
    warbleLfo.start();
    const drone = context.createGain();
    drone.gain.value = DRONE_LEVEL;
    const earth = context.createBiquadFilter();
    earth.type = 'lowpass';
    earth.frequency.value = DRONE_FILTER_HZ;
    earth.connect(drone).connect(rack);
    for (const ratio of [1, DRONE_DETUNE, 2]) {
      const string = context.createOscillator();
      string.type = 'triangle';
      string.frequency.value = midiToHz(DRONE_MIDI) * ratio;
      string.connect(earth);
      string.start();
    }
    const breath = context.createOscillator();
    breath.frequency.value = BREATH_HZ;
    const breathDepth = context.createGain();
    breathDepth.gain.value = BREATH_DEPTH;
    breath.connect(breathDepth).connect(drone.gain);
    breath.start();
    const sfxBus = context.createGain();
    sfxBus.gain.value = SFX_LEVEL;
    sfxBus.connect(limiter);
    sfxTarget = { context, output: sfxBus, noise: createNoise(context) };
    applyMusicLevel();
    setInterval(schedule, SCHEDULE_MS);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) void context?.suspend();
      else void context?.resume();
    });
  };

  return {
    musicOn,
    sfxOn,
    unlock(): void {
      if (!context) create();
      if (context?.state === 'suspended' && !document.hidden) void context.resume();
    },
    play(sound: SoundId): void {
      if (!context || !sfxTarget || !sfxOn() || context.state !== 'running') return;
      const now = context.currentTime;
      if (now - (lastPlayed.get(sound) ?? -Infinity) < (MIN_GAP_SECONDS[sound] ?? 0)) return;
      lastPlayed.set(sound, now);
      SFX[sound](sfxTarget);
    },
    setMood(next: Mood): void {
      if (next === mood) return;
      mood = next;
      bar = 0;
    },
    setDucked(next: boolean): void {
      ducked = next;
      applyMusicLevel();
    },
    toggleMusic(): void {
      const next = !musicOn();
      setMusicOn(next);
      saveEnabled(MUSIC_KEY, next);
      applyMusicLevel();
    },
    toggleSfx(): void {
      const next = !sfxOn();
      setSfxOn(next);
      saveEnabled(SFX_KEY, next);
    },
  };
}

export const audio = createAudio();

