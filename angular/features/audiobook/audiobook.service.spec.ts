import { TestBed } from '@angular/core/testing';
// prettier-ignore
import { PipelineEvent, PipelineSnapshot, PipelineTask } from '@features/novel/novel.translation.models';
import { ProjectService } from '@features/project/project.service';
import { BackendService } from '@features/settings/backend.service';
import { LanguageService } from '@shared/language/language.service';
import { ToastService } from '@shared/toast/toast.service';
import { installAudiobookBackend, prepareEngines } from '@testing/audiobook';
import { FakeIpc } from '@testing/fake-ipc';
import { pipeline, task } from '@testing/fixtures';
import { flushEffects, setupApp } from '@testing/service';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_MIX, emptyBook, isInProgress } from './audiobook.rules';
import { AudiobookService } from './audiobook.service';

const PROJECT = 1;
const TEA_WOMAN = 'E16';
const STEP_MS = 400;
const DRAIN_STEPS = 40;

function audioTask(unitId: string, segmentId: string, id: number): PipelineTask {
  return task({ id, chapterId: unitId, segmentId, status: 'queued' });
}

function audioPipeline(tasks: PipelineTask[], overrides: Partial<PipelineSnapshot> = {}) {
  return pipeline({
    id: 41,
    novelId: null,
    projectId: PROJECT,
    kind: 'audio',
    tasks,
    ...overrides,
  });
}

