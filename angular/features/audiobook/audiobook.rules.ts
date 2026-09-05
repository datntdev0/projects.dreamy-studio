import { durationText } from '../library/library.rules';
import { LibraryVoice } from '../library/library.voices.models';
import { engineName, engineReady, voiceById } from '../library/library.voices.rules';
import { ProjectModuleState } from '../project/project.models';
import { CastMember, Script, ScriptBlock, ScriptUnit } from '../scripting/scripting.models';
import { countWords } from '../scripting/scripting.rules';
// prettier-ignore
import { Audiobook, AudiobookMessage, AudiobookView, AudioEnv, AudioRecord, Blocker, MetaState, MixField, MixSettings, SegmentInfo, SegmentState, SpeakerVoice, StaleReason, UnitAudio, UnitAudioState, UnitStat, UnitSummary, VoiceAvailability, VoiceIssue, Voicing } from './audiobook.models';

export const VOICED_TYPES: ScriptBlock['type'][] = ['heading', 'narration', 'dialogue'];

export const NARRATOR_KIND = 'narrator';

export const SPEED_MIN = 0.6;

export const SPEED_MAX = 1.5;

export const SPEED_DEFAULT = 1;

export const SPEED_STEP = 0.05;

export const WORDS_PER_SECOND = 2.6;

export const MIN_SEGMENT_SECONDS = 0.8;

export const SEGMENT_PADDING_SECONDS = 0.25;

export const COST_PER_CHAR = 0.000016;

export const TITLE_EXCERPT = 48;

export const DEFAULT_MIX: MixSettings = { gap: 0.6, intro: 0.8, outro: 1.5, vol: 0 };

export const MIX_LIMITS: Record<MixField, [number, number]> = {
  gap: [0, 5],
  intro: [0, 10],
  outro: [0, 10],
  vol: [-12, 6],
};

export const REASON_KEYS: Record<StaleReason, AudiobookMessage['key']> = {
  text: 'audiobook.reason.text',
  speaker: 'audiobook.reason.speaker',
  voice: 'audiobook.reason.voice',
  speed: 'audiobook.reason.speed',
  tone: 'audiobook.reason.tone',
};

export function emptyView(): AudiobookView {
  return { unit: null, mode: 'prod', goto: null };
}

export function emptyBook(): Audiobook {
  return { voices: {}, units: {} };
}

export function emptyUnitAudio(): UnitAudio {
  return { audio: {}, mix: { ...DEFAULT_MIX }, meta: null };
}

export function unitAudioOf(book: Audiobook, unitId: string): UnitAudio {
  return book.units[unitId] ?? emptyUnitAudio();
}

export function isVoiced(block: ScriptBlock): boolean {
  return VOICED_TYPES.includes(block.type) && block.text.trim() !== '';
}

export function voicedBlocks(unit: ScriptUnit): ScriptBlock[] {
  return (unit.blocks ?? []).filter(isVoiced);
}

export function narratorOf(cast: CastMember[]): CastMember | null {
  return cast.find((member) => member.kind === NARRATOR_KIND) ?? null;
}

export function speakerFor(cast: CastMember[], block: ScriptBlock): CastMember | null {
  if (block.type === 'dialogue') {
    return cast.find((member) => member.id === block.who) ?? null;
  }
  return narratorOf(cast);
}

export function voiceIssueOf(
  voice: LibraryVoice,
  availability: VoiceAvailability,
): VoiceIssue | null {
  if (engineReady(availability.engines, voice.engine)) {
    return null;
  }
  const kind = voice.engineKind === 'local' ? 'model' : 'cloud';
  return { kind, engine: engineName(availability.engines, voice.engine) };
}

export function isUsable(voice: LibraryVoice | null, availability: VoiceAvailability): boolean {
  return voice !== null && voiceIssueOf(voice, availability) === null;
}

export function voicingOf(env: AudioEnv, block: ScriptBlock): Voicing {
  const speaker = speakerFor(env.cast, block);
  const config = speaker ? env.book.voices[speaker.id] : undefined;
  const voice =
    config && config.voice !== null && config.voice !== undefined
      ? voiceById(env.voices, config.voice)
      : null;
  return { speaker, voice, speed: config ? config.speed : SPEED_DEFAULT };
}

