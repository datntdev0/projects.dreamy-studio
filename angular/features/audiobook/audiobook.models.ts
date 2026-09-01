import { LanguageKey } from '@shared/language/language.models';

import { LibraryVoice, VoiceEngine, VoiceEngineKind } from '../library/library.voices.models';
// prettier-ignore
import { CastMember, Script, ScriptBlock, ScriptConfig, ScriptUnit, ScriptUnitKind, SpeakerClass } from '../scripting/scripting.models';

export type AudiobookMode = 'prod' | 'voices' | 'rules';

export type SegmentFilter = 'all' | 'todo' | 'stale' | 'flag';

export type SegmentState = 'none' | 'done' | 'stale' | 'flag';

export type SegmentDisplayState = SegmentState | 'running';

export type UnitAudioState = 'none' | 'doing' | 'stale' | 'done';

export type MetaState = 'none' | 'stale' | 'done';

export type StaleReason = 'script' | 'voice' | 'rule' | 'tone';

export type MixField = 'gap' | 'intro' | 'outro' | 'vol';

export type LexKind = 'names' | 'number' | 'abbreviation' | 'terms';

export type LexField = 'term' | 'say';

export type VoiceIssueKind = 'backend' | 'model' | 'cloud';

export type BlockerKind = 'lock' | 'who' | 'voice' | 'engine';

export type RegenerateResult = 'started' | 'blocked' | 'running' | 'noop';

export type LexAddResult = 'added' | 'empty';

export type SpeakerStatus = 'ready' | 'noVoice' | 'unused' | 'engine';

export type SpeakerDeleteBlock = 'narrator' | 'kb' | 'inUse';

export type PlayItemKind = 'segment' | 'pause' | 'preview';

export type PreviewResult = 'started' | 'unavailable' | 'failed';

export type CloudBilling = 'free' | 'paid';

export type GroupBilling = 'local' | CloudBilling;

export type AudiobookInspector = 'chapter' | 'segment' | 'voices' | 'rules';

export interface AudiobookMessage {
  key: LanguageKey;
  params: Record<string, string | number>;
}

export interface SpeakerVoice {
  voice: number | null;
  speed: number;
}

export interface LexRule {
  id: string;
  term: string;
  say: string;
  kind: LexKind;
}

export interface SymbolRule {
  id: string;
  on: boolean;
}

export interface SymbolDef {
  id: string;
  sym: string;
  ruleKey: LanguageKey;
}

export interface MixSettings {
  gap: number;
  intro: number;
  outro: number;
  vol: number;
}

export interface AudioRecord {
  text: string;
  voice: number | null;
  speed: number;
  rules: string;
  paren: string;
  dur: number;
  at: string;
  flag: string;
}

export interface UnitAudio {
  audio: Record<string, AudioRecord>;
  mix: MixSettings;
  meta: MetaState | null;
}

export interface AudiobookConfig {
  voices: Record<string, SpeakerVoice>;
  lex: LexRule[];
  symbols: SymbolRule[];
}

export interface Audiobook extends AudiobookConfig {
  units: Record<string, UnitAudio>;
}

export interface AudiobookView {
  unit: string | null;
  mode: AudiobookMode;
  sel: string | null;
  filter: SegmentFilter;
  test: string;
  goto: string | null;
}

export interface AudioEnv {
  book: Audiobook;
  cast: CastMember[];
  voices: LibraryVoice[];
}

export interface VoiceAvailability {
  engines: VoiceEngine[];
  backendRunning: boolean;
}

export interface VoiceIssue {
  kind: VoiceIssueKind;
  engine: string;
}

export interface Voicing {
  speaker: CastMember | null;
  voice: LibraryVoice | null;
  speed: number;
}

export interface SegmentInfo {
  state: SegmentState;
  record: AudioRecord | null;
  reasons: StaleReason[];
}

export interface UnitStat {
  total: number;
  done: number;
  stale: number;
  none: number;
  dur: number;
  state: UnitAudioState;
  meta: boolean;
}

export interface Blocker {
  kind: BlockerKind;
  speakerId: string | null;
  blockId: string | null;
  message: AudiobookMessage;
}

export interface HighlightPart {
  text: string;
  say: string | null;
}

export interface SegmentRow {
  block: ScriptBlock;
  n: number;
  speaker: CastMember | null;
  speakerClass: SpeakerClass;
  voice: LibraryVoice | null;
  speed: number;
  state: SegmentDisplayState;
  record: AudioRecord | null;
  reasons: StaleReason[];
  parts: HighlightPart[];
  readText: string;
}

