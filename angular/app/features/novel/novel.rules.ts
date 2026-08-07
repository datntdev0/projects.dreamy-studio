import { DesktopIpcError } from "../../core/desktop/desktop-ipc-error";
import { ChapterRow } from "./novel.models";
import { FracState } from "./novel.models";
import { InspectCheck } from "./novel.models";
import { InspectEvent } from "./novel.models";
import { InspectStep } from "./novel.models";
import { LangCount } from "./novel.models";
import { NovelError } from "./novel.models";
import { NovelField } from "./novel.models";
import { NovelFilters } from "./novel.models";
import { NovelFormValue } from "./novel.models";
import { NovelInput } from "./novel.models";
import { NovelLang } from "./novel.models";
import { NovelPatch } from "./novel.models";
import { NovelProgress } from "./novel.models";
import { NovelSummary } from "./novel.models";
import { NovelTotals } from "./novel.models";
import { ReaderFont } from "./novel.models";
import { ReaderPaper } from "./novel.models";
import { ReaderPrefs } from "./novel.models";
import { SelectEvent } from "./novel.models";
import { SelectionState } from "./novel.models";
import { TagCheck } from "./novel.models";
import { TagCount } from "./novel.models";

export const MAX_TAGS = 12;

export const MAX_TAG_LENGTH = 24;

export const MAX_COVER_BYTES = 8 * 1024 * 1024;

export const COVER_MAX_HEIGHT = 640;

export const RECENT_LIMIT = 3;

export const NOVEL_LANGS: NovelLang[] = ["EN", "VI", "ZH", "JA", "KO"];

export const INSPECT_STEPS: InspectStep[] = [
  "format",
  "open",
  "manifest",
  "chapters",
  "list",
  "cover",
];

export const READER_FONTS: ReaderFont[] = ["serif", "sans", "mono"];

export const READER_PAPERS: ReaderPaper[] = ["default", "sepia", "night"];

export const READER_LINE_HEIGHTS: number[] = [1.5, 1.75, 2];

export const READER_WIDTHS: number[] = [560, 680, 820];

export const READER_SIZE_RANGE = { min: 13, max: 24, step: 1 };

export const READER_PREF_DEFAULT: ReaderPrefs = {
  font: "serif",
  size: 17,
  lh: 1.75,
  width: 680,
  paper: "default",
  nums: true,
  justify: false,
};

const READER_FONT_FAMILIES: Record<ReaderFont, string> = {
  serif: "var(--font-serif)",
  sans: "var(--font)",
  mono: "var(--font-mono)",
};

const READER_PAPER_VARS: Record<ReaderPaper, string> = {
  default: "",
  sepia: "--rd-bg:#f3ead7;--rd-fg:#3b3226;--rd-mute:#8a7d68;",
  night: "--rd-bg:#14161c;--rd-fg:#cfd3dc;--rd-mute:#7c8493;",
};