export function estimateDuration(text: string, speed: number): number {
  const seconds = countWords(text) / WORDS_PER_SECOND / (speed || SPEED_DEFAULT);
  return Math.max(MIN_SEGMENT_SECONDS, seconds + SEGMENT_PADDING_SECONDS);
}

export function staleReasons(
  env: AudioEnv,
  block: ScriptBlock,
  record: AudioRecord,
): StaleReason[] {
  const { speaker, voice, speed } = voicingOf(env, block);
  const changes: [StaleReason, boolean][] = [
    ['text', record.text !== block.text],
    ['speaker', record.speaker !== (speaker ? speaker.id : null)],
    ['voice', record.voice !== (voice ? voice.id : null)],
    ['speed', record.speed !== speed],
    ['tone', (record.paren || '') !== (block.paren || '')],
  ];
  return changes.filter(([, changed]) => changed).map(([reason]) => reason);
}

export function segmentInfo(env: AudioEnv, unit: ScriptUnit, block: ScriptBlock): SegmentInfo {
  const record = unitAudioOf(env.book, unit.id).audio[block.id] ?? null;
  if (!record) {
    return { state: 'none', record: null, reasons: [] };
  }
  const reasons = staleReasons(env, block, record);
  let state: SegmentState = reasons.length > 0 ? 'stale' : 'done';
  if (record.flag) {
    state = 'flag';
  }
  return { state, record, reasons };
}

function metaStateOf(meta: MetaState | null): UnitAudioState {
  return meta ?? 'none';
}

function unitStateOf(stat: Omit<UnitStat, 'state' | 'meta'>): UnitAudioState {
  if (stat.total === 0 || (stat.done === 0 && stat.stale === 0)) {
    return 'none';
  }
  if (stat.done === stat.total) {
    return 'done';
  }
  return stat.stale > 0 ? 'stale' : 'doing';
}

export function unitStat(env: AudioEnv, unit: ScriptUnit): UnitStat {
  if (!unit.blocks) {
    const meta = metaStateOf(unitAudioOf(env.book, unit.id).meta);
    return { total: 0, done: 0, stale: 0, none: 0, dur: 0, state: meta, meta: true };
  }
  const base = { total: 0, done: 0, stale: 0, none: 0, dur: 0 };
  for (const block of voicedBlocks(unit)) {
    const info = segmentInfo(env, unit, block);
    base.total += 1;
    base.done += info.state === 'done' ? 1 : 0;
    base.none += info.state === 'none' ? 1 : 0;
    base.stale += info.state === 'stale' || info.state === 'flag' ? 1 : 0;
    base.dur += info.record ? info.record.dur : 0;
  }
  return { ...base, state: unitStateOf(base), meta: false };
}

export function unitDuration(stat: UnitStat, mix: MixSettings): number {
  return stat.dur + Math.max(0, stat.total - 1) * mix.gap + mix.intro + mix.outro;
}

export function summaryOf(stat: UnitStat, mix: MixSettings, running: number): UnitSummary {
  return {
    segments: stat.total,
    generated: stat.done,
    running,
    pending: stat.stale + stat.none,
    duration: unitDuration(stat, mix),
  };
}

export function todoBlocks(env: AudioEnv, unit: ScriptUnit): ScriptBlock[] {
  return voicedBlocks(unit).filter((block) => segmentInfo(env, unit, block).state !== 'done');
}

function lostDialogues(cast: CastMember[], blocks: ScriptBlock[]): ScriptBlock[] {
  return blocks.filter(
    (block) => block.type === 'dialogue' && !cast.some((member) => member.id === block.who),
  );
}

export function countLostDialogues(script: Script, cast: CastMember[]): number {
  return script.units.reduce(
    (sum, unit) =>
      sum +
      lostDialogues(
        cast,
        (unit.blocks ?? []).filter((block) => block.type === 'dialogue'),
      ).length,
    0,
  );
}

