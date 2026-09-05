import { project } from '@testing/fixtures';
import { describe, expect, it } from 'vitest';

import { ParagraphRow } from '../novel/novel.models';
// prettier-ignore
import { chapterParagraphs, chapterTitleOf, initialScript, needsChapterUnits, paragraphRef, rangeSource, unitSource, usesTranslation } from './scripting.source';

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
  it('creates chapter units for an audiobook range', () => {
    const script = initialScript(project({ template: 'audiobook', rangeFrom: 2, rangeTo: 3 }), {
      2: 'Two',
    });
    expect(script.cfg.preset).toBe('audiobook');
    expect(script.choose).toBe(false);
    expect(script.units.map((unit) => [unit.id, unit.no, unit.ch, unit.title])).toEqual([
      ['U01', 2, 2, 'Two'],
      ['U02', 3, 3, 'Chapter 3'],
    ]);
    expect(script.useq).toBe(2);
  });

  it('creates one empty unit without a range', () => {
    const script = initialScript(
      project({ template: 'audiobook', rangeFrom: null, rangeTo: null }),
      {},
    );
    expect(script.units).toHaveLength(1);
    expect(script.units[0]).toMatchObject({ no: 1, ch: null, title: '' });
  });

  it('creates a unit for every chapter when the project takes the whole novel', () => {
    const whole = project({ template: 'audiobook', novelId: 1, rangeFrom: null, rangeTo: null });
    const script = initialScript(whole, { 1: 'One' }, 3);
    expect(script.units.map((unit) => [unit.no, unit.ch, unit.title])).toEqual([
      [1, 1, 'One'],
      [2, 2, 'Chapter 2'],
      [3, 3, 'Chapter 3'],
    ]);
  });

  it('rebuilds only an untouched single unit script of a whole novel audiobook', () => {
    const whole = project({ template: 'audiobook', novelId: 1, rangeFrom: null, rangeTo: null });
    const untouched = initialScript(whole, {}, 0);
    expect(needsChapterUnits(whole, untouched, 3)).toBe(true);
    expect(needsChapterUnits(whole, untouched, 0)).toBe(false);
    expect(needsChapterUnits(whole, initialScript(whole, {}, 3), 3)).toBe(false);
    const written = { ...untouched, units: [{ ...untouched.units[0], blocks: [] }] };
    expect(needsChapterUnits(whole, written, 3)).toBe(false);
    const film = project({ template: 'filmseries', novelId: 1, rangeFrom: null, rangeTo: null });
    expect(needsChapterUnits(film, initialScript(film, {}, 3), 3)).toBe(false);
  });

  it('creates one episode spanning the range for films', () => {
    const ranged = initialScript(project({ template: 'filmseries', rangeFrom: 1, rangeTo: 3 }), {});
    expect(ranged.cfg.preset).toBe('film');
    expect(ranged.units).toHaveLength(1);
    expect(ranged.units[0].chs).toEqual([1, 3]);
    const open = initialScript(
      project({ template: 'filmseries', rangeFrom: null, rangeTo: null }),
      {},
    );
    expect(open.units[0].chs).toBeNull();
  });

  it('asks which kind of product to write for blank projects', () => {
    const blank = initialScript(project({ template: 'blank', rangeFrom: null, rangeTo: null }), {});
    expect(blank.choose).toBe(true);
    expect(blank.cfg.preset).toBe('audiobook');
  });
});
