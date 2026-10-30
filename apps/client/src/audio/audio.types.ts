export type SoundId =
  | 'click'
  | 'error'
  | 'march'
  | 'rifle'
  | 'warCry'
  | 'pain'
  | 'artillery'
  | 'capture'
  | 'hexLost'
  | 'battle'
  | 'build'
  | 'buildDone'
  | 'research'
  | 'offer'
  | 'elimination'
  | 'victory'
  | 'defeat';

export type Mood = 'menu' | 'peace' | 'war' | 'aftermath';

export type Voice = 'piano' | 'sun' | 'timpani' | 'kick' | 'snare' | 'hat' | 'sub';

export interface ScoreNote {
  readonly voice: Voice;
  readonly beat: number;
  readonly beats: number;
  readonly midi: number;
  readonly velocity: number;
  readonly cents?: number;
}

export type ScoreLine = readonly (readonly [beat: number, beats: number, midi: number])[];

export interface ScoreBar {
  readonly bass?: readonly number[];
  readonly arpeggio?: readonly number[];
  readonly line?: ScoreLine;
  readonly sun?: readonly number[];
  readonly bounce?: number;
  readonly groove?: boolean;
  readonly hammered?: boolean;
  readonly drag?: number;
}

export interface SweepMove {
  readonly beat: number;
  readonly beats: number;
  readonly position: number;
}

export interface MoodScore {
  readonly bpm: number;
  readonly dynamics: number;
  readonly sweepDepth: number;
  readonly timpaniBeats: readonly number[];
  readonly form: readonly ScoreBar[];
}

export interface MatchSnapshot {
  readonly hexes: number;
  readonly research: number;
  readonly offers: number;
  readonly playerFronts: number;
  readonly frontTroops: number;
  readonly aliveEmpires: number;
  readonly cooldowns: ReadonlyMap<number, number>;
  readonly ownBuildings: ReadonlyMap<number, boolean>;
}