describe('AudiobookService', () => {
  let ipc: FakeIpc;
  let service: AudiobookService;

  beforeEach(async () => {
    ipc = setupApp();
    installAudiobookBackend(ipc);
    prepareEngines();
    TestBed.inject(LanguageService).init();
    service = TestBed.inject(AudiobookService);
    flushEffects();
    await service.load(PROJECT);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function context() {
    const ctx = service.contextOf(PROJECT);
    if (!ctx) {
      throw new Error('missing context');
    }
    return ctx;
  }

  async function settle(): Promise<void> {
    await service.settled(PROJECT);
  }

  function projectName(): string {
    return TestBed.inject(ProjectService).projectById(PROJECT)?.name ?? '';
  }

  function voiceTeaWoman(): void {
    service.setSpeakerVoice(PROJECT, TEA_WOMAN, 1);
  }

  async function drain(): Promise<void> {
    for (let step = 0; step < DRAIN_STEPS && service.isGenerating(PROJECT); step += 1) {
      await vi.advanceTimersByTimeAsync(STEP_MS);
    }
  }

  function currentId(): string {
    return context().unit?.id ?? '';
  }

  function generateCurrent(exportAfter = false): Promise<number> {
    return service.generate(PROJECT, [currentId()], { exportAfter, overwrite: false });
  }

  async function generateAll(unitIds = [currentId()], exportAfter = false): Promise<number> {
    vi.useFakeTimers();
    const started = await service.generate(PROJECT, unitIds, { exportAfter, overwrite: false });
    await drain();
    await settle();
    return started;
  }

  function doneId(): string {
    return context().rail[0].unit.id;
  }

  function exported(unitIds: string[]): string {
    const base = `exports/${PROJECT}/${unitIds.join('-')}`;
    return `Exported ${base}.wav and ${base}.srt`;
  }

  function toasts(tone: string): string[] {
    return TestBed.inject(ToastService)
      .items()
      .filter((item) => item.tone === tone)
      .map((item) => item.message);
  }

  function captureChannel(): { send: (event: PipelineEvent) => void } {
    const sink = { send: (event: PipelineEvent) => void event };
    ipc.on('pipeline_start', (args) => {
      sink.send = (args?.['onEvent'] as { onmessage: typeof sink.send }).onmessage;
      return pipeline({ id: 41, novelId: null, projectId: PROJECT, kind: 'audio' });
    });
    return sink;
  }

  describe('loading', () => {
    it('loads the stored book and pins the first unfinished unit', () => {
      expect(service.isLoaded(PROJECT)).toBe(true);
      expect(service.bookOf(PROJECT)?.voices['narr']).toEqual({ voice: 1, speed: 0.95 });
      expect(service.viewOf(PROJECT).unit).toBe(context().unit?.id);
      expect(context().unit?.no).toBe(2);
      expect(service.contextOf(99)).toBeNull();
      expect(service.bookOf(99)).toBeNull();
      expect(service.error()).toBeNull();
    });

    it('does not reload an already loaded project', async () => {
      await service.ensureLoaded(PROJECT);
      expect(ipc.called('audiobook_get')).toBe(1);
      await service.load(PROJECT);
      expect(ipc.called('audiobook_get')).toBe(2);
    });

    it('starts from an empty book when nothing is stored', async () => {
      await service.load(4);
      expect(service.bookOf(4)?.units).not.toEqual({});
      ipc.on('audiobook_get', null);
      await service.load(5);
      expect(service.bookOf(5)).toEqual(emptyBook());
    });

    it('fills in missing mix settings of a stored book', async () => {
      ipc.on('audiobook_get', { voices: {}, units: {} });
      await service.load(5);
      expect(service.bookOf(5)?.mix).toEqual(DEFAULT_MIX);
      ipc.on('audiobook_get', { voices: {}, units: {}, mix: { gap: 2 } });
      await service.load(6);
      expect(service.bookOf(6)?.mix).toEqual({ ...DEFAULT_MIX, gap: 2 });
    });

    it('records a failed load', async () => {
      ipc.fail('audiobook_get', { code: 'io', detail: 'broken' });
      await service.load(5);
      expect(service.error()).toMatchObject({ code: 'io' });
      expect(service.loading()).toBe(false);
    });

    it('clears everything on reset', () => {
      service.reset();
      expect(service.isLoaded(PROJECT)).toBe(false);
      expect(service.bookOf(PROJECT)).toBeNull();
      expect(service.viewOf(PROJECT).mode).toBe('prod');
    });
  });

  describe('context', () => {
    it('describes the proto seed for the default unit', () => {
      const ctx = context();
      expect(ctx.unitKind).toBe('chapter');
      expect(ctx.rail).toHaveLength(12);
      expect(ctx.rail[0].stat.state).toBe('done');
      expect(ctx.rail[2].stat.state).toBe('done');
      expect(ctx.rail[3].stat.meta).toBe(true);
      expect(ctx.railSummary.total).toBe(12);
      expect(ctx.canPlay).toBe(true);
      expect(ctx.engines).toEqual({ localModels: 1, cloudProviders: 2 });
      expect(ctx.speakers[0].member.kind).toBe('narrator');
    });

    it('navigates modes and units', () => {
      service.setMode(PROJECT, 'voices');
      expect(context().inspector).toBe('voices');
      service.setMode(PROJECT, 'prod');
      expect(context().inspector).toBe('chapter');
      service.selectUnit(PROJECT, 'nope');
      expect(context().unit?.no).toBe(2);
      service.selectUnit(PROJECT, context().rail[0].unit.id);
      expect(context().unit?.no).toBe(1);
      expect(context().rows.length).toBeGreaterThanOrEqual(context().segments.length);
      expect(context().inspector).toBe('chapter');
    });

    it('jumps to a segment once', () => {
      const id = context().segments[1].block.id;
      service.setMode(PROJECT, 'voices');
      service.gotoSegment(PROJECT, id);
      expect(service.viewOf(PROJECT)).toMatchObject({ mode: 'prod', goto: id });
      expect(service.consumeGoto(PROJECT)).toBe(id);
      expect(service.consumeGoto(PROJECT)).toBeNull();
    });
  });

  describe('speakers', () => {
    it('changes voice and speed and persists the configuration', async () => {
      service.setSpeakerVoice(PROJECT, 'E3', 4);
      service.setSpeakerSpeed(PROJECT, 'E3', 3);
      const speaker = context().speakers.find((row) => row.member.id === 'E3');
      expect(speaker).toMatchObject({ voiceId: 4, speed: 1.5, status: 'ready' });
      await settle();
      expect(ipc.called('audiobook_config_save')).toBe(2);
      const saved = ipc.lastArgs('audiobook_config_save')?.['config'] as {
        voices: Record<string, { voice: number; speed: number }>;
      };
      expect(saved.voices['E3']).toEqual({ voice: 4, speed: 1.5 });
      expect(ipc.called('project_modules')).toBeGreaterThan(0);
    });

    it('flags an unusable engine and a missing voice', () => {
      service.setSpeakerVoice(PROJECT, 'E3', 5);
      expect(context().speakers.find((row) => row.member.id === 'E3')).toMatchObject({
        status: 'engine',
        issue: { kind: 'model' },
        canPreview: false,
      });
      service.setSpeakerVoice(PROJECT, 'E3', null);
      expect(context().speakers.find((row) => row.member.id === 'E3')?.status).toBe('noVoice');
      expect(context().blockers.map((item) => item.kind)).toContain('voice');
    });

    it('never blocks on the local backend state', () => {
      const backend = TestBed.inject(BackendService);
      voiceTeaWoman();
      backend.server.update((server) => ({ ...server, status: 'stopped' }));
      expect(context().blockers).toEqual([]);
      expect(context().canGenerate).toBe(true);
    });

    it('adds, renames and removes manual speakers', async () => {
      expect(service.addSpeaker(PROJECT, ' ')).toBe('empty');
      expect(service.addSpeaker(PROJECT, 'Crier')).toBe('added');
      expect(service.addSpeaker(PROJECT, 'crier')).toBe('duplicate');
      const crier = context().speakers.find((row) => row.member.name === 'Crier');
      expect(crier).toMatchObject({ nameEditable: true, status: 'unused', deleteBlock: null });
      const id = crier?.member.id ?? '';
      service.renameSpeaker(PROJECT, id, 'Town crier');
      expect(context().speakers.some((row) => row.member.name === 'Town crier')).toBe(true);
      service.setSpeakerVoice(PROJECT, id, 1);
      expect(service.removeSpeaker(PROJECT, id)).toBe(true);
      expect(service.bookOf(PROJECT)?.voices[id]).toBeUndefined();
      expect(service.removeSpeaker(PROJECT, 'narr')).toBe(false);
      expect(service.removeSpeaker(PROJECT, 'E1')).toBe(false);
      expect(service.removeSpeaker(PROJECT, 'missing')).toBe(false);
      await settle();
    });

    it('blocks deleting a used speaker', () => {
      const row = context().speakers.find((item) => item.member.id === TEA_WOMAN);
      expect(row?.uses).toBeGreaterThan(0);
      expect(row?.deleteBlock).toBe('kb');
      expect(context().speakers[0].deleteBlock).toBe('narrator');
    });
  });

  describe('chapter assembly and flags', () => {
    it('stores one mix for the whole project and persists it', async () => {
      service.setMix(PROJECT, 'gap', 2);
      service.setMix(PROJECT, 'sentence', 0.5);
      const mix = service.bookOf(PROJECT)?.mix;
      expect(mix).toMatchObject({ gap: 2, sentence: 0.5 });
      expect(context().chapterPanel.mix).toEqual(mix);
      expect(context().summary?.duration).toBeGreaterThan(0);
      await settle();
      expect(ipc.lastArgs('audiobook_mix_save')).toEqual({ projectId: PROJECT, mix });
      service.selectUnit(PROJECT, doneId());
      expect(context().chapterPanel.mix).toEqual(mix);
    });

    it('keeps the project mix while a chapter without a script is open', async () => {
      service.selectUnit(PROJECT, context().rail[3].unit.id);
      expect(context().chapterPanel.mix).toBeNull();
      const saves = ipc.called('audiobook_mix_save');
      service.setMix(PROJECT, 'sentence', 9);
      await settle();
      expect(ipc.called('audiobook_mix_save')).toBe(saves + 1);
      expect(service.bookOf(PROJECT)?.mix.sentence).toBe(2);
    });

    it('applies the clamped mix returned by the desktop', async () => {
      const reply = { gap: 1, intro: 1, outro: 1, vol: 0, sentence: 0.2 };
      ipc.on('audiobook_mix_save', reply);
      service.setMix(PROJECT, 'gap', 2);
      await settle();
      expect(service.bookOf(PROJECT)?.mix).toEqual(reply);
      expect(context().chapterPanel.mix).toEqual(reply);
    });

    it('flags a generated segment and clears the flag', async () => {
      const id = context().segments.find((row) => row.record)?.block.id ?? '';
      expect(service.flagSegment(PROJECT, id, 'wrong stress')).toBe(true);
      const row = context().segments.find((item) => item.block.id === id);
      expect(row).toMatchObject({ state: 'flag' });
      expect(row?.record?.flag).toBe('wrong stress');
      expect(service.clearFlag(PROJECT, id)).toBe(true);
      expect(service.clearFlag(PROJECT, id)).toBe(false);
      expect(context().segments.find((item) => item.block.id === id)?.state).not.toBe('flag');
      const missing = context().segments.find((item) => !item.record)?.block.id ?? '';
      expect(service.flagSegment(PROJECT, missing, 'x')).toBe(false);
      await settle();
      expect(ipc.called('audiobook_flag_set')).toBe(2);
      expect(ipc.lastArgs('audiobook_flag_set')).toEqual({
        projectId: PROJECT,
        unitId: context().unit?.id,
        blockId: id,
        flag: '',
      });
      expect(ipc.calls.some((call) => call.args && 'unit' in call.args)).toBe(false);
    });

    it('replaces an empty note with the re-listen hint', async () => {
      const id = context().segments.find((row) => row.record)?.block.id ?? '';
      expect(service.flagSegment(PROJECT, id, '  ')).toBe(true);
      await settle();
      expect(ipc.lastArgs('audiobook_flag_set')?.['flag']).toBe('Needs re-listening');
      expect(context().segments.find((row) => row.block.id === id)?.record?.flag).toBe(
        'Needs re-listening',
      );
    });
  });

  describe('generation', () => {
    it('is blocked until the tea woman has a voice', () => {
      expect(context().canGenerate).toBe(false);
      expect(context().blockers.map((item) => item.kind)).toEqual(['voice']);
      expect(context().blockers[0].speakerId).toBe(TEA_WOMAN);
    });

    it('plans and runs every pending segment as one audio pipeline', async () => {
      voiceTeaWoman();
      const unitId = currentId();
      const plan = service.generatePlanOf(PROJECT, [unitId]);
      expect(plan?.unitIds).toEqual([unitId]);
      expect(plan?.segments).toBeGreaterThan(0);
      expect(plan?.regenerated).toBeGreaterThan(0);
      expect(plan?.groups.map((group) => group.kind)).toEqual(['cloud']);
      expect(service.generatePlanOf(99, [unitId])).toBeNull();
      expect(context().canGenerate).toBe(true);
      const todoIds = context().todo.map((block) => block.id);
      expect(plan?.segments).toBe(todoIds.length);
      const started = await generateAll();
      expect(started).toBe(plan?.segments);
      const args = ipc.lastArgs('pipeline_start') ?? {};
      expect(args['kind']).toBe('audio');
      expect(args['projectId']).toBe(PROJECT);
      const tasks = args['tasks'] as { chapterId: string; segmentId: string }[];
      expect(tasks.map((item) => item.segmentId)).toEqual(todoIds);
      expect(tasks.every((item) => item.chapterId === unitId)).toBe(true);
      const requests = (args['params'] as { requests: Record<string, unknown> }).requests;
      expect(Object.keys(requests)).toEqual(todoIds);
      expect(context().stat?.state).toBe('done');
      expect(context().canGenerate).toBe(false);
      expect(service.isGenerating(PROJECT)).toBe(false);
      expect(service.running()).toEqual([]);
      expect(ipc.called('audiobook_segment_generate')).toBe(0);
      expect(ipc.called('audiobook_unit_get')).toBeGreaterThan(0);
      expect(ipc.called('project_modules')).toBeGreaterThan(0);
      expect(toasts('success')).toContain('Completed: Audiobook · ' + projectName());
      expect(Object.keys(service.bookOf(PROJECT)?.units[unitId] ?? {})).toEqual(['audio', 'meta']);
      expect(await generateCurrent()).toBe(0);
      expect(ipc.called('audiobook_export')).toBe(0);
    });

    it('lists the chapters that can be generated', () => {
      voiceTeaWoman();
      const chapters = service.generateChaptersOf(PROJECT);
      const withBlocks = context().script.units.filter((unit) => unit.blocks !== null);
      expect(chapters.map((chapter) => chapter.unit.id)).toEqual(withBlocks.map((unit) => unit.id));
      const current = chapters.find((chapter) => chapter.unit.id === currentId());
      expect(current).toMatchObject({ blocked: false, complete: false });
      expect(current?.todo).toBe(context().todo.length);
      expect(chapters.find((chapter) => chapter.unit.id === doneId())).toMatchObject({
        todo: 0,
        complete: true,
      });
      expect(service.generateChaptersOf(99)).toEqual([]);
    });

    it('plans only known chapters with a script', () => {
      voiceTeaWoman();
      const meta = context().rail[3].unit.id;
      expect(service.generatePlanOf(PROJECT, [])).toMatchObject({ unitIds: [], segments: 0 });
      expect(service.generatePlanOf(PROJECT, ['nope', meta])?.unitIds).toEqual([]);
      expect(service.generatePlanOf(PROJECT, [doneId()])).toMatchObject({ segments: 0, cost: 0 });
    });

    it('runs several chapters as one pipeline', async () => {
      voiceTeaWoman();
      service.setSpeakerSpeed(PROJECT, 'narr', 1.2);
      const ids = service
        .generateChaptersOf(PROJECT)
        .filter((chapter) => chapter.todo > 0 && !chapter.blocked)
        .map((chapter) => chapter.unit.id);
      expect(ids.length).toBeGreaterThan(1);
      const plan = service.generatePlanOf(PROJECT, ids);
      const started = await generateAll(ids);
      expect(started).toBe(plan?.segments);
      const tasks = ipc.lastArgs('pipeline_start')?.['tasks'] as { chapterId: string }[];
      expect([...new Set(tasks.map((item) => item.chapterId))]).toEqual(ids);
      const chapters = service.generateChaptersOf(PROJECT);
      for (const id of ids) {
        expect(chapters.find((chapter) => chapter.unit.id === id)?.complete).toBe(true);
      }
    });

    it('skips a chapter that is already generating', async () => {
      voiceTeaWoman();
      vi.useFakeTimers();
      expect(await generateCurrent()).toBeGreaterThan(0);
      expect(await generateCurrent()).toBe(0);
      expect(ipc.called('pipeline_start')).toBe(1);
      await drain();
    });

    it('shows queued and running tasks as queued or generating and keeps going across chapters', async () => {
      voiceTeaWoman();
      vi.useFakeTimers();
      await generateCurrent();
      const total = context().running.length;
      expect(total).toBeGreaterThan(0);
      expect(service.running()[0]).toMatchObject({ kind: 'audio', projectId: PROJECT });
      expect(
        context().rows.some((row) => row.kind === 'segment' && isInProgress(row.segment.state)),
      ).toBe(true);
      expect(service.isGenerating(PROJECT, context().unit?.id)).toBe(true);
      expect(service.isGenerating(PROJECT, 'other')).toBe(false);
      expect(context().canGenerate).toBe(false);
      await vi.advanceTimersByTimeAsync(800);
      expect(context().running.length).toBeLessThan(total);
      const unitId = context().unit?.id ?? '';
      service.selectUnit(PROJECT, context().rail[0].unit.id);
      expect(service.isGenerating(PROJECT, unitId)).toBe(true);
      await drain();
      expect(service.isGenerating(PROJECT)).toBe(false);
    });

    it('reports failed tasks, the failed count and keeps previous states', async () => {
      voiceTeaWoman();
      const channel = captureChannel();
      const unitId = context().unit?.id ?? '';
      const [first, second] = context().todo;
      const before = context().segments.find((row) => row.block.id === second.id)?.state;
      expect(await generateCurrent()).toBeGreaterThan(0);
      const snapshot = audioPipeline([
        audioTask(unitId, first.id, 1),
        audioTask(unitId, second.id, 2),
      ]);
      channel.send({ type: 'started', pipeline: snapshot });
      expect(context().running).toEqual([first.id, second.id]);
      channel.send({ type: 'updated', pipeline: { ...snapshot, status: 'running' } });
      const failed: PipelineTask = {
        ...audioTask(unitId, second.id, 2),
        status: 'failed',
        error: 'backend off',
      };
      channel.send({ type: 'task', pipelineId: 41, task: failed });
      expect(toasts('danger')).toContain('Could not generate the segment: backend off');
      expect(context().running).toEqual([first.id]);
      expect(context().segments.find((row) => row.block.id === second.id)?.state).toBe(before);
      channel.send({
        type: 'finished',
        pipeline: { ...snapshot, status: 'failed', failed: 1, tasks: [failed] },
      });
      await settle();
      await vi.waitFor(() =>
        expect(toasts('warning')).toContain(`Could not generate 1 segments for ${projectName()}.`),
      );
      expect(context().running).toEqual([]);
      channel.send({ type: 'started', pipeline: snapshot });
      expect(service.running()).toEqual([]);
    });

    it('drops the running state and refetches the unit after a cancel', async () => {
      voiceTeaWoman();
      const channel = captureChannel();
      await generateCurrent();
      const unitId = context().unit?.id ?? '';
      const queued = audioTask(unitId, context().todo[0].id, 1);
      channel.send({ type: 'started', pipeline: audioPipeline([queued]) });
      expect(context().running.length).toBe(1);
      const fetches = ipc.called('audiobook_unit_get');
      const cancelled = audioPipeline([{ ...queued, status: 'cancelled' }], {
        status: 'cancelled',
      });
      channel.send({ type: 'finished', pipeline: cancelled });
      expect(context().running).toEqual([]);
      await settle();
      await vi.waitFor(() =>
        expect(toasts('info')).toContain(`Cancelled: Audiobook · ${projectName()}`),
      );
      expect(ipc.called('audiobook_unit_get')).toBe(fetches + 1);
    });

    it('reports a pipeline that cannot start', async () => {
      voiceTeaWoman();
      ipc.fail('pipeline_start', { code: 'pipeline_busy', detail: 'busy' });
      expect(await generateCurrent()).toBe(0);
      expect(toasts('danger')).toContain('Could not generate the segment: busy');
      expect(context().running).toEqual([]);
    });

    it('regenerates one segment directly and reports why it cannot', async () => {
      const row = context().segments.find((item) => item.record);
      const id = row?.block.id ?? '';
      expect(service.regenerate(PROJECT, 'nothing')).toBe('noop');
      expect(service.regenerate(PROJECT, id)).toBe('blocked');
      voiceTeaWoman();
      vi.useFakeTimers();
      expect(service.regenerate(PROJECT, id)).toBe('started');
      expect(service.regenerate(PROJECT, id)).toBe('running');
      await drain();
      await settle();
      expect(ipc.called('audiobook_segment_generate')).toBe(1);
      expect(ipc.called('pipeline_start')).toBe(0);
      service.setSpeakerVoice(PROJECT, 'narr', null);
      expect(service.regenerate(PROJECT, id)).toBe('blocked');
    });

    it('keeps the segment state when a regeneration fails', async () => {
      voiceTeaWoman();
      const row = context().segments.find((item) => item.record);
      const id = row?.block.id ?? '';
      ipc.fail('audiobook_segment_generate', { code: 'backend_failed', detail: 'engine crashed' });
      expect(service.regenerate(PROJECT, id)).toBe('started');
      await settle();
      expect(toasts('danger')).toContain('Could not generate the segment: engine crashed');
      expect(context().segments.find((item) => item.block.id === id)).toMatchObject({
        state: row?.state,
        record: row?.record,
      });
    });

    it('skips a chapter blocked by a speaker without a voice', async () => {
      voiceTeaWoman();
      service.setSpeakerVoice(PROJECT, 'narr', null);
      expect(context().blockers.length).toBeGreaterThan(0);
      expect(await generateCurrent()).toBe(0);
      expect(ipc.called('pipeline_start')).toBe(0);
    });

    it('starts nothing when no pending segment has a voice', async () => {
      service.setSpeakerVoice(PROJECT, 'narr', null);
      const silent = context().todo.every(
        (block) => block.type !== 'dialogue' || block.who === TEA_WOMAN,
      );
      expect(silent).toBe(true);
      expect(await generateCurrent()).toBe(0);
      expect(ipc.called('pipeline_start')).toBe(0);
    });

    it('records persistence failures without losing the optimistic edit', async () => {
      ipc.fail('audiobook_config_save', { code: 'io', detail: 'disk full' });
      service.setSpeakerSpeed(PROJECT, 'narr', 1.2);
      await settle();
      expect(service.error()).toMatchObject({ code: 'io' });
      expect(context().speakers[0].speed).toBe(1.2);
    });
  });

  describe('export', () => {
    it('exports the chapters through the desktop', async () => {
      const reply = await service.exportUnits(PROJECT, ['U01', 'U02']);
      expect(reply).toEqual({
        wav: `exports/${PROJECT}/U01-U02.wav`,
        srt: `exports/${PROJECT}/U01-U02.srt`,
      });
      expect(ipc.lastArgs('audiobook_export')).toEqual({
        projectId: PROJECT,
        unitIds: ['U01', 'U02'],
      });
    });

    it('saves pending edits before exporting', async () => {
      service.setMix(PROJECT, 'gap', 2);
      await service.exportUnits(PROJECT, [doneId()]);
      const commands = ipc.calls.map((call) => call.command);
      expect(commands.lastIndexOf('audiobook_mix_save')).toBeLessThan(
        commands.lastIndexOf('audiobook_export'),
      );
    });

    it('reports a failed export', async () => {
      ipc.fail('audiobook_export', { code: 'io', detail: 'disk full' });
      expect(await service.exportUnits(PROJECT, [doneId()])).toBeNull();
      expect(toasts('danger')).toContain('Could not export: disk full');
    });

    it('exports right away when there is nothing to generate', async () => {
      const ids = [doneId()];
      expect(await service.generate(PROJECT, ids, { exportAfter: true, overwrite: false })).toBe(0);
      expect(ipc.called('pipeline_start')).toBe(0);
      expect(ipc.lastArgs('audiobook_export')).toEqual({ projectId: PROJECT, unitIds: ids });
      expect(toasts('success')).toEqual([exported(ids)]);
    });

    it('does not export when nothing is generated without the export option', async () => {
      expect(await service.generate(PROJECT, [doneId()])).toBe(0);
      expect(ipc.called('audiobook_export')).toBe(0);
    });

    it('exports once the pipeline completes', async () => {
      voiceTeaWoman();
      const ids = [currentId()];
      expect(await generateAll(ids, true)).toBeGreaterThan(0);
      await vi.waitFor(() => expect(toasts('success')).toContain(exported(ids)));
      expect(ipc.called('audiobook_export')).toBe(1);
      expect(ipc.lastArgs('audiobook_export')).toEqual({ projectId: PROJECT, unitIds: ids });
      const commands = ipc.calls.map((call) => call.command);
      expect(commands.lastIndexOf('pipeline_start')).toBeLessThan(
        commands.indexOf('audiobook_export'),
      );
    });

    it('skips the export when segments failed', async () => {
      voiceTeaWoman();
      const channel = captureChannel();
      const unitId = currentId();
      expect(await generateCurrent(true)).toBeGreaterThan(0);
      const failed: PipelineTask = { ...audioTask(unitId, 'x', 1), status: 'failed' };
      channel.send({
        type: 'finished',
        pipeline: audioPipeline([failed], { status: 'failed', failed: 1 }),
      });
      await vi.waitFor(() =>
        expect(toasts('warning')).toContain(
          'Export skipped because some segments were not generated.',
        ),
      );
      expect(ipc.called('audiobook_export')).toBe(0);
    });

    it('skips the export when the pipeline is cancelled', async () => {
      voiceTeaWoman();
      const channel = captureChannel();
      expect(await generateCurrent(true)).toBeGreaterThan(0);
      const queued = audioTask(currentId(), context().todo[0].id, 1);
      channel.send({
        type: 'finished',
        pipeline: audioPipeline([{ ...queued, status: 'cancelled' }], { status: 'cancelled' }),
      });
      await vi.waitFor(() =>
        expect(toasts('warning')).toContain(
          'Export skipped because some segments were not generated.',
        ),
      );
      expect(ipc.called('audiobook_export')).toBe(0);
    });

    it('does not export a finished pipeline started without the option', async () => {
      voiceTeaWoman();
      const channel = captureChannel();
      expect(await generateCurrent()).toBeGreaterThan(0);
      const done: PipelineTask = { ...audioTask(currentId(), 'x', 1), status: 'completed' };
      channel.send({ type: 'finished', pipeline: audioPipeline([done], { status: 'completed' }) });
      await vi.waitFor(() =>
        expect(toasts('success')).toContain('Completed: Audiobook · ' + projectName()),
      );
      expect(ipc.called('audiobook_export')).toBe(0);
    });
  });

  describe('messages', () => {
    it('translates blockers, reasons and engine issues', () => {
      const voice = context().blockers.find((item) => item.kind === 'voice');
      expect(service.messageText(voice?.message ?? ({} as never))).toBe(
        'Tea-selling old woman has no voice yet.',
      );
      expect(service.reasonText('text')).toBe('Speech content changed');
      expect(service.reasonText('speaker')).toBe('Character changed');
      expect(service.reasonText('speed')).toBe('Voice settings changed');
      expect(service.reasonText('tone')).toBe('Tone changed');
      expect(service.issueText({ kind: 'model', engine: 'Nano' })).toBe(
        'Requires installing the Nano model',
      );
      expect(service.issueText({ kind: 'cloud', engine: 'ElevenLabs' })).toBe(
        'Requires connecting ElevenLabs',
      );
    });
  });
});
