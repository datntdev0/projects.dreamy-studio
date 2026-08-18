import { I18nKey } from "@app/core/i18n/i18n.models";
import { NovelLang, ParagraphRow, TargetLang, TranslationStatus } from "./novel.models";
import { ChapterFilter, ChapterTranslation, DictDraft, DictEntry, DictEntryType, NovelTranslation, PassageState, TranslationStep, TranslationView, TranslationWarning, WarningFilter, WarningKind, WarningState } from "./novel.translation.models";

export const TARGET_LANGS: TargetLang[] = ["VI", "EN"];

export const TRANSLATION_STEPS: TranslationStep[] = ["dict", "guide", "trans", "result", "warn"];

export const STEP_ICONS: Record<TranslationStep, string> = { dict: "book", guide: "pen", trans: "lang", result: "frames", warn: "alert" };

export const STEP_LABEL_KEYS: Record<TranslationStep, I18nKey> = {
  dict: "novel.translation.step.dict",
  guide: "novel.translation.step.guide",
  trans: "novel.translation.step.trans",
  result: "novel.translation.step.result",
  warn: "novel.translation.step.warn",
};

export const STEP_HINT_KEYS: Record<TranslationStep, I18nKey> = {
  dict: "novel.translation.hint.dict",
  guide: "novel.translation.hint.guide",
  trans: "novel.translation.hint.trans",
  result: "novel.translation.hint.result",
  warn: "novel.translation.hint.warn",
};

export const DICT_TYPES: DictEntryType[] = ["name", "place", "org", "title", "term"];

export const DICT_TYPE_KEYS: Record<DictEntryType, I18nKey> = {
  name: "novel.translation.dict.type.name",
  place: "novel.translation.dict.type.place",
  org: "novel.translation.dict.type.org",
  title: "novel.translation.dict.type.title",
  term: "novel.translation.dict.type.term",
};

export const CHAPTER_FILTERS: ChapterFilter[] = ["all", "none", "draft", "review"];

export const CHAPTER_FILTER_KEYS: Record<ChapterFilter, I18nKey> = {
  all: "novel.translation.trans.filter.all",
  none: "novel.translation.status.none",
  draft: "novel.translation.status.draft",
  review: "novel.translation.status.review",
};

export const WARNING_FILTERS: WarningFilter[] = ["open", "done", "all"];

export const WARNING_FILTER_KEYS: Record<WarningFilter, I18nKey> = {
  open: "novel.translation.warn.filter.open",
  done: "novel.translation.warn.filter.done",
  all: "novel.translation.warn.filter.all",
};

export const WARNING_KIND_KEYS: Record<WarningKind, I18nKey> = {
  source: "novel.translation.warn.kind.source",
  dict: "novel.translation.warn.kind.dict",
  guideline: "novel.translation.warn.kind.guideline",
};

export const WARNING_KIND_BADGES: Record<WarningKind, string> = {
  source: "badge-warning",
  dict: "badge-info",
  guideline: "badge-info",
};

export const STATUS_KEYS: Record<TranslationStatus, I18nKey> = {
  none: "novel.translation.status.none",
  draft: "novel.translation.status.draft",
  review: "novel.translation.status.review",
  running: "novel.translation.status.running",
};

export const STATUS_BADGES: Record<TranslationStatus, string> = {
  none: "",
  draft: "badge-info",
  review: "badge-warning",
  running: "badge-running",
};

export const PASSAGE_STATE_KEYS: Record<PassageState, I18nKey> = {
  draft: "novel.translation.passage.draft",
  review: "novel.translation.passage.review",
};

export const PASSAGE_STATE_BADGES: Record<PassageState, string> = {
  draft: "",
  review: "badge-warning",
};

export const CHAPTER_ROW_LIMIT = 300;

export const EMPTY_VIEW: TranslationView = { step: "dict", target: null, seq: 1, picks: [], focus: null, newEntry: false };

export function targetsOf(source: NovelLang | undefined): TargetLang[] {
  return TARGET_LANGS.filter((lang) => lang !== source);
}

export function emptyTranslation(): NovelTranslation {
  return { guidelines: "", dict: [], chapters: {}, warnings: [] };
}

export function emptyDraft(): DictDraft {
  return { src: "", dst: "", type: "term", note: "" };
}

export function stepIndex(step: TranslationStep): number {
  return TRANSLATION_STEPS.indexOf(step);
}

