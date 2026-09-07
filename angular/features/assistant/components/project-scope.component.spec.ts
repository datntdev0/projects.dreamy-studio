import { Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { allById, byId, click, type } from '@testing/dom';
import { mount, Mounted, settle } from '@testing/exercise';
import { setupWorld, warmWorld, worldSession } from '@testing/world';
import { describe, expect, it } from 'vitest';

import { projectScope, WORKSPACE_SCOPE } from '../assistant.rules';
import { AssistantService } from '../assistant.service';
import { AssistantSessions } from './sessions.component';
import { AssistantStart } from './start.component';

function scopesOf(mounted: Mounted<unknown>): string[] {
  return allById(mounted.root, 'assistant-scope-option').map(
    (option) => option.getAttribute('data-scope') ?? '',
  );
}

async function prepare(): Promise<void> {
  const ipc = setupWorld();
  ipc.on('assistant_session_list', [
    worldSession('s1'),
    worldSession('s2', { scope: projectScope(1), title: 'Project chat' }),
    worldSession('s3', { scope: projectScope(3), title: 'Other project chat' }),
  ]);
  await warmWorld();
}

function mountWorld<T>(type: Type<T>): Promise<Mounted<T>> {
  return mount(type, {}, prepare);
}

function filterValues(mounted: Mounted<unknown>): string[] {
  const select = byId(mounted.root, 'assistant-sessions-filter') as HTMLSelectElement;
  return Array.from(select.options).map((option) => option.value);
}

describe('assistant project scope', () => {
  describe('picker', () => {
    async function opened(): Promise<Mounted<AssistantStart>> {
      const mounted = await mountWorld(AssistantStart);
      click(mounted.root, 'assistant-scope-toggle');
      await settle(mounted.fixture, 2);
      return mounted;
    }

    it('lists the active projects after the novels', async () => {
      const mounted = await opened();
      const scopes = scopesOf(mounted);
      expect(scopes[0]).toBe('workspace');
      expect(scopes).toContain('project-1');
      expect(scopes).toContain('project-3');
      expect(scopes).not.toContain('project-2');
      const lastNovel = Math.max(
        ...scopes.map((scope, index) => (scope.startsWith('novel-') ? index : -1)),
      );
      expect(scopes.indexOf('project-1')).toBeGreaterThan(lastNovel);
    });

    it('chooses a project as the draft scope', async () => {
      const mounted = await opened();
      const option = mounted.root.querySelector<HTMLElement>('[data-scope="project-1"]');
      option?.click();
      await settle(mounted.fixture, 2);
      const assistant = TestBed.inject(AssistantService);
      expect(assistant.draftScope()).toEqual(projectScope(1));
      expect(byId(mounted.root, 'assistant-scope-current')?.textContent).toContain('Audiobook One');
      expect(byId(mounted.root, 'assistant-scope-meta')?.textContent).toContain('2');
      expect(byId(mounted.root, 'assistant-scope-panel')).toBeNull();
    });

    it('searches projects by name', async () => {
      const mounted = await opened();
      type(mounted.root, 'assistant-scope-search', 'blank');
      await settle(mounted.fixture, 2);
      expect(scopesOf(mounted)).toEqual(['workspace', 'project-3']);
      type(mounted.root, 'assistant-scope-search', 'nothing matches');
      await settle(mounted.fixture, 2);
      expect(byId(mounted.root, 'assistant-scope-empty')).not.toBeNull();
    });

    it('starts from the workspace scope again', async () => {
      const mounted = await opened();
      const assistant = TestBed.inject(AssistantService);
      assistant.chooseScope(projectScope(3));
      mounted.root.querySelector<HTMLElement>('[data-scope="workspace"]')?.click();
      await settle(mounted.fixture, 2);
      expect(assistant.draftScope()).toEqual(WORKSPACE_SCOPE);
    });
  });

  describe('history', () => {
    it('offers every project in the scope filter', async () => {
      const mounted = await mountWorld(AssistantSessions);
      expect(filterValues(mounted)).toEqual(
        expect.arrayContaining(['all', 'workspace', 'project-1', 'project-2', 'project-3']),
      );
    });

    it('filters sessions by project', async () => {
      const mounted = await mountWorld(AssistantSessions);
      expect(allById(mounted.root, 'assistant-session')).toHaveLength(3);
      mounted.instance.onFilter({ target: { value: 'project-1' } } as unknown as Event);
      await settle(mounted.fixture, 2);
      const titles = allById(mounted.root, 'assistant-session-title').map((item) =>
        item.textContent?.trim(),
      );
      expect(titles).toEqual(['Project chat']);
      expect(mounted.instance.filterValue()).toBe('project-1');
      expect(byId(mounted.root, 'assistant-session-scope')?.textContent?.trim()).toBe(
        'Audiobook One',
      );
    });
  });
});
