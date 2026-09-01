import { TestBed } from '@angular/core/testing';
import { moduleTabId } from '@layout/layout.models';
import { TabsService } from '@layout/tabs.service';
import { LanguageService } from '@shared/language/language.service';
import { ToastService } from '@shared/toast/toast.service';
import { installAudiobookBackend, prepareEngines } from '@testing/audiobook';
import { allById, byId, click } from '@testing/dom';
import { mount, Mounted, settle } from '@testing/exercise';
import { setupApp } from '@testing/service';
import { describe, expect, it } from 'vitest';

import { ScriptingService } from '../../scripting/scripting.service';
import { AudiobookDialogsService } from '../audiobook.dialogs.service';
import { AudiobookContext, SegmentRow } from '../audiobook.models';
import {
  AUDIOBOOK_CLOCK,
  AudiobookClock,
  AudiobookPlayerService,
} from '../audiobook.player.service';
import { AudiobookService } from '../audiobook.service';
import { Audiobook } from './audiobook.component';

const PROJECT = 1;
const TEA_WOMAN = 'E16';

class ManualClock implements AudiobookClock {
  start(): unknown {
    return 'handle';
  }

  stop(): void {
    return undefined;
  }
}

async function load(): Promise<void> {
  prepareEngines();
  TestBed.inject(LanguageService).setLanguage('en');
  const audiobook = TestBed.inject(AudiobookService);
  TestBed.tick();
  await audiobook.load(PROJECT);
  await audiobook.flush(PROJECT);
}

