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
import { AudiobookContext, GenerateChapter, GeneratePlan, SegmentRow } from './audiobook.models';
import { AudiobookService } from './audiobook.service';
import { AudiobookFlagDialog } from './components/flag.dialog';
import { AudiobookGenerateDialog } from './components/generate.dialog';

const PROJECT = 1;
const TEA_WOMAN = 'E16';
const VOICE = 1;
const NARRATOR = 'narr';

const PLAN: GeneratePlan = {
  unitIds: ['U02'],
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

function currentId(): string {
  return context().unit?.id ?? '';
}

function chapters(): GenerateChapter[] {
  return audiobook().generateChaptersOf(PROJECT);
}

function chapterWhere(predicate: (chapter: GenerateChapter) => boolean): GenerateChapter {
  return chapters().find(predicate) as GenerateChapter;
}

function isComplete(chapter: GenerateChapter): boolean {
  return chapter.complete && !chapter.blocked;
}

function isPendingElsewhere(chapter: GenerateChapter): boolean {
  return chapter.todo > 0 && !chapter.blocked && chapter.unit.id !== currentId();
}

function isSelectable(chapter: GenerateChapter): boolean {
  return !chapter.blocked && chapter.total > 0;
}

function unitIdOf(chapter: GenerateChapter): string {
  return chapter.unit.id;
}

function checkbox(mounted: Mounted<unknown>, id: string): HTMLInputElement {
  return byId(mounted.root, id) as HTMLInputElement;
}

function checked(mounted: Mounted<unknown>, unitId: string): boolean {
  return checkbox(mounted, `ab-gen-ch-check-${unitId}`).checked;
}

function goDisabled(mounted: Mounted<unknown>): boolean {
  return (byId(mounted.root, 'ab-gen-go-btn')?.querySelector('button') as HTMLButtonElement)
    .disabled;
}

async function press(mounted: Mounted<unknown>, id: string): Promise<void> {
  click(mounted.root, id);
  await settle(mounted.fixture);
}

function planFor(unitIds: string[]): GeneratePlan {
  return audiobook().generatePlanOf(PROJECT, unitIds) as GeneratePlan;
}

describe('audiobook generate dialog', () => {
  async function ready(): Promise<Mounted<AudiobookGenerateDialog>> {
    const mounted = await start(AudiobookGenerateDialog);
    audiobook().setSpeakerVoice(PROJECT, TEA_WOMAN, VOICE);
    await settle(mounted.fixture);
    return mounted;
  }

  async function opened(restyle = false): Promise<Mounted<AudiobookGenerateDialog>> {
    const mounted = await ready();
    if (restyle) {
      audiobook().setSpeakerSpeed(PROJECT, NARRATOR, 1.2);
    }
    await open(mounted, () => dialogs().openGenerate(PROJECT));
    return mounted;
  }

  it('opens with blocked chapters disabled and nothing to run', async () => {
    const mounted = await start(AudiobookGenerateDialog);
    expect(context().canGenerate).toBe(false);
    await open(mounted, () => dialogs().openGenerate(PROJECT));
    expect(byId(mounted.root, 'ab-gen-modal')).not.toBeNull();
    const unitId = currentId();
    expect(checkbox(mounted, `ab-gen-ch-check-${unitId}`).disabled).toBe(true);
    expect(checked(mounted, unitId)).toBe(false);
    expect(byId(mounted.root, `ab-gen-ch-${unitId}`)?.classList).toContain('is-off');
    expect(textOf(mounted, `ab-gen-ch-status-${unitId}`)).toBe('Voices missing');
    expect(byId(mounted.root, 'audiobook-generate-intro')).toBeNull();
    expect(byId(mounted.root, 'ab-gen-nothing')).toBeNull();
    expect(goDisabled(mounted)).toBe(true);
  });

  it('lists every chapter and selects the open one', async () => {
    const mounted = await opened();
    expect(byId(mounted.root, 'dialog-title')?.textContent?.trim()).toBe('Generate audio');
    const list = chapters();
    for (const chapter of list) {
      expect(byId(mounted.root, `ab-gen-ch-${chapter.unit.id}`)).not.toBeNull();
      expect(checked(mounted, chapter.unit.id)).toBe(chapter.unit.id === currentId());
    }
    const current = chapterWhere((chapter) => chapter.unit.id === currentId());
    expect(textOf(mounted, `ab-gen-ch-status-${current.unit.id}`)).toBe(
      `${current.todo} to generate`,
    );
    const done = chapterWhere(isComplete);
    expect(textOf(mounted, `ab-gen-ch-status-${done.unit.id}`)).toBe('Generated');
    expect(checkbox(mounted, 'ab-gen-all').checked).toBe(false);
    expect(checkbox(mounted, 'ab-gen-export').checked).toBe(false);
  });

  it('plans the segments of the selected chapter', async () => {
    const mounted = await opened();
    const plan = planFor([currentId()]);
    expect(textOf(mounted, 'audiobook-generate-intro')).toContain(
      `Will generate ${plan.segments} segments`,
    );
    expect(byId(mounted.root, 'audiobook-generate-intro')?.innerHTML).toContain(
      `<b>${plan.segments} segments</b>`,
    );
    expect(textOf(mounted, 'ab-gen-go-btn')).toBe(`Generate ${plan.segments} segments`);
    expect(goDisabled(mounted)).toBe(false);
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

  it('adds another chapter to the plan', async () => {
    const mounted = await opened(true);
    const other = chapterWhere(isPendingElsewhere);
    await press(mounted, `ab-gen-ch-check-${other.unit.id}`);
    expect(checked(mounted, other.unit.id)).toBe(true);
    const plan = planFor([currentId(), other.unit.id]);
    expect(plan.segments).toBeGreaterThan(planFor([currentId()]).segments);
    expect(textOf(mounted, 'ab-gen-go-btn')).toBe(`Generate ${plan.segments} segments`);
    const generate = vi.spyOn(audiobook(), 'generate').mockResolvedValue(plan.segments);
    await press(mounted, 'ab-gen-go-btn');
    expect(plan.unitIds).toHaveLength(2);
    expect(plan.unitIds).toEqual(expect.arrayContaining([currentId(), other.unit.id]));
    expect(generate).toHaveBeenCalledWith(PROJECT, plan.unitIds, false);
  });

  it('selects and clears every selectable chapter at once', async () => {
    const mounted = await opened();
    await press(mounted, 'ab-gen-all');
    const selectable = chapters().filter(isSelectable).map(unitIdOf);
    for (const chapter of chapters()) {
      expect(checked(mounted, chapter.unit.id)).toBe(selectable.includes(chapter.unit.id));
    }
    expect(checkbox(mounted, 'ab-gen-all').checked).toBe(true);
    const plan = planFor(selectable);
    expect(textOf(mounted, 'ab-gen-go-btn')).toBe(`Generate ${plan.segments} segments`);
    await press(mounted, 'ab-gen-all');
    expect(chapters().some((chapter) => checked(mounted, chapter.unit.id))).toBe(false);
    expect(goDisabled(mounted)).toBe(true);
    expect(byId(mounted.root, 'ab-gen-nothing')).toBeNull();
  });

  it('starts the pipeline, closes and reports the start', async () => {
    const mounted = await opened();
    const generate = vi.spyOn(audiobook(), 'generate');
    const total = planFor([currentId()]).segments;
    generate.mockResolvedValue(total);
    click(mounted.root, 'ab-gen-go-btn');
    expect(generate).toHaveBeenCalledWith(PROJECT, [currentId()], false);
    expect(dialogs().request()).toBeNull();
    await settle(mounted.fixture);
    expect(toasts().map((item) => item.message)).toEqual([
      expect.stringContaining('Started: Audiobook · '),
    ]);
    expect(byId(mounted.root, 'ab-gen-modal')).toBeNull();
  });

  it('asks to export once generation finishes', async () => {
    const mounted = await opened();
    const generate = vi.spyOn(audiobook(), 'generate').mockResolvedValue(1);
    await press(mounted, 'ab-gen-export');
    expect(checkbox(mounted, 'ab-gen-export').checked).toBe(true);
    await press(mounted, 'ab-gen-go-btn');
    expect(generate).toHaveBeenCalledWith(PROJECT, [currentId()], true);
  });

  it('offers an export only when the selected chapters are generated', async () => {
    const mounted = await opened();
    const done = chapterWhere(isComplete);
    await press(mounted, `ab-gen-ch-check-${currentId()}`);
    await press(mounted, `ab-gen-ch-check-${done.unit.id}`);
    expect(textOf(mounted, 'ab-gen-nothing')).toBe(
      'Every segment in the selected chapters is already generated.',
    );
    expect(byId(mounted.root, 'audiobook-generate-intro')).toBeNull();
    expect(textOf(mounted, 'ab-gen-go-btn')).toBe('Export');
    expect(goDisabled(mounted)).toBe(true);
    await press(mounted, 'ab-gen-export');
    expect(goDisabled(mounted)).toBe(false);
    const generate = vi.spyOn(audiobook(), 'generate').mockResolvedValue(0);
    await press(mounted, 'ab-gen-go-btn');
    expect(generate).toHaveBeenCalledWith(PROJECT, [done.unit.id], true);
    expect(dialogs().request()).toBeNull();
    expect(toasts()).toEqual([]);
  });

  it('exports generated chapters through the desktop', async () => {
    const mounted = await opened();
    const done = chapterWhere(isComplete);
    await press(mounted, `ab-gen-ch-check-${currentId()}`);
    await press(mounted, `ab-gen-ch-check-${done.unit.id}`);
    await press(mounted, 'ab-gen-export');
    await press(mounted, 'ab-gen-go-btn');
    await vi.waitFor(() =>
      expect(toasts().map((item) => item.message)).toEqual([
        `Exported exports/${PROJECT}/${done.unit.id}.wav and exports/${PROJECT}/${done.unit.id}.srt`,
      ]),
    );
  });

  it('starts fresh when reopened', async () => {
    const mounted = await opened(true);
    const other = chapterWhere(isPendingElsewhere);
    await press(mounted, `ab-gen-ch-check-${other.unit.id}`);
    await press(mounted, 'ab-gen-export');
    await press(mounted, 'ab-gen-cancel-btn');
    await open(mounted, () => dialogs().openGenerate(PROJECT));
    expect(checked(mounted, other.unit.id)).toBe(false);
    expect(checked(mounted, currentId())).toBe(true);
    expect(checkbox(mounted, 'ab-gen-export').checked).toBe(false);
  });

  it('cancels without generating', async () => {
    const mounted = await opened();
    const generate = vi.spyOn(audiobook(), 'generate');
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
