import { TestBed } from '@angular/core/testing';
import { AudiobookService } from '@features/audiobook/audiobook.service';
import { ProjectService } from '@features/project/project.service';
import { LayoutService } from '@layout/layout.service';
import { installAudiobookBackend, prepareEngines } from '@testing/audiobook';
import { FakeIpc } from '@testing/fake-ipc';
import { chapter, novel, pipeline, project } from '@testing/fixtures';
import { flushEffects, setupApp } from '@testing/service';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PipelineEvent } from '../novel/novel.translation.models';
import { NovelTranslationService } from '../novel/novel.translation.service';
import { WorkspaceService } from '../workspace/workspace.service';
import { PipelineService } from './pipeline.service';

async function openChannel(ipc: FakeIpc): Promise<(event: PipelineEvent) => void> {
  let send: (event: PipelineEvent) => void = () => undefined;
  ipc.on('pipeline_start', (args) => {
    send = (args?.['onEvent'] as { onmessage: typeof send }).onmessage;
    return pipeline();
  });
  await TestBed.inject(NovelTranslationService).translate(1, ['c1']);
  return send;
}

function historyOf(args: Record<string, unknown> | undefined) {
  if (args?.['projectId'] === 5) {
    return [pipeline({ id: 4, novelId: null, projectId: 5, kind: 'audio', status: 'completed' })];
  }
  return args?.['novelId'] === 1
    ? [pipeline({ id: 1, status: 'completed' }), pipeline({ id: 3, status: 'running' })]
    : [pipeline({ id: 2, novelId: 2, status: 'failed' })];
}

describe('PipelineService', () => {
  let ipc: FakeIpc;
  let pipelines: PipelineService;

  beforeEach(async () => {
    ipc = setupApp();
    ipc.on('novel_list', [novel({ id: 1, title: 'Alpha' }), novel({ id: 2, title: 'Beta' })]);
    ipc.on('novel_chapters', [chapter({ id: 'c1', novelId: 1 })]);
    ipc.on('project_list', [project({ id: 5, name: 'Lantern Audio' })]);
    ipc.on('pipeline_history_list', historyOf);
    pipelines = TestBed.inject(PipelineService);
    flushEffects();
    await pipelines.load();
  });

  it('names novels and finds chapters', async () => {
    expect(pipelines.novelName(1)).toBe('Alpha');
    expect(pipelines.novelName(9)).toBe('#9');
    expect(pipelines.ownerName(pipeline())).toBe('Alpha');
    expect(pipelines.ownerName(pipeline({ novelId: null }))).toBe('');
    await vi.waitFor(() =>
      expect(pipelines.chapterOf(pipeline(), 'c1')).toEqual({ seq: 1, title: 'Opening' }),
    );
    expect(pipelines.chapterOf(pipeline(), 'zz')).toBeUndefined();
    expect(pipelines.chapterOf(pipeline({ novelId: null }), 'c1')).toBeUndefined();
  });

  it('loads the pipeline history of every project', () => {
    expect(ipc.lastArgs('pipeline_history_list')).toEqual({ projectId: 5, limit: 50 });
    const audio = pipelines.history().find((item) => item.id === 4);
    expect(audio && pipelines.ownerName(audio)).toBe('Lantern Audio');
  });

  it('names projects and finds script units for project pipelines', () => {
    const audio = pipeline({ novelId: null, projectId: 7, kind: 'audio' });
    expect(pipelines.ownerName(audio)).toBe('#7');
    expect(pipelines.chapterOf(audio, 'U01')).toBeUndefined();
  });

  it('loads history newest first and loads chapters of running pipelines', async () => {
    expect(pipelines.loaded()).toBe(true);
    expect(pipelines.history().map((item) => item.id)).toEqual([4, 3, 2, 1]);
    await vi.waitFor(() => expect(ipc.called('novel_chapters')).toBe(1));
  });

  it('reports load failures', async () => {
    ipc.fail('pipeline_history_list', { code: 'x', detail: 'y' });
    await pipelines.load();
    expect(pipelines.error()).toEqual({ code: 'x', detail: 'y' });
    expect(pipelines.loading()).toBe(false);
  });

  it('selects pipelines and opens the log', async () => {
    pipelines.select(2);
    expect(pipelines.selected()?.id).toBe(2);
    await vi.waitFor(() => expect(ipc.called('novel_chapters')).toBeGreaterThan(0));
    pipelines.select(null);
    expect(pipelines.selected()).toBeNull();
    pipelines.openLog(1);
    expect(TestBed.inject(LayoutService).bottomTab()).toBe('output');
    expect(pipelines.selectedId()).toBe(1);
    ipc.fail('novel_chapters', 'x');
    pipelines.select(2);
  });

  it('merges live pipelines into the history and totals', async () => {
    const send = await openChannel(ipc);
    send({ type: 'started', pipeline: pipeline({ id: 3, status: 'running', done: 1, total: 4 }) });
    send({ type: 'started', pipeline: pipeline({ id: 10, status: 'running', total: 2 }) });
    expect(pipelines.running()).toHaveLength(2);
    expect(pipelines.totals()).toEqual({ count: 2, done: 1, total: 6 });
    expect(pipelines.history().map((item) => item.id)).toEqual([10, 4, 3, 2, 1]);
  });

  it('cancels pipelines', async () => {
    ipc.on('pipeline_cancel', true);
    await pipelines.cancel(4);
    expect(ipc.lastArgs('pipeline_cancel')).toEqual({ pipelineId: 4 });
  });

  it('reloads when a running pipeline finishes', async () => {
    const send = await openChannel(ipc);
    send({ type: 'started', pipeline: pipeline({ id: 20 }) });
    flushEffects();
    ipc.calls.length = 0;
    send({ type: 'finished', pipeline: pipeline({ id: 20, status: 'completed' }) });
    await vi.waitFor(() => {
      flushEffects();
      expect(ipc.called('pipeline_history_list')).toBeGreaterThan(0);
    });
  });

  it('resets with the workspace', async () => {
    ipc.on('workspace_current', { name: 'w', path: '/w' });
    await TestBed.inject(WorkspaceService).restoreCurrent();
    flushEffects();
    expect(pipelines.loaded()).toBe(false);
  });
});

describe('PipelineService with audio pipelines', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('lists the running audio pipeline with its project name and units', async () => {
    const ipc = setupApp();
    installAudiobookBackend(ipc);
    prepareEngines();
    const audiobook = TestBed.inject(AudiobookService);
    const pipelines = TestBed.inject(PipelineService);
    flushEffects();
    await audiobook.load(1);
    audiobook.setSpeakerVoice(1, 'E16', 1);
    vi.useFakeTimers();
    await audiobook.generate(1);
    const [audio] = pipelines.running();
    expect(audio).toMatchObject({ kind: 'audio', projectId: 1, novelId: null });
    const name = TestBed.inject(ProjectService).projectById(1)?.name;
    expect(pipelines.ownerName(audio)).toBe(name);
    const unit = audiobook.contextOf(1)?.unit;
    expect(pipelines.chapterOf(audio, unit?.id ?? '')).toEqual({
      seq: unit?.no,
      title: unit?.title,
    });
    expect(pipelines.history()[0].id).toBe(audio.id);
    expect(pipelines.totals().count).toBe(1);
  });
});
