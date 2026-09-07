import { novel, project, session } from '@testing/fixtures';
import { describe, expect, it } from 'vitest';

// prettier-ignore
import { compareRecentFirst, dayKey, matchesNovelQuery, matchesProjectQuery, matchesScopeFilter, matchesSessionQuery, novelScope, parseScopeFilter, projectScope, renderMarkdown, sameScope, scopeFilterValue, scopeNovels, scopeProjects, scopeTargetId, shortStamp, WORKSPACE_SCOPE } from './assistant.rules';

describe('assistant.rules', () => {
  it('builds and compares scopes', () => {
    expect(novelScope(3)).toEqual({ kind: 'novel', novelId: 3, projectId: null });
    expect(projectScope(4)).toEqual({ kind: 'project', novelId: null, projectId: 4 });
    expect(sameScope(WORKSPACE_SCOPE, { kind: 'workspace', novelId: null, projectId: null })).toBe(
      true,
    );
    expect(sameScope(novelScope(1), novelScope(2))).toBe(false);
    expect(sameScope(novelScope(1), WORKSPACE_SCOPE)).toBe(false);
    expect(sameScope(projectScope(1), projectScope(1))).toBe(true);
    expect(sameScope(projectScope(1), projectScope(2))).toBe(false);
    expect(sameScope(projectScope(1), novelScope(1))).toBe(false);
  });

  it('reads the target id of a scope', () => {
    expect(scopeTargetId(WORKSPACE_SCOPE)).toBeNull();
    expect(scopeTargetId(novelScope(3))).toBe(3);
    expect(scopeTargetId(projectScope(4))).toBe(4);
  });

  it('round-trips scope filters through their select value', () => {
    expect(scopeFilterValue('all')).toBe('all');
    expect(scopeFilterValue('workspace')).toBe('workspace');
    expect(scopeFilterValue({ kind: 'novel', id: 2 })).toBe('novel-2');
    expect(scopeFilterValue({ kind: 'project', id: 7 })).toBe('project-7');
    expect(parseScopeFilter('novel-2')).toEqual({ kind: 'novel', id: 2 });
    expect(parseScopeFilter('project-7')).toEqual({ kind: 'project', id: 7 });
    expect(parseScopeFilter('workspace')).toBe('workspace');
    expect(parseScopeFilter('all')).toBe('all');
    expect(parseScopeFilter('project-x')).toBe('all');
    expect(parseScopeFilter('zzz')).toBe('all');
  });

  it('filters and orders projects for scope selection', () => {
    const list = [
      project({ id: 1, name: 'Alpha Book', updatedAt: '2026-01-01' }),
      project({ id: 2, name: 'Beta Film', updatedAt: '2026-03-01' }),
      project({ id: 3, name: 'Gamma Old', updatedAt: '2026-04-01', archived: true }),
      project({ id: 4, name: 'Delta Book', updatedAt: '2026-02-01' }),
    ];
    expect(matchesProjectQuery(' ', list[0])).toBe(true);
    expect(matchesProjectQuery('BOOK', list[0])).toBe(true);
    expect(matchesProjectQuery('zzz', list[0])).toBe(false);
    expect(scopeProjects([...list], '', null).map((item) => item.id)).toEqual([2, 4, 1]);
    expect(scopeProjects([...list], '', 1).map((item) => item.id)).toEqual([1, 2, 4]);
    expect(scopeProjects([...list], 'book', null).map((item) => item.id)).toEqual([4, 1]);
    expect(scopeProjects([...list], 'gamma', null)).toEqual([]);
  });

  it('filters and orders novels for scope selection', () => {
    const list = [
      novel({ id: 1, title: 'Alpha', updatedAt: '2026-01-01' }),
      novel({ id: 2, title: 'Beta', name: 'Custom', updatedAt: '2026-03-01' }),
      novel({ id: 3, title: 'Gamma', updatedAt: '2026-02-01' }),
    ];
    expect(matchesNovelQuery(' ', list[0])).toBe(true);
    expect(matchesNovelQuery('custom', list[1])).toBe(true);
    expect(matchesNovelQuery('beta', list[1])).toBe(true);
    expect(matchesNovelQuery('zzz', list[1])).toBe(false);
    expect(scopeNovels([...list], '', null).map((item) => item.id)).toEqual([2, 3, 1]);
    expect(scopeNovels([...list], '', 1).map((item) => item.id)).toEqual([1, 2, 3]);
    expect(scopeNovels([...list], 'gamm', null).map((item) => item.id)).toEqual([3]);
  });

  it('filters sessions', () => {
    const workspace = session({
      id: 'a',
      title: 'Hello',
      preview: 'world',
      updatedAt: '2026-02-01',
    });
    const scoped = session({
      id: 'b',
      title: 'Other',
      scope: novelScope(4),
      updatedAt: '2026-03-01',
    });
    expect(compareRecentFirst(workspace, scoped)).toBeGreaterThan(0);
    expect(matchesScopeFilter(workspace, 'all')).toBe(true);
    expect(matchesScopeFilter(workspace, 'workspace')).toBe(true);
    expect(matchesScopeFilter(scoped, 'workspace')).toBe(false);
    expect(matchesScopeFilter(scoped, { kind: 'novel', id: 4 })).toBe(true);
    expect(matchesScopeFilter(scoped, { kind: 'novel', id: 5 })).toBe(false);
    expect(matchesScopeFilter(scoped, { kind: 'project', id: 4 })).toBe(false);
    expect(matchesScopeFilter(workspace, { kind: 'novel', id: 4 })).toBe(false);
    const inProject = session({ id: 'c', scope: projectScope(4), updatedAt: '2026-03-01' });
    expect(matchesScopeFilter(inProject, { kind: 'project', id: 4 })).toBe(true);
    expect(matchesScopeFilter(inProject, { kind: 'project', id: 9 })).toBe(false);
    expect(matchesScopeFilter(inProject, { kind: 'novel', id: 4 })).toBe(false);
    expect(matchesScopeFilter(inProject, 'workspace')).toBe(false);
    expect(matchesSessionQuery(workspace, '')).toBe(true);
    expect(matchesSessionQuery(workspace, 'WORLD')).toBe(true);
    expect(matchesSessionQuery(workspace, 'zzz')).toBe(false);
  });

  it('renders markdown', () => {
    expect(renderMarkdown('**bold**\nnext')).toContain('<strong>bold</strong>');
    expect(renderMarkdown('a\nb')).toContain('<br>');
  });

  it('buckets days', () => {
    const now = new Date(2026, 5, 15, 12, 0, 0);
    const at = (days: number): string => new Date(2026, 5, 15 - days, 8, 0, 0).toISOString();
    expect(dayKey(at(0), now)).toBe('today');
    expect(dayKey('garbage', now)).toBe('today');
    expect(dayKey(at(1), now)).toBe('yesterday');
    expect(dayKey(at(4), now)).toBe('week');
    expect(dayKey(at(20), now)).toBe('older');
    expect(shortStamp(at(0), now)).toMatch(/^\d\d:\d\d$/);
    expect(shortStamp(at(20), now)).toMatch(/^\d\d-\d\d$/);
  });
});
