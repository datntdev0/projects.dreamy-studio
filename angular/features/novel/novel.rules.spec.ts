import { DesktopIpcError } from '@shared/desktop/desktop-ipc-error';
import { chapter, novel } from '@testing/fixtures';
import { describe, expect, it } from 'vitest';

// prettier-ignore
import { applyInspectEvent, checkTag, clampSeq, compareNewestFirst, compareTagCount, compareUpdatedDesc, displayName, exportFileName, fieldPatch, fileNameOf, filterChapters, filterNovels, formatCount, formatMonthDay, formatStamp, fracState, hasCustomName, inspectPercent, isChapterLocked, isDuplicateTitle, langCounts, matchesChapter, matchesQuery, normalizeParagraphText, normTag, novelProgress, novelTotals, parseTags, passesFilters, pruneLangs, pruneTags, READER_PREF_DEFAULT, readerPageStyle, recentNovels, sanitizePrefs, tagCounts, titleTooLong, toggled, toNovelError, toNovelInput, withoutTag } from './novel.rules';

describe('novel.rules tags', () => {
  it('normalizes and parses tags', () => {
    expect(normTag('  #Foo, Bar ')).toBe('foo--bar'.replace('--', '-'));
    expect(parseTags('a, B ,a,,c')).toEqual(['a', 'b', 'c']);
    expect(parseTags(Array.from({ length: 20 }, (_, i) => `t${i}`).join(','))).toHaveLength(12);
  });

  it('checks tags', () => {
    expect(checkTag([], '')).toBe('empty');
    expect(checkTag(['a'], 'a')).toBe('duplicate');
    expect(
      checkTag(
        Array.from({ length: 12 }, (_, i) => `t${i}`),
        'x',
      ),
    ).toBe('limit');
    expect(checkTag([], 'x')).toBe('ok');
    expect(withoutTag(['a', 'b'], 'a')).toEqual(['b']);
  });

  it('counts and prunes tags and languages', () => {
    const novels = [novel({ id: 1, tags: ['a', 'b'] }), novel({ id: 2, tags: ['b'], lang: 'VI' })];
    expect(tagCounts(novels)).toEqual([
      { tag: 'b', count: 2 },
      { tag: 'a', count: 1 },
    ]);
    expect(compareTagCount({ tag: 'a', count: 1 }, { tag: 'b', count: 1 })).toBeLessThan(0);
    expect(langCounts(novels)).toEqual([
      { lang: 'EN', count: 1 },
      { lang: 'VI', count: 1 },
    ]);
    expect(pruneTags(['a', 'z'], new Set(['a']))).toEqual(['a']);
    expect(pruneLangs(['EN', 'JA'], novels)).toEqual(['EN']);
    expect(toggled([1, 2], 2)).toEqual([1]);
    expect(toggled([1], 2)).toEqual([1, 2]);
  });
});

describe('novel.rules novels', () => {
  it('resolves display names', () => {
    expect(displayName({ name: ' Custom ', title: 'T' })).toBe('Custom');
    expect(displayName({ name: '', title: 'T' })).toBe('T');
    expect(hasCustomName({ name: 'x', title: 'T' })).toBe(true);
    expect(hasCustomName({ name: '', title: 'T' })).toBe(false);
  });

  it('sorts', () => {
    expect(compareNewestFirst(novel({ id: 1 }), novel({ id: 2 }))).toBeGreaterThan(0);
    expect(
      compareUpdatedDesc(novel({ updatedAt: '2026-01-01' }), novel({ updatedAt: '2026-02-01' })),
    ).toBeGreaterThan(0);
    const list = [
      novel({ id: 1, updatedAt: 'a' }),
      novel({ id: 2, updatedAt: 'c' }),
      novel({ id: 3, updatedAt: 'b' }),
    ];
    expect(recentNovels(list, 2).map((item) => item.id)).toEqual([2, 3]);
  });

  it('filters and searches', () => {
    const a = novel({ id: 1, title: 'Alpha', tags: ['x'], lang: 'EN' });
    const b = novel({ id: 2, title: 'Beta', author: 'Zed', tags: ['y'], lang: 'VI' });
    expect(passesFilters(a, { tags: ['x'], langs: ['EN'] })).toBe(true);
    expect(passesFilters(a, { tags: ['y'], langs: [] })).toBe(false);
    expect(passesFilters(a, { tags: [], langs: ['VI'] })).toBe(false);
    expect(matchesQuery(b, '')).toBe(true);
    expect(matchesQuery(b, 'zed')).toBe(true);
    expect(matchesQuery(b, 'nope')).toBe(false);
    expect(filterNovels([a, b], { tags: [], langs: [] }, 'alp')).toEqual([a]);
  });

  it('computes progress, totals and fractions', () => {
    expect(novelProgress(novel())).toEqual({ translated: 4, analyzed: 2, total: 10 });
    expect(
      novelTotals([
        novel(),
        novel({ chapterCount: 5, wordCount: 5, translatedCount: 1, analyzedCount: 1 }),
      ]),
    ).toEqual({ novels: 2, chapters: 15, words: 1005, translated: 5, analyzed: 3 });
    expect(fracState(5, 5)).toBe('is-full');
    expect(fracState(1, 5)).toBe('is-part');
    expect(fracState(0, 5)).toBe('');
    expect(fracState(0, 0)).toBe('');
  });

  it('validates titles', () => {
    expect(isDuplicateTitle([novel({ title: ' Hello ' })], 'hello')).toBe(true);
    expect(isDuplicateTitle([novel()], '  ')).toBe(false);
    expect(isDuplicateTitle([novel()], 'other')).toBe(false);
    expect(titleTooLong('a'.repeat(201))).toBe(true);
    expect(titleTooLong('a')).toBe(false);
  });

  it('builds inputs and patches', () => {
    const form = {
      title: ' T ',
      name: 'T',
      author: ' A ',
      lang: 'VI' as const,
      description: ' d ',
      tags: 'x, y',
    };
    expect(toNovelInput(form)).toEqual({
      title: 'T',
      name: '',
      author: 'A',
      lang: 'VI',
      description: 'd',
      tags: ['x', 'y'],
    });
    expect(toNovelInput({ ...form, name: 'N' }).name).toBe('N');
    const n = novel({ title: 'T' });
    expect(fieldPatch(n, 'title', ' ')).toBeNull();
    expect(fieldPatch(n, 'title', ' X ')).toEqual({ title: 'X' });
    expect(fieldPatch(n, 'name', 'T')).toEqual({ name: '' });
    expect(fieldPatch(n, 'name', 'N')).toEqual({ name: 'N' });
    expect(fieldPatch(n, 'lang', 'VI')).toEqual({ lang: 'VI' });
    expect(fieldPatch(n, 'author', ' a ')).toEqual({ author: 'a' });
    expect(fieldPatch(n, 'description', 'd')).toEqual({ description: 'd' });
  });
});

