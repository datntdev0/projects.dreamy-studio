// prettier-ignore
import { Audiobook, AudiobookConfig, AudioRecord, ExportReply, MixField, MixSettings, SegmentRequest, UnitAudio } from '@features/audiobook/audiobook.models';
// prettier-ignore
import { audiobookProgress, clampMix, DEFAULT_MIX, emptyUnitAudio, estimateDuration, MIX_LIMITS, stampNow } from '@features/audiobook/audiobook.rules';
// prettier-ignore
import { PipelineEvent, PipelineSnapshot, PipelineTask, TaskRequest } from '@features/novel/novel.translation.models';
import { ProjectModuleState } from '@features/project/project.models';
import { findBlock, findUnit } from '@features/scripting/scripting.rules';
import { silenceWav } from '@shared/audio/wav';

import { audiobookEnvOf, audiobookVoices, seedAudiobooks } from './audiobook.fixtures';
import { projectModuleStatesFor } from './project-management.fixtures';
import { IpcHandlers } from './screen.mocks';
import { ScriptingState } from './scripting.mocks';

const GENERATE_DELAY_MS = 350;
const MIN_PREVIEW_SECONDS = 2;
const FIRST_PIPELINE_ID = 900;
const AUDIO_KIND = 'audio';

interface EventSink {
  emit?: (event: PipelineEvent) => void;
  onmessage?: (event: PipelineEvent) => void;
}

interface AudioPipeline {
  snapshot: PipelineSnapshot;
  sink: EventSink;
  requests: Record<string, SegmentRequest>;
  cancelled: boolean;
}

