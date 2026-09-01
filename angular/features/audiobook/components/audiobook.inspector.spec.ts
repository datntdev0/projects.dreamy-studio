import { TestBed } from '@angular/core/testing';
import { ProjectService } from '@features/project/project.service';
import { TabsService } from '@layout/tabs.service';
import { LanguageService } from '@shared/language/language.service';
import { ToastService } from '@shared/toast/toast.service';
import { installAudiobookBackend, prepareEngines } from '@testing/audiobook';
import { byId, click, type } from '@testing/dom';
import { mount, Mounted, settle } from '@testing/exercise';
import { setupApp } from '@testing/service';
import { describe, expect, it } from 'vitest';

import { AudiobookDialogsService } from '../audiobook.dialogs.service';
import { AudiobookContext, SegmentRow } from '../audiobook.models';
import { AudiobookPlayerService } from '../audiobook.player.service';
import { AudiobookService } from '../audiobook.service';
import { AudiobookInspector } from './inspector.component';

const PROJECT = 1;

async function prepare(): Promise<void> {
  TestBed.inject(LanguageService).setLanguage('en');
  prepareEngines();
  const audiobook = TestBed.inject(AudiobookService);
  TestBed.tick();
  await audiobook.load(PROJECT);
  await TestBed.inject(ProjectService).load();
}

async function openInspector(): Promise<Mounted<AudiobookInspector>> {
  installAudiobookBackend(setupApp());
  return mount(AudiobookInspector, { projectId: PROJECT }, prepare);
}

function audiobook(): AudiobookService {
  return TestBed.inject(AudiobookService);
}

function context(): AudiobookContext {
  return audiobook().contextOf(PROJECT) as AudiobookContext;
}

function segmentWhere(predicate: (row: SegmentRow) => boolean): SegmentRow {
  return context().segments.find(predicate) as SegmentRow;
}

