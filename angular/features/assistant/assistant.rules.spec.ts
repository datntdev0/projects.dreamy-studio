import { novel, session } from '@testing/fixtures';
import { describe, expect, it } from 'vitest';

// prettier-ignore
import { compareRecentFirst, dayKey, matchesNovelQuery, matchesScopeFilter, matchesSessionQuery, novelScope, renderMarkdown, sameScope, scopeNovels, shortStamp, WORKSPACE_SCOPE } from './assistant.rules';

describe('assistant.rules', () => {
  it('builds and compares scopes', () => {
    expect(novelScope(3)).toEqual({ kind: 'novel', novelId: 3 });
    expect(sameScope(WORKSPACE_SCOPE, { kind: 'workspace', novelId: null })).toBe(true);
    expect(sameScope(novelScope(1), novelScope(2))).toBe(false);
    expect(sameScope(novelScope(1), WORKSPACE_SCOPE)).toBe(false);
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
    expect(matchesScopeFilter(scoped, 4)).toBe(true);
    expect(matchesScopeFilter(workspace, 4)).toBe(false);
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
