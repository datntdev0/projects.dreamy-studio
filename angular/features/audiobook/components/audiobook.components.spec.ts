import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { moduleTabId } from '@layout/layout.models';
import { TabsService } from '@layout/tabs.service';
import { LanguageService } from '@shared/language/language.service';
import { ToastService } from '@shared/toast/toast.service';
import { FakeAudioOutput, installAudiobookBackend, prepareEngines } from '@testing/audiobook';
import { allById, byId, click } from '@testing/dom';
import { mount, Mounted, settle } from '@testing/exercise';
import { setupApp } from '@testing/service';
import { describe, expect, it, vi } from 'vitest';

import { ScriptingState } from '../../../stories/screens/scripting.mocks';
import { ScriptingService } from '../../scripting/scripting.service';
import { AudiobookDialogsService } from '../audiobook.dialogs.service';
import { AudiobookContext, SegmentRow } from '../audiobook.models';
import { AUDIOBOOK_AUDIO, AudiobookPlayerService } from '../audiobook.player.service';
import { AudiobookService } from '../audiobook.service';
import { Audiobook } from './audiobook.component';
import { AudiobookListen } from './listen.component';

const PROJECT = 1;
const TEA_WOMAN = 'E16';

async function load(): Promise<void> {
  prepareEngines();
  TestBed.inject(LanguageService).setLanguage('en');
  const audiobook = TestBed.inject(AudiobookService);
  TestBed.tick();
  await audiobook.load(PROJECT);
  await audiobook.flush(PROJECT);
}

async function open(prepare?: (state: ScriptingState) => void): Promise<Mounted<Audiobook>> {
  const ipc = setupApp();
  ipc.on('workspace_current', null);
  const backend = installAudiobookBackend(ipc);
  prepare?.(backend.scripting);
  return mount(Audiobook, { projectId: PROJECT }, load);
}

function service(): AudiobookService {
  return TestBed.inject(AudiobookService);
}

function player(): AudiobookPlayerService {
  return TestBed.inject(AudiobookPlayerService);
}

function context(): AudiobookContext {
  const ctx = service().contextOf(PROJECT);
  if (!ctx) {
    throw new Error('missing context');
  }
  return ctx;
}

function rowWhere(predicate: (row: SegmentRow) => boolean): SegmentRow {
  const row = context().segments.find(predicate);
  if (!row) {
    throw new Error('missing segment');
  }
  return row;
}

