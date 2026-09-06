import { LibraryVoice, VoiceEngineKind } from '../library/library.voices.models';
import { engineName, voiceById } from '../library/library.voices.rules';
import { CastMember, Script, ScriptBlock, ScriptUnit } from '../scripting/scripting.models';
import { findUnit, speakerClass } from '../scripting/scripting.rules';
import {
  Audiobook,
  AudiobookContext,
  AudiobookInspector,
  AudiobookView,
  AudioEnv,
  ChapterPanel,
  EngineSummary,
  GenerationJob,
  ListRow,
  RailRow,
  RailSummary,
  SegmentDisplayState,
  SegmentRow,
  SegmentState,
  SpeakerDeleteBlock,
  SpeakerRow,
  SpeakerStatus,
  UnitStat,
  VoiceAvailability,
  VoiceOption,
  VoiceOptionGroup,
} from './audiobook.models';
import {
  blockersOf,
  countLostDialogues,
  defaultUnitOf,
  isUsable,
  isVoiced,
  segmentInfo,
  speakerUseCount,
  speakerVoiceOf,
  summaryOf,
  todoBlocks,
  unitAudioOf,
  unitStat,
  voiceIssueOf,
  voicingOf,
} from './audiobook.rules';

export interface ContextInput {
  projectId: number;
  script: Script;
  cast: CastMember[];
  book: Audiobook;
  view: AudiobookView;
  voices: LibraryVoice[];
  availability: VoiceAvailability;
  jobs: GenerationJob[];
}

function displayStateOf(
  jobs: GenerationJob[],
  blockId: string,
  state: SegmentState,
): SegmentDisplayState {
  const job = jobs.find((item) => item.blockId === blockId);
  if (!job) {
    return state;
  }
  return job.active ? 'generating' : 'queued';
}

function segmentRowOf(
  env: AudioEnv,
  unit: ScriptUnit,
  jobs: GenerationJob[],
  block: ScriptBlock,
  n: number,
): SegmentRow {
  const { speaker, voice, speed } = voicingOf(env, block);
  const info = segmentInfo(env, unit, block);
  return {
    block,
    n,
    speaker,
    speakerClass: speakerClass(speaker ?? undefined),
    voice,
    speed,
    state: displayStateOf(jobs, block.id, info.state),
    record: info.record,
    reasons: info.reasons,
  };
}

export function segmentRowsOf(
  env: AudioEnv,
  unit: ScriptUnit,
  jobs: GenerationJob[],
): SegmentRow[] {
  return (unit.blocks ?? [])
    .filter(isVoiced)
    .map((block, index) => segmentRowOf(env, unit, jobs, block, index + 1));
}

export function listRowsOf(unit: ScriptUnit | null, segments: SegmentRow[]): ListRow[] {
  const rows: ListRow[] = [];
  for (const block of unit?.blocks ?? []) {
    const segment = segments.find((row) => row.block.id === block.id);
    if (segment) {
      rows.push({ kind: 'segment', segment });
    } else if (block.type === 'pause') {
      rows.push({ kind: 'pause', pause: { block, seconds: block.ms / 1000 } });
    }
  }
  return rows;
}

function voiceOptionOf(voice: LibraryVoice, availability: VoiceAvailability): VoiceOption {
  const issue = voiceIssueOf(voice, availability);
  return {
    voice,
    usable: issue === null,
    issue,
    engineName: engineName(availability.engines, voice.engine),
  };
}

function groupOf(
  kind: VoiceEngineKind,
  voices: LibraryVoice[],
  availability: VoiceAvailability,
): VoiceOptionGroup {
  return {
    kind,
    options: voices
      .filter((voice) => voice.engineKind === kind)
      .map((voice) => voiceOptionOf(voice, availability)),
  };
}

export function voiceGroupsOf(
  voices: LibraryVoice[],
  availability: VoiceAvailability,
): VoiceOptionGroup[] {
  return [groupOf('local', voices, availability), groupOf('cloud', voices, availability)];
}

function deleteBlockOf(member: CastMember, uses: number): SpeakerDeleteBlock | null {
  if (member.kind === 'narrator') {
    return 'narrator';
  }
  if (member.kind === 'kb') {
    return 'kb';
  }
  return uses > 0 ? 'inUse' : null;
}

