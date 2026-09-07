import { ChapterRow } from '../novel/novel.models';
import { ChapterTranslation, NovelTranslation } from '../novel/novel.translation.models';
import { Script, ScriptUnit } from './scripting.models';
import { chapterTitleOf } from './scripting.source';

export interface DerivedChapter {
  id: string;
  seq: number;
  title: string;
}

export interface ChapterListInput {
  rows: ChapterRow[];
  translation: NovelTranslation | null;
}

export type WireUnit =
  ScriptUnit | Pick<ScriptUnit, 'id' | 'chapterId' | 'blocks' | 'meta' | 'updated'>;

export type WireScript = Omit<Script, 'units'> & { units: WireUnit[] };

export function isTranslatedChapter(chapter: ChapterTranslation | undefined): boolean {
  return !!chapter && (!!chapter.title || Object.keys(chapter.passages).length > 0);
}

function derivedChapter(row: ChapterRow, translation: NovelTranslation | null): DerivedChapter {
  return {
    id: row.id,
    seq: row.seq,
    title: chapterTitleOf({
      seq: row.seq,
      hasNovel: true,
      translated: translation !== null,
      translatedTitle: translation?.chapters[row.id]?.title || null,
      originalTitle: row.title || null,
    }),
  };
}

function bySeq(first: ChapterRow, second: ChapterRow): number {
  return first.seq - second.seq;
}

export function derivedChapters(input: ChapterListInput): DerivedChapter[] {
  const { translation } = input;
  const rows = translation
    ? input.rows.filter((row) => isTranslatedChapter(translation.chapters[row.id]))
    : input.rows;
  return [...rows].sort(bySeq).map((row) => derivedChapter(row, translation));
}

export function derivesChapters(script: Pick<Script, 'cfg' | 'choose'>): boolean {
  return script.cfg.preset === 'audiobook' && !script.choose;
}

function chapterUnit(stored: ScriptUnit | undefined, chapter: DerivedChapter): ScriptUnit {
  return {
    id: chapter.id,
    chapterId: chapter.id,
    no: chapter.seq,
    ch: chapter.seq,
    chs: null,
    title: chapter.title,
    blocks: stored?.blocks ?? null,
    meta: stored?.meta ?? null,
    updated: stored?.updated ?? '',
  };
}

export function withChapterUnits(stored: Script, chapters: DerivedChapter[]): Script {
  if (!derivesChapters(stored)) {
    return { ...stored, units: stored.units.filter((unit) => unit.chapterId === null) };
  }
  const content = new Map<string, ScriptUnit>();
  for (const unit of stored.units) {
    if (unit.chapterId !== null) {
      content.set(unit.chapterId, unit);
    }
  }
  return {
    ...stored,
    units: chapters.map((chapter) => chapterUnit(content.get(chapter.id), chapter)),
  };
}

function hasStoredContent(unit: ScriptUnit): boolean {
  return unit.chapterId === null || unit.blocks !== null || unit.meta !== null;
}

function storedUnit(unit: ScriptUnit): ScriptUnit {
  return unit.chapterId === null ? unit : { ...unit, no: 0, ch: null, chs: null, title: '' };
}

function hiddenUnits(previous: Script, next: Script): ScriptUnit[] {
  if (!derivesChapters(previous) || !derivesChapters(next)) {
    return [];
  }
  const shown = new Set(next.units.map((unit) => unit.id));
  return previous.units.filter((unit) => unit.chapterId !== null && !shown.has(unit.id));
}

export function storedScript(previous: Script, next: Script): Script {
  const kept = next.units.filter(hasStoredContent).map(storedUnit);
  return { ...next, units: [...kept, ...hiddenUnits(previous, next)] };
}

export function normalizedScript(script: Script): Script {
  return {
    ...script,
    units: script.units.map((unit) => ({ ...unit, chapterId: unit.chapterId ?? null })),
  };
}

export function wireUnit(unit: ScriptUnit): WireUnit {
  if (unit.chapterId === null) {
    return unit;
  }
  return {
    id: unit.id,
    chapterId: unit.chapterId,
    blocks: unit.blocks,
    meta: unit.meta,
    updated: unit.updated,
  };
}

export function wireScript(script: Script): WireScript {
  return { ...script, units: script.units.map(wireUnit) };
}