function speakerBlocker(
  env: AudioEnv,
  availability: VoiceAvailability,
  speaker: CastMember,
): Blocker | null {
  const config = env.book.voices[speaker.id];
  const voice = config && config.voice !== null ? voiceById(env.voices, config.voice) : null;
  if (!voice) {
    return {
      kind: 'voice',
      speakerId: speaker.id,
      blockId: null,
      message: { key: 'audiobook.blocker.voice', params: { speaker: speaker.name } },
    };
  }
  const issue = voiceIssueOf(voice, availability);
  if (!issue) {
    return null;
  }
  return {
    kind: 'engine',
    speakerId: speaker.id,
    blockId: null,
    message: {
      key: `audiobook.blocker.engine.${issue.kind}`,
      params: { speaker: speaker.name, voice: voice.name, engine: issue.engine },
    },
  };
}

export function blockersOf(
  env: AudioEnv,
  availability: VoiceAvailability,
  unit: ScriptUnit,
): Blocker[] {
  const out: Blocker[] = [];
  const segments = voicedBlocks(unit);
  const lost = lostDialogues(env.cast, segments);
  if (lost.length > 0) {
    out.push({
      kind: 'who',
      speakerId: null,
      blockId: lost[0].id,
      message: { key: 'audiobook.blocker.who', params: { count: lost.length } },
    });
  }
  const seen = new Set<string>();
  for (const block of segments) {
    const speaker = speakerFor(env.cast, block);
    if (speaker && !seen.has(speaker.id)) {
      seen.add(speaker.id);
      const found = speakerBlocker(env, availability, speaker);
      if (found) {
        out.push(found);
      }
    }
  }
  return out;
}

export function speakerUseCount(script: Script, speaker: CastMember): number {
  let count = 0;
  for (const unit of script.units) {
    for (const block of unit.blocks ?? []) {
      count += belongsTo(speaker, block) ? 1 : 0;
    }
  }
  return count;
}

function belongsTo(speaker: CastMember, block: ScriptBlock): boolean {
  if (speaker.kind === NARRATOR_KIND) {
    return block.type === 'heading' || block.type === 'narration';
  }
  return block.type === 'dialogue' && block.who === speaker.id;
}

export function clampSpeed(value: number): number {
  const parsed = Number.isFinite(value) && value !== 0 ? value : SPEED_DEFAULT;
  const stepped = Math.round(parsed / SPEED_STEP) * SPEED_STEP;
  return Number(Math.max(SPEED_MIN, Math.min(SPEED_MAX, stepped)).toFixed(2));
}

export function clampMix(field: MixField, value: number): number {
  const [low, high] = MIX_LIMITS[field];
  return Math.max(low, Math.min(high, Number.isFinite(value) ? value : 0));
}

export function speakerVoiceOf(book: Audiobook, speakerId: string): SpeakerVoice {
  return book.voices[speakerId] ?? { voice: null, speed: SPEED_DEFAULT };
}

export function audiobookProgress(env: AudioEnv, script: Script): ProjectModuleState {
  const stats = script.units.map((unit) => unitStat(env, unit));
  const done = stats.filter((stat) => stat.state === 'done').length;
  const stale = stats.filter((stat) => stat.state === 'stale').length;
  const any = stats.some((stat) => stat.state !== 'none');
  const total = stats.length;
  let state: ProjectModuleState['state'] = any ? 'doing' : 'idle';
  if (stale > 0) {
    state = 'stale';
  } else if (total > 0 && done === total) {
    state = 'done';
  }
  const note = `${done}/${total} ${script.cfg.unit}s${stale ? ` · ${stale} need review` : ''}`;
  return { id: 'audiobook', state, done, total, note };
}

export function defaultUnitOf(script: Script, stats: UnitStat[]): ScriptUnit | null {
  const pending = script.units.findIndex(
    (unit, index) => unit.blocks !== null && stats[index].state !== 'done',
  );
  if (pending >= 0) {
    return script.units[pending];
  }
  return script.units.find((unit) => unit.blocks !== null) ?? script.units[0] ?? null;
}

export function formatSeconds(seconds: number): string {
  return durationText(Math.round(seconds) * 1000);
}

export function formatCost(value: number): string {
  return `≈ $${value.toFixed(3)}`;
}

export function excerptTitle(unitTitle: string, text: string): string {
  const cut = text.length > TITLE_EXCERPT ? `${text.slice(0, TITLE_EXCERPT)}…` : text;
  return `${unitTitle} · ${cut}`;
}

export function stampNow(): string {
  return new Date().toISOString();
}
