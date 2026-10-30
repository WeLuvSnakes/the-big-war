import { describe, expect, test } from 'bun:test';
import { diffSounds } from '../../../client/src/audio/match-audio';
import type { MatchSnapshot } from '../../../client/src/audio/audio.types';
import { renderPianoNote, sourness } from '../../../client/src/audio/piano';
import { barSeconds, composeBar, midiToHz, MOOD_SCORES, nextBar } from '../../../client/src/audio/soundtrack';

const snapshot = (patch: Partial<MatchSnapshot> = {}): MatchSnapshot => ({
  hexes: 10,
  research: 0,
  offers: 0,
  playerFronts: 0,
  frontTroops: 0,
  aliveEmpires: 4,
  cooldowns: new Map(),
  ownBuildings: new Map(),
  ...patch,
});

describe('diffSounds', () => {
  test('is silent when nothing changed', () => {
    expect(diffSounds(snapshot(), snapshot())).toEqual([]);
  });

  test('reports territory, research, diplomacy and battle changes', () => {
    const next = snapshot({ hexes: 11, research: 1, offers: 1, playerFronts: 1, aliveEmpires: 3 });
    expect(diffSounds(snapshot(), next)).toEqual(['capture', 'research', 'offer', 'battle', 'elimination']);
    expect(diffSounds(snapshot(), snapshot({ hexes: 9 }))).toEqual(['hexLost']);
  });

  test('soldiers scream only when troops die on a front that is still open', () => {
    const fighting = snapshot({ playerFronts: 1, frontTroops: 50 });
    expect(diffSounds(fighting, snapshot({ playerFronts: 1, frontTroops: 40 }))).toEqual(['pain']);
    expect(diffSounds(fighting, snapshot({ playerFronts: 0, frontTroops: 0 }))).toEqual([]);
  });

  test('tracks a building from placement to completion, ignoring captured ones', () => {
    const placed = snapshot({ ownBuildings: new Map([[1, false]]) });
    expect(diffSounds(snapshot(), placed)).toEqual(['build']);
    expect(diffSounds(placed, snapshot({ ownBuildings: new Map([[1, true]]) }))).toEqual(['buildDone']);
    expect(diffSounds(snapshot(), snapshot({ ownBuildings: new Map([[2, true]]) }))).toEqual([]);
  });

  test('artillery is heard only for own guns or while the player is fighting', () => {
    const fired = { cooldowns: new Map([[7, 5]]) };
    expect(diffSounds(snapshot(), snapshot(fired))).toEqual([]);
    expect(diffSounds(snapshot({ playerFronts: 1 }), snapshot({ ...fired, playerFronts: 1 }))).toEqual(['artillery']);
    expect(diffSounds(snapshot(fired), snapshot({ cooldowns: new Map([[7, 4]]) }))).toEqual([]);
  });
});

const seeded = (seed = 1) => () => {
  seed = (seed * 16807) % 2147483647;
  return seed / 2147483647;
};

const pianoBars = (mood: keyof typeof MOOD_SCORES, bar: number) =>
  composeBar(mood, bar, () => 0.5).filter(note => note.voice === 'piano');

const melody = (mood: keyof typeof MOOD_SCORES, bar: number) => {
  const { form } = MOOD_SCORES[mood];
  return (form[bar]?.line ?? []).map(([, , midi]) => midi);
};

