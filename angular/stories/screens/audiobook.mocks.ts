import {
  Audiobook,
  AudiobookConfig,
  AudioRecord,
  ExportReply,
  PreviewReply,
  SegmentRequest,
  UnitAudio,
} from '@features/audiobook/audiobook.models';
import {
  audiobookProgress,
  emptyUnitAudio,
  estimateDuration,
  stampNow,
} from '@features/audiobook/audiobook.rules';
import { ProjectModuleState } from '@features/project/project.models';
import { findBlock, findUnit } from '@features/scripting/scripting.rules';

import { audiobookEnvOf, audiobookVoices, seedAudiobooks } from './audiobook.fixtures';
import { projectModuleStatesFor } from './project-management.fixtures';
import { IpcHandlers } from './screen.mocks';
import { ScriptingState } from './scripting.mocks';

const GENERATE_DELAY_MS = 350;
const MIN_PREVIEW_SECONDS = 2;

interface AudiobookState {
  books: Record<number, Audiobook>;
}

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function numberArg(args: Record<string, unknown>, key: string): number {
  return Number(args[key]);
}

function bookOf(state: AudiobookState, args: Record<string, unknown>): Audiobook {
  const book = state.books[numberArg(args, 'projectId')];
  if (!book) {
    throw { code: 'not_found', detail: 'This project has no audiobook yet.' };
  }
  return book;
}

function saveConfig(state: AudiobookState, args: Record<string, unknown>): void {
  const projectId = numberArg(args, 'projectId');
  const config = clone(args['config'] as AudiobookConfig);
  state.books[projectId] = { ...(state.books[projectId] ?? { units: {} }), ...config };
}

function saveUnit(state: AudiobookState, args: Record<string, unknown>): void {
  const book = bookOf(state, args);
  book.units[String(args['unitId'])] = clone(args['unit'] as UnitAudio);
}

function recordOf(request: SegmentRequest): AudioRecord {
  return {
    text: request.text,
    speaker: request.speaker,
    voice: request.voice,
    speed: request.speed,
    paren: request.paren,
    dur: estimateDuration(request.text, request.speed),
    at: stampNow(),
    flag: '',
  };
}

async function generateSegment(
  state: AudiobookState,
  scripting: ScriptingState,
  args: Record<string, unknown>,
): Promise<AudioRecord> {
  await pause(GENERATE_DELAY_MS);
  const book = bookOf(state, args);
  const script = scripting.scripts[numberArg(args, 'projectId')];
  const unit = script ? findUnit(script, String(args['unitId'])) : undefined;
  if (!unit || !findBlock(unit, String(args['blockId']))) {
    throw { code: 'not_found', detail: 'The segment no longer exists.' };
  }
  const record = recordOf(args['request'] as SegmentRequest);
  const audio = book.units[unit.id] ?? emptyUnitAudio();
  book.units[unit.id] = { ...audio, audio: { ...audio.audio, [String(args['blockId'])]: record } };
  return clone(record);
}

function exportUnit(state: AudiobookState, args: Record<string, unknown>): ExportReply {
  bookOf(state, args);
  const projectId = numberArg(args, 'projectId');
  return { path: `exports/${projectId}/${String(args['unitId'])}.${String(args['format'])}` };
}

function previewVoice(args: Record<string, unknown>): PreviewReply {
  const seconds = estimateDuration(String(args['text']), Number(args['speed']));
  return { dur: Math.max(MIN_PREVIEW_SECONDS, seconds) };
}

function progressOf(
  state: AudiobookState,
  scripting: ScriptingState,
  projectId: number,
): ProjectModuleState | null {
  const book = state.books[projectId];
  const script = scripting.scripts[projectId];
  return book && script ? audiobookProgress(audiobookEnvOf(script, book), script) : null;
}

function modulesOf(
  state: AudiobookState,
  scripting: ScriptingState,
  base: IpcHandlers['project_modules'],
  args: Record<string, unknown>,
): ProjectModuleState[] {
  const rows = (base ? base(args) : projectModuleStatesFor(numberArg(args, 'projectId'))) as
    ProjectModuleState[] | undefined;
  const progress = progressOf(state, scripting, numberArg(args, 'projectId'));
  return (rows ?? []).map((row) => (row.id === 'audiobook' && progress ? { ...progress } : row));
}

export function audiobookHandlers(
  scripting: ScriptingState,
  base: IpcHandlers['project_modules'],
): IpcHandlers {
  const state: AudiobookState = { books: seedAudiobooks(clone(scripting.scripts)) };
  return {
    audiobook_get: (args) => {
      const book = state.books[numberArg(args, 'projectId')];
      return book ? clone(book) : null;
    },
    audiobook_config_save: (args) => saveConfig(state, args),
    audiobook_unit_save: (args) => saveUnit(state, args),
    audiobook_segment_generate: (args) => generateSegment(state, scripting, args),
    audiobook_voice_preview: previewVoice,
    audiobook_export: (args) => exportUnit(state, args),
    project_modules: (args) => modulesOf(state, scripting, base, args),
    library_voice_list: audiobookVoices,
  };
}
