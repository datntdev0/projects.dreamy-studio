import { chapter } from '@testing/fixtures';
import { describe, expect, it } from 'vitest';

import { DictEntry, NovelTranslation, TranslationWarning } from './novel.translation.models';
// prettier-ignore
import { chapterStatus, emptyDraft, emptyTranslation, filterDict, filterWarnings, fromWireChapter, fromWireTranslation, fromWireWarnings, matchesChapterFilter, matchesDict, matchesWarningFilter, passageState, planTranslation, rangeText, replaceEntry, reviewCount, reviewCountOf, stepIndex, targetsOf, translatedCount, warningReason, warningsOfPassage, withoutEntry } from './novel.translation.rules';

const entry = (id: number, src: string, dst = '', note = ''): DictEntry => ({
  id,
  src,
  dst,
  type: 'term',
  note,
});
const warn = (
  kind: 'source' | 'dict',
  chapterId: string,
  n: number,
  entryId: number | null = null,
): TranslationWarning => ({ id: `${kind}${chapterId}${n}`, kind, chapterId, seq: 1, n, entryId });

describe('novel.translation.rules', () => {
  it('lists targets and empty values', () => {
    expect(targetsOf('EN')).toEqual(['VI']);
    expect(targetsOf(undefined)).toEqual(['VI', 'EN']);
    expect(emptyTranslation().dict).toEqual([]);
    expect(emptyDraft().type).toBe('term');
    expect(stepIndex('trans')).toBe(2);
  });

  it('converts wire values', () => {
    expect(
      fromWireChapter({
        title: 'T',
        paragraphs: [{ n: 1, originalHashcheck: 'h', text: 'x', note: 'n' }],
      }),
    ).toEqual({ title: 'T', passages: { 1: { text: 'x', note: 'n' } } });
    const rows = [chapter({ id: 'c1', seq: 7 })];
    expect(
      fromWireWarnings(
        [
          { kind: 'dict', chapterId: 'c1', n: 2, entryId: 5 },
          { kind: 'source', chapterId: 'zz', n: 1, entryId: null },
        ],
        rows,
      ),
    ).toEqual([
      { id: 'dict:c1:2:5', kind: 'dict', chapterId: 'c1', seq: 7, n: 2, entryId: 5 },
      { id: 'source:zz:1:0', kind: 'source', chapterId: 'zz', seq: 0, n: 1, entryId: null },
    ]);
    const wire = {
      guidelines: 'g',
      dict: [entry(1, 'a')],
      chapters: { c1: { title: 'T', paragraphs: [] } },
      warnings: [],
    };
    expect(fromWireTranslation(wire, rows).chapters['c1'].title).toBe('T');
  });

  it('derives review state', () => {
    const list = [warn('source', 'c1', 1), warn('dict', 'c1', 1, 1), warn('dict', 'c2', 3, 1)];
    expect(warningsOfPassage(list, 'c1', 1)).toHaveLength(2);
    expect(passageState(list, 'c1', 1)).toBe('review');
    expect(passageState(list, 'c1', 9)).toBe('ok');
    expect(reviewCountOf(list, 'c1')).toBe(1);
    expect(reviewCount(list)).toBe(2);
    expect(matchesWarningFilter('dict', 'all')).toBe(true);
    expect(matchesWarningFilter('dict', 'source')).toBe(false);
    expect(filterWarnings(list, 'dict')).toHaveLength(2);
    expect(warningReason(list[0], [])).toEqual({
      key: 'novel.translation.warn.reason.source',
      params: {},
    });
    expect(warningReason(list[1], [entry(1, 's', 'd')]).params).toEqual({ src: 's', dst: 'd' });
    expect(warningReason(list[1], []).params).toEqual({ src: '', dst: '' });
  });

  it('derives chapter status', () => {
    const translation: NovelTranslation = {
      ...emptyTranslation(),
      chapters: { c3: { title: '', passages: {} } },
    };
    expect(chapterStatus(translation, 'c1', ['c1'], [])).toBe('running');
    expect(chapterStatus(translation, 'c2', [], ['c2'])).toBe('queued');
    expect(chapterStatus(translation, 'c9', [], [])).toBe('none');
    expect(chapterStatus(translation, 'c3', [], [])).toBe('done');
    expect(translatedCount(translation)).toBe(1);
    expect(matchesChapterFilter('done', 'all')).toBe(true);
    expect(matchesChapterFilter('done', 'none')).toBe(false);
  });

  it('filters and edits the dictionary', () => {
    const list = [entry(1, 'Alpha', 'A'), entry(2, 'Beta', 'B', 'note')];
    expect(matchesDict(list[0], ' ')).toBe(true);
    expect(matchesDict(list[1], 'NOTE')).toBe(true);
    expect(filterDict(list, 'alp')).toEqual([list[0]]);
    expect(replaceEntry(list, entry(2, 'Bee'))[1].src).toBe('Bee');
    expect(withoutEntry(list, 1)).toEqual([list[1]]);
  });

  it('formats ranges', () => {
    expect(rangeText([5, 1, 2, 3, 7])).toBe('1–3, 5, 7');
    expect(rangeText([])).toBe('');
  });

  it('plans translation runs', () => {
    const rows = [1, 2, 3, 4].map((seq) =>
      chapter({ id: `c${seq}`, seq, wordCount: seq === 4 ? 0 : 10 }),
    );
    const translated = { c1: { title: '', passages: {} } };
    const missing = planTranslation(rows, translated, ['c3'], {
      mode: 'missing',
      from: 1,
      to: 4,
      overwrite: true,
    });
    expect(missing).toMatchObject({
      run: [2],
      busy: [3],
      noSource: [4],
      keep: [1],
      missing: [2, 3, 4],
    });
    const range = planTranslation(rows, translated, [], {
      mode: 'range',
      from: 1,
      to: 2,
      overwrite: true,
    });
    expect(range.run).toEqual([1, 2]);
    expect(range.overwrite).toEqual([1]);
    expect(
      planTranslation(rows, translated, [], { mode: 'all', from: 1, to: 4, overwrite: false }).run,
    ).toEqual([2, 3]);
  });
});
