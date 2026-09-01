import { Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ProjectService } from '@features/project/project.service';
import { LanguageService } from '@shared/language/language.service';
import { ToastService } from '@shared/toast/toast.service';
import { installAudiobookBackend, prepareEngines } from '@testing/audiobook';
import { byId, click, type } from '@testing/dom';
import { mount, Mounted, settle } from '@testing/exercise';
import { setupApp } from '@testing/service';
import { describe, expect, it, vi } from 'vitest';

import { AudiobookDialogsService } from './audiobook.dialogs.service';
import { AudiobookContext, GeneratePlan, SegmentRow } from './audiobook.models';
import { AudiobookService } from './audiobook.service';
import { AudiobookFlagDialog } from './components/flag.dialog';
import { AudiobookGenerateDialog } from './components/generate.dialog';

const PROJECT = 1;
const TEA_WOMAN = 'E16';
const VOICE = 1;

const PLAN: GeneratePlan = {
  unitId: 'U02',
  unitNo: 2,
  segmentIds: ['B1', 'B2', 'B3'],
  segments: 3,
  regenerated: 2,
  cost: 0.048,
  groups: [
    { key: 'local', kind: 'local', name: '', billing: 'local', chars: 1200, cost: 0 },
    {
      key: 'elevenlabs',
      kind: 'cloud',
      name: 'ElevenLabs',
      billing: 'paid',
      chars: 3000,
      cost: 0.048,
    },
    { key: 'edge-read-aloud', kind: 'cloud', name: 'Edge', billing: 'free', chars: 500, cost: 0 },
  ],
};

async function prepare(): Promise<void> {
  TestBed.inject(LanguageService).setLanguage('en');
  prepareEngines();
  const audiobook = TestBed.inject(AudiobookService);
  TestBed.tick();
  await audiobook.load(PROJECT);
  await TestBed.inject(ProjectService).load();
}

async function start<T>(type: Type<T>): Promise<Mounted<T>> {
  installAudiobookBackend(setupApp());
  return mount(type, {}, prepare);
}

function audiobook(): AudiobookService {
  return TestBed.inject(AudiobookService);
}

function dialogs(): AudiobookDialogsService {
  return TestBed.inject(AudiobookDialogsService);
}

function context(): AudiobookContext {
  return audiobook().contextOf(PROJECT) as AudiobookContext;
}

function toasts(): { message: string; tone: string }[] {
  return TestBed.inject(ToastService).items();
}

