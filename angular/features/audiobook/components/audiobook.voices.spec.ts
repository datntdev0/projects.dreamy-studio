import { TestBed } from '@angular/core/testing';
import { LanguageService } from '@shared/language/language.service';
import { ToastService } from '@shared/toast/toast.service';
import { installAudiobookBackend, prepareEngines } from '@testing/audiobook';
import { allById, byId, click, type } from '@testing/dom';
import { mount, Mounted, settle } from '@testing/exercise';
import { flushEffects, setupApp } from '@testing/service';
import { describe, expect, it } from 'vitest';

import { AudiobookContext } from '../audiobook.models';
import { AudiobookPlayerService } from '../audiobook.player.service';
import { AudiobookService } from '../audiobook.service';
import { AudiobookVoices } from './voices.component';

const PROJECT = 1;
const TEA_WOMAN = 'E16';
const MARO = 'E3';
const MODEL_VOICE = 5;

async function prepare(): Promise<void> {
  const ipc = setupApp();
  installAudiobookBackend(ipc);
  prepareEngines();
  TestBed.inject(LanguageService).init();
  const service = TestBed.inject(AudiobookService);
  flushEffects();
  await service.load(PROJECT);
}

async function open<T>(type: new () => T): Promise<Mounted<T>> {
  return mount(type, { projectId: PROJECT }, prepare);
}

function service(): AudiobookService {
  return TestBed.inject(AudiobookService);
}

function context(): AudiobookContext {
  const ctx = service().contextOf(PROJECT);
  if (!ctx) {
    throw new Error('missing context');
  }
  return ctx;
}

function speaker(id: string) {
  const row = context().speakers.find((item) => item.member.id === id);
  if (!row) {
    throw new Error(`missing speaker ${id}`);
  }
  return row;
}

function usableOption(kind: 'local' | 'cloud') {
  const option = context()
    .voiceGroups.find((group) => group.kind === kind)
    ?.options.find((item) => item.usable);
  if (!option) {
    throw new Error(`no usable ${kind} voice`);
  }
  return option;
}

