import { existsSync } from 'node:fs';
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { expect } from '@playwright/test';

import type { AudiobookMode, AudiobookPage, MixField } from '../pages/audiobook.ts';
import type { ModuleId } from '../pages/project.ts';
import { type ScriptBlock, unitKey } from '../pages/scripting.ts';
import type { AppSession } from './app.ts';
import { type BackendStub, openBackendTab, serverPort } from './backend.ts';
import type { Ui } from './fixtures.ts';
import { openFromSplash } from './flows.ts';
import type { PickerStub } from './picker.ts';
import { projectFolder } from './project.ts';
import type { Sandbox } from './sandbox.ts';
// prettier-ignore
import { addBlock, AUDIO_PROJECT, durationText, generateDefault, idByInputValue, openAudiobook, openScripting, openScriptingWorkspace, paragraphsOf, PROJECT_IDS, TYPE_PAUSE } from './scripting.ts';
import { closeSettings, openGeneralTab, setSlider } from './settings.ts';
import { readVoices, type SeedVoice, seedVoices } from './voices.ts';

export const AUDIO_ID = PROJECT_IDS[AUDIO_PROJECT] ?? 1;

export const NARRATOR_VOICE = 'Narrator An';
export const HERO_VOICE = 'Brother Hai';
export const QUIET_VOICE = 'Quiet Thu';
export const NANO_VOICE = 'Sister Lan';
export const CLOUD_VOICE = 'Cloud Ana';
export const EDGE_VOICE = 'Edge Mai';
export const EDGE_ENGINE = 'Microsoft Edge Read Aloud';
export const NANO_ENGINE = 'VieNeu-TTS v3 Nano';
export const CLOUD_ENGINE = 'ElevenLabs';

export const LIBRARY_VOICES: readonly SeedVoice[] = [
  { name: NARRATOR_VOICE, preset: 'Mai Anh', createdAt: '2026-03-05T08:00:00Z' },
  {
    name: HERO_VOICE,
    gender: 'male',
    preset: 'Hải Đăng',
    createdAt: '2026-03-04T08:00:00Z',
  },
  { name: QUIET_VOICE, preset: 'Kim Thanh', sampleText: '', createdAt: '2026-03-03T08:00:00Z' },
  {
    name: NANO_VOICE,
    engine: 'vieneu-nano',
    gender: 'male',
    preset: 'Minh Quân',
    createdAt: '2026-03-02T08:00:00Z',
  },
  {
    name: CLOUD_VOICE,
    engine: 'elevenlabs',
    engineKind: 'cloud',
    source: 'design',
    prompt: 'female, young adult',
    createdAt: '2026-03-01T08:00:00Z',
  },
  {
    name: EDGE_VOICE,
    engine: 'edge-read-aloud',
    engineKind: 'cloud',
    createdAt: '2026-02-28T08:00:00Z',
  },
];

