import { TestBed } from '@angular/core/testing';
import { TabsService } from '@layout/tabs.service';
import { allById, byId, click } from '@testing/dom';
import { mount, settle } from '@testing/exercise';
import { project } from '@testing/fixtures';
import { setupWorld, warmWorld } from '@testing/world';
import { describe, expect, it } from 'vitest';

import { ProjectModuleFrame } from './module-frame.component';
import { ProjectModuleHost } from './module-host.component';
import { ProjectModulePlaceholder } from './module-placeholder.component';
import { ProjectModules } from './modules.component';

async function warm(): Promise<void> {
  await warmWorld();
}

describe('project module components', () => {
  it('renders every module row and opens only implemented modules', async () => {
    setupWorld();
    const mounted = await mount(
      ProjectModules,
      { project: project({ id: 1, name: 'Alpha' }) },
      warm,
    );
    const rows = allById(mounted.root, 'project-modules-row');
    expect(rows.map((row) => row.dataset['moduleId'])).toEqual([
      'scripting',
      'character',
      'world',
      'storyboard',
      'audiobook',
      'canvas',
      'video',
    ]);
    expect(rows.map((row) => row.dataset['state'])).toEqual([
      'doing',
      'done',
      'idle',
      'idle',
      'stale',
      'idle',
      'idle',
    ]);
    const disabled = rows.filter((row) => row.getAttribute('aria-disabled') === 'true');
    expect(disabled.map((row) => row.dataset['moduleId'])).toEqual([
      'character',
      'world',
      'storyboard',
      'canvas',
      'video',
    ]);
    expect(disabled.every((row) => Boolean(row.getAttribute('title')))).toBe(true);
    expect(rows[0].getAttribute('title')).toBeNull();
    const tabs = TestBed.inject(TabsService);
    disabled[0].click();
    disabled[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(tabs.activeId()).toBe('home');
    rows[0].click();
    expect(tabs.activeId()).toBe('pmod:1:scripting');
    rows[4].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(tabs.activeId()).toBe('pmod:1:audiobook');
    rows[4].dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
    mounted.fixture.detectChanges();
    expect(
      allById(mounted.root, 'project-modules-row')
        .filter((row) => row.classList.contains('is-selected'))
        .map((row) => row.dataset['moduleId']),
    ).toEqual(['audiobook']);
  });

  it('wraps the module host in the frame with a back button and state badge', async () => {
    setupWorld();
    const mounted = await mount(ProjectModuleHost, { projectId: 1, moduleId: 'audiobook' }, warm);
    expect(byId(mounted.root, 'project-module-frame-title')?.textContent?.trim()).toBeTruthy();
    expect(byId(mounted.root, 'project-module-frame-state')?.dataset['state']).toBe('stale');
    expect(byId(mounted.root, 'project-module-placeholder')).not.toBeNull();
    expect(byId(mounted.root, 'project-module-placeholder-soon')).toBeNull();
    const tabs = TestBed.inject(TabsService);
    click(mounted.root, 'project-module-frame-back');
    expect(tabs.activeId()).toBe('project:1');
    mounted.fixture.destroy();
  });

  it('shows the coming-soon placeholder for modules that are not implemented', async () => {
    setupWorld();
    const mounted = await mount(
      ProjectModulePlaceholder,
      { projectId: 1, moduleId: 'canvas' },
      warm,
    );
    expect(byId(mounted.root, 'project-module-placeholder-soon')).not.toBeNull();
    expect(byId(mounted.root, 'project-module-placeholder-project')?.textContent).toContain(
      'Audiobook One',
    );
    mounted.fixture.destroy();
  });

  it('offers a way back to the catalog when the project is missing', async () => {
    setupWorld();
    const mounted = await mount(ProjectModuleFrame, { projectId: 99, moduleId: 'scripting' }, warm);
    await settle(mounted.fixture);
    expect(byId(mounted.root, 'project-module-frame-empty')).not.toBeNull();
    click(mounted.root, 'project-module-frame-catalog');
    expect(TestBed.inject(TabsService).activeId()).toBe('projects');
    mounted.fixture.destroy();
  });
});