export function reviewCountOf(chapter: ChapterTranslation | undefined): number {
  let total = 0;
  for (const passage of Object.values(chapter?.passages ?? {})) {
    total += passage.state === "review" ? 1 : 0;
  }
  return total;
}

export function reviewCount(translation: NovelTranslation): number {
  let total = 0;
  for (const chapter of Object.values(translation.chapters)) {
    total += reviewCountOf(chapter);
  }
  return total;
}

export function chapterStatus(translation: NovelTranslation, chapterId: string, running: string[]): TranslationStatus {
  if (running.includes(chapterId)) {
    return "running";
  }
  const chapter = translation.chapters[chapterId];
  if (!chapter) {
    return "none";
  }
  return reviewCountOf(chapter) > 0 ? "review" : "draft";
}

export function translatedCount(translation: NovelTranslation): number {
  return Object.keys(translation.chapters).length;
}

export function openWarnings(list: TranslationWarning[]): TranslationWarning[] {
  const out: TranslationWarning[] = [];
  for (const warning of list) {
    if (warning.state === "open") {
      out.push(warning);
    }
  }
  return out;
}

export function matchesWarningFilter(state: WarningState, filter: WarningFilter): boolean {
  if (filter === "all") {
    return true;
  }
  return filter === "open" ? state === "open" : state !== "open";
}

export function filterWarnings(list: TranslationWarning[], filter: WarningFilter): TranslationWarning[] {
  const out: TranslationWarning[] = [];
  for (const warning of list) {
    if (matchesWarningFilter(warning.state, filter)) {
      out.push(warning);
    }
  }
  return out;
}

export function matchesDict(entry: DictEntry, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return true;
  }
  return `${entry.src} ${entry.dst} ${entry.note}`.toLowerCase().includes(needle);
}

export function filterDict(list: DictEntry[], query: string): DictEntry[] {
  const out: DictEntry[] = [];
  for (const entry of list) {
    if (matchesDict(entry, query)) {
      out.push(entry);
    }
  }
  return out;
}

export function matchesChapterFilter(status: TranslationStatus, filter: ChapterFilter): boolean {
  return filter === "all" || status === filter;
}

export function nextEntryId(list: DictEntry[]): string {
  let highest = 0;
  for (const entry of list) {
    highest = Math.max(highest, Number(entry.id.slice(1)) || 0);
  }
  return `D${String(highest + 1).padStart(2, "0")}`;
}

export function nextWarningId(list: TranslationWarning[]): string {
  let highest = 0;
  for (const warning of list) {
    highest = Math.max(highest, Number(warning.id.slice(1)) || 0);
  }
  return `W${String(highest + 1).padStart(2, "0")}`;
}

export function replaceEntry(list: DictEntry[], next: DictEntry): DictEntry[] {
  const out: DictEntry[] = [];
  for (const entry of list) {
    out.push(entry.id === next.id ? next : entry);
  }
  return out;
}

export function withoutEntry(list: DictEntry[], id: string): DictEntry[] {
  const out: DictEntry[] = [];
  for (const entry of list) {
    if (entry.id !== id) {
      out.push(entry);
    }
  }
  return out;
}

export function replaceWarning(list: TranslationWarning[], next: TranslationWarning): TranslationWarning[] {
  const out: TranslationWarning[] = [];
  for (const warning of list) {
    out.push(warning.id === next.id ? next : warning);
  }
  return out;
}

export function rangeText(numbers: number[]): string {
  const sorted = [...numbers].sort((a, b) => a - b);
  const parts: string[] = [];
  let start = 0;
  while (start < sorted.length) {
    let end = start;
    while (end + 1 < sorted.length && sorted[end + 1] === sorted[end] + 1) {
      end += 1;
    }
    parts.push(end === start ? `${sorted[start]}` : `${sorted[start]}–${sorted[end]}`);
    start = end + 1;
  }
  return parts.join(", ");
}

export function usesTerm(text: string, term: string): boolean {
  return text.toLowerCase().includes(term.toLowerCase());
}

export function flaggedPassages(entry: DictEntry, source: ParagraphRow[], chapter: ChapterTranslation): number[] {
  const out: number[] = [];
  for (const paragraph of source) {
    const passage = chapter.passages[paragraph.n];
    if (passage && usesTerm(paragraph.text, entry.src) && !usesTerm(passage.text, entry.dst)) {
      out.push(paragraph.n);
    }
  }
  return out;
}