function statusOf(voice: LibraryVoice | null, issue: unknown, uses: number): SpeakerStatus {
  if (!voice) {
    return uses > 0 ? 'noVoice' : 'unused';
  }
  return issue ? 'engine' : 'ready';
}

function speakerRowOf(input: ContextInput, member: CastMember): SpeakerRow {
  const { book, voices, availability, script } = input;
  const config = speakerVoiceOf(book, member.id);
  const voice = config.voice === null ? null : voiceById(voices, config.voice);
  const issue = voice ? voiceIssueOf(voice, availability) : null;
  const uses = speakerUseCount(script, member);
  return {
    member,
    speakerClass: speakerClass(member),
    voice,
    voiceId: config.voice,
    speed: config.speed,
    uses,
    status: statusOf(voice, issue, uses),
    issue,
    nameEditable: member.kind === 'extra',
    canPreview: isUsable(voice, availability),
    previewSendsText: voice?.engineKind === 'cloud',
    engineName: voice ? engineName(availability.engines, voice.engine) : null,
    deleteBlock: deleteBlockOf(member, uses),
  };
}

function railOf(script: Script, stats: UnitStat[], activeId: string | null): RailRow[] {
  return script.units.map((unit, index) => ({
    unit,
    active: unit.id === activeId,
    stat: stats[index],
  }));
}

function railSummaryOf(script: Script, stats: UnitStat[]): RailSummary {
  const done = stats.filter((stat) => stat.state === 'done').length;
  const total = script.units.length;
  return { done, total, percent: total ? Math.round((done / total) * 100) : 0 };
}

function engineSummaryOf(availability: VoiceAvailability): EngineSummary {
  const ready = availability.engines.filter((engine) => engine.ready);
  return {
    localModels: ready.filter((engine) => engine.kind === 'local').length,
    cloudProviders: ready.filter((engine) => engine.kind === 'cloud').length,
  };
}

function inspectorOf(view: AudiobookView): AudiobookInspector {
  return view.mode === 'voices' ? 'voices' : 'chapter';
}

function chapterPanelOf(
  book: Audiobook,
  unit: ScriptUnit | null,
  blockers: AudiobookContext['blockers'],
): ChapterPanel {
  return {
    mix: unit?.blocks ? book.mix : null,
    blockers,
  };
}

export function buildContext(input: ContextInput): AudiobookContext {
  const { projectId, script, cast, book, view, voices, availability } = input;
  const env: AudioEnv = { book, cast, voices };
  const stats = script.units.map((unit) => unitStat(env, unit));
  const unit = findUnit(script, view.unit) ?? defaultUnitOf(script, stats);
  const stat = unit ? stats[script.units.indexOf(unit)] : null;
  const audio = unit ? unitAudioOf(book, unit.id) : null;
  const jobs = input.jobs.filter((job) => job.unitId === unit?.id);
  const running = jobs.map((job) => job.blockId);
  const hasBlocks = !!unit && unit.blocks !== null;
  const segments = unit && hasBlocks ? segmentRowsOf(env, unit, jobs) : [];
  const todo = unit && hasBlocks ? todoBlocks(env, unit) : [];
  const blockers = unit && hasBlocks ? blockersOf(env, availability, unit) : [];
  return {
    projectId,
    script,
    config: script.cfg,
    unitKind: script.cfg.unit,
    view,
    inspector: inspectorOf(view),
    cast,
    book,
    voices,
    availability,
    unit,
    audio,
    running,
    generating: running.length > 0,
    stat,
    summary: stat && audio ? summaryOf(stat, book.mix, running.length) : null,
    rail: railOf(script, stats, unit ? unit.id : null),
    railSummary: railSummaryOf(script, stats),
    segments,
    rows: listRowsOf(unit, segments),
    changed: segments.filter((row) => row.state === 'stale').length,
    todo,
    blockers,
    canGenerate: hasBlocks && blockers.length === 0 && todo.length > 0 && running.length === 0,
    canPlay: segments.some((row) => row.record !== null),
    speakers: cast.map((member) => speakerRowOf(input, member)),
    lostDialogues: countLostDialogues(script, cast),
    voiceGroups: voiceGroupsOf(voices, availability),
    engines: engineSummaryOf(availability),
    chapterPanel: chapterPanelOf(book, unit, blockers),
  };
}