function textOf(mounted: Mounted<unknown>, id: string): string {
  return (byId(mounted.root, id)?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

async function select(mounted: Mounted<unknown>, row: SegmentRow): Promise<void> {
  audiobook().selectSegment(PROJECT, row.block.id);
  await settle(mounted.fixture);
}

async function showUnit(mounted: Mounted<unknown>, unitId: string): Promise<void> {
  audiobook().selectUnit(PROJECT, unitId);
  await settle(mounted.fixture);
}

describe('AudiobookInspector (chapter panel)', () => {
  it('describes the unit, the assembly mix and opens Scripting', async () => {
    const mounted = await openInspector();
    expect(textOf(mounted, 'audiobook-inspector-chapter-name')).toMatch(/^Chapter 2/);
    expect(textOf(mounted, 'audiobook-inspector-chapter-locked')).toBe('Locked');
    expect(textOf(mounted, 'audiobook-inspector-chapter-generated')).toMatch(/^\d+\/\d+$/);
    expect(textOf(mounted, 'audiobook-inspector-chapter-duration')).toMatch(/^≈ \d+:\d{2}$/);
    for (const field of ['gap', 'intro', 'outro', 'vol']) {
      expect(byId(mounted.root, `ab-mix-${field}`)).not.toBeNull();
    }
    expect(byId(mounted.root, 'ab-ins-blockers')).not.toBeNull();
    expect(textOf(mounted, 'ab-ins-script-btn')).toBe('Open Scripting');
    click(mounted.root, 'ab-ins-script-btn');
    expect(TestBed.inject(TabsService).activeId()).toBe(`pmod:${PROJECT}:scripting`);
  });

  it('shows a locked, fully generated chapter without blockers', async () => {
    const mounted = await openInspector();
    await showUnit(mounted, 'U01');
    expect(textOf(mounted, 'audiobook-inspector-chapter-locked')).toBe('Locked');
    expect(byId(mounted.root, 'audiobook-inspector-chapter-locked')?.classList).toContain(
      'badge-success',
    );
    expect(byId(mounted.root, 'ab-ins-blockers')).toBeNull();
    expect(byId(mounted.root, 'ab-ins-mix')).not.toBeNull();
  });

  it('flags a chapter whose script is not locked yet', async () => {
    const mounted = await openInspector();
    await showUnit(mounted, 'U03');
    expect(textOf(mounted, 'audiobook-inspector-chapter-unlocked')).toBe('Not locked');
    expect(byId(mounted.root, 'audiobook-inspector-chapter-unlocked')?.classList).toContain(
      'badge-warning',
    );
    expect(byId(mounted.root, 'audiobook-inspector-chapter-blocker')).not.toBeNull();
  });

  it('hides the mix for a chapter without a script', async () => {
    const mounted = await openInspector();
    await showUnit(mounted, 'U04');
    expect(byId(mounted.root, 'ab-ins-mix')).toBeNull();
    expect(textOf(mounted, 'audiobook-inspector-chapter-total')).toBe('—');
    expect(textOf(mounted, 'audiobook-inspector-chapter-generated')).toBe('—');
    expect(textOf(mounted, 'audiobook-inspector-chapter-duration')).toBe('—');
  });

  it('stores the mix and clamps it to the allowed range', async () => {
    const mounted = await openInspector();
    type(mounted.root, 'ab-mix-gap', '9');
    await settle(mounted.fixture);
    expect(context().audio?.mix.gap).toBe(5);
    expect((byId(mounted.root, 'ab-mix-gap') as HTMLInputElement).value).toBe('5');
    type(mounted.root, 'ab-mix-vol', '-40');
    await settle(mounted.fixture);
    expect(context().audio?.mix.vol).toBe(-12);
    type(mounted.root, 'ab-mix-intro', '1.5');
    await settle(mounted.fixture);
    expect(context().audio?.mix.intro).toBe(1.5);
    type(mounted.root, 'ab-mix-outro', 'abc');
    await settle(mounted.fixture);
    expect(context().audio?.mix.outro).toBe(0);
    expect((byId(mounted.root, 'ab-mix-outro') as HTMLInputElement).value).toBe('0');
  });
});

describe('AudiobookInspector (segment panel)', () => {
  it('describes a generated segment and plays it', async () => {
    const mounted = await openInspector();
    const row = segmentWhere((item) => item.state === 'done');
    await select(mounted, row);
    expect(byId(mounted.root, 'ab-ins-mix')).toBeNull();
    expect(textOf(mounted, 'ab-ins-text')).toBe(row.block.text);
    expect(textOf(mounted, 'audiobook-inspector-segment-status')).toBe('Generated');
    expect(byId(mounted.root, 'audiobook-inspector-segment-badge')?.className).toContain(
      'badge-success',
    );
    expect(textOf(mounted, 'audiobook-inspector-segment-duration')).toMatch(/^\d+:\d{2}$/);
    expect(textOf(mounted, 'audiobook-inspector-segment-speed')).toBe(`${row.speed}×`);
    expect(byId(mounted.root, 'audiobook-inspector-segment-why')).toBeNull();
    click(mounted.root, 'ab-ins-play');
    expect(TestBed.inject(AudiobookPlayerService).isCurrentSegment(row.block.id)).toBe(true);
  });

  it('lists why a stale segment needs regeneration', async () => {
    const mounted = await openInspector();
    const row = segmentWhere((item) => item.state === 'stale');
    await select(mounted, row);
    expect(textOf(mounted, 'audiobook-inspector-segment-status')).toBe('Needs regeneration');
    expect(byId(mounted.root, 'audiobook-inspector-segment-badge')?.className).toContain(
      'badge-warning',
    );
    expect(byId(mounted.root, 'audiobook-inspector-segment-reason')).not.toBeNull();
  });

  it('shows the read-as text only when a rule changes it', async () => {
    const mounted = await openInspector();
    const changed = segmentWhere((item) => item.readText !== item.block.text);
    await select(mounted, changed);
    expect(textOf(mounted, 'ab-ins-read')).toBe(changed.readText);
    const plain = segmentWhere((item) => item.readText === item.block.text);
    await select(mounted, plain);
    expect(byId(mounted.root, 'ab-ins-read')).toBeNull();
  });

  it('disables listening for a segment without audio', async () => {
    const mounted = await openInspector();
    const row = segmentWhere((item) => item.record === null);
    await select(mounted, row);
    expect((byId(mounted.root, 'ab-ins-play') as HTMLButtonElement).disabled).toBe(true);
    expect(textOf(mounted, 'audiobook-inspector-segment-duration')).toBe('—');
    expect(textOf(mounted, 'audiobook-inspector-segment-status')).toBe('Not generated');
    expect(byId(mounted.root, 'ab-ins-flag')).toBeNull();
    expect(byId(mounted.root, 'ab-ins-unflag')).toBeNull();
  });

  it('opens the flag dialog and clears an existing flag', async () => {
    const mounted = await openInspector();
    const row = segmentWhere((item) => item.state === 'done');
    await select(mounted, row);
    click(mounted.root, 'ab-ins-flag');
    expect(TestBed.inject(AudiobookDialogsService).request()).toEqual({
      kind: 'flag',
      projectId: PROJECT,
      blockId: row.block.id,
    });
    audiobook().flagSegment(PROJECT, row.block.id, 'Wrong stress');
    await settle(mounted.fixture);
    expect(textOf(mounted, 'audiobook-inspector-segment-flag-note')).toContain('Wrong stress');
    expect(textOf(mounted, 'audiobook-inspector-segment-status')).toBe('Failed');
    expect(byId(mounted.root, 'ab-ins-flag')).toBeNull();
    click(mounted.root, 'ab-ins-unflag');
    await settle(mounted.fixture);
    expect(byId(mounted.root, 'audiobook-inspector-segment-flag-note')).toBeNull();
    expect(byId(mounted.root, 'ab-ins-flag')).not.toBeNull();
  });

  it('refuses to regenerate while the chapter has blockers', async () => {
    const mounted = await openInspector();
    const row = segmentWhere((item) => item.state === 'done');
    await select(mounted, row);
    expect(context().blockers.length).toBeGreaterThan(0);
    click(mounted.root, 'ab-ins-regen');
    const toasts = TestBed.inject(ToastService).items();
    expect(toasts).toHaveLength(1);
    expect(toasts[0].tone).toBe('warning');
    expect(toasts[0].message).toBe(audiobook().messageText(context().blockers[0].message));
  });

  it('regenerates a segment of a ready chapter', async () => {
    const mounted = await openInspector();
    await showUnit(mounted, 'U01');
    const row = segmentWhere((item) => item.state === 'done');
    await select(mounted, row);
    click(mounted.root, 'ab-ins-regen');
    expect(TestBed.inject(ToastService).items()).toHaveLength(0);
    expect(context().running).toContain(row.block.id);
    await audiobook().settled(PROJECT);
  });

  it('opens Scripting at the segment', async () => {
    const mounted = await openInspector();
    const row = segmentWhere((item) => item.state === 'done');
    await select(mounted, row);
    click(mounted.root, 'ab-ins-edit');
    expect(TestBed.inject(TabsService).activeId()).toBe(`pmod:${PROJECT}:scripting`);
  });
});

describe('AudiobookInspector (voices and rules)', () => {
  it('summarises the engines and opens the voice library', async () => {
    const mounted = await openInspector();
    audiobook().setMode(PROJECT, 'voices');
    await settle(mounted.fixture);
    expect(textOf(mounted, 'audiobook-inspector-voices-local')).toBe('1 models');
    expect(textOf(mounted, 'audiobook-inspector-voices-cloud')).toBe('2 provider');
    expect(byId(mounted.root, 'ab-ins-mix')).toBeNull();
    click(mounted.root, 'ab-ins-library-btn');
    expect(TestBed.inject(TabsService).activeId()).toBe('voices');
  });

  it('keeps the engine shortcuts when the backend is stopped', async () => {
    const mounted = await openInspector();
    prepareEngines(false);
    audiobook().setMode(PROJECT, 'voices');
    await settle(mounted.fixture);
    expect(byId(mounted.root, 'ab-ins-tts-btn')).not.toBeNull();
    expect(byId(mounted.root, 'ab-ins-speech-btn')).not.toBeNull();
  });

  it('counts pronunciation rules, symbols and affected segments', async () => {
    const mounted = await openInspector();
    audiobook().setMode(PROJECT, 'rules');
    await settle(mounted.fixture);
    expect(textOf(mounted, 'audiobook-inspector-rules-pronunciation')).toBe('5');
    expect(textOf(mounted, 'audiobook-inspector-rules-symbols')).toBe('4');
    expect(textOf(mounted, 'audiobook-inspector-rules-affected')).toBe(
      String(context().rulesPanel.affected),
    );
  });
});
