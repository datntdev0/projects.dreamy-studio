import { TargetLang } from "./novel.models";

export type TranslationStep = "dict" | "guide" | "trans" | "result" | "warn";

export type DictEntryType = "name" | "place" | "org" | "title" | "term";

export type PassageState = "draft" | "review";

export type WarningKind = "source" | "dict" | "guideline";

export type WarningState = "open" | "resolved";

export type WarningFilter = "open" | "done" | "all";

export type ChapterFilter = "all" | "none" | "draft" | "review";

export interface DictEntry {
  id: string;
  src: string;
  dst: string;
  type: DictEntryType;
  note: string;
}

export interface DictDraft {
  src: string;
  dst: string;
  type: DictEntryType;
  note: string;
}

export interface PassageNote {
  text: string;
  date: string;
}

export interface PassageTranslation {
  text: string;
  state: PassageState;
  previous: PassageState;
  note: PassageNote | null;
}

export interface ChapterTranslation {
  title: string;
  passages: Record<number, PassageTranslation>;
}

export interface TranslationWarning {
  id: string;
  kind: WarningKind;
  chapterId: string;
  seq: number;
  n: number | null;
  reason: string;
  state: WarningState;
  by: string;
  date: string;
}

export interface NovelTranslation {
  guidelines: string;
  dict: DictEntry[];
  chapters: Record<string, ChapterTranslation>;
  warnings: TranslationWarning[];
}

export interface TranslationView {
  step: TranslationStep;
  target: TargetLang | null;
  seq: number;
  picks: string[];
  focus: number | null;
  newEntry: boolean;
}

export interface TranslatedPassage {
  n: number;
  text: string;
}

export interface TranslatedChapter {
  title: string;
  passages: TranslatedPassage[];
}

export interface DictChange {
  entry: DictEntry;
  flagged: number;
}

