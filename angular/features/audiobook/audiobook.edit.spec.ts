import { audiobook, audioRecord } from '@testing/audiobook';
import { describe, expect, it } from 'vitest';

import * as edit from './audiobook.edit';
import { emptyUnitAudio } from './audiobook.rules';

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
  it('stores clamped mix settings per unit', () => {
    const book = edit.setMix(audiobook(), 'U01', 'gap', 99);
    expect(book.units['U01'].mix).toEqual({ ...emptyUnitAudio().mix, gap: 5 });
    expect(edit.setMix(book, 'U01', 'vol', -3).units['U01'].mix.vol).toBe(-3);
  });

  it('stores, flags and clears records', () => {
    const base = audiobook();
    const stored = edit.putRecord(base, 'U01', 'B1', audioRecord());
    expect(stored.units['U01'].audio['B1'].flag).toBe('');
    expect(edit.flagRecord(base, 'U01', 'B1', 'x')).toBe(base);
    const flagged = edit.flagRecord(stored, 'U01', 'B1', '  bad stress ');
    expect(flagged.units['U01'].audio['B1'].flag).toBe('bad stress');
    expect(edit.flagRecord(stored, 'U01', 'B1', ' ').units['U01'].audio['B1'].flag).toBe(
      edit.DEFAULT_FLAG_NOTE,
    );
    expect(edit.clearRecordFlag(flagged, 'U01', 'B1').units['U01'].audio['B1'].flag).toBe('');
    expect(edit.clearRecordFlag(stored, 'U01', 'B1')).toBe(stored);
    expect(edit.clearRecordFlag(base, 'U01', 'B1')).toBe(base);
  });
});