interface AudiobookState {
  books: Record<number, Audiobook>;
  pipelines: Map<number, AudioPipeline>;
  nextPipeline: number;
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

function unitOf(book: Audiobook, unitId: string): UnitAudio {
  return book.units[unitId] ?? emptyUnitAudio();
}

function saveConfig(state: AudiobookState, args: Record<string, unknown>): void {
  const projectId = numberArg(args, 'projectId');
  const config = clone(args['config'] as AudiobookConfig);
  state.books[projectId] = {
    ...(state.books[projectId] ?? { units: {}, mix: { ...DEFAULT_MIX } }),
    ...config,
  };
}

function getUnit(state: AudiobookState, args: Record<string, unknown>): UnitAudio {
  const book = state.books[numberArg(args, 'projectId')];
  return clone(book ? unitOf(book, String(args['unitId'])) : emptyUnitAudio());
}

function clampedMix(mix: MixSettings): MixSettings {
  const out = { ...mix };
  for (const field of Object.keys(MIX_LIMITS) as MixField[]) {
    out[field] = clampMix(field, mix[field]);
  }
  return out;
}

function saveMix(state: AudiobookState, args: Record<string, unknown>): MixSettings {
  const book = bookOf(state, args);
  book.mix = clampedMix(args['mix'] as MixSettings);
  return clone(book.mix);
}

function setFlag(state: AudiobookState, args: Record<string, unknown>): AudioRecord {
  const book = bookOf(state, args);
  const unit = unitOf(book, String(args['unitId']));
  const blockId = String(args['blockId']);
  const record = unit.audio[blockId];
  if (!record) {
    throw { code: 'not_found', detail: 'The segment has no audio yet.' };
  }
  const next = { ...record, flag: String(args['flag']) };
  book.units[String(args['unitId'])] = { ...unit, audio: { ...unit.audio, [blockId]: next } };
  return clone(next);
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

function writeSegment(
  state: AudiobookState,
  scripting: ScriptingState,
  args: Record<string, unknown>,
  request: SegmentRequest,
): AudioRecord {
  const book = bookOf(state, args);
  const script = scripting.scripts[numberArg(args, 'projectId')];
  const unit = script ? findUnit(script, String(args['unitId'])) : undefined;
  if (!unit || !findBlock(unit, String(args['blockId']))) {
    throw { code: 'not_found', detail: 'The segment no longer exists.' };
  }
  const record = recordOf(request);
  const audio = unitOf(book, unit.id);
  book.units[unit.id] = { ...audio, audio: { ...audio.audio, [String(args['blockId'])]: record } };
  return clone(record);
}

async function generateSegment(
  state: AudiobookState,
  scripting: ScriptingState,
  args: Record<string, unknown>,
): Promise<AudioRecord> {
  await pause(GENERATE_DELAY_MS);
  return writeSegment(state, scripting, args, args['request'] as SegmentRequest);
}

function segmentAudio(state: AudiobookState, args: Record<string, unknown>): ArrayBuffer {
  const record = unitOf(bookOf(state, args), String(args['unitId'])).audio[String(args['blockId'])];
  if (!record) {
    throw { code: 'not_found', detail: 'The segment has no audio yet.' };
  }
  return silenceWav(record.dur);
}

function exportUnit(state: AudiobookState, args: Record<string, unknown>): ExportReply {
  bookOf(state, args);
  const base = `exports/${numberArg(args, 'projectId')}/${(args['unitIds'] as string[]).join('-')}`;
  return { wav: `${base}.wav`, srt: `${base}.srt` };
}

function previewVoice(args: Record<string, unknown>): ArrayBuffer {
  const seconds = estimateDuration(String(args['text']), Number(args['speed']));
  return silenceWav(Math.max(MIN_PREVIEW_SECONDS, seconds));
}

function emit(pipeline: AudioPipeline, event: PipelineEvent): void {
  const send = pipeline.sink.emit ?? pipeline.sink.onmessage;
  send?.(clone(event));
}

function emitTask(pipeline: AudioPipeline, task: PipelineTask): void {
  const tasks = pipeline.snapshot.tasks;
  pipeline.snapshot.done = tasks.filter((item) => item.status === 'completed').length;
  pipeline.snapshot.failed = tasks.filter((item) => item.status === 'failed').length;
  emit(pipeline, { type: 'task', pipelineId: pipeline.snapshot.id, task });
}

function taskOf(request: TaskRequest, index: number): PipelineTask {
  return {
    id: index + 1,
    chapterId: request.chapterId,
    passage: null,
    segmentId: request.segmentId ?? null,
    status: 'queued',
    progress: 0,
    error: '',
    startedAt: null,
    finishedAt: null,
  };
}

function settleTask(
  state: AudiobookState,
  scripting: ScriptingState,
  pipeline: AudioPipeline,
  task: PipelineTask,
): void {
  const blockId = task.segmentId ?? '';
  const args = { projectId: pipeline.snapshot.projectId, unitId: task.chapterId, blockId };
  try {
    writeSegment(state, scripting, args, pipeline.requests[blockId]);
    task.status = 'completed';
    task.progress = 100;
  } catch (cause) {
    task.status = 'failed';
    task.error = (cause as { detail?: string }).detail ?? String(cause);
  }
  task.finishedAt = stampNow();
}

async function runTask(
  state: AudiobookState,
  scripting: ScriptingState,
  pipeline: AudioPipeline,
  task: PipelineTask,
): Promise<void> {
  task.status = 'running';
  task.startedAt = stampNow();
  emitTask(pipeline, task);
  await pause(GENERATE_DELAY_MS);
  if (!pipeline.cancelled) {
    settleTask(state, scripting, pipeline, task);
    emitTask(pipeline, task);
  }
}

function cancelRest(pipeline: AudioPipeline): void {
  for (const task of pipeline.snapshot.tasks) {
    if (task.status === 'queued' || task.status === 'running') {
      task.status = 'cancelled';
      task.finishedAt = stampNow();
      emitTask(pipeline, task);
    }
  }
}

async function runPipeline(
  state: AudiobookState,
  scripting: ScriptingState,
  pipeline: AudioPipeline,
): Promise<void> {
  pipeline.snapshot.startedAt = stampNow();
  emit(pipeline, { type: 'started', pipeline: pipeline.snapshot });
  for (const task of pipeline.snapshot.tasks) {
    if (pipeline.cancelled) {
      break;
    }
    await runTask(state, scripting, pipeline, task);
  }
  cancelRest(pipeline);
  const snapshot = pipeline.snapshot;
  snapshot.status = pipeline.cancelled ? 'cancelled' : snapshot.failed > 0 ? 'failed' : 'completed';
  snapshot.finishedAt = stampNow();
  state.pipelines.delete(snapshot.id);
  emit(pipeline, { type: 'finished', pipeline: snapshot });
}

function startAudio(
  state: AudiobookState,
  scripting: ScriptingState,
  args: Record<string, unknown>,
): PipelineSnapshot {
  const requests = args['tasks'] as TaskRequest[];
  const params = args['params'] as { requests: Record<string, SegmentRequest> };
  const snapshot: PipelineSnapshot = {
    id: state.nextPipeline,
    novelId: null,
    projectId: numberArg(args, 'projectId'),
    kind: AUDIO_KIND,
    target: '',
    status: 'running',
    total: requests.length,
    done: 0,
    failed: 0,
    createdAt: stampNow(),
    startedAt: null,
    finishedAt: null,
    tasks: requests.map(taskOf),
  };
  state.nextPipeline += 1;
  const pipeline: AudioPipeline = {
    snapshot,
    sink: args['onEvent'] as EventSink,
    requests: clone(params.requests),
    cancelled: false,
  };
  state.pipelines.set(snapshot.id, pipeline);
  setTimeout(() => void runPipeline(state, scripting, pipeline), 0);
  return clone(snapshot);
}

function cancelAudio(state: AudiobookState, args: Record<string, unknown>): boolean | null {
  const pipeline = state.pipelines.get(numberArg(args, 'pipelineId'));
  if (!pipeline) {
    return null;
  }
  pipeline.cancelled = true;
  return true;
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

function fallbackOf(
  fallback: IpcHandlers,
  command: string,
  args: Record<string, unknown>,
): unknown {
  const handler = fallback[command];
  return handler ? handler(args) : undefined;
}

export function audiobookHandlers(
  scripting: ScriptingState,
  base: IpcHandlers['project_modules'],
  fallback: IpcHandlers = {},
): IpcHandlers {
  const state: AudiobookState = {
    books: seedAudiobooks(clone(scripting.scripts)),
    pipelines: new Map(),
    nextPipeline: FIRST_PIPELINE_ID,
  };
  return {
    audiobook_get: (args) => {
      const book = state.books[numberArg(args, 'projectId')];
      return book ? clone(book) : null;
    },
    audiobook_unit_get: (args) => getUnit(state, args),
    audiobook_config_save: (args) => saveConfig(state, args),
    audiobook_mix_save: (args) => saveMix(state, args),
    audiobook_flag_set: (args) => setFlag(state, args),
    audiobook_segment_generate: (args) => generateSegment(state, scripting, args),
    audiobook_segment_audio: (args) => segmentAudio(state, args),
    audiobook_voice_preview: previewVoice,
    audiobook_export: (args) => exportUnit(state, args),
    pipeline_start: (args) =>
      args['kind'] === AUDIO_KIND
        ? startAudio(state, scripting, args)
        : fallbackOf(fallback, 'pipeline_start', args),
    pipeline_cancel: (args) =>
      cancelAudio(state, args) ?? fallbackOf(fallback, 'pipeline_cancel', args),
    project_modules: (args) => modulesOf(state, scripting, base, args),
    library_voice_list: audiobookVoices,
  };
}
