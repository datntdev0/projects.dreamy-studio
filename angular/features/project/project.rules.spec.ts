import { DesktopIpcError } from '@shared/desktop/desktop-ipc-error';
import { project, projectModuleState } from '@testing/fixtures';
import { describe, expect, it } from 'vitest';

// prettier-ignore
import { completeModuleStates, filterProjects, idleModuleState, isProjectModuleId, isProjectTemplate, moduleBadgeClass, moduleRows, moduleStateKey, PROJECT_MODULE_STAGES, PROJECT_MODULES, PROJECT_TEMPLATES, projectCode, projectModule, projectStatus, sortDirEntries, sortProjects, templateIcon, toggled, toProjectError, treeKey, validateProjectName, validateRange } from './project.rules';

describe('project.rules', () => {
  it('validates names and ranges', () => {
    expect(validateProjectName('  ')).toBe('empty');
    expect(validateProjectName('a')).toBeNull();
    expect(validateRange(null, null)).toBe(true);
    expect(validateRange(1, 3)).toBe(true);
    expect(validateRange(3, 1)).toBe(false);
    expect(validateRange(0, 1)).toBe(false);
    expect(validateRange(1, null)).toBe(false);
    expect(validateRange(1.5, 2)).toBe(false);
  });

  it('toggles values', () => {
    expect(toggled([1], 2)).toEqual([1, 2]);
    expect(toggled([1, 2, 3], 2)).toEqual([1, 3]);
  });

  it('filters projects', () => {
    const list = [
      project({ id: 1, name: 'Alpha', description: 'tales' }),
      project({ id: 2, name: 'Beta', template: 'blank', archived: true }),
    ];
    expect(projectStatus(list[1])).toBe('archived');
    expect(filterProjects(list, { templates: [], status: [] }, '')).toHaveLength(2);
    expect(filterProjects(list, { templates: ['blank'], status: [] }, '')).toEqual([list[1]]);
    expect(filterProjects(list, { templates: [], status: ['active'] }, '')).toEqual([list[0]]);
    expect(filterProjects(list, { templates: [], status: [] }, ' TALES ')).toEqual([list[0]]);
  });

  it('sorts projects by name or update, archived last', () => {
    const list = [
      project({ id: 1, name: 'b', updatedAt: '2026-01-01' }),
      project({ id: 2, name: 'A', updatedAt: '2026-02-01' }),
      project({ id: 3, name: '0', archived: true, updatedAt: '2026-03-01' }),
    ];
    expect(sortProjects(list, 'name').map((item) => item.id)).toEqual([2, 1, 3]);
    expect(sortProjects(list, 'updated').map((item) => item.id)).toEqual([2, 1, 3]);
  });

  it('sorts directory entries with folders first', () => {
    const entries = [
      { name: 'b.txt', kind: 'file' as const, size: 1 },
      { name: 'z', kind: 'dir' as const, size: 0 },
      { name: 'a', kind: 'dir' as const, size: 0 },
    ];
    expect(sortDirEntries(entries).map((entry) => entry.name)).toEqual(['a', 'z', 'b.txt']);
  });

  it('normalizes tree keys', () => {
    expect(treeKey(3, '\\a\\b/')).toBe('3:a/b');
    expect(treeKey(3, '')).toBe('3:');
  });

  it('converts errors', () => {
    expect(toProjectError({ code: 'a', detail: 'b' })).toEqual({ code: 'a', detail: 'b' });
    expect(toProjectError(new DesktopIpcError('x', { code: 'a', detail: 'b' }))).toEqual({
      code: 'a',
      detail: 'b',
    });
    expect(toProjectError(5)).toEqual({ code: 'unknown', detail: '5' });
    expect(toProjectError(null)).toEqual({ code: 'unknown', detail: 'null' });
  });

  it('describes templates', () => {
    expect(PROJECT_TEMPLATES).toHaveLength(3);
    expect(isProjectTemplate('blank')).toBe(true);
    expect(isProjectTemplate('nope')).toBe(false);
    expect(templateIcon('audiobook')).toBe('mic');
    expect(templateIcon('nope' as never)).toBe('folder');
    expect(projectCode(7)).toBe('PRJ-0007');
  });

  it('describes the module catalog', () => {
    expect(PROJECT_MODULES.map((module) => module.id)).toEqual([
      'scripting',
      'character',
      'world',
      'storyboard',
      'audiobook',
      'canvas',
      'video',
    ]);
    expect(PROJECT_MODULE_STAGES).toEqual(['pre', 'prod', 'post']);
    expect(
      PROJECT_MODULES.filter((module) => module.implemented).map((module) => module.id),
    ).toEqual(['scripting', 'audiobook']);
    expect(projectModule('audiobook')).toMatchObject({
      stage: 'prod',
      icon: 'mic',
      labelKey: 'project.module.audiobook',
      blurbKey: 'project.module.audiobook.blurb',
    });
    expect(projectModule('video').stage).toBe('post');
    expect(isProjectModuleId('canvas')).toBe(true);
    expect(isProjectModuleId('nope')).toBe(false);
  });

  it('completes module states with idle defaults', () => {
    const known = projectModuleState({ id: 'audiobook', state: 'done', done: 3, total: 3 });
    const complete = completeModuleStates([known]);
    expect(complete).toHaveLength(PROJECT_MODULES.length);
    expect(complete.find((state) => state.id === 'audiobook')).toBe(known);
    expect(complete.find((state) => state.id === 'world')).toEqual(idleModuleState('world'));
    expect(completeModuleStates(null)).toHaveLength(PROJECT_MODULES.length);
    expect(completeModuleStates(undefined).every((state) => state.state === 'idle')).toBe(true);
  });

  it('builds module rows and state presentation', () => {
    const rows = moduleRows([projectModuleState({ id: 'scripting', state: 'stale' })]);
    expect(rows).toHaveLength(PROJECT_MODULES.length);
    expect(rows[0].state.state).toBe('stale');
    expect(rows[1].state.state).toBe('idle');
    expect(moduleStateKey('doing')).toBe('project.module.state.doing');
    expect(moduleBadgeClass('idle')).toBe('');
    expect(moduleBadgeClass('doing')).toBe('badge-running');
    expect(moduleBadgeClass('done')).toBe('badge-success');
    expect(moduleBadgeClass('stale')).toBe('badge-warning');
  });
});
