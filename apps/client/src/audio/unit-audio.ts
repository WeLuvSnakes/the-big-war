import type { SfxTarget } from './sfx';
import { audio } from './audio.service';
import type { ClientStore } from '../game/store/store.types';
import type { Unit, UnitId, UnitKind } from '../game/unit/unit.types';
import type { EngineVoiceSpec, Listener, Loudness, ShotVoices, UnitAudio } from './unit-audio.types';

export type * from './unit-audio.types';

const MAX_SHOTS_PER_FRAME = 6;
const MAX_ENGINES = 6;
const SHOT_FADE_PX = 400;
const ENGINE_FADE_PX = 500;
const SHOT_LEVEL = 0.6;
const ENGINE_LEVEL = 0.6;
const PAN_WIDTH = 0.8;
const IDLE_SHARE = 0.45;
const ENGINE_RELEASE_MS = 800;
const SILENT = 0.02;

const SHOTS: ShotVoices = {
  infantry: { seconds: 0.18, hz: 1800, q: 0.8, thump: 140, gain: 0.55, tail: 0.25 },
  assault: { seconds: 0.07, hz: 2400, q: 1.0, thump: 180, gain: 0.35, tail: 0.08 },
  mg: { seconds: 0.09, hz: 1100, q: 0.7, thump: 95, gain: 0.45, tail: 0.12 },
  coax: { seconds: 0.09, hz: 1100, q: 0.7, thump: 95, gain: 0.45, tail: 0.12 },
  sniper: { seconds: 0.3, hz: 2600, q: 0.6, thump: 70, gain: 0.9, tail: 0.9 },
  mrap: { seconds: 0.09, hz: 1100, q: 0.7, thump: 95, gain: 0.45, tail: 0.12 },
  tank: { seconds: 0.45, hz: 380, q: 0.5, thump: 48, gain: 1.2, tail: 1.2 },
};

const ENGINES: Partial<Readonly<Record<UnitKind, EngineVoiceSpec>>> = {
  tank: { idle: 32, drive: 52, gain: 0.32, cutoff: 260, tracks: 0.22 },
  mrap: { idle: 55, drive: 95, gain: 0.22, cutoff: 420, tracks: 0 },
};

interface EngineVoice {
  readonly out: GainNode;
  readonly pan: StereoPannerNode;
  readonly low: OscillatorNode;
  readonly high: OscillatorNode;
  readonly wobble: OscillatorNode;
  readonly clank: GainNode | null;
  stop(): void;
}

function loudness(listener: Listener, x: number, y: number, fade: number): Loudness {
  const width = listener.max.x - listener.min.x;
  const height = listener.max.y - listener.min.y;
  const off = Math.max(0, listener.min.x - x, x - listener.max.x, listener.min.y - y, y - listener.max.y) * listener.scale;
  const zoom = Math.min(1, 0.45 + listener.scale * 0.45);
  const across = width > 0 ? (x - listener.min.x) / width : 0.5;
  return {
    volume: Math.max(0, 1 - off / fade) * zoom * (height > 0 ? 1 : 0),
    pan: Math.max(-1, Math.min(1, across * 2 - 1)) * PAN_WIDTH,
  };
}

function playShot(target: SfxTarget, kind: keyof ShotVoices, level: Loudness): void {
  const { context, noise } = target;
  const voice = SHOTS[kind];
  const now = context.currentTime;
  const volume = SHOT_LEVEL * level.volume * voice.gain * (0.85 + Math.random() * 0.3);
  const big = kind === 'tank';
  const out = context.createStereoPanner();
  out.pan.value = level.pan;
  out.connect(target.output);
  const source = context.createBufferSource();
  source.buffer = noise;
  source.playbackRate.value = 0.9 + Math.random() * 0.2;
  const band = context.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = voice.hz * (0.9 + Math.random() * 0.2);
  band.Q.value = voice.q;
  const envelope = context.createGain();
  envelope.gain.setValueAtTime(volume, now);
  envelope.gain.exponentialRampToValueAtTime(0.001, now + voice.seconds + voice.tail);
  source.connect(band).connect(envelope).connect(out);
  source.start(now, Math.random() * 0.5, voice.seconds + voice.tail);
  const thump = context.createOscillator();
  thump.type = 'sine';
  thump.frequency.setValueAtTime(voice.thump, now);
  thump.frequency.exponentialRampToValueAtTime(big ? 25 : 40, now + (big ? 0.5 : 0.12));
  const thumpGain = context.createGain();
  thumpGain.gain.setValueAtTime(volume * 0.8, now);
  thumpGain.gain.exponentialRampToValueAtTime(0.001, now + (big ? 0.6 : 0.15));
  thump.connect(thumpGain).connect(out);
  thump.start(now);
  thump.stop(now + (big ? 0.62 : 0.16));
}

