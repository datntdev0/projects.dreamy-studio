import { LanguageKey } from '@shared/language/language.models';

export type ScriptPreset = 'audiobook' | 'film';

export type ScriptUnitKind = 'chapter' | 'episode';

export type BlockType =
  'heading' | 'narration' | 'dialogue' | 'pause' | 'note' | 'scene' | 'action';

export type UnitStatus = 'draft' | 'review' | 'locked';

export type CastKind = 'narrator' | 'kb' | 'extra';

export type IssueKind = 'none' | 'empty' | 'who' | 'scene' | 'stale' | 'uncovered' | 'noscene';

export type IssueLevel = 'error' | 'warn';

export type MoveDirection = 'up' | 'down';

export type ResetScope = 'unit' | 'all';

export type LockResult = 'locked' | 'errors' | 'noop';

export type CastAddResult = 'added' | 'empty' | 'duplicate';

export type SpeakerClass = 'spk-n' | 'spk-x' | `spk-${number}`;

export type RailMark = 'locked' | 'stale' | 'review' | 'draft';

export interface BlockTypeDef {
  type: BlockType;
  icon: string;
  text: boolean;
  who: boolean;
  labelKey: LanguageKey;
  hintKey: LanguageKey;
}

export interface ScriptConfig {
  preset: ScriptPreset;
  unit: ScriptUnitKind;
  types: BlockType[];
  layout: 'page';
  source: boolean;
  speakers: boolean;
  ranges: boolean;
  freeUnits: boolean;
}

export interface ScriptPresetDef {
  id: ScriptPreset;
  icon: string;
  labelKey: LanguageKey;
  shortKey: LanguageKey;
  blurbKey: LanguageKey;
}

export interface ScriptBlock {
  id: string;
  type: BlockType;
  text: string;
  who: string;
  paren: string;
  ms: number;
  loc: string;
  time: string;
  ref: string | null;
  snap: string | null;
  beat: string;
  refs: string[];
  chars: string[];
}

export interface UnitMeta {
  blocks: number;
  words: number;
}

export type ChapterRange = [number, number];

export interface ScriptUnit {
  id: string;
  no: number;
  ch: number | null;
  chs: ChapterRange | null;
  title: string;
  status: UnitStatus;
  blocks: ScriptBlock[] | null;
  meta: UnitMeta | null;
  updated: string;
}

export interface CastMember {
  id: string;
  name: string;
  kind: CastKind;
  c: number;
}

export interface Script {
  cfg: ScriptConfig;
  choose: boolean;
  extraCast: CastMember[];
  units: ScriptUnit[];
  seq: number;
  useq: number;
}

export interface ScriptView {
  unit: string | null;
  collapsed: Record<string, true>;
  sel: string | null;
  drawer: boolean;
  focus: string | null;
  goto: string | null;
  ref: string | null;
}

export interface ViewFocus {
  focus: string | null;
  goto: string | null;
  ref: string | null;
}

export interface ScriptChange {
  script: Script;
  view: Partial<ScriptView>;
}

export interface BlockIds {
  seq: number;
}

export interface SourceParagraph {
  id: string;
  text: string;
}

export interface ScriptSource {
  list: SourceParagraph[];
  map: Record<string, string>;
}

export interface QuoteSegment {
  quoted: boolean;
  text: string;
}

export interface ScriptScene {
  block: ScriptBlock;
  index: number;
  no: number;
  end: number;
  body: ScriptBlock[];
}

export interface ScriptMetrics {
  blocks: number;
  words: number;
  pause: number;
  scenes: number;
  lines: number;
  secs: number;
  byWho: Record<string, number>;
  byType: Partial<Record<BlockType, number>>;
}

export interface ScriptIssue {
  kind: IssueKind;
  level: IssueLevel;
  blockId: string | null;
  ref: string | null;
  messageKey: LanguageKey;
  params: Record<string, string | number>;
}

export interface CheckRow {
  kind: IssueKind;
  level: IssueLevel;
  labelKey: LanguageKey;
  count: number;
  first: ScriptIssue | null;
}

export interface CheckSummary {
  errors: number;
  warnings: number;
}

export interface BlockPatch {
  text?: string;
  who?: string;
  paren?: string;
  loc?: string;
  time?: string;
  beat?: string;
  seconds?: number;
}

export interface SourceRow {
  ref: string | null;
  para: SourceParagraph | null;
  blocks: ScriptBlock[] | null;
}

export interface UnitStats {
  blocks: number;
  words: number;
  secs: number;
  scenes: number | null;
  covered: number | null;
  paragraphs: number | null;
}

export interface RailRow {
  unit: ScriptUnit;
  active: boolean;
  mark: RailMark;
  stale: number;
  generating: boolean;
  metrics: ScriptMetrics | null;
  meta: UnitMeta | null;
  chapters: number[];
}

export interface RailSummary {
  locked: number;
  total: number;
  percent: number;
}

export interface KbStatus {
  novel: boolean;
  available: boolean;
  ready: boolean;
  missing: number[];
}

export interface ScriptBeat {
  event: string;
  text: string;
  refs: string[];
  chars: string[];
  loc: string;
  time: string;
}

export interface ScriptContext {
  projectId: number;
  script: Script;
  config: ScriptConfig;
  view: ScriptView;
  choose: boolean;
  cast: CastMember[];
  places: string[];
  unit: ScriptUnit | null;
  locked: boolean;
  generating: boolean;
  source: ScriptSource | null;
  hasDefault: boolean;
  metrics: ScriptMetrics | null;
  stats: UnitStats | null;
  issues: ScriptIssue[];
  checks: CheckRow[];
  checkSummary: CheckSummary;
  canLock: boolean;
  scenes: ScriptScene[];
  staleRefs: string[];
  uncovered: SourceParagraph[];
  rows: SourceRow[] | null;
  rail: RailRow[];
  railSummary: RailSummary;
  kb: KbStatus;
  selected: ScriptBlock | null;
  chapterMax: number;
}

export interface DraftReason {
  key: LanguageKey;
  params: Record<string, string | number>;
}

export interface DraftOption {
  unit: ScriptUnit;
  reason: DraftReason | null;
  hasContent: boolean;
}

export interface DraftLoad {
  words: number;
  extra: number;
  beats: number;
}

export interface DraftEstimate {
  tin: number;
  tout: number;
  cost: number;
}

export interface DraftRequest {
  preset: ScriptPreset;
  unit: { id: string; no: number; title: string; ch: number | null; chs: ChapterRange | null };
  source: SourceParagraph[] | null;
  beats: ScriptBeat[];
  cast: CastMember[];
}

export interface DraftResult {
  unit: ScriptUnit;
  seq: number;
}

export interface ResetResult {
  script: Script;
  count: number;
}

export interface KbEvidence {
  chapter: number;
  p: number;
}

export interface KbCharacter {
  id: string;
  name: string;
  refs: string[];
}

export interface KbPlace {
  id: string;
  name: string;
  refs: string[];
  container: boolean;
  organization: boolean;
}

export interface KbEvent {
  id: string;
  name: string;
  refs: string[];
  place: string | null;
  order: number;
}

export interface KbSnapshot {
  analyzed: number[];
  characters: KbCharacter[];
  places: KbPlace[];
  events: KbEvent[];
  participants: Record<string, string[]>;
}