function textOf(mounted: Mounted<unknown>, id: string): string {
  return (byId(mounted.root, id)?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

function segmentIds(mounted: Mounted<unknown>): string[] {
  return Array.from(mounted.root.querySelectorAll<HTMLElement>('.ab-seg')).map(
    (row) => row.dataset['id'] ?? '',
  );
}

function scriptChapterFour(state: ScriptingState): void {
  const units = state.scripts[PROJECT].units;
  units[3].meta = null;
  units[3].blocks = units[2].blocks;
}

function generateDisabled(mounted: Mounted<unknown>): boolean {
  return (byId(mounted.root, 'ab-generate-btn') as HTMLButtonElement).disabled;
}

function listenButton(mounted: Mounted<unknown>): HTMLButtonElement {
  return byId(mounted.root, 'ab-play-all-btn') as HTMLButtonElement;
}

async function clickAndSettle(mounted: Mounted<unknown>, id: string): Promise<void> {
  click(mounted.root, id);
  await settle(mounted.fixture);
}

describe('Audiobook production editor', () => {
  it('renders the bar, the rail, the sub bar and the segment list', async () => {
    const mounted = await open();
    const ctx = context();
    expect(textOf(mounted, 'ab-back-btn')).toBe('Harrowmere — Audiobook');
    expect(textOf(mounted, 'audiobook-title')).toBe('Audiobook');
    expect(byId(mounted.root, 'ab-views-prod')?.classList.contains('is-active')).toBe(true);
    expect(textOf(mounted, 'ab-views-voices')).toBe('Voices');
    expect(allById(mounted.root, 'ab-views')[0].querySelectorAll('button')).toHaveLength(2);
    expect(byId(mounted.root, 'ab-views-rules')).toBeNull();
    expect(textOf(mounted, 'ab-rail-count')).toBe(
      `${ctx.railSummary.done}/${ctx.railSummary.total} generated`,
    );
    expect(mounted.root.querySelectorAll('.sc-unit')).toHaveLength(12);
    expect(byId(mounted.root, 'ab-unit-U02')?.classList.contains('is-active')).toBe(true);
    expect(textOf(mounted, 'ab-unit-U02')).toContain('8/12 segments');
    expect(textOf(mounted, 'ab-unit-U10')).toContain('Not generated');
    expect(textOf(mounted, 'audiobook-subbar-number')).toBe('CHAPTERS 02');
    expect(byId(mounted.root, 'audiobook-subbar-lock')).toBeNull();
    expect(byId(mounted.root, 'audiobook-rail-unlocked')).toBeNull();
    expect(byId(mounted.root, 'ab-stats')).toBeNull();
    expect(allById(mounted.root, 'ab-list')).toHaveLength(1);
    expect(segmentIds(mounted)).toEqual(ctx.segments.map((row) => row.block.id));
    const list = mounted.root.querySelector('app-audiobook-list');
    expect(list?.firstElementChild?.tagName).toBe('APP-AUDIOBOOK-LISTEN');
    const bar = byId(mounted.root, 'audiobook-bar') as HTMLElement;
    expect(byId(bar, 'ab-play-all-btn')).toBeNull();
    expect(textOf(mounted, 'ab-generate-btn')).toBe('Generate all');
    expect(byId(mounted.root, 'ab-generate-btn')?.classList.contains('btn-primary')).toBe(true);
    expect(byId(mounted.root, 'ab-filters')).toBeNull();
    expect(byId(mounted.root, 'ab-player')).toBeNull();
  });

  it('shows a row per segment with its speaker, voice, state and pauses', async () => {
    const mounted = await open();
    const done = rowWhere((row) => row.state === 'done');
    const none = rowWhere((row) => row.state === 'none');
    const stale = rowWhere((row) => row.state === 'stale');
    const doneRow = byId(mounted.root, `ab-seg-${done.block.id}`) as HTMLElement;
    expect(doneRow.classList.contains('is-done')).toBe(true);
    expect(doneRow.querySelector('.ab-text')?.textContent).toBe(done.block.text);
    expect(textOf(mounted, `audiobook-segment-state-${done.block.id}`)).toBe('Generated');
    expect(textOf(mounted, `audiobook-segment-state-${none.block.id}`)).toBe('Not generated');
    expect(byId(mounted.root, `ab-play-${none.block.id}`)?.hasAttribute('disabled')).toBe(true);
    expect(byId(mounted.root, `ab-play-${done.block.id}`)?.hasAttribute('disabled')).toBe(false);
    const staleRow = byId(mounted.root, `ab-seg-${stale.block.id}`) as HTMLElement;
    expect(staleRow.querySelector('.ab-why')?.textContent).toContain('Voice settings changed');
    expect(byId(mounted.root, 'audiobook-segment-reason-speed')).not.toBeNull();
    expect(textOf(mounted, 'ab-ban-changed')).toBe(
      '1 segments changed since their audio was generated',
    );
    expect(
      allById(mounted.root, 'audiobook-segment-actions')[0].querySelectorAll('button'),
    ).toHaveLength(3);
    expect(byId(mounted.root, `ab-flag-${none.block.id}`)?.hasAttribute('disabled')).toBe(true);
    expect(mounted.root.querySelector('.ab-seg-h .type-tag')?.textContent).toContain('Title');
    expect(allById(mounted.root, 'audiobook-segment-speaker')[0].textContent?.trim()).toBe(
      'Narrator',
    );
    expect(mounted.root.querySelectorAll('.ab-gap')).toHaveLength(
      context().rows.filter((row) => row.kind === 'pause').length,
    );
    expect(mounted.root.querySelector('.ab-gap')?.textContent?.trim()).toMatch(
      /^Pause \d\.\d seconds$/,
    );
  });

  it('plays one segment, toggles the player and stops it', async () => {
    const mounted = await open();
    const id = rowWhere((row) => row.state === 'done').block.id;
    await clickAndSettle(mounted, `ab-play-${id}`);
    expect(byId(mounted.root, 'ab-player')).not.toBeNull();
    expect(textOf(mounted, 'ab-pl-title')).toContain(' · ');
    expect(byId(mounted.root, 'ab-pl-toggle')?.getAttribute('aria-label')).toBe('Pause');
    const row = byId(mounted.root, `ab-seg-${id}`) as HTMLElement;
    expect(row.classList.contains('is-playing')).toBe(true);
    expect(row.style.getPropertyValue('--pg')).toBe('0%');
    const output = TestBed.inject(AUDIOBOOK_AUDIO) as FakeAudioOutput;
    await vi.waitFor(() => expect(output.progress).not.toBeNull());
    output.progress?.(1);
    await settle(mounted.fixture);
    expect(row.style.getPropertyValue('--pg')).not.toBe('0%');
    expect(textOf(mounted, 'audiobook-player-time')).toMatch(/^\d+:\d{2} \/ \d+:\d{2}$/);
    await clickAndSettle(mounted, 'ab-pl-toggle');
    expect(player().playing()).toBe(false);
    expect(byId(mounted.root, 'ab-pl-toggle')?.getAttribute('aria-label')).toBe('Play');
    await clickAndSettle(mounted, `ab-play-${id}`);
    expect(player().playing()).toBe(true);
    await clickAndSettle(mounted, 'ab-pl-stop');
    expect(byId(mounted.root, 'ab-player')).toBeNull();
    expect(row.classList.contains('is-playing')).toBe(false);
    expect(row.style.getPropertyValue('--pg')).toBe('');
  });

  it('shows the listen card with the chapter progress', async () => {
    const mounted = await open();
    expect(textOf(mounted, 'audiobook-listen-title')).toBe('Listen to the whole chapter');
    expect(textOf(mounted, 'audiobook-listen-meta')).toMatch(
      /^8\/12 segments generated · ≈ \d+:\d{2}$/,
    );
    expect(listenButton(mounted).disabled).toBe(false);
    expect(listenButton(mounted).getAttribute('aria-label')).toBe('Listen to the whole chapter');
    const bar = byId(mounted.root, 'audiobook-listen-progress')?.querySelector('i');
    expect(bar?.style.width).toBe(`${(8 / 12) * 100}%`);
    expect(byId(mounted.root, 'ab-listen')?.classList.contains('is-off')).toBe(false);
    expect(byId(mounted.root, 'ab-listen')?.classList.contains('is-playing')).toBe(false);
  });

  it('pauses and resumes the chapter from the listen card', async () => {
    const mounted = await open();
    await clickAndSettle(mounted, 'ab-play-all-btn');
    expect(player().playing()).toBe(true);
    expect(byId(mounted.root, 'ab-listen')?.classList.contains('is-playing')).toBe(true);
    await clickAndSettle(mounted, 'ab-play-all-btn');
    expect(player().playing()).toBe(false);
    expect(byId(mounted.root, 'ab-listen')?.classList.contains('is-playing')).toBe(false);
    expect(player().state().queue.length).toBeGreaterThan(1);
    await clickAndSettle(mounted, 'ab-play-all-btn');
    expect(player().playing()).toBe(true);
  });

  it('restarts the chapter when a single segment is playing', async () => {
    const mounted = await open();
    const id = rowWhere((row) => row.state === 'done').block.id;
    await clickAndSettle(mounted, `ab-play-${id}`);
    expect(byId(mounted.root, 'ab-listen')?.classList.contains('is-playing')).toBe(false);
    await clickAndSettle(mounted, 'ab-play-all-btn');
    expect(player().state().queue.length).toBeGreaterThan(1);
    expect(byId(mounted.root, 'ab-listen')?.classList.contains('is-playing')).toBe(true);
  });

  it('disables the listen card for a chapter without audio', async () => {
    const mounted = await open(scriptChapterFour);
    await clickAndSettle(mounted, 'ab-unit-U04');
    expect(context().canPlay).toBe(false);
    expect(listenButton(mounted).disabled).toBe(true);
    expect(byId(mounted.root, 'ab-listen')?.classList.contains('is-off')).toBe(true);
    expect(textOf(mounted, 'audiobook-listen-meta')).toBe(
      'Generate segments to listen to the whole chapter',
    );
  });

  it('warns when the chapter has no audio to queue', async () => {
    const mounted = await open();
    const listen = mounted.fixture.debugElement.query(By.directive(AudiobookListen));
    vi.spyOn(player(), 'playChapter').mockReturnValue(false);
    (listen.componentInstance as AudiobookListen).toggle();
    expect(TestBed.inject(ToastService).items()).toEqual([
      expect.objectContaining({
        message: 'This chapter has no audio to listen to yet.',
        tone: 'warning',
      }),
    ]);
  });

  it('plays the whole chapter including pauses', async () => {
    const mounted = await open();
    await clickAndSettle(mounted, 'ab-play-all-btn');
    const queue = player().state().queue;
    expect(queue.some((item) => item.kind === 'pause')).toBe(true);
    expect(queue.filter((item) => item.kind === 'segment')).toHaveLength(
      context().segments.filter((row) => row.record).length,
    );
    expect(byId(mounted.root, 'ab-player')).not.toBeNull();
  });

  it('opens Generate from the toolbar even while the chapter has blockers', async () => {
    const mounted = await open();
    expect(context().canGenerate).toBe(false);
    expect(generateDisabled(mounted)).toBe(false);
    await clickAndSettle(mounted, 'ab-generate-btn');
    expect(TestBed.inject(AudiobookDialogsService).request()).toEqual({
      kind: 'generate',
      projectId: PROJECT,
    });
  });

  it('shows the blockers and routes the banner buttons', async () => {
    const mounted = await open();
    expect(textOf(mounted, 'ab-ban-voice')).toContain('Tea-selling old woman has no voice yet.');
    expect(byId(mounted.root, 'ab-pick-voice-btn')).not.toBeNull();
    await clickAndSettle(mounted, 'ab-pick-voice-btn');
    expect(context().view.mode).toBe('voices');
    expect(byId(mounted.root, 'ab-views-voices')?.classList.contains('is-active')).toBe(true);
    expect(mounted.root.querySelector('app-audiobook-voices')).not.toBeNull();
    expect(byId(mounted.root, 'ab-rail')).toBeNull();
    expect(byId(mounted.root, 'ab-play-all-btn')).toBeNull();
  });

  it('toasts the first blocker instead of regenerating', async () => {
    const mounted = await open();
    const id = rowWhere((row) => row.state === 'done').block.id;
    await clickAndSettle(mounted, `ab-regen-${id}`);
    const toasts = TestBed.inject(ToastService).items();
    expect(toasts).toHaveLength(1);
    expect(toasts[0]).toMatchObject({ tone: 'warning' });
    expect(toasts[0].message).toContain('Tea-selling old woman has no voice yet.');
    expect(context().running).toEqual([]);
  });

  it('flags a generated segment through the dialog and clears the flag inline', async () => {
    const mounted = await open();
    const id = rowWhere((row) => row.state === 'done').block.id;
    expect(byId(mounted.root, `ab-flag-${id}`)?.getAttribute('aria-pressed')).toBe('false');
    await clickAndSettle(mounted, `ab-flag-${id}`);
    expect(TestBed.inject(AudiobookDialogsService).request()).toEqual({
      kind: 'flag',
      projectId: PROJECT,
      blockId: id,
    });
    service().flagSegment(PROJECT, id, 'Wrong stress');
    await settle(mounted.fixture);
    expect(textOf(mounted, 'audiobook-segment-flag')).toBe('Failed: Wrong stress');
    expect(byId(mounted.root, `ab-flag-${id}`)?.getAttribute('aria-pressed')).toBe('true');
    expect(byId(mounted.root, `ab-flag-${id}`)?.getAttribute('aria-label')).toBe('Clear flag');
    await clickAndSettle(mounted, `ab-flag-${id}`);
    expect(context().segments.find((row) => row.block.id === id)?.state).toBe('done');
  });

  it('regenerates a segment and shows it as generating', async () => {
    const mounted = await open();
    service().setSpeakerVoice(PROJECT, TEA_WOMAN, 1);
    await settle(mounted.fixture);
    const id = rowWhere((row) => row.state === 'stale').block.id;
    await clickAndSettle(mounted, `ab-regen-${id}`);
    expect(context().running).toEqual([id]);
    expect(textOf(mounted, `audiobook-segment-state-${id}`)).toBe('Generating');
    expect(byId(mounted.root, `ab-seg-${id}`)?.classList.contains('is-running')).toBe(true);
    expect(byId(mounted.root, `ab-regen-${id}`)?.hasAttribute('disabled')).toBe(true);
    expect(generateDisabled(mounted)).toBe(true);
    await service().settled(PROJECT);
    await settle(mounted.fixture);
    expect(textOf(mounted, `audiobook-segment-state-${id}`)).toBe('Generated');
    expect(byId(mounted.root, `ab-seg-${id}`)?.classList.contains('is-done')).toBe(true);
    expect(generateDisabled(mounted)).toBe(false);
  });

  it('selects another chapter from the rail without any lock state', async () => {
    const mounted = await open();
    await clickAndSettle(mounted, 'ab-unit-U03');
    expect(byId(mounted.root, 'ab-unit-U03')?.classList.contains('is-active')).toBe(true);
    expect(byId(mounted.root, 'audiobook-subbar-lock')).toBeNull();
    expect(byId(mounted.root, 'audiobook-rail-unlocked')).toBeNull();
    expect(mounted.root.querySelectorAll('[data-testid^="ab-ban-"]')).toHaveLength(0);
  });

  it('opens Scripting on the chapter from the empty script state', async () => {
    const mounted = await open((state) => {
      state.scripts[PROJECT].units[3].meta = null;
    });
    await clickAndSettle(mounted, 'ab-unit-U04');
    expect(textOf(mounted, 'audiobook-empty')).toContain('Write the narration script');
    await clickAndSettle(mounted, 'ab-empty-script-btn');
    expect(TestBed.inject(TabsService).activeId()).toBe(moduleTabId(PROJECT, 'scripting'));
    expect(TestBed.inject(ScriptingService).viewOf(PROJECT).unit).toBe('U04');
  });

  it('opens Scripting at the segment from the edit button', async () => {
    const mounted = await open();
    const id = context().segments[1].block.id;
    await clickAndSettle(mounted, `ab-edit-${id}`);
    expect(TestBed.inject(TabsService).activeId()).toBe(moduleTabId(PROJECT, 'scripting'));
    const view = TestBed.inject(ScriptingService).viewOf(PROJECT);
    expect(view.sel).toBe(id);
    expect(view.goto).toBe(id);
  });

  it('shows the placeholder state for a chapter without sample content', async () => {
    const mounted = await open();
    await clickAndSettle(mounted, 'ab-unit-U05');
    expect(textOf(mounted, 'audiobook-empty')).toContain('has audio that needs regeneration');
    expect(byId(mounted.root, 'ab-play-all-btn')).toBeNull();
    expect(byId(mounted.root, 'ab-listen')).toBeNull();
    expect(byId(mounted.root, 'ab-stats')).toBeNull();
  });

  it('hosts the voices view and returns to production', async () => {
    const mounted = await open();
    await clickAndSettle(mounted, 'ab-views-voices');
    expect(mounted.root.querySelector('app-audiobook-voices')).not.toBeNull();
    expect(byId(mounted.root, 'ab-sub')).toBeNull();
    await clickAndSettle(mounted, 'ab-views-prod');
    expect(byId(mounted.root, 'ab-rail')).not.toBeNull();
    expect(byId(mounted.root, 'ab-list')).not.toBeNull();
  });

  it('jumps to a requested segment from another view', async () => {
    const mounted = await open();
    await clickAndSettle(mounted, 'ab-views-voices');
    const id = context().segments[2].block.id;
    service().gotoSegment(PROJECT, id);
    await settle(mounted.fixture);
    expect(context().view.mode).toBe('prod');
    expect(context().view.goto).toBeNull();
    expect(byId(mounted.root, `ab-seg-${id}`)).not.toBeNull();
  });

  it('renders nothing until the audiobook is loaded', async () => {
    TestBed.configureTestingModule({});
    const ipc = setupApp();
    ipc.on('workspace_current', null);
    installAudiobookBackend(ipc);
    const mounted = await mount(Audiobook, { projectId: 99 }, load);
    expect(byId(mounted.root, 'ab-root')).toBeNull();
  });
});
