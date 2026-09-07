import { NovelSummary } from '@features/novel/novel.models';
import { displayName, formatMonthDay, formatStamp } from '@features/novel/novel.rules';
import { ProjectSummary } from '@features/project/project.models';
import { marked } from 'marked';

// prettier-ignore
import { AssistantChangeTarget, AssistantScope, AssistantScopeFilter, AssistantScopeTarget, AssistantSessionSummary } from './assistant.models';

export const RECENT_SESSIONS = 3;

const PROJECT_TARGETS: AssistantChangeTarget[] = ['script', 'project', 'audiobook'];

export const NOVEL_SCOPES = true;

export const WORKSPACE_SCOPE: AssistantScope = {
  kind: 'workspace',
  novelId: null,
  projectId: null,
};

const SCOPED_FILTER = /^(novel|project)-(\d+)$/;

export function novelScope(novelId: number): AssistantScope {
  return { kind: 'novel', novelId, projectId: null };
}

export function projectScope(projectId: number): AssistantScope {
  return { kind: 'project', novelId: null, projectId };
}

export function isProjectChange(target: AssistantChangeTarget): boolean {
  return PROJECT_TARGETS.includes(target);
}

export function sameScope(left: AssistantScope, right: AssistantScope): boolean {
  return (
    left.kind === right.kind && left.novelId === right.novelId && left.projectId === right.projectId
  );
}

export function scopeTargetId(scope: AssistantScope): number | null {
  if (scope.kind === 'novel') {
    return scope.novelId;
  }
  return scope.kind === 'project' ? scope.projectId : null;
}

export function scopeFilterValue(filter: AssistantScopeFilter): string {
  return typeof filter === 'string' ? filter : `${filter.kind}-${filter.id}`;
}

export function parseScopeFilter(value: string): AssistantScopeFilter {
  const match = SCOPED_FILTER.exec(value);
  if (match) {
    return { kind: match[1] as AssistantScopeTarget['kind'], id: Number(match[2]) };
  }
  return value === 'workspace' ? 'workspace' : 'all';
}

export function matchesNovelQuery(query: string, novel: NovelSummary): boolean {
  const needle = query.trim().toLowerCase();
  return (
    needle === '' ||
    displayName(novel).toLowerCase().includes(needle) ||
    novel.title.toLowerCase().includes(needle)
  );
}

export function matchesProjectQuery(query: string, project: ProjectSummary): boolean {
  const needle = query.trim().toLowerCase();
  return needle === '' || project.name.toLowerCase().includes(needle);
}

function isActiveProject(project: ProjectSummary): boolean {
  return !project.archived;
}

function compareUpdatedFirst<T extends { updatedAt: string }>(left: T, right: T): number {
  return right.updatedAt.localeCompare(left.updatedAt);
}

function hasId(id: number | null, item: { id: number }): boolean {
  return item.id === id;
}

function contextFirst<T extends { id: number }>(items: T[], contextId: number | null): T[] {
  const index = items.findIndex(hasId.bind(null, contextId));
  if (index > 0) {
    items.unshift(...items.splice(index, 1));
  }
  return items;
}

export function scopeNovels(
  novels: NovelSummary[],
  query: string,
  contextNovelId: number | null,
): NovelSummary[] {
  const sorted = novels.filter(matchesNovelQuery.bind(null, query)).sort(compareUpdatedFirst);
  return contextFirst(sorted, contextNovelId);
}

export function scopeProjects(
  projects: ProjectSummary[],
  query: string,
  contextProjectId: number | null,
): ProjectSummary[] {
  const sorted = projects
    .filter(isActiveProject)
    .filter(matchesProjectQuery.bind(null, query))
    .sort(compareUpdatedFirst);
  return contextFirst(sorted, contextProjectId);
}

export function compareRecentFirst(
  left: AssistantSessionSummary,
  right: AssistantSessionSummary,
): number {
  return right.updatedAt.localeCompare(left.updatedAt);
}

export function matchesScopeFilter(
  session: AssistantSessionSummary,
  filter: AssistantScopeFilter,
): boolean {
  if (filter === 'all') {
    return true;
  }
  if (filter === 'workspace') {
    return session.scope.kind === 'workspace';
  }
  return session.scope.kind === filter.kind && scopeTargetId(session.scope) === filter.id;
}

export function matchesSessionQuery(session: AssistantSessionSummary, query: string): boolean {
  const needle = query.trim().toLowerCase();
  return (
    needle === '' ||
    session.title.toLowerCase().includes(needle) ||
    session.preview.toLowerCase().includes(needle)
  );
}

export function renderMarkdown(text: string): string {
  return marked.parse(text, { async: false, gfm: true, breaks: true });
}

export function dayKey(iso: string, now: Date): 'today' | 'yesterday' | 'week' | 'older' {
  const date = new Date(iso);
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const time = date.getTime();
  if (Number.isNaN(time) || time >= start) {
    return 'today';
  }
  const day = 24 * 60 * 60 * 1000;
  if (time >= start - day) {
    return 'yesterday';
  }
  return time >= start - 6 * day ? 'week' : 'older';
}

export function shortStamp(iso: string, now: Date): string {
  return dayKey(iso, now) === 'today' ? formatStamp(iso).slice(11) : formatMonthDay(iso);
}
