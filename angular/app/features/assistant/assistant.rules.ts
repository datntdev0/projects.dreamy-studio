import { NovelSummary } from "@app/features/novel/novel.models";
import { displayName, formatMonthDay, formatStamp } from "@app/features/novel/novel.rules";
import { marked } from "marked";
import { AssistantScope, AssistantScopeFilter, AssistantSessionSummary } from "./assistant.models";

export const RECENT_SESSIONS = 3;

export const NOVEL_SCOPES = true;

export const WORKSPACE_SCOPE: AssistantScope = { kind: "workspace", novelId: null };

export function novelScope(novelId: number): AssistantScope {
  return { kind: "novel", novelId };
}

export function sameScope(left: AssistantScope, right: AssistantScope): boolean {
  return left.kind === right.kind && left.novelId === right.novelId;
}

export function matchesNovelQuery(query: string, novel: NovelSummary): boolean {
  const needle = query.trim().toLowerCase();
  return needle === "" || displayName(novel).toLowerCase().includes(needle) || novel.title.toLowerCase().includes(needle);
}

function compareNovelRecent(left: NovelSummary, right: NovelSummary): number {
  return right.updatedAt.localeCompare(left.updatedAt);
}

function hasNovelId(novelId: number | null, novel: NovelSummary): boolean {
  return novel.id === novelId;
}

export function scopeNovels(novels: NovelSummary[], query: string, contextNovelId: number | null): NovelSummary[] {
  const sorted = novels.filter(matchesNovelQuery.bind(null, query)).sort(compareNovelRecent);
  const index = sorted.findIndex(hasNovelId.bind(null, contextNovelId));
  if (index > 0) {
    sorted.unshift(...sorted.splice(index, 1));
  }
  return sorted;
}

export function compareRecentFirst(left: AssistantSessionSummary, right: AssistantSessionSummary): number {
  return right.updatedAt.localeCompare(left.updatedAt);
}

export function matchesScopeFilter(session: AssistantSessionSummary, filter: AssistantScopeFilter): boolean {
  if (filter === "all") {
    return true;
  }
  if (filter === "workspace") {
    return session.scope.kind === "workspace";
  }
  return session.scope.kind === "novel" && session.scope.novelId === filter;
}

export function matchesSessionQuery(session: AssistantSessionSummary, query: string): boolean {
  const needle = query.trim().toLowerCase();
  return needle === "" || session.title.toLowerCase().includes(needle) || session.preview.toLowerCase().includes(needle);
}

export function renderMarkdown(text: string): string {
  return marked.parse(text, { async: false, gfm: true, breaks: true });
}

export function dayKey(iso: string, now: Date): "today" | "yesterday" | "week" | "older" {
  const date = new Date(iso);
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const time = date.getTime();
  if (Number.isNaN(time) || time >= start) {
    return "today";
  }
  const day = 24 * 60 * 60 * 1000;
  if (time >= start - day) {
    return "yesterday";
  }
  return time >= start - 6 * day ? "week" : "older";
}

export function shortStamp(iso: string, now: Date): string {
  return dayKey(iso, now) === "today" ? formatStamp(iso).slice(11) : formatMonthDay(iso);
}