describe('composeBar', () => {
  test('starts every note inside the bar in every mood', () => {
    for (const mood of Object.keys(MOOD_SCORES) as (keyof typeof MOOD_SCORES)[]) {
      const random = seeded();
      for (let bar = 0; bar < MOOD_SCORES[mood].form.length * 4; bar++) {
        for (const note of composeBar(mood, bar, random)) {
          expect(note.beat).toBeGreaterThanOrEqual(0);
          expect(note.beat).toBeLessThan(4);
          expect(note.velocity).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  test('moonlight rolls twelve triplets a bar under the bass', () => {
    expect(pianoBars('peace', 0)).toHaveLength(2 + 12);
  });

  test('the ode stumbles through in c sharp minor', () => {
    expect(melody('peace', 8)).toEqual([76, 76, 78, 80]);
  });

  test('war opens on the fate knock, hammered in octaves with a beat of rest first', () => {
    const notes = pianoBars('war', 0);
    expect(Math.min(...notes.map(note => note.beat))).toBe(0.5);
    expect(notes.filter(note => note.midi === 68 - 24)).toHaveLength(3);
    expect(notes.every(note => note.velocity === 1)).toBe(true);
  });

  test('the knock stops dead before agartha', () => {
    expect(composeBar('peace', 18, () => 0.5)).toEqual([]);
  });

  test('agartha turns the ode major over a sun heard only in the distance', () => {
    expect(melody('peace', 20)).toEqual([90, 90, 91, 93]);
    const voices = composeBar('peace', 20, () => 0.5).map(note => note.voice);
    expect(voices).toContain('sun');
    expect(MOOD_SCORES.peace.form[20]?.bass).toBeUndefined();
  });

  test('only war has timpani', () => {
    expect(composeBar('war', 4, () => 0.5).some(note => note.voice === 'timpani')).toBe(true);
    expect(composeBar('peace', 8, () => 0.5).some(note => note.voice === 'timpani')).toBe(false);
  });

  test('a drunk hand can slip a semitone and slam the keys', () => {
    const slipped = composeBar('peace', 8, () => 0.1).filter(note => note.voice === 'piano' && note.beats === 0.14);
    expect(slipped.length).toBeGreaterThan(0);
    expect(composeBar('peace', 0, () => 0.01).some(note => note.velocity === 1)).toBe(true);
  });
});

describe('nextBar', () => {
  test('walks forward unless he loses his place in a melody', () => {
    expect(nextBar('peace', 0, () => 0)).toBe(1);
    expect(nextBar('peace', 10, () => 0)).toBe(8);
    expect(nextBar('peace', 10, () => 0.5)).toBe(11);
  });

  test('never loses his place inside the fate knock', () => {
    expect(nextBar('war', 0, () => 0)).toBe(1);
  });
});

describe('barSeconds', () => {
  test('sags at the end of a phrase', () => {
    expect(barSeconds('peace', 7)).toBeGreaterThan(barSeconds('peace', 6));
  });
});

describe('renderPianoNote', () => {
  const sampleRate = 44100;

  const centsOffFundamental = (samples: Float32Array, hz: number): number => {
    const from = Math.floor(sampleRate * 0.05);
    const length = Math.floor(sampleRate * 0.6);
    let best = 0;
    let bestPower = -1;
    for (let cents = -50; cents <= 50; cents += 1) {
      const step = (2 * Math.PI * hz * 2 ** (cents / 1200)) / sampleRate;
      let real = 0;
      let imaginary = 0;
      for (let i = 0; i < length; i++) {
        const value = samples[from + i]! * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / length));
        real += value * Math.cos(step * i);
        imaginary += value * Math.sin(step * i);
      }
      const power = real * real + imaginary * imaginary;
      if (power > bestPower) {
        bestPower = power;
        best = cents;
      }
    }
    return best;
  };

  const loudness = (samples: Float32Array, from: number, to: number): number => {
    const slice = samples.subarray(from * sampleRate, to * sampleRate);
    return Math.sqrt(slice.reduce((sum, value) => sum + value * value, 0) / slice.length);
  };

  test('every key strikes equally loud and fades to silence', () => {
    for (const midi of [32, 61, 76, 93]) {
      const samples = renderPianoNote(midi, sampleRate, seeded());
      expect(loudness(samples, 0, 0.1)).toBeCloseTo(0.3, 5);
      expect(samples.at(-1)).toBeCloseTo(0, 3);
    }
  });

  test('held notes still sing a second later, even at the top of agartha', () => {
    for (const midi of [61, 76, 93]) {
      const samples = renderPianoNote(midi, sampleRate, seeded());
      expect(loudness(samples, 1, 1.1)).toBeGreaterThan(0.02);
    }
  });

  test('no note ever gets louder as it rings', () => {
    for (const midi of [32, 61, 76, 86, 90, 93]) {
      const samples = renderPianoNote(midi, sampleRate, seeded());
      expect(loudness(samples, 3, 3.3)).toBeLessThan(loudness(samples, 0.5, 0.8));
    }
  });

  test('each key is sour by its own fixed amount', () => {
    for (const midi of [44, 61, 76, 93]) {
      const samples = renderPianoNote(midi, sampleRate, seeded());
      expect(Math.abs(centsOffFundamental(samples, midiToHz(midi + sourness(midi))))).toBeLessThan(6);
    }
  });
});
