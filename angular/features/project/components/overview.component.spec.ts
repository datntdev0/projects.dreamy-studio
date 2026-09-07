import { TestBed } from '@angular/core/testing';
import { TabsService } from '@layout/tabs.service';
import { audiobook, audioRecord } from '@testing/audiobook';
import { allById, byId } from '@testing/dom';
import { mount, settle } from '@testing/exercise';
import { project } from '@testing/fixtures';
import { setupWorld, warmWorld } from '@testing/world';
import { describe, expect, it } from 'vitest';

import { PROJECT_MODULES } from '../project.rules';
import { ProjectOverview } from './overview.component';
import { ProjectView } from './project-view.component';

async function warm(): Promise<void> {
  await warmWorld();
}

function metricValues(root: HTMLElement): Record<string, string> {
  const values: Record<string, string> = {};
  for (const tile of allById(root, 'project-overview-metric')) {
    values[tile.dataset['metric'] ?? ''] =
      byId(tile, 'project-overview-metric-value')?.textContent?.trim() ?? '';
  }
  return values;
}

describe('project overview', () => {
  it('shows measured progress and audio with placeholders for metrics not tracked yet', async () => {
    setupWorld();
    const mounted = await mount(
      ProjectOverview,
      { project: project({ id: 1, name: 'Alpha', description: 'Night tales' }) },
      warm,
    );
    await settle(mounted.fixture);
    expect(byId(mounted.root, 'project-overview-name')?.textContent?.trim()).toBe('Alpha');
    expect(byId(mounted.root, 'project-overview-description')?.textContent?.trim()).toBe(
      'Night tales',
    );
    expect(metricValues(mounted.root)).toEqual({
      progress: '50%',
      audio: '0',
      images: '--',
      video: '--',
    });
    const stages = allById(mounted.root, 'project-overview-stage');
    expect(stages.map((stage) => stage.dataset['stage'])).toEqual(['pre', 'prod', 'post']);
    expect(
      stages.map((stage) => byId(stage, 'project-overview-stage-count')?.textContent?.trim()),
    ).toEqual(['1/4', '1/2', '0/1']);
    expect(allById(mounted.root, 'project-overview-module-add')).toHaveLength(5);
  });

  it('measures generated audio once the audiobook is loaded', async () => {
    const ipc = setupWorld();
    ipc.on(
      'audiobook_get',
      audiobook({
        units: {
          U01: {
            audio: { B1: audioRecord({ dur: 30 }), B2: audioRecord({ dur: 45 }) },
            meta: null,
          },
        },
      }),
    );
    const mounted = await mount(ProjectOverview, { project: project({ id: 1 }) }, warm);
    await settle(mounted.fixture);
    expect(metricValues(mounted.root)['audio']).toBe('2');
    const audio = allById(mounted.root, 'project-overview-metric').find(
      (tile) => tile.dataset['metric'] === 'audio',
    );
    expect(byId(audio as HTMLElement, 'project-overview-metric-note')?.textContent).toContain(
      '1:15',
    );
  });

  it('opens implemented and coming-soon modules alike', async () => {
    setupWorld();
    const mounted = await mount(
      ProjectOverview,
      { project: project({ id: 1, modules: PROJECT_MODULES.map((module) => module.id) }) },
      warm,
    );
    await settle(mounted.fixture);
    const modules = allById(mounted.root, 'project-overview-module');
    expect(modules.map((row) => row.dataset['moduleId'])).toEqual([
      'scripting',
      'character',
      'world',
      'storyboard',
      'audiobook',
      'canvas',
      'video',
    ]);
    expect(allById(mounted.root, 'project-overview-module-soon')).toHaveLength(5);
    const tabs = TestBed.inject(TabsService);
    modules[6].click();
    expect(tabs.activeId()).toBe('pmod:1:video');
    modules[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(tabs.activeId()).toBe('pmod:1:scripting');
    modules[4].dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    expect(tabs.activeId()).toBe('pmod:1:audiobook');
    modules[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
    expect(tabs.activeId()).toBe('pmod:1:audiobook');
  });

  it('describes a project without a novel source', async () => {
    setupWorld();
    const mounted = await mount(
      ProjectOverview,
      { project: project({ id: 3, novelId: null, srcKind: null, srcLang: null }) },
      warm,
    );
    expect(byId(mounted.root, 'project-overview-source-icon')).not.toBeNull();
    expect(byId(mounted.root, 'project-overview-description')).toBeNull();
  });

  it('opens the project view on the overview tab', async () => {
    setupWorld();
    const mounted = await mount(ProjectView, { projectId: 1 }, warm);
    await settle(mounted.fixture);
    expect(byId(mounted.root, 'project-view-tab-overview')?.getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(byId(mounted.root, 'project-overview-root')).not.toBeNull();
    byId(mounted.root, 'project-view-tab-settings')?.click();
    mounted.fixture.detectChanges();
    expect(byId(mounted.root, 'project-view-settings')).not.toBeNull();
    expect(byId(mounted.root, 'project-overview-root')).toBeNull();
  });

  it('enables a module from its add card', async () => {
    const ipc = setupWorld();
    const mounted = await mount(ProjectOverview, { project: project({ id: 1 }) }, warm);
    await settle(mounted.fixture);
    ipc.on('project_update', project({ id: 1, modules: ['scripting', 'audiobook', 'video'] }));
    const add = allById(mounted.root, 'project-overview-module-add').find(
      (card) => card.dataset['moduleId'] === 'video',
    );
    add?.click();
    await settle(mounted.fixture);
    expect(ipc.lastArgs('project_update')).toEqual({
      id: 1,
      patch: { modules: ['scripting', 'audiobook', 'video'] },
    });
  });

  it('toggles optional modules in settings and locks template modules', async () => {
    const ipc = setupWorld();
    const mounted = await mount(ProjectView, { projectId: 1 }, warm);
    await settle(mounted.fixture);
    byId(mounted.root, 'project-view-tab-settings')?.click();
    mounted.fixture.detectChanges();
    const toggles = new Map(
      allById(mounted.root, 'project-view-module').map((row) => [
        row.dataset['moduleId'],
        byId(row, 'project-view-module-toggle') as HTMLInputElement,
      ]),
    );
    expect(toggles.get('scripting')?.disabled).toBe(true);
    expect(toggles.get('scripting')?.checked).toBe(true);
    expect(toggles.get('audiobook')?.disabled).toBe(true);
    const video = toggles.get('video') as HTMLInputElement;
    expect(video.disabled).toBe(false);
    expect(video.checked).toBe(false);
    ipc.on('project_update', project({ id: 1, modules: ['scripting', 'audiobook', 'video'] }));
    video.click();
    await settle(mounted.fixture);
    expect(ipc.lastArgs('project_update')).toEqual({
      id: 1,
      patch: { modules: ['scripting', 'audiobook', 'video'] },
    });
    ipc.fail('project_update', { code: 'db', detail: 'locked' });
    video.click();
    await settle(mounted.fixture);
    expect(video.checked).toBe(true);
  });
});
