import { TestBed } from '@angular/core/testing';
import { FakeIpc } from '@testing/fake-ipc';
import { chapter, novel, pipeline, task } from '@testing/fixtures';
import { flushEffects, setupApp } from '@testing/service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { WorkspaceService } from '../workspace/workspace.service';
import { NovelService } from './novel.service';
import { PipelineEvent, WireTranslation } from './novel.translation.models';
import { NovelTranslationService } from './novel.translation.service';

const wire: WireTranslation = {
  guidelines: 'g',
  dict: [{ id: 1, src: 'a', dst: 'b', type: 'term', note: '' }],
  chapters: {
    c1: {
      title: 'Tieu de',
      paragraphs: [{ n: 1, originalHashcheck: 'h', text: 'xin chao', note: '' }],
    },
  },
  warnings: [{ kind: 'source', chapterId: 'c1', n: 1, entryId: null }],
};

describe('NovelTranslationService', () => {
  let ipc: FakeIpc;
  let service: NovelTranslationService;
  let events: (event: PipelineEvent) => void = () => undefined;

  beforeEach(async () => {
    ipc = setupApp();
    ipc.on('novel_list', [novel({ id: 1, lang: 'EN' })]);
    ipc.on('novel_chapters', [chapter({ id: 'c1', seq: 1 }), chapter({ id: 'c2', seq: 2 })]);
    ipc.on('translation_get', wire);
    ipc.on('pipeline_start', (args) => {
      events = (args?.['onEvent'] as { onmessage: typeof events }).onmessage;
      return pipeline();
    });
    TestBed.inject(NovelService);
    service = TestBed.inject(NovelTranslationService);
    flushEffects();
    await TestBed.inject(NovelService).load();
  });

  it('resolves the target language', () => {
    expect(service.targetOf(1)).toBe('VI');
    service.setTarget(1, 'EN');
    expect(service.targetOf(1)).toBe('VI');
    expect(service.targetOf(99)).toBe('VI');
    expect(service.viewOf(1).seq).toBe(1);
  });

  it('loads translations and exposes derived data', async () => {
    await service.ensure(1);
    await service.ensure(1);
    expect(ipc.called('translation_get')).toBe(1);
    expect(service.of(1).guidelines).toBe('g');
    expect(service.titleOf(1, 'c1')).toBe('Tieu de');
    expect(service.titleOf(1, 'zz')).toBeNull();
    expect(service.reviewCountOf(1)).toBe(1);
    expect(service.translatedCountOf(1)).toBe(1);
    expect(service.warningsOf(1)).toHaveLength(1);
    expect(service.statusOf(1, 'c1')).toBe('done');
    expect(service.statusOf(1, 'c2')).toBe('none');
    expect(service.progressOf(1)).toEqual({});
    expect(service.queuedOf(1)).toEqual([]);
  });

  it('records load and refresh failures', async () => {
    ipc.fail('translation_get', { code: 'a', detail: 'b' });
    await service.load(1, 'VI');
    expect(service.error()).toEqual({ code: 'a', detail: 'b' });
    expect(service.loading()).toBe(false);
    service.error.set(null);
    await service.refresh(1, 'VI');
    expect(service.error()?.code).toBe('a');
  });

  it('tracks the view state', () => {
    service.setStep(1, 'warn');
    expect(service.viewOf(1).step).toBe('warn');
    service.setSeq(1, 99);
    service.focusPassage(1, 2, 3);
    expect(service.viewOf(1)).toMatchObject({ step: 'result', seq: 2, focus: 3 });
    expect(service.consumeFocus(1)).toBe(3);
    expect(service.consumeFocus(1)).toBeNull();
    service.startEntry(1);
    expect(service.consumeEntry(1)).toBe(true);
    expect(service.consumeEntry(1)).toBe(false);
  });

  it('saves guidelines and edits the dictionary', async () => {
    await service.load(1);
    ipc.on('translation_guidelines_save', true);
    expect(await service.saveGuidelines(1, ' new ')).toBe(true);
    expect(service.of(1).guidelines).toBe('new');
    ipc.on('translation_guidelines_save', false);
    expect(await service.saveGuidelines(1, 'same')).toBe(false);
    ipc.on('translation_warnings', []);
    ipc.on('translation_dict_add', {
      entry: { id: 2, src: 'c', dst: 'd', type: 'term', note: '' },
      flagged: 0,
    });
    await service.addEntry(1, { src: 'c', dst: 'd', type: 'term', note: '' });
    expect(service.of(1).dict).toHaveLength(2);
    ipc.on('translation_dict_update', {
      entry: { id: 2, src: 'c', dst: 'e', type: 'term', note: '' },
      flagged: 1,
    });
    expect((await service.updateEntry(1, 2, { dst: 'e' }))?.flagged).toBe(1);
    expect(await service.updateEntry(1, 77, { dst: 'e' })).toBeNull();
    await service.removeEntry(1, 2);
    expect(service.of(1).dict).toHaveLength(1);
  });

  it('saves passages and notes', async () => {
    await service.load(1);
    ipc.on('translation_warnings', []);
    const saved = {
      title: 'Tieu de',
      paragraphs: [{ n: 1, originalHashcheck: 'h', text: 'moi', note: '' }],
    };
    ipc.on('translation_passage_save', saved);
    expect(await service.saveParagraph(1, 'c1', 9, 'x')).toBe('idle');
    expect(await service.saveParagraph(1, 'c1', 1, '  ')).toBe('empty');
    expect(await service.saveParagraph(1, 'c1', 1, 'xin chao')).toBe('unchanged');
    expect(await service.saveParagraph(1, 'c1', 1, 'moi')).toBe('saved');
    expect(service.of(1).chapters['c1'].passages[1].text).toBe('moi');
    ipc.on('translation_note_save', {
      title: 'Tieu de',
      paragraphs: [{ n: 1, originalHashcheck: 'h', text: 'moi', note: 'n' }],
    });
    await service.setNote(1, 'c1', 1, ' n ');
    expect(service.of(1).chapters['c1'].passages[1].note).toBe('n');
    await service.setNote(1, 'c1', 1, 'n');
    await service.setNote(1, 'c1', 9, 'n');
    expect(ipc.called('translation_note_save')).toBe(1);
  });

  it('starts, retries and cancels pipelines', async () => {
    await service.load(1);
    await service.translate(1, ['c1', 'c2']);
    expect(ipc.lastArgs('pipeline_start')).toMatchObject({ novelId: 1, target: 'VI' });
    await service.retranslate(1, 'missing');
    await service.retranslate(1, service.warningsOf(1)[0].id);
    expect(ipc.called('pipeline_start')).toBe(2);
    await service.startAnalysis(1, 'VI', ['c1']);
    expect(ipc.lastArgs('pipeline_start')).toMatchObject({ kind: 'analysis' });
    await service.cancelPipeline(5);
    expect(ipc.lastArgs('pipeline_cancel')).toEqual({ pipelineId: 5 });
  });

  it('follows pipeline events', async () => {
    await service.load(1);
    await service.translate(1, ['c1', 'c2']);
    const running = pipeline({
      id: 7,
      status: 'queued',
      tasks: [
        task({ id: 1, chapterId: 'c1', status: 'running', progress: 30 }),
        task({ id: 2, chapterId: 'c2', status: 'queued' }),
      ],
    });
    events({ type: 'started', pipeline: running });
    expect(service.isTranslating(1)).toBe(true);
    expect(service.isAnalyzing(1)).toBe(false);
    expect(service.progressOf(1)).toEqual({ c1: 30 });
    expect(service.queuedOf(1)).toEqual(['c2']);
    expect(service.statusOf(1, 'c1')).toBe('running');
    expect(service.statusOf(1, 'c2')).toBe('queued');
    events({ type: 'updated', pipeline: { ...running, status: 'running' } });
    expect(service.running()[0].status).toBe('running');
    events({
      type: 'task',
      pipelineId: 7,
      task: task({ id: 1, chapterId: 'c1', status: 'completed', progress: 100 }),
    });
    expect(service.running()[0].done).toBe(1);
    events({ type: 'task', pipelineId: 99, task: task({ id: 9 }) });
    await vi.waitFor(() => expect(ipc.called('translation_get')).toBeGreaterThan(1));
    ipc.on('pipeline_cancel', true);
    await service.cancelNovel(1);
    expect(ipc.called('pipeline_cancel')).toBe(1);
    events({ type: 'finished', pipeline: { ...running, status: 'completed' } });
    await vi.waitFor(() => expect(service.running()).toEqual([]));
  });

  it('tracks analysis pipelines separately', async () => {
    await service.startAnalysis(1, 'VI', ['c1']);
    const analysis = pipeline({ id: 8, kind: 'analysis', tasks: [task({ status: 'completed' })] });
    events({ type: 'started', pipeline: analysis });
    expect(service.isAnalyzing(1)).toBe(true);
    expect(service.isTranslating(1)).toBe(false);
    events({ type: 'task', pipelineId: 8, task: task({ status: 'completed' }) });
    await service.cancelNovel(1);
    events({ type: 'finished', pipeline: analysis });
    await vi.waitFor(() => expect(service.finished()?.id).toBe(8));
    expect(service.running()).toEqual([]);
  });

  it('ignores stale fetch results and resets with the workspace', async () => {
    let release: (value: unknown) => void = () => undefined;
    ipc.on('translation_get', () => new Promise((resolve) => (release = resolve)));
    const first = service.load(1, 'VI');
    ipc.on('translation_get', wire);
    await service.load(1, 'VI');
    release({ ...wire, guidelines: 'stale' });
    await first;
    expect(service.of(1).guidelines).toBe('g');
    ipc.on('workspace_current', { name: 'w', path: '/w' });
    await TestBed.inject(WorkspaceService).restoreCurrent();
    flushEffects();
    expect(service.of(1).guidelines).toBe('');
  });
});