export function normTag(value: string): string {
  return String(value)
    .toLowerCase()
    .replace(/[,#]/g, " ")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, MAX_TAG_LENGTH);
}

export function parseTags(text: string): string[] {
  const out: string[] = [];
  for (const part of String(text).split(",")) {
    const tag = normTag(part);
    if (tag && !out.includes(tag)) {
      out.push(tag);
    }
  }
  return out.slice(0, MAX_TAGS);
}

export function checkTag(tags: string[], tag: string): TagCheck {
  if (!tag) {
    return "empty";
  }
  if (tags.includes(tag)) {
    return "duplicate";
  }
  return tags.length >= MAX_TAGS ? "limit" : "ok";
}

export function withoutTag(tags: string[], tag: string): string[] {
  const out: string[] = [];
  for (const item of tags) {
    if (item !== tag) {
      out.push(item);
    }
  }
  return out;
}

export function displayName(novel: Pick<NovelSummary, "name" | "title">): string {
  const name = novel.name.trim();
  return name ? name : novel.title;
}

export function hasCustomName(novel: Pick<NovelSummary, "name" | "title">): boolean {
  return displayName(novel) !== novel.title;
}

export function compareNewestFirst(a: NovelSummary, b: NovelSummary): number {
  return b.id - a.id;
}

export function compareUpdatedDesc(a: NovelSummary, b: NovelSummary): number {
  return b.updatedAt.localeCompare(a.updatedAt);
}

export function compareTagCount(a: TagCount, b: TagCount): number {
  return b.count - a.count || a.tag.localeCompare(b.tag);
}

export function tagCounts(novels: NovelSummary[]): TagCount[] {
  const counts = new Map<string, number>();
  for (const novel of novels) {
    for (const tag of novel.tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  const out: TagCount[] = [];
  for (const [tag, count] of counts) {
    out.push({ tag, count });
  }
  return out.sort(compareTagCount);
}

export function langCounts(novels: NovelSummary[]): LangCount[] {
  const out: LangCount[] = [];
  for (const lang of NOVEL_LANGS) {
    let count = 0;
    for (const novel of novels) {
      count += novel.lang === lang ? 1 : 0;
    }
    if (count > 0) {
      out.push({ lang, count });
    }
  }
  return out;
}

export function pruneTags(tags: string[], known: Set<string>): string[] {
  const out: string[] = [];
  for (const tag of tags) {
    if (known.has(tag)) {
      out.push(tag);
    }
  }
  return out;
}

export function pruneLangs(langs: NovelLang[], novels: NovelSummary[]): NovelLang[] {
  const out: NovelLang[] = [];
  for (const lang of langs) {
    if (novels.some((novel) => novel.lang === lang)) {
      out.push(lang);
    }
  }
  return out;
}

export function toggled<T>(list: T[], value: T): T[] {
  const index = list.indexOf(value);
  if (index < 0) {
    return [...list, value];
  }
  return [...list.slice(0, index), ...list.slice(index + 1)];
}

function hasAllTags(novel: NovelSummary, tags: string[]): boolean {
  for (const tag of tags) {
    if (!novel.tags.includes(tag)) {
      return false;
    }
  }
  return true;
}

export function passesFilters(novel: NovelSummary, filters: NovelFilters): boolean {
  const langOk = filters.langs.length === 0 || filters.langs.includes(novel.lang);
  return hasAllTags(novel, filters.tags) && langOk;
}

export function matchesQuery(novel: NovelSummary, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return true;
  }
  const haystack = `${novel.title} ${novel.name} ${novel.author}`.toLowerCase();
  return haystack.includes(needle);
}

export function filterNovels(
  novels: NovelSummary[],
  filters: NovelFilters,
  query: string,
): NovelSummary[] {
  const out: NovelSummary[] = [];
  for (const novel of novels) {
    if (passesFilters(novel, filters) && matchesQuery(novel, query)) {
      out.push(novel);
    }
  }
  return out;
}

function rangeBetween(order: number[], anchor: number, id: number): number[] | null {
  const a = order.indexOf(anchor);
  const b = order.indexOf(id);
  if (a < 0 || b < 0) {
    return null;
  }
  return order.slice(Math.min(a, b), Math.max(a, b) + 1);
}

export function clickSelection(
  state: SelectionState,
  id: number,
  event: SelectEvent | undefined,
  order: number[],
  known: Set<number>,
): SelectionState {
  const anchor = state.anchor;
  if (event?.shiftKey && anchor !== null && known.has(anchor)) {
    const range = rangeBetween(order, anchor, id);
    return range ? { ids: range, anchor } : state;
  }
  if (event?.ctrlKey || event?.metaKey) {
    return { ids: toggled(state.ids, id), anchor: id };
  }
  return { ids: [id], anchor: id };
}

export function toggleSelection(state: SelectionState, id: number): SelectionState {
  return { ids: toggled(state.ids, id), anchor: id };
}

function allIncluded(ids: number[], selected: number[]): boolean {
  for (const id of ids) {
    if (!selected.includes(id)) {
      return false;
    }
  }
  return true;
}

function withoutIds(selected: number[], ids: number[]): number[] {
  const out: number[] = [];
  for (const id of selected) {
    if (!ids.includes(id)) {
      out.push(id);
    }
  }
  return out;
}

export function toggleAllSelection(
  state: SelectionState,
  visible: number[],
): SelectionState {
  if (allIncluded(visible, state.ids)) {
    return { ids: withoutIds(state.ids, visible), anchor: state.anchor };
  }
  return { ids: [...new Set([...state.ids, ...visible])], anchor: state.anchor };
}

export function pruneSelection(
  state: SelectionState,
  known: Set<number>,
): SelectionState {
  const ids: number[] = [];
  for (const id of state.ids) {
    if (known.has(id)) {
      ids.push(id);
    }
  }
  const anchor = state.anchor !== null && known.has(state.anchor) ? state.anchor : null;
  return { ids, anchor };
}

export function novelProgress(novel: NovelSummary): NovelProgress {
  return {
    translated: novel.translatedCount,
    analyzed: novel.analyzedCount,
    total: novel.chapterCount,
  };
}

export function fracState(done: number, total: number): FracState {
  if (total && done >= total) {
    return "is-full";
  }
  return done ? "is-part" : "";
}

export function novelTotals(novels: NovelSummary[]): NovelTotals {
  const totals: NovelTotals = {
    novels: novels.length,
    chapters: 0,
    words: 0,
    translated: 0,
    analyzed: 0,
  };
  for (const novel of novels) {
    totals.chapters += novel.chapterCount;
    totals.words += novel.wordCount;
    totals.translated += novel.translatedCount;
    totals.analyzed += novel.analyzedCount;
  }
  return totals;
}

export function recentNovels(novels: NovelSummary[], limit: number): NovelSummary[] {
  return [...novels].sort(compareUpdatedDesc).slice(0, limit);
}

export function isDuplicateTitle(novels: NovelSummary[], title: string): boolean {
  const needle = title.trim().toLowerCase();
  if (!needle) {
    return false;
  }
  return novels.some((novel) => novel.title.trim().toLowerCase() === needle);
}

export function toNovelInput(form: NovelFormValue): NovelInput {
  const title = form.title.trim();
  const name = form.name.trim();
  return {
    title,
    name: name === title ? "" : name,
    author: form.author.trim(),
    lang: form.lang,
    description: form.description.trim(),
    tags: parseTags(form.tags),
  };
}

export function fieldPatch(
  novel: NovelSummary,
  field: NovelField,
  raw: string,
): NovelPatch | null {
  const value = raw.trim();
  switch (field) {
    case "title":
      return value ? { title: value } : null;
    case "name":
      return { name: value === novel.title ? "" : value };
    case "lang":
      return { lang: value as NovelLang };
    case "author":
      return { author: value };
    case "description":
      return { description: value };
  }
}

export function matchesChapter(chapter: ChapterRow, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return true;
  }
  return `${chapter.seq} ${chapter.title}`.toLowerCase().includes(needle);
}

export function filterChapters(chapters: ChapterRow[], query: string): ChapterRow[] {
  const out: ChapterRow[] = [];
  for (const chapter of chapters) {
    if (matchesChapter(chapter, query)) {
      out.push(chapter);
    }
  }
  return out;
}

export function clampSeq(seq: number, total: number): number {
  const whole = Math.floor(seq) || 1;
  return Math.max(1, Math.min(Math.max(total, 1), whole));
}

export function normalizeParagraphText(text: string): string {
  return text.trim().replace(/\s*[\r\n]+\s*/g, " ");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function pickEnum<T extends string>(value: unknown, allowed: T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function pickNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function pickBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export function sanitizePrefs(stored: unknown): ReaderPrefs {
  const base = READER_PREF_DEFAULT;
  if (!isRecord(stored)) {
    return { ...base };
  }
  return {
    font: pickEnum(stored["font"], READER_FONTS, base.font),
    size: pickNumber(stored["size"], base.size),
    lh: pickNumber(stored["lh"], base.lh),
    width: pickNumber(stored["width"], base.width),
    paper: pickEnum(stored["paper"], READER_PAPERS, base.paper),
    nums: pickBoolean(stored["nums"], base.nums),
    justify: pickBoolean(stored["justify"], base.justify),
  };
}

export function readerPageStyle(prefs: ReaderPrefs): string {
  const vars = [
    `--rd-fs:${prefs.size}px`,
    `--rd-lh:${prefs.lh}`,
    `--rd-w:${prefs.width}px`,
    `--rd-font:${READER_FONT_FAMILIES[prefs.font]};`,
  ];
  return `${vars.join(";")}${READER_PAPER_VARS[prefs.paper]}`;
}

function isNovelError(value: unknown): value is NovelError {
  if (!isRecord(value)) {
    return false;
  }
  return typeof value["code"] === "string" && typeof value["detail"] === "string";
}

export function toNovelError(error: unknown): NovelError {
  const payload = error instanceof DesktopIpcError ? error.cause : error;
  if (isNovelError(payload)) {
    return payload;
  }
  return { code: "unknown", detail: String(payload) };
}

export function applyInspectEvent(
  checks: InspectCheck[],
  event: InspectEvent,
): InspectCheck[] {
  const next: InspectCheck = {
    step: event.step,
    status: event.status,
    detail: event.detail,
  };
  const index = checks.findIndex((check) => check.step === event.step);
  if (index < 0) {
    return [...checks, next];
  }
  return [...checks.slice(0, index), next, ...checks.slice(index + 1)];
}

export function inspectPercent(checks: InspectCheck[]): number {
  let finished = 0;
  for (const check of checks) {
    finished += check.status === "running" ? 0 : 1;
  }
  return Math.round((finished / INSPECT_STEPS.length) * 100);
}

export function fileNameOf(path: string): string {
  const segments = path.split(/[\\/]/);
  const last = segments[segments.length - 1];
  return last ? last : path;
}

export function formatCount(value: number): string {
  return Number(value).toLocaleString("en-US");
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export function formatStamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return `${day} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function formatMonthDay(iso: string): string {
  return formatStamp(iso).slice(5, 10);
}