export const STATE_NONE = 'Not generated';
export const STATE_RUNNING = 'Generating';
export const STATE_DONE = 'Generated';
export const STATE_STALE = 'Needs regeneration';
export const STATE_FLAG = 'Failed';
export const UNIT_DONE = 'Audio generated';
export const UNIT_STALE = 'Needs review';
export const UNIT_DOING = 'In progress';
export const UNIT_NONE = 'Not generated';
export const STATUS_READY = 'Ready';
export const STATUS_NO_VOICE = 'NO VOICE';
export const STATUS_UNUSED = 'UNUSED';
export const STATUS_NOT_CONNECTED = 'NOT CONNECTED';
export const STATUS_MODEL_REQUIRED = 'MODEL REQUIRED';
export const NO_VOICE_OPTION = 'No voice selected';
export const GROUP_LOCAL = 'Local TTS';
export const GROUP_CLOUD = 'Cloud speech';
export const MODEL_ISSUE = `Requires installing the ${NANO_ENGINE} model`;
export const CLOUD_ISSUE = `Requires connecting ${CLOUD_ENGINE}`;
export const REASON_TEXT = 'Speech content changed';
export const REASON_SPEAKER = 'Character changed';
export const REASON_TONE = 'Tone changed';
export const REASON_VOICE = 'Voice changed';
export const REASON_SPEED = 'Voice settings changed';
export const PREVIEW_FALLBACK = 'The lamp keeper climbed the stairs as the tide rolled in.';
export const PREVIEW_FAILED = 'Could not play the voice preview.';
export const SPEAKER_DUPLICATE = 'A speaker with this name already exists.';
export const DELETE_NARRATOR = 'The narrator cannot be deleted';
export const DELETE_KB = 'Characters from the Knowledgebase';
export const DELETE_IN_USE = 'In use';
export const NO_AUDIO = 'This chapter has no audio to listen to yet.';
export const EMPTY_SCRIPT = 'Write the narration script in Scripting before generating audio.';
export const EMPTY_BLANK = 'No segments to voice';
export const FLAG_PLACEHOLDER = 'e.g. Wrong stress on a proper name, pauses too fast';
export const FLAG_TOAST = 'Flagged the segment as failed.';
export const FLAG_DEFAULT = 'Needs re-listening';
export const LOCAL_GROUP_TEXT = 'Local TTS · runs on this machine, no data leaves it';
export const EDGE_GROUP_TEXT = `${EDGE_ENGINE} · the text will be sent to the provider, billed to the account’s credits`;
export const NO_COST = 'Estimated cost: no direct cost. Progress is shown in the Pipelines panel.';
export const EXPORT_HINT = 'Generate every segment before exporting.';
export const STARTED_TOAST = `Started: Audiobook · ${AUDIO_PROJECT}`;
export const COMPLETED_TOAST = `Completed: Audiobook · ${AUDIO_PROJECT}`;
export const SEGMENT_FAILED = 'Could not generate the segment:';
export const BACKEND_REASON = 'The stub refused to synthesize speech';
export const PLAY = 'Play';
export const PAUSE = 'Pause';
export const DEFAULT_MIX: Readonly<Record<MixField, number>> = {
  gap: 0.6,
  intro: 0.8,
  outro: 1.5,
  vol: 0,
};

const GENERATION_TIMEOUT_MS = 90_000;
const SRT_CUE = /^\d+\r?\n\d{2}:\d{2}:\d{2},\d{3} --> \d{2}:\d{2}:\d{2},\d{3}/gm;

export interface AudioRecordFile {
  readonly text: string;
  readonly speaker: string | null;
  readonly voice: number | null;
  readonly speed: number;
  readonly paren: string;
  readonly dur: number;
  readonly flag: string;
}

export interface UnitAudioFile {
  readonly audio: Readonly<Record<string, AudioRecordFile>>;
  readonly mix: Readonly<Record<MixField, number>>;
}

export interface AudiobookFile {
  readonly voices: Readonly<Record<string, { voice: number | null; speed: number }>>;
}

export interface AudiobookSetup {
  readonly folder: string;
  readonly voices: Readonly<Record<string, number>>;
}

interface StoredBlock {
  type?: string;
  who?: string;
}

async function seedLibraryVoices(sandbox: Sandbox, folder: string): Promise<void> {
  await seedVoices(sandbox, folder, LIBRARY_VOICES);
}

function voiceIds(folder: string): Record<string, number> {
  const ids: Record<string, number> = {};
  for (const voice of readVoices(folder)) {
    ids[voice.name] = voice.id;
  }
  return ids;
}

export function paragraph(chapter: number, index: number): string {
  const text = paragraphsOf(chapter)[index];
  if (text === undefined) {
    throw new Error(`chapter ${chapter} has no paragraph ${index}`);
  }
  return text;
}

export async function openDraftedProject(
  ui: Ui,
  picker: PickerStub,
  sandbox: Sandbox,
  chapters: readonly number[] = [1],
): Promise<AudiobookSetup> {
  const folder = await openScriptingWorkspace(
    ui,
    picker,
    sandbox,
    seedLibraryVoices.bind(null, sandbox),
  );
  await openScripting(ui, AUDIO_PROJECT);
  for (const chapter of chapters) {
    await generateDefault(ui, chapter);
  }
  return { folder, voices: voiceIds(folder) };
}

