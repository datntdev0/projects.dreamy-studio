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
  LexRow,
  ListRow,
  RailRow,
  RailSummary,
  SegmentFilter,
  SegmentPanel,
  SegmentRow,
  SpeakerDeleteBlock,
  SpeakerRow,
  SpeakerStatus,
  SymbolRow,
  UnitAudio,
  UnitStat,
  VoiceAvailability,
  VoiceOption,
  VoiceOptionGroup,
} from './audiobook.models';
import {
  affectedCount,
  blockersOf,
  countLostDialogues,
  defaultUnitOf,
  highlightParts,
  isUsable,
  isVoiced,
  lexHits,
  occurrencesOf,
  readText,
  segmentInfo,
  speakerUseCount,
  speakerVoiceOf,
  summaryOf,
  SYMBOL_DEFS,
  todoBlocks,
  unitAudioOf,
  unitStat,
  voiceIssueOf,
  voicingOf,
} from './audiobook.rules';

export const DEFAULT_TEST_TEXT =
  'Wren Aldous climbs three hundred twelve steps of the Lantern Tower at Harrowmere.';

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

function segmentRowOf(
  env: AudioEnv,
  unit: ScriptUnit,
  running: string[],
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
    state: running.includes(block.id) ? 'running' : info.state,
    record: info.record,
    reasons: info.reasons,
    parts: highlightParts(env.book.lex, block.text),
    readText: readText(env.book.lex, block.text),
  };
}

export function segmentRowsOf(env: AudioEnv, unit: ScriptUnit, running: string[]): SegmentRow[] {
  return (unit.blocks ?? [])
    .filter(isVoiced)
    .map((block, index) => segmentRowOf(env, unit, running, block, index + 1));
}

export function passesFilter(filter: SegmentFilter, row: SegmentRow): boolean {
  if (filter === 'todo') {
    return row.state !== 'done';
  }
  return filter === 'all' || row.state === filter;
}

export function listRowsOf(
  unit: ScriptUnit | null,
  segments: SegmentRow[],
  filter: SegmentFilter,
): ListRow[] {
  const rows: ListRow[] = [];
  for (const block of unit?.blocks ?? []) {
    const segment = segments.find((row) => row.block.id === block.id);
    if (segment && passesFilter(filter, segment)) {
      rows.push({ kind: 'segment', segment });
    } else if (!segment && filter === 'all' && block.type === 'pause') {
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

function lexRowsOf(script: Script, book: Audiobook): LexRow[] {
  return book.lex.map((rule) => ({ rule, occurrences: occurrencesOf(script, rule.term) }));
}

function symbolRowsOf(book: Audiobook): SymbolRow[] {
  return SYMBOL_DEFS.map((def) => ({
    id: def.id,
    sym: def.sym,
    ruleKey: def.ruleKey,
    on: book.symbols.find((item) => item.id === def.id)?.on ?? false,
  }));
}

function railOf(script: Script, stats: UnitStat[], activeId: string | null): RailRow[] {
  return script.units.map((unit, index) => ({
    unit,
    active: unit.id === activeId,
    locked: unit.status === 'locked',
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

function inspectorOf(view: AudiobookView, selected: SegmentRow | null): AudiobookInspector {
  if (view.mode !== 'prod') {
    return view.mode;
  }
  return selected ? 'segment' : 'chapter';
}

function testTextOf(view: AudiobookView, unit: ScriptUnit | null, book: Audiobook): string {
  if (view.test) {
    return view.test;
  }
  const sample = (unit?.blocks ?? []).find(
    (block) => block.type === 'narration' && lexHits(book.lex, block.text).length > 0,
  );
  return sample ? sample.text : DEFAULT_TEST_TEXT;
}

function segmentPanelOf(row: SegmentRow | null, input: ContextInput): SegmentPanel | null {
  if (!row) {
    return null;
  }
  const issue = row.voice ? voiceIssueOf(row.voice, input.availability) : null;
  return {
    row,
    changed: row.readText !== row.block.text,
    engineName: row.voice ? engineName(input.availability.engines, row.voice.engine) : null,
    usable: isUsable(row.voice, input.availability),
    issue,
    canFlag: row.record !== null && !row.record.flag,
    canClearFlag: row.record !== null && row.record.flag !== '',
  };
}

function chapterPanelOf(
  stat: UnitStat | null,
  audio: UnitAudio | null,
  unit: ScriptUnit | null,
  blockers: AudiobookContext['blockers'],
): ChapterPanel {
  return {
    locked: unit?.status === 'locked',
    total: stat ? stat.total : 0,
    generated: stat ? stat.done : 0,
    attention: stat ? stat.stale + stat.none : 0,
    duration: stat ? stat.dur : 0,
    mix: unit?.blocks && audio ? audio.mix : null,
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
  const running = input.jobs.filter((job) => job.unitId === unit?.id).map((job) => job.blockId);
  const hasBlocks = !!unit && unit.blocks !== null;
  const segments = unit && hasBlocks ? segmentRowsOf(env, unit, running) : [];
  const todo = unit && hasBlocks ? todoBlocks(env, unit) : [];
  const blockers = unit && hasBlocks ? blockersOf(env, availability, unit, script.cfg.unit) : [];
  const selected = segments.find((row) => row.block.id === view.sel) ?? null;
  const testText = testTextOf(view, unit, book);
  const affected = affectedCount(env, script);
  return {
    projectId,
    script,
    config: script.cfg,
    unitKind: script.cfg.unit,
    view,
    inspector: inspectorOf(view, selected),
    cast,
    book,
    voices,
    availability,
    unit,
    locked: unit?.status === 'locked',
    audio,
    running,
    generating: running.length > 0,
    stat,
    summary: stat && audio ? summaryOf(stat, audio.mix, running.length) : null,
    rail: railOf(script, stats, unit ? unit.id : null),
    railSummary: railSummaryOf(script, stats),
    segments,
    rows: listRowsOf(unit, segments, view.filter),
    todo,
    blockers,
    canGenerate: hasBlocks && blockers.length === 0 && todo.length > 0 && running.length === 0,
    canPlay: segments.some((row) => row.record !== null),
    selected,
    speakers: cast.map((member) => speakerRowOf(input, member)),
    lostDialogues: countLostDialogues(script, cast),
    voiceGroups: voiceGroupsOf(voices, availability),
    lexicon: lexRowsOf(script, book),
    symbols: symbolRowsOf(book),
    testText,
    testOutput: readText(book.lex, testText),
    affected,
    engines: engineSummaryOf(availability),
    chapterPanel: chapterPanelOf(stat, audio, unit, blockers),
    segmentPanel: segmentPanelOf(selected, input),
    rulesPanel: {
      pronunciations: book.lex.length,
      activeSymbols: book.symbols.filter((item) => item.on).length,
      affected,
    },
  };
}