function textOf(mounted: Mounted<unknown>, id: string): string {
  return (byId(mounted.root, id)?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

async function open(mounted: Mounted<unknown>, opener: () => void): Promise<void> {
  opener();
  await settle(mounted.fixture);
}

function segmentWhere(predicate: (row: SegmentRow) => boolean): SegmentRow {
  return context().segments.find(predicate) as SegmentRow;
}

describe('audiobook generate dialog', () => {
  async function ready(): Promise<Mounted<AudiobookGenerateDialog>> {
    const mounted = await start(AudiobookGenerateDialog);
    audiobook().setSpeakerVoice(PROJECT, TEA_WOMAN, VOICE);
    await settle(mounted.fixture);
    return mounted;
  }

  it('stays closed while blockers prevent generating', async () => {
    const mounted = await start(AudiobookGenerateDialog);
    expect(context().canGenerate).toBe(false);
    await open(mounted, () => dialogs().openGenerate(PROJECT));
    expect(byId(mounted.root, 'ab-gen-modal')).toBeNull();
    expect(dialogs().request()).toBeNull();
  });

  it('plans the segments of the open chapter', async () => {
    const mounted = await ready();
    expect(context().canGenerate).toBe(true);
    await open(mounted, () => dialogs().openGenerate(PROJECT));
    expect(byId(mounted.root, 'ab-gen-modal')).not.toBeNull();
    const plan = audiobook().generatePlanOf(PROJECT) as GeneratePlan;
    expect(byId(mounted.root, 'dialog-title')?.textContent).toContain(
      'Generate audio for chapter 2',
    );
    expect(textOf(mounted, 'audiobook-generate-intro')).toContain(
      `Will generate ${plan.segments} segments`,
    );
    expect(byId(mounted.root, 'audiobook-generate-intro')?.innerHTML).toContain(
      `<b>${plan.segments} segments</b>`,
    );
    expect(textOf(mounted, 'ab-gen-go-btn')).toBe(`Generate ${plan.segments} segments`);
    expect(textOf(mounted, 'ab-gen-group-elevenlabs')).toContain(
      'ElevenLabs · the text will be sent to the provider',
    );
    expect(byId(mounted.root, 'ab-gen-group-elevenlabs')?.classList).toContain('is-warn');
    expect(textOf(mounted, 'ab-gen-estimate')).toContain('Estimated cost: ≈ $');
  });

  it('describes regenerated segments, cloud billing and the estimated cost', async () => {
    const mounted = await ready();
    vi.spyOn(audiobook(), 'generatePlanOf').mockReturnValue(PLAN);
    await open(mounted, () => dialogs().openGenerate(PROJECT));
    expect(textOf(mounted, 'audiobook-generate-intro')).toContain(
      'Will generate 3 segments, of which 2 segments are regenerated because the script or voice changed.',
    );
    expect(textOf(mounted, 'ab-gen-group-local')).toContain('1,200 characters');
    const paid = textOf(mounted, 'ab-gen-group-elevenlabs');
    expect(paid).toContain('ElevenLabs · the text will be sent to the provider, ≈ $0.048');
    expect(paid).toContain('3,000 characters');
    expect(byId(mounted.root, 'ab-gen-group-elevenlabs')?.classList).toContain('is-warn');
    expect(textOf(mounted, 'ab-gen-group-edge-read-aloud')).toContain(
      'billed to the account’s credits',
    );
    expect(byId(mounted.root, 'audiobook-generate-estimate-text')?.innerHTML).toContain(
      '<b>≈ $0.048</b>',
    );
  });

  it('generates, closes and reports success', async () => {
    const mounted = await ready();
    const generate = vi.spyOn(audiobook(), 'generate');
    await open(mounted, () => dialogs().openGenerate(PROJECT));
    const total = (audiobook().generatePlanOf(PROJECT) as GeneratePlan).segments;
    generate.mockResolvedValue(total);
    click(mounted.root, 'ab-gen-go-btn');
    expect(generate).toHaveBeenCalledWith(PROJECT);
    expect(dialogs().request()).toBeNull();
    expect(toasts().map((item) => item.message)).toEqual([
      expect.stringContaining('Started: Audiobook · '),
    ]);
    await settle(mounted.fixture);
    const messages = toasts();
    expect(messages).toHaveLength(2);
    expect(messages[1].message).toContain('Completed: Audiobook · ');
    expect(messages[1].tone).toBe('success');
    expect(byId(mounted.root, 'ab-gen-modal')).toBeNull();
  });

  it('warns when some segments could not be generated', async () => {
    const mounted = await ready();
    vi.spyOn(audiobook(), 'generate').mockResolvedValue(0);
    await open(mounted, () => dialogs().openGenerate(PROJECT));
    click(mounted.root, 'ab-gen-go-btn');
    await settle(mounted.fixture);
    const last = toasts().at(-1);
    expect(last?.message).toContain('Could not generate every segment for ');
    expect(last?.tone).toBe('warning');
  });

  it('cancels without generating', async () => {
    const mounted = await ready();
    const generate = vi.spyOn(audiobook(), 'generate');
    await open(mounted, () => dialogs().openGenerate(PROJECT));
    click(mounted.root, 'ab-gen-cancel-btn');
    await settle(mounted.fixture);
    expect(generate).not.toHaveBeenCalled();
    expect(dialogs().request()).toBeNull();
    expect(byId(mounted.root, 'ab-gen-modal')).toBeNull();
    expect(toasts()).toEqual([]);
  });
});

describe('audiobook flag dialog', () => {
  async function ready(): Promise<Mounted<AudiobookFlagDialog>> {
    const mounted = await start(AudiobookFlagDialog);
    audiobook().selectUnit(PROJECT, 'U01');
    await settle(mounted.fixture);
    return mounted;
  }

  function flaggable(): SegmentRow {
    return segmentWhere((row) => row.state === 'done');
  }

  it('flags a segment with the typed note', async () => {
    const mounted = await ready();
    const row = flaggable();
    await open(mounted, () => dialogs().openFlag(PROJECT, row.block.id));
    expect(byId(mounted.root, 'ab-flag-modal')).not.toBeNull();
    expect(byId(mounted.root, 'dialog-title')?.textContent).toContain('Flag a failed reading');
    type(mounted.root, 'ab-flag-note', '  Wrong stress on a name  ');
    click(mounted.root, 'ab-flag-save-btn');
    await settle(mounted.fixture);
    const record = context().audio?.audio[row.block.id];
    expect(record?.flag).toBe('Wrong stress on a name');
    expect(dialogs().request()).toBeNull();
    expect(toasts()).toEqual([
      expect.objectContaining({ message: 'Flagged the segment as failed.', tone: 'warning' }),
    ]);
  });

  it('falls back to a default note and starts empty on reopening', async () => {
    const mounted = await ready();
    const [first, second] = context().segments.filter((row) => row.state === 'done');
    await open(mounted, () => dialogs().openFlag(PROJECT, first.block.id));
    type(mounted.root, 'ab-flag-note', 'draft');
    click(mounted.root, 'ab-flag-cancel-btn');
    await settle(mounted.fixture);
    expect(context().audio?.audio[first.block.id].flag).toBe('');
    await open(mounted, () => dialogs().openFlag(PROJECT, second.block.id));
    expect((byId(mounted.root, 'ab-flag-note') as HTMLTextAreaElement).value).toBe('');
    click(mounted.root, 'ab-flag-save-btn');
    await settle(mounted.fixture);
    expect(context().audio?.audio[second.block.id].flag).toBe('Needs re-listening');
  });

  it('refuses a segment without audio or already flagged', async () => {
    const mounted = await ready();
    audiobook().selectUnit(PROJECT, 'U02');
    await settle(mounted.fixture);
    const missing = segmentWhere((row) => row.record === null);
    await open(mounted, () => dialogs().openFlag(PROJECT, missing.block.id));
    expect(byId(mounted.root, 'ab-flag-modal')).toBeNull();
    expect(dialogs().request()).toBeNull();
    const done = segmentWhere((row) => row.state === 'done');
    audiobook().flagSegment(PROJECT, done.block.id, 'x');
    await open(mounted, () => dialogs().openFlag(PROJECT, done.block.id));
    expect(byId(mounted.root, 'ab-flag-modal')).toBeNull();
    expect(toasts()).toEqual([]);
  });
});
