import { script, scriptBlock, scriptUnit } from '@testing/scripting';
import { describe, expect, it } from 'vitest';

import { ChapterRow } from '../novel/novel.models';
import { NovelTranslation } from '../novel/novel.translation.models';
// prettier-ignore
import { DerivedChapter, derivedChapters, derivesChapters, isTranslatedChapter, normalizedScript, storedScript, wireScript, wireUnit, withChapterUnits } from './scripting.chapters';
import { configOf } from './scripting.rules';

function row(seq: number, title = `Original ${seq}`): ChapterRow {
  return {
    id: `ch-${seq}`,
    novelId: 1,
    seq,
    title,
    wordCount: 10,
    translationStatus: 'none',
    analysisStatus: 'none',
    createdAt: '',
    updatedAt: '',
  };
}

function translation(...seqs: number[]): NovelTranslation {
  const chapters: NovelTranslation['chapters'] = {};
  for (const seq of seqs) {
    chapters[`ch-${seq}`] = { title: `Dịch ${seq}`, passages: { 1: { text: 'một', note: '' } } };
  }
  return { guidelines: '', dict: [], chapters, warnings: [] };
}

function chapters(...seqs: number[]): DerivedChapter[] {
  return seqs.map((seq) => ({ id: `ch-${seq}`, seq, title: `Title ${seq}` }));
}

function chapterUnit(seq: number, overrides = {}) {
  return scriptUnit({ id: `ch-${seq}`, chapterId: `ch-${seq}`, no: seq, ch: seq, ...overrides });
}

describe('scripting derived chapters', () => {
  const rows = Array.from({ length: 100 }, (_, index) => row(index + 1));

  it('lists every original chapter when no translation is used', () => {
    const list = derivedChapters({ rows: rows.slice(0, 3), translation: null });
    expect(list.map((item) => [item.id, item.seq, item.title])).toEqual([
      ['ch-1', 1, 'Original 1'],
      ['ch-2', 2, 'Original 2'],
      ['ch-3', 3, 'Original 3'],
    ]);
  });

  it('falls back to a numbered title when the original title is empty', () => {
    expect(derivedChapters({ rows: [row(4, '')], translation: null })[0].title).toBe('Chapter 4');
  });

  it('lists only translated chapters, sorted by sequence, with the translated title', () => {
    const scattered = [3, 41, 7, 12, 99, 5, 20, 8, 60, 2, 31, 15];
    const list = derivedChapters({ rows, translation: translation(...scattered) });
    expect(list).toHaveLength(12);
    expect(list.map((item) => item.seq)).toEqual([...scattered].sort((a, b) => a - b));
    expect(list[0]).toEqual({ id: 'ch-2', seq: 2, title: 'Dịch 2' });
  });

  it('grows when more chapters are translated', () => {
    const first = derivedChapters({ rows, translation: translation(1, 2, 3) });
    const next = derivedChapters({ rows, translation: translation(1, 2, 3, 50, 4) });
    expect(first).toHaveLength(3);
    expect(next.map((item) => item.seq)).toEqual([1, 2, 3, 4, 50]);
  });

  it('ignores translated records with neither a title nor a passage', () => {
    const empty: NovelTranslation = {
      ...translation(1),
      chapters: { 'ch-1': { title: '', passages: {} }, 'ch-2': { title: 'Hai', passages: {} } },
    };
    expect(
      derivedChapters({ rows: rows.slice(0, 3), translation: empty }).map((c) => c.seq),
    ).toEqual([2]);
    expect(isTranslatedChapter(undefined)).toBe(false);
    expect(isTranslatedChapter({ title: '', passages: { 1: { text: 'x', note: '' } } })).toBe(true);
  });

  it('keeps the original title when a translated chapter has no translated title', () => {
    const untitled: NovelTranslation = {
      ...translation(),
      chapters: { 'ch-1': { title: '', passages: { 1: { text: 'x', note: '' } } } },
    };
    expect(derivedChapters({ rows: [row(1)], translation: untitled })[0].title).toBe('Original 1');
  });
});