function textOf(mounted: Mounted<unknown>, id: string): string {
  return (byId(mounted.root, id)?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

function field(mounted: Mounted<unknown>, id: string): HTMLInputElement {
  return byId(mounted.root, id) as HTMLInputElement;
}

async function pick(mounted: Mounted<unknown>, id: string, value: string): Promise<void> {
  const select = field(mounted, id);
  select.value = value;
  select.dispatchEvent(new Event('change', { bubbles: true }));
  await settle(mounted.fixture);
}

async function enter(mounted: Mounted<unknown>, id: string, value: string): Promise<void> {
  type(mounted.root, id, value);
  await settle(mounted.fixture);
}

async function press(mounted: Mounted<unknown>, id: string): Promise<void> {
  click(mounted.root, id);
  await settle(mounted.fixture);
}

function toasts(): string[] {
  return TestBed.inject(ToastService)
    .items()
    .map((item) => item.message);
}

describe('AudiobookVoices', () => {
  it('lists every speaker with its voice, uses and status', async () => {
    const mounted = await open(AudiobookVoices);
    expect(allById(mounted.root, 'ab-spk-table')).toHaveLength(1);
    expect(allById(mounted.root, 'ab-voices')).toHaveLength(1);
    for (const row of context().speakers) {
      expect(byId(mounted.root, `ab-spk-${row.member.id}`)).not.toBeNull();
    }
    expect(field(mounted, 'ab-spk-name-narr').value).toBe('Narrator');
    expect(field(mounted, 'ab-spk-name-narr').disabled).toBe(true);
    expect(field(mounted, `ab-spk-name-${MARO}`).disabled).toBe(true);
    expect(textOf(mounted, 'audiobook-voices-narrator')).toBe('NARRATION');
    expect(textOf(mounted, 'audiobook-voices-kb')).toBe('KB');
    const status = byId(mounted.root, `ab-spk-${TEA_WOMAN}`)?.querySelector(
      '[data-testid="audiobook-voices-status"]',
    );
    expect(status?.textContent?.trim()).toBe('NO VOICE');
    expect(byId(mounted.root, 'ab-lost-ban')).toBeNull();
  });

  it('offers local and cloud voices and keeps the empty option', async () => {
    const mounted = await open(AudiobookVoices);
    const select = field(mounted, `ab-spk-voice-${MARO}`) as unknown as HTMLSelectElement;
    const groups = Array.from(select.querySelectorAll('optgroup')).map((item) => item.label);
    expect(groups).toEqual(['Local TTS', 'Cloud speech']);
    expect(select.options[0].textContent?.trim()).toBe('No voice selected');
    const labels = Array.from(select.options).map((option) => option.textContent ?? '');
    expect(labels.some((label) => label.includes(' · ') && label.includes(' — '))).toBe(true);
  });

  it('assigns and clears a voice', async () => {
    const mounted = await open(AudiobookVoices);
    await pick(mounted, `ab-spk-voice-${TEA_WOMAN}`, '4');
    expect(speaker(TEA_WOMAN)).toMatchObject({ voiceId: 4, status: 'ready' });
    const status = byId(mounted.root, `ab-spk-${TEA_WOMAN}`)?.querySelector(
      '[data-testid="audiobook-voices-status"]',
    );
    expect(status?.textContent?.trim()).toBe('Ready');
    expect((byId(mounted.root, `ab-spk-preview-${TEA_WOMAN}`) as HTMLButtonElement).disabled).toBe(
      false,
    );
    await pick(mounted, `ab-spk-voice-${TEA_WOMAN}`, '');
    expect(speaker(TEA_WOMAN).voiceId).toBeNull();
  });

  it('shows an engine status for an unusable voice and disables preview', async () => {
    const mounted = await open(AudiobookVoices);
    await pick(mounted, `ab-spk-voice-${MARO}`, String(MODEL_VOICE));
    const row = byId(mounted.root, `ab-spk-${MARO}`);
    const badge = row?.querySelector('[data-testid="audiobook-voices-status"] .badge');
    expect(badge?.textContent?.trim()).toBe('MODEL REQUIRED');
    expect(badge?.getAttribute('title')).toContain('model');
    expect((byId(mounted.root, `ab-spk-preview-${MARO}`) as HTMLButtonElement).disabled).toBe(true);
  });

  it('clamps the speed to the allowed range', async () => {
    const mounted = await open(AudiobookVoices);
    await enter(mounted, `ab-spk-speed-${MARO}`, '9');
    expect(speaker(MARO).speed).toBe(1.5);
    expect(field(mounted, `ab-spk-speed-${MARO}`).value).toBe('1.5');
    await enter(mounted, `ab-spk-speed-${MARO}`, '0.1');
    expect(speaker(MARO).speed).toBe(0.6);
    await enter(mounted, `ab-spk-speed-${MARO}`, '0.95');
    expect(speaker(MARO).speed).toBe(0.95);
    await enter(mounted, `ab-spk-speed-${MARO}`, '');
    expect(speaker(MARO).speed).toBe(1);
    expect(field(mounted, `ab-spk-speed-${MARO}`).value).toBe('1');
  });

  it('adds, renames and removes a manual speaker', async () => {
    const mounted = await open(AudiobookVoices);
    await enter(mounted, 'ab-spk-new-input', '  Crier ');
    await press(mounted, 'ab-spk-add-btn');
    const crier = context().speakers.find((row) => row.member.name === 'Crier');
    expect(crier).toBeDefined();
    const id = crier?.member.id ?? '';
    expect(field(mounted, 'ab-spk-new-input').value).toBe('');
    const name = field(mounted, `ab-spk-name-${id}`);
    expect(name.disabled).toBe(false);
    await enter(mounted, `ab-spk-name-${id}`, 'Town crier');
    expect(speaker(id).member.name).toBe('Town crier');
    await enter(mounted, `ab-spk-name-${id}`, '   ');
    expect(speaker(id).member.name).toBe('Town crier');
    expect(field(mounted, `ab-spk-name-${id}`).value).toBe('Town crier');
    expect((byId(mounted.root, `ab-spk-del-${id}`) as HTMLButtonElement).disabled).toBe(false);
    await press(mounted, `ab-spk-del-${id}`);
    expect(context().speakers.some((row) => row.member.id === id)).toBe(false);
    expect(byId(mounted.root, `ab-spk-${id}`)).toBeNull();
  });

  it('rejects a duplicate speaker and ignores an empty name', async () => {
    const mounted = await open(AudiobookVoices);
    const count = context().speakers.length;
    await enter(mounted, 'ab-spk-new-input', 'Narrator');
    await press(mounted, 'ab-spk-add-btn');
    expect(context().speakers).toHaveLength(count);
    expect(toasts()).toContain('A speaker with this name already exists.');
    await enter(mounted, 'ab-spk-new-input', ' ');
    await press(mounted, 'ab-spk-add-btn');
    expect(context().speakers).toHaveLength(count);
  });

  it('adds a speaker with the enter key', async () => {
    const mounted = await open(AudiobookVoices);
    const input = field(mounted, 'ab-spk-new-input');
    input.value = 'Gatekeeper';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await settle(mounted.fixture);
    expect(context().speakers.some((row) => row.member.name === 'Gatekeeper')).toBe(true);
  });

  it('blocks deleting the narrator, knowledgebase and used speakers', async () => {
    const mounted = await open(AudiobookVoices);
    for (const id of ['narr', TEA_WOMAN]) {
      const button = byId(mounted.root, `ab-spk-del-${id}`) as HTMLButtonElement;
      expect(button.disabled).toBe(true);
    }
    expect(byId(mounted.root, 'ab-spk-del-narr')?.getAttribute('title')).toBe(
      'The narrator cannot be deleted',
    );
    expect(byId(mounted.root, `ab-spk-del-${TEA_WOMAN}`)?.getAttribute('title')).toBe(
      'Characters from the Knowledgebase',
    );
  });

  it('previews a local voice without warning and a cloud voice with one', async () => {
    const mounted = await open(AudiobookVoices);
    await pick(mounted, `ab-spk-voice-${MARO}`, String(usableOption('local').voice.id));
    await press(mounted, `ab-spk-preview-${MARO}`);
    await settle(mounted.fixture);
    const player = TestBed.inject(AudiobookPlayerService);
    expect(player.playing()).toBe(true);
    expect(player.current()?.kind).toBe('preview');
    expect(toasts()).toEqual([]);
    const cloud = usableOption('cloud');
    await pick(mounted, `ab-spk-voice-${MARO}`, String(cloud.voice.id));
    expect(speaker(MARO).previewSendsText).toBe(true);
    await press(mounted, `ab-spk-preview-${MARO}`);
    await settle(mounted.fixture);
    expect(toasts()).toEqual([`Preview sends a sample sentence to ${cloud.engineName}.`]);
  });
});
