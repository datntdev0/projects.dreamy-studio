export type NovelLang = "EN" | "VI" | "ZH" | "JA" | "KO";

export type NovelOrigin = "created" | "imported";

export interface NovelSummary {
  id: number;
  title: string;
  name: string;
  author: string;
  lang: NovelLang;
  description: string;
  origin: NovelOrigin;
  createdAt: string;
  updatedAt: string;
  chapterCount: number;
  wordCount: number;
  translatedCount: number;
  analyzedCount: number;
  tags: string[];
}

export interface NovelInput {
  title: string;
  name: string;
  author: string;
  lang: NovelLang;
  description: string;
  tags: string[];
}

export interface NovelPatch {
  title?: string;
  name?: string;
  author?: string;
  lang?: NovelLang;
  description?: string;
  tags?: string[];
}

export type TranslationStatus = "none" | "draft" | "review" | "running";

export type AnalysisStatus = "none" | "done" | "stale" | "running";

export interface ChapterRow {
  id: string;
  novelId: number;
  seq: number;
  title: string;
  wordCount: number;
  translationStatus: TranslationStatus;
  analysisStatus: AnalysisStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ParagraphRow {
  n: number;
  text: string;
}

export type InspectStep =
  | "format"
  | "open"
  | "manifest"
  | "chapters"
  | "list"
  | "cover";

export type InspectStatus = "running" | "ok" | "warn" | "fail";

export interface InspectEvent {
  step: InspectStep;
  status: InspectStatus;
  detail?: string;
}

export interface InspectCheck {
  step: InspectStep;
  status: InspectStatus;
  detail?: string;
}

export interface PackageSummary {
  title: string;
  author: string;
  lang: NovelLang;
  chapterCount: number;
  wordCount: number;
  hasCover: boolean;
}

export interface NovelError {
  code: string;
  detail: string;
}

export type NovelViewMode = "grid" | "list";

export interface NovelFilters {
  tags: string[];
  langs: NovelLang[];
}

export interface TagCount {
  tag: string;
  count: number;
}

export interface LangCount {
  lang: NovelLang;
  count: number;
}

export interface NovelProgress {
  translated: number;
  analyzed: number;
  total: number;
}

export interface NovelTotals {
  novels: number;
  chapters: number;
  words: number;
  translated: number;
  analyzed: number;
}

export type TagCheck = "ok" | "empty" | "duplicate" | "limit";

export type TagAddResult = "added" | "empty" | "duplicate" | "limit" | "missing";

export type NovelField = "title" | "name" | "author" | "lang" | "description";

export interface NovelFormValue {
  title: string;
  name: string;
  author: string;
  lang: NovelLang;
  description: string;
  tags: string;
}

export interface CoverEntry {
  updatedAt: string;
  url: string | null;
}

export type FracState = "" | "is-part" | "is-full";

export type NovelScreen = "chapters" | "reading";

export type ReaderMode = "read" | "edit";

export type ReaderFont = "serif" | "sans" | "mono";

export type ReaderPaper = "default" | "sepia" | "night";

export interface ReaderPrefs {
  font: ReaderFont;
  size: number;
  lh: number;
  width: number;
  paper: ReaderPaper;
  nums: boolean;
  justify: boolean;
}

export type ParagraphSaveResult = "saved" | "empty" | "unchanged" | "idle";
