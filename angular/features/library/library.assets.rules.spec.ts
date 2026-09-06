import { libraryImage, libraryPrompt, librarySound, libraryVideo } from '@testing/fixtures';
import { describe, expect, it } from 'vitest';

import { toAssetRows } from './library.assets.models';
import { collectionTags, filterAssetRows } from './library.assets.rules';

describe('library assets', () => {
  const rows = toAssetRows(
    [
      libraryImage({
        id: 1,
        name: 'img',
        collectionId: 9,
        tags: ['a'],
        size: 5,
        createdAt: '2026-01-01',
      }),
    ],
    [
      librarySound({
        id: 2,
        name: 'snd',
        collectionId: 9,
        tags: ['a', 'b'],
        size: 7,
        createdAt: '2026-02-01',
      }),
    ],
    [libraryVideo({ id: 3, name: 'vid', collectionId: 8, tags: ['a'] })],
    [
      libraryPrompt({
        id: 4,
        name: 'prm',
        collectionId: 9,
        text: 'Secret words',
        tags: [],
        size: 1,
        createdAt: '2026-03-01',
      }),
    ],
  );

  it('builds rows for every kind', () => {
    expect(rows.map((row) => row.ref.kind)).toEqual(['image', 'sound', 'video', 'prompt']);
    expect(toAssetRows([], [], [])).toEqual([]);
  });

  it('filters rows in a collection, newest first', () => {
    const base = { query: '', collection: 9, tags: [] };
    expect(filterAssetRows(rows, base).map((row) => row.ref.id)).toEqual([4, 2, 1]);
    expect(filterAssetRows(rows, { ...base, query: 'secret' }).map((row) => row.ref.id)).toEqual([
      4,
    ]);
    expect(filterAssetRows(rows, { ...base, query: 'B' }).map((row) => row.ref.id)).toEqual([2]);
    expect(filterAssetRows(rows, { ...base, tags: ['a', 'b'] }).map((row) => row.ref.id)).toEqual([
      2,
    ]);
  });

  it('counts tags in a collection', () => {
    expect(
      collectionTags(rows, 9).map((entry) => [entry.tag, entry.counts.image + entry.counts.sound]),
    ).toEqual([
      ['a', 2],
      ['b', 1],
    ]);
    expect(collectionTags(rows, 1)).toEqual([]);
  });
});
