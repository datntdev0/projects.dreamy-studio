import { I18nKey, I18nParams } from "@app/core/i18n/i18n.models";
import { ChapterRow, NovelLang, TargetLang, TranslationStatus } from "./novel.models";
import { ChapterFilter, ChapterTranslation, DictDraft, DictEntry, DictEntryType, NovelTranslation, PassageState, TranslationStep, TranslationView, TranslationWarning, WarningFilter, WarningKind, WireChapter, WireTranslation, WireWarning } from "./novel.translation.models";

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

export const WARNING_FILTERS: WarningFilter[] = ["all", "source", "dict"];

export const WARNING_FILTER_KEYS: Record<WarningFilter, I18nKey> = {
  all: "novel.translation.warn.filter.all",
  source: "novel.translation.warn.filter.source",
  dict: "novel.translation.warn.filter.dict",
};

export const WARNING_KIND_KEYS: Record<WarningKind, I18nKey> = {
  source: "novel.translation.warn.kind.source",
  dict: "novel.translation.warn.kind.dict",
};

export const WARNING_KIND_BADGES: Record<WarningKind, string> = {
  source: "badge-warning",
  dict: "badge-info",
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

export function fromWireChapter(wire: WireChapter): ChapterTranslation {
  const passages: Record<number, { text: string; note: string }> = {};
  for (const paragraph of wire.paragraphs) {
    passages[paragraph.n] = { text: paragraph.text, note: paragraph.note };
  }
  return { title: wire.title, passages };
}

export function fromWireWarnings(list: WireWarning[], chapters: ChapterRow[]): TranslationWarning[] {
  const out: TranslationWarning[] = [];
  for (const warning of list) {
    const chapter = chapters.find((item) => item.id === warning.chapterId);
    out.push({
      id: `${warning.kind}:${warning.chapterId}:${warning.n}:${warning.entryId ?? 0}`,
      kind: warning.kind,
      chapterId: warning.chapterId,
      seq: chapter?.seq ?? 0,
      n: warning.n,
      entryId: warning.entryId,
    });
  }
  return out;
}

export function fromWireTranslation(wire: WireTranslation, chapters: ChapterRow[]): NovelTranslation {
  const translated: Record<string, ChapterTranslation> = {};
  for (const [chapterId, chapter] of Object.entries(wire.chapters)) {
    translated[chapterId] = fromWireChapter(chapter);
  }
  return { guidelines: wire.guidelines, dict: wire.dict, chapters: translated, warnings: fromWireWarnings(wire.warnings, chapters) };
}

export function warningsOfPassage(warnings: TranslationWarning[], chapterId: string, n: number): TranslationWarning[] {
  const out: TranslationWarning[] = [];
  for (const warning of warnings) {
    if (warning.chapterId === chapterId && warning.n === n) {
      out.push(warning);
    }
  }
  return out;
}

export function passageState(warnings: TranslationWarning[], chapterId: string, n: number): PassageState {
  return warningsOfPassage(warnings, chapterId, n).length > 0 ? "review" : "draft";
}

export function reviewCountOf(warnings: TranslationWarning[], chapterId: string): number {
  const passages = new Set<number>();
  for (const warning of warnings) {
    if (warning.chapterId === chapterId) {
      passages.add(warning.n);
    }
  }
  return passages.size;
}

export function reviewCount(warnings: TranslationWarning[]): number {
  const passages = new Set<string>();
  for (const warning of warnings) {
    passages.add(`${warning.chapterId}:${warning.n}`);
  }
  return passages.size;
}

export function chapterStatus(translation: NovelTranslation, chapterId: string, running: string[]): TranslationStatus {
  if (running.includes(chapterId)) {
    return "running";
  }
  if (!translation.chapters[chapterId]) {
    return "none";
  }
  return reviewCountOf(translation.warnings, chapterId) > 0 ? "review" : "draft";
}

export function translatedCount(translation: NovelTranslation): number {
  return Object.keys(translation.chapters).length;
}

export function matchesWarningFilter(kind: WarningKind, filter: WarningFilter): boolean {
  return filter === "all" || kind === filter;
}

export function filterWarnings(list: TranslationWarning[], filter: WarningFilter): TranslationWarning[] {
  const out: TranslationWarning[] = [];
  for (const warning of list) {
    if (matchesWarningFilter(warning.kind, filter)) {
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

export function replaceEntry(list: DictEntry[], next: DictEntry): DictEntry[] {
  const out: DictEntry[] = [];
  for (const entry of list) {
    out.push(entry.id === next.id ? next : entry);
  }
  return out;
}

export function withoutEntry(list: DictEntry[], id: number): DictEntry[] {
  const out: DictEntry[] = [];
  for (const entry of list) {
    if (entry.id !== id) {
      out.push(entry);
    }
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

export function warningReason(warning: TranslationWarning, dict: DictEntry[]): { key: I18nKey; params: I18nParams } {
  if (warning.kind === "source") {
    return { key: "novel.translation.warn.reason.source", params: {} };
  }
  const entry = dict.find((item) => item.id === warning.entryId);
  return { key: "novel.translation.warn.reason.dict", params: { src: entry?.src ?? "", dst: entry?.dst ?? "" } };
}
