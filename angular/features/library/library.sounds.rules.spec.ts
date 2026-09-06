import { librarySound } from '@testing/fixtures';
import { describe, expect, it } from 'vitest';

// prettier-ignore
import { audioText, durationText, filterSounds, searchSounds, soundCode } from './library.sounds.rules';

describe('library.sounds.rules', () => {
  const items = [
    librarySound({
      id: 1,
      name: 'b',
      size: 1,
      tags: ['x'],
      createdAt: '2026-01-01',
      collectionId: 2,
    }),
    librarySound({ id: 2, name: 'a', size: 9, createdAt: '2026-02-01' }),
  ];

  it('describes audio', () => {
    expect(audioText(librarySound({ sampleRate: 44100, channels: 1 }))).toBe('44.1 kHz · Mono');
    expect(audioText(librarySound({ sampleRate: 48000, channels: 2 }))).toBe('48 kHz · Stereo');
    expect(audioText(librarySound({ sampleRate: 48000, channels: 6 }))).toBe('48 kHz · 6 ch');
    expect(searchSounds(items, '')).toHaveLength(2);
  });

  it('filters keeping the given order', () => {
    expect(durationText(65_000)).toBe('1:05');
    expect(soundCode(3)).toMatch(/0003$/);
    expect(
      filterSounds(items, { query: 'X', collection: null, tags: [] }).map((item) => item.id),
    ).toEqual([1]);
    expect(
      filterSounds(items, { query: '', collection: null, tags: [] }).map((item) => item.id),
    ).toEqual([1, 2]);
    expect(
      filterSounds(items, { query: '', collection: 2, tags: [] }).map((item) => item.id),
    ).toEqual([1]);
    expect(
      filterSounds(items, { query: '', collection: 'none', tags: [] }).map((item) => item.id),
    ).toEqual([2]);
    expect(filterSounds(items, { query: '', collection: null, tags: ['x', 'y'] })).toEqual([]);
  });
});
