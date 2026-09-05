import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import type { Page } from '@playwright/test';

import { expect, type Ui } from './fixtures.ts';
import { openFromSplash } from './flows.ts';
// prettier-ignore
import { type LibrarySeed, sampleSoundBytes, type SeededLibrary, seedLibraryWorkspace, showLibrary } from './library.ts';
import type { PickerStub } from './picker.ts';
import type { Sandbox } from './sandbox.ts';
import { WORKSPACE_DB_FILE } from './workspaces.ts';

const VOICES_WORKSPACE = 'voices';

export const VOICE_SAMPLE_VI = 'Xin chào, đây là giọng đọc mẫu dành cho câu chuyện của bạn.';
export const UPDATED_TOAST = 'Voice updated.';
export const DUPLICATED_TOAST = 'Voice duplicated.';
export const FAILED_TOAST = 'Could not save the voice. Please try again.';
export const UNDONE_VOICE_WARNING = 'The voice profile will be removed. This cannot be undone.';
export const NOTICE_TEXT =
  'No speech engine is ready yet. Download a local TTS model or connect a cloud provider to generate speech.';
export const PLAY_SAMPLE = 'Play sample';
export const STOP_SAMPLE = 'Stop sample';
export const MIC_DENIED = 'Microphone access was denied or no microphone was found.';

export type MicrophoneMode = 'ok' | 'denied' | 'missing';

export interface SeedVoice {
  readonly name: string;
  readonly description?: string;
  readonly engine?: string;
  readonly engineKind?: 'local' | 'cloud';
  readonly source?: 'preset' | 'clone' | 'design';
  readonly language?: string;
  readonly gender?: 'female' | 'male' | 'neutral';
  readonly preset?: string | null;
  readonly prompt?: string;
  readonly referenceKind?: 'sound' | 'file' | 'recording' | null;
  readonly referenceSoundId?: number | null;
  readonly referenceName?: string;
  readonly sampleText?: string;
  readonly sampleDurationMs?: number | null;
  readonly createdAt: string;
}

export interface VoiceRecord {
  readonly id: number;
  readonly name: string;
  readonly description: string;
  readonly engine: string;
  readonly source: string;
  readonly language: string;
  readonly gender: string;
  readonly preset: string | null;
  readonly prompt: string;
  readonly referenceKind: string | null;
  readonly referenceSoundId: number | null;
  readonly referenceName: string;
  readonly sampleText: string;
  readonly sampleDurationMs: number | null;
}

export interface OpenedVoices {
  readonly folder: string;
  readonly ids: SeededLibrary;
  readonly voices: Readonly<Record<string, number>>;
}

const VOICE_INSERT =
  'INSERT INTO ws_library_voices (name, description, engine, engine_kind, source, language, gender, preset, prompt, reference_kind, reference_sound_id, reference_name, sample_text, sample_duration_ms, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
const VOICE_SELECT =
  'SELECT id, name, description, engine, source, language, gender, preset, prompt, reference_kind AS referenceKind, reference_sound_id AS referenceSoundId, reference_name AS referenceName, sample_text AS sampleText, sample_duration_ms AS sampleDurationMs FROM ws_library_voices ORDER BY id';

function insertVoice(database: DatabaseSync, voice: SeedVoice): number {
  const result = database
    .prepare(VOICE_INSERT)
    .run(
      voice.name,
      voice.description ?? '',
      voice.engine ?? 'vieneu-turbo',
      voice.engineKind ?? 'local',
      voice.source ?? 'preset',
      voice.language ?? 'vi',
      voice.gender ?? 'female',
      voice.source === undefined || voice.source === 'preset' ? (voice.preset ?? 'Mai Anh') : null,
      voice.prompt ?? '',
      voice.referenceKind ?? null,
      voice.referenceSoundId ?? null,
      voice.referenceName ?? '',
      voice.sampleText ?? VOICE_SAMPLE_VI,
      voice.sampleDurationMs === undefined ? 3_500 : voice.sampleDurationMs,
      voice.createdAt,
      voice.createdAt,
    );
  return Number(result.lastInsertRowid);
}

export function voiceDir(folder: string, id: number): string {
  return join(folder, 'library', 'voices', String(id));
}

export function hasReference(folder: string, id: number): boolean {
  return existsSync(join(voiceDir(folder, id), 'reference.wav'));
}

async function writeReferences(
  sandbox: Sandbox,
  folder: string,
  voices: readonly SeedVoice[],
  ids: Readonly<Record<string, number>>,
): Promise<void> {
  for (const voice of voices) {
    if (voice.source !== 'clone') {
      continue;
    }
    const directory = voiceDir(folder, ids[voice.name] ?? 0);
    await mkdir(directory, { recursive: true });
    await writeFile(
      join(directory, 'reference.wav'),
      await sampleSoundBytes(sandbox, `${voice.name}.wav`, 2),
    );
  }
}

export async function seedVoices(
  sandbox: Sandbox,
  folder: string,
  voices: readonly SeedVoice[],
): Promise<Readonly<Record<string, number>>> {
  const database = new DatabaseSync(join(folder, WORKSPACE_DB_FILE));
  const ids: Record<string, number> = {};
  try {
    for (const voice of voices) {
      ids[voice.name] = insertVoice(database, voice);
    }
  } finally {
    database.close();
  }
  await writeReferences(sandbox, folder, voices, ids);
  return ids;
}

export function readVoices(folder: string): VoiceRecord[] {
  const database = new DatabaseSync(join(folder, WORKSPACE_DB_FILE));
  try {
    return database.prepare(VOICE_SELECT).all() as unknown as VoiceRecord[];
  } finally {
    database.close();
  }
}

export async function showVoices(ui: Ui): Promise<void> {
  await ui.main.library.explorer.voices.click();
  await expect(ui.main.library.voices.root).toBeVisible();
}

export async function openVoices(
  ui: Ui,
  picker: PickerStub,
  sandbox: Sandbox,
  voices: readonly SeedVoice[] = [],
  seed: LibrarySeed = {},
): Promise<OpenedVoices> {
  const folder = sandbox.workspace(VOICES_WORKSPACE);
  const ids = await seedLibraryWorkspace(folder, seed);
  const seeded = await seedVoices(sandbox, folder, voices);
  await openFromSplash(ui, picker, folder);
  await showLibrary(ui);
  await showVoices(ui);
  return { folder, ids, voices: seeded };
}

function fakeMicrophone(mode: MicrophoneMode): void {
  const devices = navigator.mediaDevices;
  devices.getUserMedia = async (): Promise<MediaStream> => {
    if (mode === 'denied') {
      throw new DOMException('Permission denied', 'NotAllowedError');
    }
    if (mode === 'missing') {
      throw new DOMException('Requested device not found', 'NotFoundError');
    }
    const context = new AudioContext();
    const oscillator = context.createOscillator();
    const destination = context.createMediaStreamDestination();
    oscillator.connect(destination);
    oscillator.start();
    return destination.stream;
  };
}

export async function useMicrophone(page: Page, mode: MicrophoneMode): Promise<void> {
  await page.evaluate(fakeMicrophone, mode);
}
