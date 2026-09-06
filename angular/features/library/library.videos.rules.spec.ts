import { libraryVideo } from '@testing/fixtures';
import { describe, expect, it } from 'vitest';

// prettier-ignore
import { filterVideos, frameText, searchVideos, videoCode, videoMeta } from './library.videos.rules';

describe('library.videos.rules', () => {
  const items = [
    libraryVideo({
      id: 1,
      name: 'b',
      size: 1,
      tags: ['x'],
      createdAt: '2026-01-01',
      collectionId: 2,
    }),
    libraryVideo({ id: 2, name: 'a', size: 9, createdAt: '2026-02-01', fps: null }),
  ];

  it('formats text', () => {
    expect(videoCode(4)).toBe('VID-0004');
    expect(frameText(items[0])).toBe('1920 × 1080 · 29.97 fps');
    expect(frameText(items[1])).toBe('1920 × 1080');
    expect(videoMeta(items[0])).toBe('0:05 · 1920×1080');
  });

  it('filters keeping the given order', () => {
    expect(searchVideos(items, 'x')).toHaveLength(1);
    expect(
      filterVideos(items, { query: '', collection: null, tags: [] }).map((item) => item.id),
    ).toEqual([1, 2]);
    expect(
      filterVideos(items, { query: '', collection: 2, tags: [] }).map((item) => item.id),
    ).toEqual([1]);
    expect(
      filterVideos(items, { query: '', collection: 'none', tags: [] }).map((item) => item.id),
    ).toEqual([2]);
    expect(
      filterVideos(items, { query: '', collection: null, tags: ['x'] }).map((item) => item.id),
    ).toEqual([1]);
  });
});