describe('novel.rules chapters and reader', () => {
  it('filters chapters', () => {
    const rows = [
      chapter({ seq: 1, title: 'Alpha' }),
      chapter({ id: 'c2', seq: 2, title: 'Beta' }),
    ];
    expect(matchesChapter(rows[0], '')).toBe(true);
    expect(matchesChapter(rows[0], 'alp')).toBe(true);
    expect(filterChapters(rows, '2')).toEqual([rows[1]]);
  });

  it('clamps sequence numbers and normalizes paragraphs', () => {
    expect(clampSeq(0, 5)).toBe(1);
    expect(clampSeq(9, 5)).toBe(5);
    expect(clampSeq(3.7, 5)).toBe(3);
    expect(clampSeq(2, 0)).toBe(1);
    expect(normalizeParagraphText('  a \r\n b\nc ')).toBe('a b c');
    expect(isChapterLocked(chapter())).toBe(false);
    expect(isChapterLocked(chapter({ translationStatus: 'done' }))).toBe(true);
    expect(isChapterLocked(chapter({ analysisStatus: 'stale' }))).toBe(true);
  });

  it('sanitizes reader preferences', () => {
    expect(sanitizePrefs(null)).toEqual(READER_PREF_DEFAULT);
    expect(
      sanitizePrefs({
        font: 'mono',
        size: 20,
        lh: Number.NaN,
        width: 820,
        paper: 'bad',
        nums: false,
        justify: 'x',
      }),
    ).toEqual({
      font: 'mono',
      size: 20,
      lh: 1.75,
      width: 820,
      paper: 'default',
      nums: false,
      justify: false,
    });
  });

  it('renders the page style', () => {
    expect(readerPageStyle(READER_PREF_DEFAULT)).toContain('--rd-fs:17px');
    expect(readerPageStyle({ ...READER_PREF_DEFAULT, paper: 'sepia' })).toContain(
      '--rd-bg:#f3ead7',
    );
  });
});

describe('novel.rules misc', () => {
  it('converts errors', () => {
    expect(toNovelError({ code: 'a', detail: 'b' })).toEqual({ code: 'a', detail: 'b' });
    expect(toNovelError(new DesktopIpcError('c', { code: 'a', detail: 'b' }))).toEqual({
      code: 'a',
      detail: 'b',
    });
    expect(toNovelError('x')).toEqual({ code: 'unknown', detail: 'x' });
    expect(toNovelError(null)).toEqual({ code: 'unknown', detail: 'null' });
  });

  it('tracks inspection progress', () => {
    let checks = applyInspectEvent([], { step: 'format', status: 'running' });
    expect(inspectPercent(checks)).toBe(0);
    checks = applyInspectEvent(checks, { step: 'format', status: 'ok', detail: 'd' });
    checks = applyInspectEvent(checks, { step: 'open', status: 'warn' });
    expect(checks).toHaveLength(2);
    expect(inspectPercent(checks)).toBe(33);
  });

  it('formats names, counts and stamps', () => {
    expect(fileNameOf('a\\b/c.txt')).toBe('c.txt');
    expect(fileNameOf('dir/')).toBe('dir/');
    expect(exportFileName(novel({ title: 'My: "Novel"?. ' }))).toBe('My Novel.dsnovel');
    expect(exportFileName(novel({ title: '???' }))).toBe('novel.dsnovel');
    expect(formatCount(1234567)).toBe('1,234,567');
    expect(formatStamp('bad')).toBe('bad');
    expect(formatStamp('2026-03-04T05:06:00')).toBe('2026-03-04 05:06');
    expect(formatMonthDay('2026-03-04T05:06:00')).toBe('03-04');
  });
});
