import { DesktopIpcError } from '@shared/desktop/desktop-ipc-error';
import { describe, expect, it } from 'vitest';

// prettier-ignore
import { collectionCode, durationText, fileNameOf, formatBytes, formatIsoMinute, hasCollectionName, kindCount, libraryErrorKey, normalizeTag, searchTags, sortTags, sumCounts, tagsForKind, toLibraryError } from './library.rules';

describe('library.rules', () => {
  it('normalizes tags', () => {
    expect(normalizeTag('  #Hello, World  ')).toBe('hello-world');
    expect(normalizeTag('x'.repeat(40))).toHaveLength(24);
  });

  it('formats collection codes', () => {
    expect(collectionCode(3)).toBe('COL-03');
    expect(collectionCode(120)).toBe('COL-120');
  });

  it('sums counts across kinds', () => {
    expect(sumCounts({ image: 1, sound: 2, video: 3, prompt: 4, voice: 5 })).toBe(15);
  });

  it('formats durations', () => {
    expect(durationText(65_000)).toBe('1:05');
    expect(durationText(3_725_000)).toBe('1:02:05');
    expect(durationText(-5)).toBe('0:00');
  });

  it('formats sizes', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(10)).toBe('1 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
    expect(formatBytes(3 * 1024 * 1024 * 1024)).toBe('3.0 GB');
  });

  it('formats timestamps and file names', () => {
    expect(formatIsoMinute('2026-01-02T03:04:05Z')).toBe('2026-01-02 03:04');
    expect(fileNameOf('C:\\a\\b\\c.png')).toBe('c.png');
    expect(fileNameOf('a/b/c.png')).toBe('c.png');
  });

  it('maps errors to language keys', () => {
    expect(libraryErrorKey({ code: 'tag_exists', detail: '' })).toBe('library.error.tagExists');
    expect(libraryErrorKey({ code: 'other', detail: '' })).toBe('library.error.generic');
    expect(toLibraryError('boom')).toEqual({ code: 'unknown', detail: 'boom' });
  });
});

describe('library.rules taxonomy', () => {
  const counts = (image: number, sound = 0) => ({ image, sound, video: 0, prompt: 0, voice: 0 });
  const tags = [
    { tag: 'b', counts: counts(1) },
    { tag: 'a', counts: counts(1) },
    { tag: 'c', counts: counts(0, 5) },
  ];

  it('sorts and searches tags', () => {
    expect(sortTags(tags).map((item) => item.tag)).toEqual(['c', 'a', 'b']);
    expect(searchTags(tags, ' A ').map((item) => item.tag)).toEqual(['a']);
    expect(tagsForKind(tags, 'image').map((item) => item.tag)).toEqual(['a', 'b']);
    expect(kindCount(counts(3), 'image')).toBe(3);
  });

  it('detects duplicate collection names', () => {
    const collections = [
      { id: 1, name: 'Alpha', description: '', createdAt: '', updatedAt: '', counts: counts(0) },
    ];
    expect(hasCollectionName(collections, ' alpha ')).toBe(true);
    expect(hasCollectionName(collections, 'alpha', 1)).toBe(false);
    expect(hasCollectionName(collections, 'beta')).toBe(false);
  });

  it('converts errors', () => {
    expect(toLibraryError({ code: 'a', detail: 'b' })).toEqual({ code: 'a', detail: 'b' });
    expect(toLibraryError(new DesktopIpcError('c', { code: 'a', detail: 'b' }))).toEqual({
      code: 'a',
      detail: 'b',
    });
    expect(toLibraryError('x')).toEqual({ code: 'unknown', detail: 'x' });
  });

  it('maps every error code to a key', () => {
    const codes = [
      'collection_exists',
      'invalid_input',
      'tag_exists',
      'invalid_tag',
      'image_not_found',
      'image_unsupported',
      'image_too_large',
      'image_unreadable',
      'sound_not_found',
      'sound_unsupported',
      'sound_too_large',
      'sound_unreadable',
      'video_not_found',
      'video_unsupported',
      'video_too_large',
      'video_unreadable',
      'prompt_not_found',
      'prompt_too_large',
      'prompt_unreadable',
      'prompt_empty',
      'prompt_name_invalid',
      'tag_limit',
      'io',
    ];
    const keys = new Set(codes.map((code) => libraryErrorKey({ code, detail: '' })));
    expect(keys.size).toBe(codes.length);
    expect(libraryErrorKey('unknown')).toBe('library.error.generic');
  });
});