function createEngine(target: SfxTarget, spec: EngineVoiceSpec): EngineVoice {
  const { context, noise } = target;
  const now = context.currentTime;
  const out = context.createGain();
  out.gain.value = 0;
  const pan = context.createStereoPanner();
  const lowpass = context.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.value = spec.cutoff;
  const low = context.createOscillator();
  low.type = 'sawtooth';
  low.frequency.value = spec.idle;
  const high = context.createOscillator();
  high.type = 'square';
  high.frequency.value = spec.idle * 1.51;
  const highGain = context.createGain();
  highGain.gain.value = 0.35;
  const wobble = context.createOscillator();
  wobble.frequency.value = spec.idle / 4;
  const wobbleDepth = context.createGain();
  wobbleDepth.gain.value = 0.25;
  const amp = context.createGain();
  amp.gain.value = 0.75;
  wobble.connect(wobbleDepth).connect(amp.gain);
  low.connect(amp);
  high.connect(highGain).connect(amp);
  amp.connect(lowpass).connect(out);
  const extras: AudioScheduledSourceNode[] = [];
  let clank: GainNode | null = null;
  if (spec.tracks > 0) {
    const rattle = context.createBufferSource();
    rattle.buffer = noise;
    rattle.loop = true;
    const band = context.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 900;
    band.Q.value = 2;
    clank = context.createGain();
    clank.gain.value = 0;
    const tread = context.createOscillator();
    tread.type = 'square';
    tread.frequency.value = 7;
    const treadDepth = context.createGain();
    treadDepth.gain.value = 0.5;
    const trackAmp = context.createGain();
    trackAmp.gain.value = 0.5;
    tread.connect(treadDepth).connect(trackAmp.gain);
    rattle.connect(band).connect(trackAmp).connect(clank).connect(out);
    rattle.start(now, Math.random());
    tread.start(now);
    extras.push(rattle, tread);
  }
  out.connect(pan).connect(target.output);
  for (const oscillator of [low, high, wobble]) oscillator.start(now);
  return {
    out,
    pan,
    low,
    high,
    wobble,
    clank,
    stop() {
      out.gain.setTargetAtTime(0, context.currentTime, 0.15);
      setTimeout(() => {
        for (const node of [low, high, wobble, ...extras]) {
          try {
            node.stop();
          } catch {
            continue;
          }
        }
        out.disconnect();
      }, ENGINE_RELEASE_MS);
    },
  };
}

export function createUnitAudio(store: ClientStore): UnitAudio {
  let lastEvent = 0;
  const engines = new Map<UnitId, EngineVoice>();

  const stopEngines = (keep: ReadonlySet<UnitId>) => {
    for (const [id, engine] of engines) {
      if (keep.has(id)) continue;
      engine.stop();
      engines.delete(id);
    }
  };

  const playEvents = (target: SfxTarget | null, listener: Listener) => {
    let played = 0;
    for (const event of store.state.unitEvents) {
      if (event.id <= lastEvent) continue;
      lastEvent = event.id;
      if (!target || listener.paused || played >= MAX_SHOTS_PER_FRAME) continue;
      if (event.kind === 'death' && !event.vehicle) continue;
      const level = loudness(listener, event.x, event.y, SHOT_FADE_PX);
      if (level.volume <= SILENT) continue;
      played += 1;
      playShot(target, event.kind === 'death' ? 'tank' : event.sound, level);
    }
  };

  const updateEngines = (target: SfxTarget | null, listener: Listener) => {
    if (!target || listener.paused) {
      stopEngines(new Set());
      return;
    }
    const cx = (listener.min.x + listener.max.x) / 2;
    const cy = (listener.min.y + listener.max.y) / 2;
    const near = store.state.units
      .filter((unit): unit is Unit => ENGINES[unit.kind] !== undefined)
      .map(unit => ({ unit, gap: Math.hypot(unit.x - cx, unit.y - cy) }))
      .sort((a, b) => a.gap - b.gap)
      .slice(0, MAX_ENGINES);
    stopEngines(new Set(near.map(item => item.unit.id)));
    const now = target.context.currentTime;
    for (const { unit } of near) {
      const spec = ENGINES[unit.kind]!;
      let engine = engines.get(unit.id);
      if (!engine) {
        engine = createEngine(target, spec);
        engines.set(unit.id, engine);
      }
      const level = loudness(listener, unit.x, unit.y, ENGINE_FADE_PX);
      const rev = unit.moving ? 1 : 0;
      const pitch = spec.idle + (spec.drive - spec.idle) * rev;
      engine.low.frequency.setTargetAtTime(pitch, now, 0.4);
      engine.high.frequency.setTargetAtTime(pitch * 1.51, now, 0.4);
      engine.wobble.frequency.setTargetAtTime(pitch / 4, now, 0.4);
      engine.out.gain.setTargetAtTime(ENGINE_LEVEL * spec.gain * level.volume * (rev ? 1 : IDLE_SHARE), now, 0.25);
      engine.pan.pan.setTargetAtTime(level.pan, now, 0.1);
      engine.clank?.gain.setTargetAtTime(rev * spec.tracks, now, 0.2);
    }
  };

  return {
    update(listener) {
      const target = audio.sfxTarget();
      playEvents(target, listener);
      updateEngines(target, listener);
    },
    stop() {
      stopEngines(new Set());
    },
  };
}