async function open(): Promise<Mounted<Audiobook>> {
  TestBed.configureTestingModule({
    providers: [{ provide: AUDIOBOOK_CLOCK, useValue: new ManualClock() }],
  });
  const ipc = setupApp();
  ipc.on('workspace_current', null);
  installAudiobookBackend(ipc);
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
    expect(textOf(mounted, 'ab-views-rules')).toBe('Reading rules');
    expect(textOf(mounted, 'ab-rail-count')).toBe(
      `${ctx.railSummary.done}/${ctx.railSummary.total} generated`,
    );
    expect(mounted.root.querySelectorAll('.sc-unit')).toHaveLength(12);
    expect(byId(mounted.root, 'ab-unit-U02')?.classList.contains('is-active')).toBe(true);
    expect(textOf(mounted, 'ab-unit-U02')).toContain('8/12 segments');
    expect(textOf(mounted, 'ab-unit-U10')).toContain('Not generated');
    expect(textOf(mounted, 'audiobook-subbar-number')).toBe('CHAPTERS 02');
    expect(textOf(mounted, 'audiobook-subbar-lock')).toBe('Script locked');
    expect(textOf(mounted, 'ab-stats')).toMatch(/^12 segments8 generated4 to generate≈ \d+:\d{2}$/);
    expect(allById(mounted.root, 'ab-list')).toHaveLength(1);
    expect(segmentIds(mounted)).toEqual(ctx.segments.map((row) => row.block.id));
    expect(textOf(mounted, 'ab-play-all-btn')).toBe('Listen to the whole chapter');
    expect(textOf(mounted, 'ab-generate-btn')).toBe('Generate 4 segments');
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
    expect(staleRow.querySelector('.ab-why')?.textContent).toContain('Reading rule changed');
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

  it('highlights lexicon hits without changing the text', async () => {
    const mounted = await open();
    const hit = rowWhere((row) => row.parts.some((part) => part.say !== null));
    const text = byId(mounted.root, `ab-seg-${hit.block.id}`)?.querySelector('.ab-text');
    expect(text?.textContent).toBe(hit.block.text);
    const mark = text?.querySelector('mark.ab-hit') as HTMLElement;
    expect(mark.title).toMatch(/^Read as: /);
    expect(mark.textContent).toBe(hit.parts.find((part) => part.say !== null)?.text);
  });

  it('filters the list and shows the empty state when nothing matches', async () => {
    const mounted = await open();
    const all = segmentIds(mounted).length;
    await clickAndSettle(mounted, 'ab-filters-todo');
    expect(byId(mounted.root, 'ab-filters-todo')?.classList.contains('is-active')).toBe(true);
    expect(segmentIds(mounted)).toHaveLength(4);
    expect(mounted.root.querySelectorAll('.ab-gap')).toHaveLength(0);
    await clickAndSettle(mounted, 'ab-filters-stale');
    expect(segmentIds(mounted)).toHaveLength(1);
    await clickAndSettle(mounted, 'ab-filters-flag');
    expect(segmentIds(mounted)).toHaveLength(0);
    expect(textOf(mounted, 'audiobook-empty')).toContain('No segments match the filters');
    await clickAndSettle(mounted, 'ab-filters-all');
    expect(segmentIds(mounted)).toHaveLength(all);
    expect(byId(mounted.root, 'audiobook-empty')).toBeNull();
  });

  it('selects a segment on click and on Enter', async () => {
    const mounted = await open();
    const [first, second] = context().segments;
    await clickAndSettle(mounted, `ab-seg-${first.block.id}`);
    expect(context().view.sel).toBe(first.block.id);
    expect(byId(mounted.root, `ab-seg-${first.block.id}`)?.classList.contains('is-sel')).toBe(true);
    byId(mounted.root, `ab-seg-${second.block.id}`)?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
    );
    await settle(mounted.fixture);
    expect(context().view.sel).toBe(second.block.id);
    expect(mounted.root.querySelectorAll('.ab-seg.is-sel')).toHaveLength(1);
  });

  it('plays one segment, toggles the player and stops it', async () => {
    const mounted = await open();
    const id = rowWhere((row) => row.state === 'done').block.id;
    await clickAndSettle(mounted, `ab-play-${id}`);
    expect(context().view.sel).toBeNull();
    expect(byId(mounted.root, 'ab-player')).not.toBeNull();
    expect(textOf(mounted, 'ab-pl-title')).toContain(' · ');
    expect(byId(mounted.root, 'ab-pl-toggle')?.getAttribute('aria-label')).toBe('Pause');
    const row = byId(mounted.root, `ab-seg-${id}`) as HTMLElement;
    expect(row.classList.contains('is-playing')).toBe(true);
    expect(row.style.getPropertyValue('--pg')).toBe('0%');
    player().advance(2);
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

  it('shows the blockers, disables Generate and routes the banner buttons', async () => {
    const mounted = await open();
    expect(textOf(mounted, 'ab-ban-voice')).toContain('Tea-selling old woman has no voice yet.');
    expect(byId(mounted.root, 'ab-generate-btn')?.hasAttribute('disabled')).toBe(true);
    expect(byId(mounted.root, 'ab-pick-voice-btn')).not.toBeNull();
    await clickAndSettle(mounted, 'ab-pick-voice-btn');
    expect(context().view.mode).toBe('voices');
    expect(byId(mounted.root, 'ab-views-voices')?.classList.contains('is-active')).toBe(true);
    expect(mounted.root.querySelector('app-audiobook-voices')).not.toBeNull();
    expect(byId(mounted.root, 'ab-rail')).toBeNull();
    expect(byId(mounted.root, 'ab-generate-btn')).toBeNull();
  });

  it('opens Generate once the blockers are cleared', async () => {
    const mounted = await open();
    service().setSpeakerVoice(PROJECT, TEA_WOMAN, 1);
    await settle(mounted.fixture);
    expect(byId(mounted.root, 'ab-ban-voice')).toBeNull();
    expect(byId(mounted.root, 'ab-generate-btn')?.hasAttribute('disabled')).toBe(false);
    await clickAndSettle(mounted, 'ab-generate-btn');
    expect(TestBed.inject(AudiobookDialogsService).request()).toEqual({
      kind: 'generate',
      projectId: PROJECT,
    });
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
    expect(context().view.sel).toBeNull();
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
    expect(textOf(mounted, 'ab-stats')).toContain('1 generating');
    await service().settled(PROJECT);
    await settle(mounted.fixture);
    expect(textOf(mounted, `audiobook-segment-state-${id}`)).toBe('Generated');
    expect(byId(mounted.root, `ab-seg-${id}`)?.classList.contains('is-done')).toBe(true);
  });

  it('selects another chapter from the rail and shows its lock blocker', async () => {
    const mounted = await open();
    await clickAndSettle(mounted, 'ab-unit-U03');
    expect(byId(mounted.root, 'ab-unit-U03')?.classList.contains('is-active')).toBe(true);
    expect(textOf(mounted, 'audiobook-subbar-lock')).toBe('Script not locked');
    expect(textOf(mounted, 'ab-ban-lock')).toContain('is not locked yet.');
    expect(byId(mounted.root, 'ab-open-script-btn')).not.toBeNull();
    expect(byId(mounted.root, 'ab-unit-U03')?.querySelector('.sc-mk')).not.toBeNull();
  });

  it('opens Scripting on the chapter from the lock banner', async () => {
    const mounted = await open();
    await clickAndSettle(mounted, 'ab-unit-U03');
    await clickAndSettle(mounted, 'ab-open-script-btn');
    expect(TestBed.inject(TabsService).activeId()).toBe(moduleTabId(PROJECT, 'scripting'));
    expect(TestBed.inject(ScriptingService).viewOf(PROJECT).unit).toBe('U03');
  });

  it('opens Scripting at the segment from the edit button', async () => {
    const mounted = await open();
    const id = context().segments[1].block.id;
    await clickAndSettle(mounted, `ab-edit-${id}`);
    expect(TestBed.inject(TabsService).activeId()).toBe(moduleTabId(PROJECT, 'scripting'));
    const view = TestBed.inject(ScriptingService).viewOf(PROJECT);
    expect(view.sel).toBe(id);
    expect(view.goto).toBe(id);
    expect(context().view.sel).toBeNull();
  });

  it('shows the placeholder state for a chapter without sample content', async () => {
    const mounted = await open();
    await clickAndSettle(mounted, 'ab-unit-U05');
    expect(textOf(mounted, 'audiobook-empty')).toContain('has audio that needs regeneration');
    expect(byId(mounted.root, 'ab-play-all-btn')).toBeNull();
    expect(byId(mounted.root, 'ab-generate-btn')).toBeNull();
    expect(textOf(mounted, 'ab-stats')).toContain('0 segments');
  });

  it('hosts the voices and rules views and returns to production', async () => {
    const mounted = await open();
    await clickAndSettle(mounted, 'ab-views-rules');
    expect(mounted.root.querySelector('app-audiobook-rules')).not.toBeNull();
    expect(byId(mounted.root, 'ab-sub')).toBeNull();
    await clickAndSettle(mounted, 'ab-views-voices');
    expect(mounted.root.querySelector('app-audiobook-voices')).not.toBeNull();
    expect(mounted.root.querySelector('app-audiobook-rules')).toBeNull();
    await clickAndSettle(mounted, 'ab-views-prod');
    expect(byId(mounted.root, 'ab-rail')).not.toBeNull();
    expect(byId(mounted.root, 'ab-list')).not.toBeNull();
  });

  it('jumps to a requested segment from another view and selects it', async () => {
    const mounted = await open();
    await clickAndSettle(mounted, 'ab-views-rules');
    const id = context().segments[2].block.id;
    service().gotoSegment(PROJECT, id);
    await settle(mounted.fixture);
    expect(context().view.mode).toBe('prod');
    expect(context().view.sel).toBe(id);
    expect(context().view.goto).toBeNull();
    expect(byId(mounted.root, `ab-seg-${id}`)?.classList.contains('is-sel')).toBe(true);
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
