import type { WeaponSound } from '../game/unit/unit.types';
import type { Pixel } from '@the-big-war/game-engine/world-tile/world-tile.types';

export interface ShotVoice {
  readonly seconds: number;
  readonly hz: number;
  readonly q: number;
  readonly thump: number;
  readonly gain: number;
  readonly tail: number;
}

export interface EngineVoiceSpec {
  readonly idle: number;
  readonly drive: number;
  readonly gain: number;
  readonly cutoff: number;
  readonly tracks: number;
}

export interface Listener {
  readonly min: Pixel;
  readonly max: Pixel;
  readonly scale: number;
  readonly paused: boolean;
}

export interface Loudness {
  readonly volume: number;
  readonly pan: number;
}

export type ShotVoices = Readonly<Record<WeaponSound, ShotVoice>>;

export interface UnitAudio {
  update(listener: Listener): void;
  stop(): void;
}
