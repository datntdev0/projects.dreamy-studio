import { TestBed } from '@angular/core/testing';
import { BackendService } from '@features/settings/backend.service';
import { LanguageService } from '@shared/language/language.service';
import { installAudiobookBackend, prepareEngines } from '@testing/audiobook';
import { FakeIpc } from '@testing/fake-ipc';
import { flushEffects, setupApp } from '@testing/service';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AudiobookService } from './audiobook.service';

const PROJECT = 1;
const TEA_WOMAN = 'E16';
const STEP_MS = 400;
const DRAIN_STEPS = 40;

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

  function voiceTeaWoman(): void {
    service.setSpeakerVoice(PROJECT, TEA_WOMAN, 1);
  }

  async function drain(): Promise<void> {
    for (let step = 0; step < DRAIN_STEPS && service.isGenerating(PROJECT); step += 1) {
      await vi.advanceTimersByTimeAsync(STEP_MS);
    }
  }

  async function generateAll(): Promise<number> {
    vi.useFakeTimers();
    const pending = service.generate(PROJECT);
    await drain();
    return pending;
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
      expect(service.bookOf(5)).toEqual({ voices: {}, units: {} });
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
      expect(ctx.availability.backendRunning).toBe(true);
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

    it('reports backend-off blockers through the live availability', () => {
      const backend = TestBed.inject(BackendService);
      service.setSpeakerVoice(PROJECT, 'narr', 2);
      backend.server.update((server) => ({ ...server, status: 'stopped' }));
      expect(context().blockers[0].message.key).toBe('audiobook.blocker.engine.backend');
      expect(context().canGenerate).toBe(false);
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
    it('stores mix settings for chapters with a script only', async () => {
      service.setMix(PROJECT, 'gap', 2);
      expect(context().audio?.mix.gap).toBe(2);
      expect(context().summary?.duration).toBeGreaterThan(0);
      await settle();
      expect(ipc.lastArgs('audiobook_unit_save')).toMatchObject({ unitId: context().unit?.id });
      service.selectUnit(PROJECT, context().rail[3].unit.id);
      const saves = ipc.called('audiobook_unit_save');
      service.setMix(PROJECT, 'gap', 3);
      await settle();
      expect(ipc.called('audiobook_unit_save')).toBe(saves);
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
      expect(ipc.called('audiobook_unit_save')).toBe(2);
    });
  });

  describe('generation', () => {
    it('is blocked until the tea woman has a voice', () => {
      expect(context().canGenerate).toBe(false);
      expect(context().blockers.map((item) => item.kind)).toEqual(['voice']);
      expect(context().blockers[0].speakerId).toBe(TEA_WOMAN);
    });

    it('plans, generates every pending segment and refreshes progress', async () => {
      voiceTeaWoman();
      const plan = service.generatePlanOf(PROJECT);
      expect(plan?.segments).toBeGreaterThan(0);
      expect(plan?.regenerated).toBeGreaterThan(0);
      expect(plan?.groups.map((group) => group.kind)).toEqual(['cloud']);
      expect(service.generatePlanOf(99)).toBeNull();
      expect(context().canGenerate).toBe(true);
      const generated = await generateAll();
      expect(generated).toBe(plan?.segments);
      expect(context().stat?.state).toBe('done');
      expect(context().canGenerate).toBe(false);
      expect(service.isGenerating(PROJECT)).toBe(false);
      expect(ipc.called('audiobook_segment_generate')).toBe(generated);
      expect(ipc.called('project_modules')).toBeGreaterThan(0);
      expect(await service.generate(PROJECT)).toBe(0);
    });

    it('shows segments as running while the backend works', async () => {
      voiceTeaWoman();
      vi.useFakeTimers();
      const pending = service.generate(PROJECT);
      const total = context().running.length;
      expect(total).toBeGreaterThan(0);
      expect(
        context().rows.some((row) => row.kind === 'segment' && row.segment.state === 'running'),
      ).toBe(true);
      expect(service.isGenerating(PROJECT, context().unit?.id)).toBe(true);
      expect(service.isGenerating(PROJECT, 'other')).toBe(false);
      expect(context().canGenerate).toBe(false);
      await vi.advanceTimersByTimeAsync(400);
      expect(context().running.length).toBeLessThan(total);
      await drain();
      await pending;
      expect(context().running).toEqual([]);
    });

    it('regenerates one segment and reports why it cannot', async () => {
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
      service.setSpeakerVoice(PROJECT, 'narr', null);
      expect(service.regenerate(PROJECT, id)).toBe('blocked');
    });

    it('skips segments that lost their voice and records backend failures', async () => {
      voiceTeaWoman();
      service.setSpeakerVoice(PROJECT, 'narr', null);
      expect(await service.generate(PROJECT)).toBe(0);
      service.setSpeakerVoice(PROJECT, 'narr', 1);
      ipc.fail('audiobook_segment_generate', { code: 'tts', detail: 'engine crashed' });
      expect(await generateAll()).toBe(0);
      expect(service.error()).toMatchObject({ code: 'tts' });
      expect(context().running).toEqual([]);
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
    it('exports a fully generated chapter and refuses an incomplete one', async () => {
      expect(await service.exportUnit(PROJECT, 'wav')).toBeNull();
      service.selectUnit(PROJECT, context().rail[0].unit.id);
      const unitId = context().unit?.id;
      expect(await service.exportUnit(PROJECT, 'srt')).toBe(`exports/${PROJECT}/${unitId}.srt`);
      expect(ipc.called('audiobook_export')).toBe(1);
    });

    it('reports a failed export', async () => {
      service.selectUnit(PROJECT, context().rail[0].unit.id);
      ipc.fail('audiobook_export', { code: 'io', detail: 'disk full' });
      expect(await service.exportUnit(PROJECT, 'wav')).toBeNull();
      expect(service.error()).not.toBeNull();
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
      expect(service.issueText({ kind: 'backend', engine: 'x' })).toBe('Python backend is off');
    });
  });
});
