import { LanguageKey } from '@shared/language/language.models';

export type ScriptPreset = 'audiobook' | 'film';

export type ScriptUnitKind = 'chapter' | 'episode';

export type BlockType =
  'heading' | 'narration' | 'dialogue' | 'pause' | 'note' | 'scene' | 'action';

export type CastKind = 'narrator' | 'kb' | 'extra';

export type MoveDirection = 'up' | 'down';

export type ResetScope = 'unit' | 'all';

export type CastAddResult = 'added' | 'empty' | 'duplicate';

export type SpeakerClass = 'spk-n' | 'spk-x' | `spk-${number}`;

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
  sel: string | null;
  focus: string | null;
  goto: string | null;
}

export interface ViewFocus {
  focus: string | null;
  goto: string | null;
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

export interface BlockPatch {
  text?: string;
  who?: string;
  paren?: string;
  loc?: string;
  time?: string;
  beat?: string;
  seconds?: number;
}

export interface UnitStats {
  blocks: number;
  words: number;
  secs: number;
  scenes: number | null;
}

export interface RailRow {
  unit: ScriptUnit;
  active: boolean;
  metrics: ScriptMetrics | null;
  meta: UnitMeta | null;
  chapters: number[];
}

export interface RailSummary {
  done: number;
  total: number;
  percent: number;
}

export interface KbStatus {
  novel: boolean;
  available: boolean;
  missing: number[];
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
  source: ScriptSource | null;
  hasDefault: boolean;
  metrics: ScriptMetrics | null;
  stats: UnitStats | null;
  scenes: ScriptScene[];
  rail: RailRow[];
  railSummary: RailSummary;
  kb: KbStatus;
  chapterMax: number;
}

export interface ResetResult {
  script: Script;
  count: number;
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
}

export interface KbSnapshot {
  analyzed: number[];
  characters: KbCharacter[];
  places: KbPlace[];
}