export interface PauseRow {
  block: ScriptBlock;
  seconds: number;
}

export type ListRow = { kind: 'segment'; segment: SegmentRow } | { kind: 'pause'; pause: PauseRow };

export interface UnitSummary {
  segments: number;
  generated: number;
  running: number;
  pending: number;
  duration: number;
}

export interface RailRow {
  unit: ScriptUnit;
  active: boolean;
  locked: boolean;
  stat: UnitStat;
}

export interface RailSummary {
  done: number;
  total: number;
  percent: number;
}

export interface VoiceOption {
  voice: LibraryVoice;
  usable: boolean;
  issue: VoiceIssue | null;
  engineName: string;
}

export interface VoiceOptionGroup {
  kind: VoiceEngineKind;
  options: VoiceOption[];
}

export interface SpeakerRow {
  member: CastMember;
  speakerClass: SpeakerClass;
  voice: LibraryVoice | null;
  voiceId: number | null;
  speed: number;
  uses: number;
  status: SpeakerStatus;
  issue: VoiceIssue | null;
  nameEditable: boolean;
  canPreview: boolean;
  previewSendsText: boolean;
  engineName: string | null;
  deleteBlock: SpeakerDeleteBlock | null;
}

export interface LexRow {
  rule: LexRule;
  occurrences: number;
}

export interface SymbolRow {
  id: string;
  sym: string;
  ruleKey: LanguageKey;
  on: boolean;
}

export interface EngineSummary {
  localModels: number;
  cloudProviders: number;
}

export interface ChapterPanel {
  locked: boolean;
  total: number;
  generated: number;
  attention: number;
  duration: number;
  mix: MixSettings | null;
  blockers: Blocker[];
}

export interface SegmentPanel {
  row: SegmentRow;
  changed: boolean;
  engineName: string | null;
  usable: boolean;
  issue: VoiceIssue | null;
  canFlag: boolean;
  canClearFlag: boolean;
}

export interface RulesPanel {
  pronunciations: number;
  activeSymbols: number;
  affected: number;
}

export interface AudiobookContext {
  projectId: number;
  script: Script;
  config: ScriptConfig;
  unitKind: ScriptUnitKind;
  view: AudiobookView;
  inspector: AudiobookInspector;
  cast: CastMember[];
  book: Audiobook;
  voices: LibraryVoice[];
  availability: VoiceAvailability;
  unit: ScriptUnit | null;
  locked: boolean;
  audio: UnitAudio | null;
  running: string[];
  generating: boolean;
  stat: UnitStat | null;
  summary: UnitSummary | null;
  rail: RailRow[];
  railSummary: RailSummary;
  segments: SegmentRow[];
  rows: ListRow[];
  todo: ScriptBlock[];
  blockers: Blocker[];
  canGenerate: boolean;
  canPlay: boolean;
  selected: SegmentRow | null;
  speakers: SpeakerRow[];
  lostDialogues: number;
  voiceGroups: VoiceOptionGroup[];
  lexicon: LexRow[];
  symbols: SymbolRow[];
  testText: string;
  testOutput: string;
  affected: number;
  engines: EngineSummary;
  chapterPanel: ChapterPanel;
  segmentPanel: SegmentPanel | null;
  rulesPanel: RulesPanel;
}

export interface GenerateGroup {
  key: string;
  kind: VoiceEngineKind;
  name: string;
  billing: GroupBilling;
  chars: number;
  cost: number;
}

export interface GeneratePlan {
  unitId: string;
  unitNo: number;
  segmentIds: string[];
  segments: number;
  regenerated: number;
  groups: GenerateGroup[];
  cost: number;
}

export interface SegmentRequest {
  text: string;
  readText: string;
  voice: number;
  speed: number;
  rules: string;
  paren: string;
  symbols: string[];
}

export interface PreviewRequest {
  voiceId: number;
  speed: number;
  text: string;
}

export interface PreviewReply {
  dur: number;
}

export interface PlayItem {
  id: string;
  kind: PlayItemKind;
  projectId: number;
  unitId: string;
  dur: number;
  title: string;
  voice: string;
}

export interface PlayerState {
  queue: PlayItem[];
  index: number;
  time: number;
  on: boolean;
}

export interface GenerationJob {
  unitId: string;
  blockId: string;
}

export interface AudiobookDialogRequestGenerate {
  kind: 'generate';
  projectId: number;
}

export interface AudiobookDialogRequestFlag {
  kind: 'flag';
  projectId: number;
  blockId: string;
}
