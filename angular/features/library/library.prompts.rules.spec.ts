import { libraryPrompt } from '@testing/fixtures';
import { describe, expect, it } from 'vitest';

// prettier-ignore
import { charCount, filterPrompts, promptCode, promptExcerpt, promptMeta, promptNameTooLong, promptSegments, promptTextTooLarge, promptVariables, searchPrompts, sortPrompts } from './library.prompts.rules';

describe('library.prompts.rules', () => {
  it('formats and measures', () => {
    expect(promptCode(2)).toBe('PRM-0002');
    expect(charCount('a😀')).toBe(2);
    expect(promptMeta(libraryPrompt({ text: 'abc' }))).toBe(3);
    expect(promptNameTooLong('x'.repeat(121))).toBe(true);
    expect(promptNameTooLong('x')).toBe(false);
    expect(promptTextTooLarge('x'.repeat(256 * 1024 + 1))).toBe(true);
    expect(promptTextTooLarge('x')).toBe(false);
  });

  it('extracts variables and segments', () => {
    expect(promptVariables('a {{ x }} b {{y}} {{x}} {{ }}')).toEqual(['x', 'y']);
    expect(promptSegments('a {{x}} b')).toEqual([
      { text: 'a ', variable: false },
      { text: 'x', variable: true },
      { text: ' b', variable: false },
    ]);
    expect(promptSegments('{{x}}')).toEqual([{ text: 'x', variable: true }]);
    expect(promptSegments('')).toEqual([]);
  });

  it('builds excerpts', () => {
    expect(promptExcerpt('short  ')).toBe('short');
    expect(promptExcerpt('x'.repeat(200))).toBe(`${'x'.repeat(180)}…`);
  });

  it('searches, sorts and filters', () => {
    const items = [
      libraryPrompt({
        id: 1,
        name: 'b',
        text: 'hello',
        size: 1,
        tags: ['x'],
        createdAt: '2026-01-01',
        collectionId: 3,
      }),
      libraryPrompt({ id: 2, name: 'a', text: 'world', size: 9, createdAt: '2026-02-01' }),
    ];
    expect(searchPrompts(items, 'WORLD').map((item) => item.id)).toEqual([2]);
    expect(searchPrompts(items, 'x').map((item) => item.id)).toEqual([1]);
    expect(searchPrompts(items, '').length).toBe(2);
    expect(sortPrompts(items, 'name')[0].id).toBe(2);
    expect(sortPrompts(items, 'size')[0].id).toBe(2);
    expect(sortPrompts(items, 'new')[0].id).toBe(2);
    expect(
      filterPrompts(items, { query: '', sort: 'new', collection: 3, tags: [] }).map(
        (item) => item.id,
      ),
    ).toEqual([1]);
    expect(
      filterPrompts(items, { query: '', sort: 'new', collection: 'none', tags: [] }).map(
        (item) => item.id,
      ),
    ).toEqual([2]);
    expect(
      filterPrompts(items, { query: '', sort: 'new', collection: null, tags: ['x'] }).map(
        (item) => item.id,
      ),
    ).toEqual([1]);
  });
});