export async function openAudiobookOf(
  ui: Ui,
  picker: PickerStub,
  sandbox: Sandbox,
  chapters: readonly number[] = [1],
): Promise<AudiobookSetup> {
  const setup = await openDraftedProject(ui, picker, sandbox, chapters);
  await openAudiobook(ui, AUDIO_PROJECT);
  return setup;
}

export async function reopenAudiobook(
  ui: Ui,
  app: AppSession,
  picker: PickerStub,
  folder: string,
): Promise<AudiobookPage> {
  await app.restart();
  await expect(ui.splash.root).toBeVisible();
  await openFromSplash(ui, picker, folder);
  await openAudiobook(ui, AUDIO_PROJECT);
  return ui.main.audiobook;
}

export async function switchModule(ui: Ui, moduleId: ModuleId): Promise<void> {
  const tab = ui.main.project.moduleTab(AUDIO_ID, moduleId);
  await tab.click();
  await expect(tab).toHaveAttribute('aria-selected', 'true');
}

export async function addPause(ui: Ui, after: number, seconds: string): Promise<void> {
  const scripting = ui.main.scripting;
  await scripting.block(after).text.click();
  await addBlock(ui, TYPE_PAUSE);
  const pause = scripting.block(after + 1).pause;
  await pause.fill(seconds);
  await pause.blur();
  await expect(pause).toHaveValue(seconds);
}

export async function speakAs(ui: Ui, block: ScriptBlock, name: string): Promise<void> {
  const scripting = ui.main.scripting;
  await block.who.click();
  if (await scripting.menuItem(name).isEnabled()) {
    await scripting.menuItem(name).click();
  } else {
    await block.who.press('Escape');
  }
  await expect(scripting.menu).toBeHidden();
  await expect(block.who).toHaveText(name);
}

export async function showMode(ui: Ui, mode: AudiobookMode): Promise<void> {
  const audiobook = ui.main.audiobook;
  await audiobook.mode(mode).click();
  await expect(audiobook.mode(mode)).toHaveAttribute('aria-pressed', 'true');
}

export async function assignVoice(
  ui: Ui,
  speakerId: string,
  voiceId: number | null,
): Promise<void> {
  const value = voiceId === null ? '' : String(voiceId);
  await showMode(ui, 'voices');
  await ui.main.audiobook.voices.row(speakerId).voice.selectOption(value);
  await expect(ui.main.audiobook.voices.row(speakerId).voice).toHaveValue(value);
}

export async function castVoices(
  ui: Ui,
  cast: Readonly<Record<string, number | null>>,
): Promise<void> {
  for (const [speakerId, voiceId] of Object.entries(cast)) {
    await assignVoice(ui, speakerId, voiceId);
  }
  await showMode(ui, 'prod');
}

export async function setSpeed(ui: Ui, speakerId: string, value: string): Promise<void> {
  const speed = ui.main.audiobook.voices.row(speakerId).speed;
  await speed.fill(value);
  await speed.blur();
}

export async function expectEveryState(ui: Ui, state: string, timeout = 10_000): Promise<void> {
  const states = ui.main.audiobook.states;
  await expect(states.first()).toBeVisible();
  await expect(states.filter({ hasNotText: state })).toHaveCount(0, { timeout });
}

export async function startGeneration(ui: Ui): Promise<void> {
  const dialog = ui.main.audiobook.generateDialog;
  await ui.main.audiobook.generateAll.click();
  await expect(dialog.panel).toBeVisible();
  await dialog.go.click();
  await expect(dialog.panel).toBeHidden();
}

export async function generateChapter(ui: Ui): Promise<void> {
  await startGeneration(ui);
  await expectEveryState(ui, STATE_DONE, GENERATION_TIMEOUT_MS);
}

export async function regenerateSegment(ui: Ui, index: number): Promise<void> {
  const segment = ui.main.audiobook.segment(index);
  await segment.regenerate.click();
  await expect(segment.state).toHaveText(STATE_DONE, { timeout: GENERATION_TIMEOUT_MS });
}

export async function showInspector(ui: Ui): Promise<void> {
  const audiobook = ui.main.audiobook;
  if (await audiobook.inspectorTab.isVisible()) {
    await audiobook.inspectorTab.click();
  }
}

