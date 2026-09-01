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

import { AudiobookContext } from '../audiobook.models';
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

function textOf(mounted: Mounted<unknown>, id: string): string {
  return (byId(mounted.root, id)?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

function disabled(mounted: Mounted<unknown>, id: string): boolean {
  return (byId(mounted.root, id) as HTMLButtonElement).disabled;
}

async function showUnit(mounted: Mounted<unknown>, unitId: string): Promise<void> {
  audiobook().selectUnit(PROJECT, unitId);
  await settle(mounted.fixture);
}

describe('AudiobookInspector (chapter panel)', () => {
  it('describes the unit and the assembly mix without a Scripting shortcut', async () => {
    const mounted = await openInspector();
    expect(textOf(mounted, 'audiobook-inspector-chapter-name')).toMatch(/^Chapter 2/);
    expect(byId(mounted.root, 'audiobook-inspector-chapter-locked')).toBeNull();
    expect(byId(mounted.root, 'audiobook-inspector-chapter-unlocked')).toBeNull();
    expect(textOf(mounted, 'audiobook-inspector-chapter-generated')).toMatch(/^\d+\/\d+$/);
    expect(textOf(mounted, 'audiobook-inspector-chapter-duration')).toMatch(/^≈ \d+:\d{2}$/);
    for (const field of ['gap', 'intro', 'outro', 'vol']) {
      expect(byId(mounted.root, `ab-mix-${field}`)).not.toBeNull();
    }
    expect(byId(mounted.root, 'ab-ins-blockers')).not.toBeNull();
    expect(byId(mounted.root, 'ab-ins-script-btn')).toBeNull();
  });

  it('shows a fully generated chapter without blockers or lock rows', async () => {
    const mounted = await openInspector();
    await showUnit(mounted, 'U01');
    expect(byId(mounted.root, 'audiobook-inspector-chapter-locked')).toBeNull();
    expect(byId(mounted.root, 'audiobook-inspector-chapter-unlocked')).toBeNull();
    expect(byId(mounted.root, 'ab-ins-blockers')).toBeNull();
    expect(byId(mounted.root, 'ab-ins-mix')).not.toBeNull();
  });

  it('treats a chapter without a lock as ready once its voices are usable', async () => {
    const mounted = await openInspector();
    await showUnit(mounted, 'U03');
    expect(byId(mounted.root, 'audiobook-inspector-chapter-blocker')).toBeNull();
    expect(textOf(mounted, 'audiobook-inspector-chapter-generated')).toBe('5/5');
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

describe('AudiobookInspector (chapter actions)', () => {
  it('blocks export until every segment is generated', async () => {
    const mounted = await openInspector();
    expect(disabled(mounted, 'ab-export-wav')).toBe(true);
    expect(disabled(mounted, 'ab-export-srt')).toBe(true);
    expect(textOf(mounted, 'ab-export-hint')).toBe('Generate every segment before exporting.');
  });

  it('exports a complete chapter as WAV and SRT', async () => {
    const mounted = await openInspector();
    await showUnit(mounted, 'U01');
    expect(byId(mounted.root, 'ab-export-hint')).toBeNull();
    expect(textOf(mounted, 'ab-export-wav')).toBe('WAV');
    click(mounted.root, 'ab-export-wav');
    await audiobook().flush(PROJECT);
    await settle(mounted.fixture);
    click(mounted.root, 'ab-export-srt');
    await settle(mounted.fixture);
    const toasts = TestBed.inject(ToastService).items();
    expect(toasts.map((toast) => toast.message)).toEqual([
      `Exported to exports/${PROJECT}/U01.wav`,
      `Exported to exports/${PROJECT}/U01.srt`,
    ]);
  });

  it('hides the chapter actions for a chapter without a script', async () => {
    const mounted = await openInspector();
    await showUnit(mounted, 'U04');
    expect(byId(mounted.root, 'ab-export-wav')).toBeNull();
  });
});

describe('AudiobookInspector (voices)', () => {
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
});