describe('scripting chapter units', () => {
  it('derives units from the chapters and links stored content by chapter id', () => {
    const blocks = [scriptBlock()];
    const stored = script([chapterUnit(2, { blocks, updated: 'now', title: '' })]);
    const full = withChapterUnits(stored, chapters(1, 2, 5));
    expect(
      full.units.map((unit) => [unit.id, unit.chapterId, unit.no, unit.ch, unit.title]),
    ).toEqual([
      ['ch-1', 'ch-1', 1, 1, 'Title 1'],
      ['ch-2', 'ch-2', 2, 2, 'Title 2'],
      ['ch-5', 'ch-5', 5, 5, 'Title 5'],
    ]);
    expect(full.units.map((unit) => unit.blocks)).toEqual([null, blocks, null]);
    expect(full.units[1].updated).toBe('now');
  });

  it('hides stored content of chapters that are no longer listed', () => {
    const stored = script([chapterUnit(9, { blocks: [] })]);
    expect(withChapterUnits(stored, chapters(1)).units.map((unit) => unit.id)).toEqual(['ch-1']);
  });

  it('keeps free units and drops chapter units for presets without chapters', () => {
    const film = script([scriptUnit({ id: 'U01', chs: [1, 2] }), chapterUnit(3)], {
      cfg: configOf('film'),
    });
    expect(withChapterUnits(film, chapters(1, 2)).units.map((unit) => unit.id)).toEqual(['U01']);
    expect(derivesChapters(film)).toBe(false);
    expect(derivesChapters(script([], { choose: true }))).toBe(false);
    expect(derivesChapters(script())).toBe(true);
  });

  it('stores only chapter units that carry content and keeps hidden ones', () => {
    const previous = script([chapterUnit(9, { blocks: [] })]);
    const full = withChapterUnits(previous, chapters(1, 2));
    const edited = {
      ...full,
      units: full.units.map((unit) =>
        unit.id === 'ch-2' ? { ...unit, blocks: [scriptBlock()] } : unit,
      ),
    };
    const next = storedScript(previous, edited);
    expect(next.units.map((unit) => unit.id)).toEqual(['ch-2', 'ch-9']);
    expect(next.units[0]).toMatchObject({ chapterId: 'ch-2', no: 0, ch: null, title: '' });
  });

  it('stores units carrying only a progress summary', () => {
    const previous = script();
    const full = withChapterUnits(previous, chapters(1));
    const summarised = { ...full, units: [{ ...full.units[0], meta: { blocks: 8, words: 120 } }] };
    expect(storedScript(previous, summarised).units).toHaveLength(1);
  });

  it('drops hidden chapters when the preset stops using chapters', () => {
    const previous = script([chapterUnit(9, { blocks: [] })]);
    const film = script([scriptUnit({ id: 'U01', chs: null })], { cfg: configOf('film') });
    expect(storedScript(previous, film).units.map((unit) => unit.id)).toEqual(['U01']);
  });

  it('keeps free units whole when storing', () => {
    const free = scriptUnit({ id: 'U01', title: 'Pilot', chs: [1, 2] });
    const film = script([free], { cfg: configOf('film') });
    expect(storedScript(film, film).units[0]).toEqual(free);
  });

  it('normalizes a missing chapter id from storage', () => {
    const legacy = { ...scriptUnit(), chapterId: undefined } as unknown as ReturnType<
      typeof scriptUnit
    >;
    expect(normalizedScript(script([legacy])).units[0].chapterId).toBeNull();
  });

  it('sends only the content fields of a chapter unit over the wire', () => {
    const unit = chapterUnit(3, { blocks: [], updated: 'then' });
    expect(wireUnit(unit)).toEqual({
      id: 'ch-3',
      chapterId: 'ch-3',
      blocks: [],
      meta: null,
      updated: 'then',
    });
    const free = scriptUnit({ id: 'U01' });
    expect(wireUnit(free)).toBe(free);
    expect(wireScript(script([unit, free])).units).toHaveLength(2);
  });
});
