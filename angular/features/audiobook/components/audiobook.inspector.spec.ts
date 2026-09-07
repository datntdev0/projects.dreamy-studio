import { TestBed } from '@angular/core/testing';
import { ProjectService } from '@features/project/project.service';
import { TabsService } from '@layout/tabs.service';
import { LanguageService } from '@shared/language/language.service';
import { installAudiobookBackend, prepareEngines } from '@testing/audiobook';
import { byId, click, type } from '@testing/dom';
import { mount, Mounted, settle } from '@testing/exercise';
import { setupApp } from '@testing/service';
import { describe, expect, it } from 'vitest';

import { MixSettings } from '../audiobook.models';
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

function textOf(mounted: Mounted<unknown>, id: string): string {
  return (byId(mounted.root, id)?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

function inputValue(mounted: Mounted<unknown>, id: string): string {
  return (byId(mounted.root, id) as HTMLInputElement).value;
}

function mix(): MixSettings {
  return audiobook().bookOf(PROJECT)?.mix as MixSettings;
}

async function showUnit(mounted: Mounted<unknown>, unitId: string): Promise<void> {
  audiobook().selectUnit(PROJECT, unitId);
  await settle(mounted.fixture);
}

describe('AudiobookInspector (chapter panel)', () => {
  it('describes the unit and the assembly mix without a Scripting shortcut', async () => {
    const mounted = await openInspector();
    expect(byId(mounted.root, 'audiobook-inspector-chapter-details')).toBeNull();
    expect(byId(mounted.root, 'audiobook-inspector-chapter-locked')).toBeNull();
    expect(byId(mounted.root, 'audiobook-inspector-chapter-unlocked')).toBeNull();
    for (const field of ['gap', 'intro', 'outro', 'sentence', 'vol']) {
      expect(byId(mounted.root, `ab-mix-${field}`)).not.toBeNull();
    }
    expect(byId(mounted.root, 'ab-ins-blockers')).not.toBeNull();
    expect(byId(mounted.root, 'ab-ins-script-btn')).toBeNull();
  });

  it('shows a fully generated chapter without blockers or lock rows', async () => {
    const mounted = await openInspector();
    await showUnit(mounted, 'ch-1');
    expect(byId(mounted.root, 'audiobook-inspector-chapter-locked')).toBeNull();
    expect(byId(mounted.root, 'audiobook-inspector-chapter-unlocked')).toBeNull();
    expect(byId(mounted.root, 'ab-ins-blockers')).toBeNull();
    expect(byId(mounted.root, 'ab-ins-mix')).not.toBeNull();
  });

  it('treats a chapter without a lock as ready once its voices are usable', async () => {
    const mounted = await openInspector();
    await showUnit(mounted, 'ch-3');
    expect(byId(mounted.root, 'audiobook-inspector-chapter-blocker')).toBeNull();
  });

  it('hides the mix for a chapter without a script', async () => {
    const mounted = await openInspector();
    await showUnit(mounted, 'ch-4');
    expect(byId(mounted.root, 'ab-ins-mix')).toBeNull();
  });

  it('stores the mix and clamps it to the allowed range', async () => {
    const mounted = await openInspector();
    type(mounted.root, 'ab-mix-gap', '9');
    await settle(mounted.fixture);
    expect(mix().gap).toBe(5);
    expect(inputValue(mounted, 'ab-mix-gap')).toBe('5');
    type(mounted.root, 'ab-mix-vol', '-40');
    await settle(mounted.fixture);
    expect(mix().vol).toBe(-12);
    type(mounted.root, 'ab-mix-intro', '1.5');
    await settle(mounted.fixture);
    expect(mix().intro).toBe(1.5);
    type(mounted.root, 'ab-mix-outro', 'abc');
    await settle(mounted.fixture);
    expect(mix().outro).toBe(0);
    expect(inputValue(mounted, 'ab-mix-outro')).toBe('0');
  });

  it('edits the pause between sentences within its range', async () => {
    const mounted = await openInspector();
    expect(inputValue(mounted, 'ab-mix-sentence')).toBe('0.3');
    expect(textOf(mounted, 'audiobook-inspector-chapter-mix-hint')).toContain(
      'Applies to every chapter of this project.',
    );
    type(mounted.root, 'ab-mix-sentence', '0.55');
    await settle(mounted.fixture);
    expect(mix().sentence).toBe(0.55);
    type(mounted.root, 'ab-mix-sentence', '7');
    await settle(mounted.fixture);
    expect(mix().sentence).toBe(2);
    expect(inputValue(mounted, 'ab-mix-sentence')).toBe('2');
  });

  it('shares one mix across every chapter of the project', async () => {
    const mounted = await openInspector();
    type(mounted.root, 'ab-mix-gap', '2.5');
    await settle(mounted.fixture);
    await showUnit(mounted, 'ch-1');
    expect(inputValue(mounted, 'ab-mix-gap')).toBe('2.5');
    expect(byId(mounted.root, 'ab-export-wav')).toBeNull();
    expect(byId(mounted.root, 'ab-export-hint')).toBeNull();
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
