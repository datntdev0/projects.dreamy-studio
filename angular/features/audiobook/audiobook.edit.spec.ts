import { audiobook, audioRecord } from '@testing/audiobook';
import { describe, expect, it } from 'vitest';

import * as edit from './audiobook.edit';
import { DEFAULT_MIX, emptyUnitAudio } from './audiobook.rules';

describe('speaker configuration', () => {
  it('sets voice and clamps speed', () => {
    const base = audiobook();
    const voiced = edit.setSpeakerVoice(base, 'narr', 4);
    expect(voiced.voices['narr']).toEqual({ voice: 4, speed: 1 });
    const fast = edit.setSpeakerSpeed(voiced, 'narr', 9);
    expect(fast.voices['narr']).toEqual({ voice: 4, speed: 1.5 });
    expect(edit.setSpeakerSpeed(base, 'E1', Number.NaN).voices['E1']).toEqual({
      voice: null,
      speed: 1,
    });
    expect(edit.setSpeakerVoice(fast, 'narr', null).voices['narr'].voice).toBeNull();
  });

  it('removes a speaker voice only when it exists', () => {
    const book = audiobook({ voices: { E1: { voice: 1, speed: 1 } } });
    expect(edit.removeSpeakerVoice(book, 'E1').voices).toEqual({});
    expect(edit.removeSpeakerVoice(book, 'zzz')).toBe(book);
  });
});

describe('unit audio', () => {
  it('stores clamped mix settings for the whole project', () => {
    const base = audiobook({ units: { U01: emptyUnitAudio() } });
    const book = edit.setMix(base, 'gap', 99);
    expect(book.mix).toEqual({ ...DEFAULT_MIX, gap: 5 });
    expect(book.units).toBe(base.units);
    expect(base.mix).toEqual(DEFAULT_MIX);
    expect(edit.setMix(book, 'vol', -3).mix.vol).toBe(-3);
    expect(edit.setMix(book, 'sentence', 9).mix.sentence).toBe(2);
    expect(edit.setMix(book, 'sentence', -1).mix.sentence).toBe(0);
    expect(edit.setMix(book, 'sentence', 0.45).mix).toEqual({ ...book.mix, sentence: 0.45 });
  });

  it('stores records, flags and mix replies', () => {
    const base = audiobook();
    const stored = edit.putRecord(base, 'U01', 'B1', audioRecord());
    expect(stored.units['U01'].audio['B1'].flag).toBe('');
    expect(edit.setRecordFlag(base, 'U01', 'B1', 'x')).toBe(base);
    const flagged = edit.setRecordFlag(stored, 'U01', 'B1', 'bad stress');
    expect(flagged.units['U01'].audio['B1'].flag).toBe('bad stress');
    expect(edit.setRecordFlag(flagged, 'U01', 'B1', 'bad stress')).toBe(flagged);
    expect(edit.setRecordFlag(flagged, 'U01', 'B1', '').units['U01'].audio['B1'].flag).toBe('');
    const reply = { gap: 1, intro: 2, outro: 3, vol: 0, sentence: 0.5 };
    const mixed = edit.putMix(stored, reply);
    expect(mixed.mix).toBe(reply);
    expect(mixed.units).toBe(stored.units);
    const unit = { ...emptyUnitAudio(), audio: { B2: audioRecord() } };
    expect(edit.putUnit(base, 'U02', unit).units['U02']).toBe(unit);
  });
});
