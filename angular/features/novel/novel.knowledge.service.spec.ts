import { TestBed } from '@angular/core/testing';
import { DialogService } from '@shared/dialog/dialog.service';
import { FakeIpc } from '@testing/fake-ipc';
import { chapter, novel, pipeline } from '@testing/fixtures';
import { entity, ONTOLOGY_VIEW } from '@testing/knowledge';
import { flushEffects, setupApp } from '@testing/service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { WorkspaceService } from '../workspace/workspace.service';
import { WireKnowledge } from './novel.knowledge.models';
import { NovelKnowledgeService } from './novel.knowledge.service';
import { NovelService } from './novel.service';
import { NovelTranslationService } from './novel.translation.service';

function wireOf(
  items: WireKnowledge['items'],
  analyzed: WireKnowledge['analyzed'] = {},
  lang: WireKnowledge['lang'] = 'src',
): WireKnowledge {
  return { lang, ontology: ONTOLOGY_VIEW, items, analyzed };
}

describe('NovelKnowledgeService', () => {
  let ipc: FakeIpc;
  let service: NovelKnowledgeService;

  beforeEach(async () => {
    ipc = setupApp();
    ipc.on('novel_list', [
      novel({ id: 1, lang: 'EN' }),
      novel({ id: 2, lang: 'VI' }),
      novel({ id: 3, lang: 'ZH' }),
    ]);
    ipc.on('novel_chapters', [chapter({ id: 'c1', seq: 1 }), chapter({ id: 'c2', seq: 2 })]);
    ipc.on(
      'knowledge_get',
      wireOf([entity('a', 'location', 'A')], {
        1: { at: '', entities: 1, facts: 0, stale: false },
      }),
    );
    TestBed.inject(NovelService);
    service = TestBed.inject(NovelKnowledgeService);
    flushEffects();
    await TestBed.inject(NovelService).load();
  });

  it('picks the default language', () => {
    expect(service.defaultLangOf(1)).toBe('VI');
    expect(service.defaultLangOf(2)).toBe('src');
    expect(service.defaultLangOf(3)).toBe('VI');
    expect(service.defaultLangOf(99)).toBe('VI');
    expect(service.viewOf(1).lang).toBe('VI');
  });

  it('loads knowledge and derives data', async () => {
    expect(service.isLoaded(1)).toBe(false);
    await service.ensure(1);
    await service.ensure(1);
    expect(ipc.called('knowledge_get')).toBe(1);
    expect(service.isLoaded(1)).toBe(true);
    expect(service.of(1).items).toHaveLength(1);
    expect(service.ontology().version).toBe(1);
    expect(service.analyzedCountOf(1)).toBe(1);
    expect(service.visibleOf(1).entities).toBe(1);
    expect(service.issuesOf(1).length).toBeGreaterThanOrEqual(0);
    expect(service.isRunning(1)).toBe(false);
  });

  it('loads every language and derives chapter analysis', async () => {
    await service.ensureAll(1);
    expect(ipc.called('knowledge_get')).toBe(2);
    expect(service.analysisOf(1, 1)).toBe('done');
    expect(service.analysisOf(1, 2)).toBe('none');
    expect(service.analyzedSeqCountOf(1, [1, 2])).toBe(1);
    ipc.on(
      'knowledge_get',
      wireOf([], { 2: { at: '', entities: 0, facts: 0, stale: true } }, 'EN'),
    );
    service.reset();
    await service.load(1, 'VI');
    expect(service.analysisOf(1, 2)).toBe('stale');
  });

  it('records load failures', async () => {
    ipc.fail('knowledge_get', { code: 'x', detail: 'y' });
    await service.load(1);
    expect(service.error()).toEqual({ code: 'x', detail: 'y' });
    expect(service.loading()).toBe(false);
  });

  it('updates the view', async () => {
    service.setTab(1, 'list');
    service.select(1, 'a');
    expect(service.viewOf(1)).toMatchObject({ tab: 'list', sel: 'a' });
    service.patchView(1, { q: 'x', type: 'location', chapter: 2, onlyIssues: true });
    service.clearFilters(1);
    expect(service.viewOf(1)).toMatchObject({ q: '', type: 'all', chapter: 0, onlyIssues: false });
    service.setLang(1, 'EN');
    await vi.waitFor(() => expect(service.isLoaded(1, 'EN')).toBe(true));
    expect(service.viewOf(1).sel).toBeNull();
  });

  it('applies edits and follows remaps', async () => {
    await service.load(1);
    service.select(1, 'old');
    ipc.on('knowledge_edit', {
      knowledge: wireOf([entity('new', 'location', 'N')]),
      remap: { old: 'new' },
    });
    await service.apply(1, [{ k: 'rename', id: 'old', name: 'N' }]);
    expect(service.viewOf(1).sel).toBe('new');
    service.select(1, 'gone');
    await service.apply(1, []);
    expect(service.viewOf(1).sel).toBeNull();
    service.select(1, null);
    await service.apply(1, []);
    await service.remove(1, ['new']);
    expect(ipc.lastArgs('knowledge_edit')).toMatchObject({ edits: [{ k: 'del', id: 'new' }] });
  });

  it('confirms removals through the dialog', async () => {
    await service.load(1);
    ipc.on('knowledge_edit', { knowledge: wireOf([]), remap: {} });
    const dialogs = TestBed.inject(DialogService);
    const pending = service.confirmRemove(1, ['a'], 'Name');
    expect(dialogs.current()?.options.tone).toBe('danger');
    await dialogs.accept();
    await pending;
    expect(ipc.called('knowledge_edit')).toBe(1);
  });

  it('accepts stale chapters and starts analyses', async () => {
    await service.load(1);
    ipc.on('knowledge_stale_accept', wireOf([]));
    await service.staleAccept(1, [1]);
    expect(service.of(1).items).toEqual([]);
    ipc.on('pipeline_start', pipeline());
    await service.analyze(1, [2], 'VI', false);
    expect(ipc.lastArgs('pipeline_start')).toMatchObject({ kind: 'analysis', novelId: 1 });
  });

  it('reloads when an analysis finishes and resets on workspace changes', async () => {
    const translation = TestBed.inject(NovelTranslationService);
    translation.finished.set(pipeline({ id: 9, kind: 'analysis', novelId: 1, target: 'VI' }));
    flushEffects();
    await vi.waitFor(() => expect(ipc.called('knowledge_get')).toBeGreaterThan(0));
    ipc.on('workspace_current', { name: 'w', path: '/w' });
    await TestBed.inject(WorkspaceService).restoreCurrent();
    flushEffects();
    expect(service.isLoaded(1)).toBe(false);
  });
});
