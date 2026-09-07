import { project } from '@testing/fixtures';
import { describe, expect, it } from 'vitest';

import { ParagraphRow } from '../novel/novel.models';
// prettier-ignore
import { chapterParagraphs, chapterTitleOf, initialScript, paragraphRef, rangeSource, unitSource, usesTranslation } from './scripting.source';

const ORIGINALS: ParagraphRow[] = [
  { n: 1, text: 'one', hashcheck: 'a' },
  { n: 2, text: 'two', hashcheck: 'b' },
];

describe('scripting source resolution', () => {
  it('builds paragraphs from the original text', () => {
    expect(paragraphRef(2, 3)).toBe('2.3');
    expect(
      chapterParagraphs({ seq: 2, originals: ORIGINALS, passages: null, translated: false }),
    ).toEqual([
      { id: '2.1', text: 'one' },
      { id: '2.2', text: 'two' },
    ]);
    expect(
      chapterParagraphs({ seq: 2, originals: [], passages: null, translated: false }),
    ).toBeNull();
    expect(
      chapterParagraphs({ seq: 2, originals: undefined, passages: null, translated: false }),
    ).toBeNull();
  });

  it('prefers the translation and falls back to the original', () => {
    const passages = { 1: { text: 'một', note: '' }, 2: { text: '', note: '' } };
    const list = chapterParagraphs({ seq: 1, originals: ORIGINALS, passages, translated: true });
    expect(list?.map((item) => item.text)).toEqual(['một', 'two']);
    const ignored = chapterParagraphs({
      seq: 1,
      originals: ORIGINALS,
      passages,
      translated: false,
    });
    expect(ignored?.map((item) => item.text)).toEqual(['one', 'two']);
    const missing = chapterParagraphs({
      seq: 1,
      originals: ORIGINALS,
      passages: undefined,
      translated: true,
    });
    expect(missing?.[0].text).toBe('one');
  });

  it('merges chapter ranges only when every chapter has text', () => {
    const first = [{ id: '1.1', text: 'a' }];
    const second = [{ id: '2.1', text: 'b' }];
    expect(rangeSource([first, second])?.list).toHaveLength(2);
    expect(rangeSource([first, null])).toBeNull();
    expect(rangeSource([])).toBeNull();
    const chapters = { 1: first, 2: second, 3: null };
    expect(unitSource({ ch: null, chs: [1, 2] }, chapters)?.map['2.1']).toBe('b');
    expect(unitSource({ ch: 3, chs: null }, chapters)).toBeNull();
    expect(unitSource({ ch: null, chs: null }, chapters)).toBeNull();
    expect(unitSource({ ch: 9, chs: null }, chapters)).toBeNull();
  });

  it('titles chapters', () => {
    const base = {
      seq: 2,
      hasNovel: true,
      translated: true,
      translatedTitle: 'Tựa',
      originalTitle: 'Title',
    };
    expect(chapterTitleOf(base)).toBe('Tựa');
    expect(chapterTitleOf({ ...base, translatedTitle: null })).toBe('Title');
    expect(chapterTitleOf({ ...base, translated: false })).toBe('Title');
    expect(chapterTitleOf({ ...base, translatedTitle: null, originalTitle: null })).toBe(
      'Chapter 2',
    );
    expect(chapterTitleOf({ ...base, hasNovel: false })).toBe('Chapter 2');
  });

  it('detects translated sources', () => {
    expect(usesTranslation(project({ srcKind: 'translation' }))).toBe(true);
    expect(usesTranslation(project({ srcKind: 'original' }))).toBe(false);
    expect(usesTranslation(project({ srcKind: null }))).toBe(false);
  });
});

describe('scripting initial script', () => {
  it('starts an audiobook script without any stored chapter', () => {
    const script = initialScript(project({ template: 'audiobook', novelId: 1 }));
    expect(script.cfg.preset).toBe('audiobook');
    expect(script.choose).toBe(false);
    expect(script.units).toEqual([]);
    expect(script.useq).toBe(0);
  });

  it('creates one open episode for films', () => {
    const script = initialScript(project({ template: 'filmseries', novelId: 1 }));
    expect(script.cfg.preset).toBe('film');
    expect(script.units).toHaveLength(1);
    expect(script.units[0]).toMatchObject({ chapterId: null, chs: null });
  });

  it('asks which kind of product to write for blank projects', () => {
    const blank = initialScript(project({ template: 'blank' }));
    expect(blank.choose).toBe(true);
    expect(blank.cfg.preset).toBe('audiobook');
    expect(blank.units).toEqual([]);
  });
});