export function speakerIdOf(ui: Ui, name: string): Promise<string> {
  return idByInputValue(ui.main.audiobook.voices.body, name, 'ab-spk-name-');
}

export async function setPipelineLimits(ui: Ui, pipelines: number, tasks: number): Promise<void> {
  const general = ui.main.settings.general;
  await openGeneralTab(ui, 'pipelines');
  await setSlider(general.maxPipelines, pipelines);
  await setSlider(general.maxTasks, tasks);
  await expect(general.maxPipelinesValue).toHaveText(String(pipelines));
  await expect(general.maxTasksValue).toHaveText(String(tasks));
  await closeSettings(ui);
}

export async function stopBackend(ui: Ui, backend: BackendStub): Promise<void> {
  await openBackendTab(ui, 'general');
  await backend.kill(await serverPort(ui));
  await closeSettings(ui);
}

function audiobookDir(folder: string): string {
  return join(projectFolder(folder, AUDIO_ID), 'audiobook');
}

async function readJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T;
  } catch {
    return null;
  }
}

export function readAudiobook(folder: string): Promise<AudiobookFile | null> {
  return readJson<AudiobookFile>(join(audiobookDir(folder), 'audiobook.json'));
}

export function readUnitAudio(folder: string, position: number): Promise<UnitAudioFile | null> {
  return readJson<UnitAudioFile>(join(audiobookDir(folder), 'units', `${unitKey(position)}.json`));
}

export async function savedVoiceOf(folder: string, speakerId: string): Promise<number | null> {
  return (await readAudiobook(folder))?.voices[speakerId]?.voice ?? null;
}

export async function savedMix(
  folder: string,
  position: number,
): Promise<Readonly<Record<MixField, number>> | null> {
  return (await readUnitAudio(folder, position))?.mix ?? null;
}

export async function savedFlags(folder: string, position: number): Promise<string[]> {
  const unit = await readUnitAudio(folder, position);
  return Object.values(unit?.audio ?? {}).map((record) => record.flag);
}

export function recordedSeconds(unit: UnitAudioFile | null): number {
  let seconds = 0;
  for (const record of Object.values(unit?.audio ?? {})) {
    seconds += record.dur;
  }
  return seconds;
}

export function chapterEstimate(unit: UnitAudioFile | null, segments: number): string {
  const mix = unit?.mix ?? DEFAULT_MIX;
  const silence = Math.max(0, segments - 1) * mix.gap + mix.intro + mix.outro;
  return `≈ ${durationText(recordedSeconds(unit) + silence)}`;
}

export function exportsDir(folder: string): string {
  return join(audiobookDir(folder), 'exports');
}

export async function exportedFiles(folder: string): Promise<string[]> {
  const directory = exportsDir(folder);
  return existsSync(directory) ? (await readdir(directory)).sort() : [];
}

function hasFormat(format: string, name: string): boolean {
  return name.endsWith(`.${format}`);
}

export async function exportsOf(folder: string, format: string): Promise<string[]> {
  return (await exportedFiles(folder)).filter(hasFormat.bind(null, format));
}

export async function exportSize(folder: string, name: string): Promise<number> {
  return (await stat(join(exportsDir(folder), name))).size;
}

export async function srtCueCount(folder: string, name: string): Promise<number> {
  const text = await readFile(join(exportsDir(folder), name), 'utf8');
  return text.match(SRT_CUE)?.length ?? 0;
}

function orphanBlock(block: StoredBlock): StoredBlock {
  return block.type === 'dialogue' ? { ...block, who: 'ghost-speaker' } : block;
}

export async function orphanDialogues(folder: string, position: number): Promise<void> {
  const path = join(
    projectFolder(folder, AUDIO_ID),
    'scripting',
    'units',
    `${unitKey(position)}.json`,
  );
  const unit = JSON.parse(await readFile(path, 'utf8')) as { blocks?: StoredBlock[] };
  const blocks = (unit.blocks ?? []).map(orphanBlock);
  await writeFile(path, JSON.stringify({ ...unit, blocks }, null, 2));
}
