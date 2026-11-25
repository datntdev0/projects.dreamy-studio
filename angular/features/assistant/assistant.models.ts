import { BlockType } from '@features/scripting/scripting.models';

export type AssistantScopeKind = 'workspace' | 'novel' | 'project';

export type AssistantRole = 'user' | 'assistant';

export type AssistantView = 'start' | 'sessions' | 'chat';

export interface AssistantScopeTarget {
  kind: 'novel' | 'project';
  id: number;
}

export type AssistantScopeFilter = 'all' | 'workspace' | AssistantScopeTarget;

export interface AssistantScope {
  kind: AssistantScopeKind;
  novelId: number | null;
  projectId: number | null;
}

export interface AssistantCitation {
  novelId: number;
  chapter: number;
  p: number;
  quote: string;
}

export type AssistantChangeTarget =
  'novel' | 'chapter' | 'knowledge' | 'translation' | 'script' | 'project' | 'audiobook';

export interface AssistantChange {
  target: AssistantChangeTarget;
  novelId: number | null;
  projectId: number | null;
  chapterId: string | null;
  lang: string | null;
  translationTarget: string | null;
}

export type AssistantEvent =
  { kind: 'activity'; label: string } | ({ kind: 'changed' } & AssistantChange);

export type ProposalStatus = 'pending' | 'applied' | 'rejected';

export type ProposalDecision = 'applied' | 'rejected';

export type FindingSeverity = 'error' | 'warning' | 'info';

export type FindingCategory = 'name' | 'dict' | 'meaning' | 'omission' | 'style';

export interface TranslationFinding {
  id: string;
  n: number;
  severity: FindingSeverity;
  category: FindingCategory;
  source: string;
  current: string;
  suggested: string;
  from: string;
  to: string;
  reason: string;
  status: ProposalStatus;
}

export interface DictProposal {
  id: string;
  src: string;
  dst: string;
  type: string;
  note: string;
  occurrences: number;
  status: ProposalStatus;
}

export interface TranslationReview {
  kind: 'translation_review';
  chapter: number;
  chapterTitle: string;
  target: string;
  checked: number;
  findings: TranslationFinding[];
  dictionary: DictProposal[];
}

export type KnowledgeChangeOp =
  | 'merge'
  | 'rename'
  | 'retype'
  | 'add_entity'
  | 'add_fact'
  | 'fact'
  | 'del'
  | 'props'
  | 'evidence'
  | 'character';

export interface KnowledgeChange {
  id: string;
  op: KnowledgeChangeOp;
  target: string;
  before: string | null;
  after: string | null;
  reason: string;
  ev: AssistantCitation[];
}

export interface KnowledgeValidation {
  ok: boolean;
  resolves: number;
  introduces: string[];
}

export interface KnowledgeChangeSet {
  kind: 'knowledge_changes';
  id: string;
  title: string;
  edits: number;
  validation: KnowledgeValidation;
  changes: KnowledgeChange[];
  status: ProposalStatus;
  lang?: string;
  novelId?: number;
}

export type PipelineJobKind = 'translation' | 'analysis' | 'synthesis';

export interface PipelineRunOwner {
  novelId: number | null;
  projectId: number | null;
}

export interface PipelineRunItem {
  id: string;
  seq: number | null;
  title: string;
  tasks: number;
  note: string | null;
}

export interface PipelineRunSkipped {
  id: string;
  seq: number | null;
  title: string;
  reason: string;
}

export interface PipelineRun {
  kind: 'pipeline_run';
  id: string;
  job: PipelineJobKind;
  owner: PipelineRunOwner;
  title: string;
  target: string | null;
  mode: string | null;
  overwrite: boolean;
  items: PipelineRunItem[];
  skipped: PipelineRunSkipped[];
  warnings: string[];
  totalTasks: number;
  status: ProposalStatus;
  pipelineId: number | null;
}

export interface PipelineRunLaunch {
  messageId: string;
  run: PipelineRun;
}

export interface ScriptDraftCurrentBlock {
  id: string;
  type: BlockType;
  text: string;
  who: string;
  paren: string;
}

export interface ScriptDraftBlock {
  id: string | null;
  type: BlockType;
  text: string;
  who: string;
  paren: string;
  ms: number;
  loc: string;
  time: string;
  beat: string;
  refs: string[];
  chars: string[];
  kept: boolean;
}

export interface ScriptDraftCast {
  id: string;
  name: string;
}

export interface ScriptDraftSpeaker {
  id: string;
  name: string;
  blocks: number;
}

export interface ScriptDraftStats {
  blocks: number;
  voiced: number;
  words: number;
  narration: number;
  dialogue: number;
  kept: number;
  staleAudio: number;
}

export interface ScriptDraft {
  kind: 'script_draft';
  id: string;
  projectId: number;
  title: string;
  unitId: string;
  unitTitle: string;
  chapter: number | null;
  summary: string;
  baseRev: string;
  current: ScriptDraftCurrentBlock[];
  currentTruncated: boolean;
  blocks: ScriptDraftBlock[];
  extraCast: ScriptDraftCast[];
  speakers: ScriptDraftSpeaker[];
  stats: ScriptDraftStats;
  unresolved: number;
  warnings: string[];
  status: ProposalStatus;
}

export type ScriptDraftDiffKind = 'added' | 'removed' | 'moved' | 'gap';

export interface ScriptDraftDiffRow {
  key: string;
  kind: ScriptDraftDiffKind;
  type: BlockType | null;
  text: string;
  paren: string;
  speaker: string;
  count: number;
}

export interface ScriptDraftDiff {
  rows: ScriptDraftDiffRow[];
  added: number;
  removed: number;
  moved: number;
}

export type AssistantAttachment =
  TranslationReview | KnowledgeChangeSet | PipelineRun | ScriptDraft;

export type AssistantContext =
  | { kind: 'translation_review'; chapterId: string; target: string }
  | { kind: 'knowledge_review'; lang: string; issueIds: string[] }
  | { kind: 'script_rewrite'; unitId: string; note?: string };

export interface ProposalResolution {
  messageId: string;
  itemIds: string[];
  status: ProposalDecision;
  pipelineId?: number;
}

export interface MarkedText {
  before: string;
  mark: string;
  after: string;
}

export interface InlineDiff {
  before: string;
  removed: string;
  added: string;
  after: string;
}

export interface AssistantMessage {
  id: string;
  role: AssistantRole;
  text: string;
  createdAt: string;
  activities: string[];
  citations: AssistantCitation[];
  attachments?: AssistantAttachment[];
}

export interface AssistantSessionSummary {
  id: string;
  title: string;
  scope: AssistantScope;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  preview: string;
  editGranted: boolean;
}

export interface AssistantContextUsage {
  usedTokens: number;
  maxTokens: number | null;
}

export type AssistantQuotaWindow = 'session' | 'weekly';

export type AssistantQuotaStatus = 'ok' | 'warning' | 'limited';

export interface AssistantQuota {
  window: AssistantQuotaWindow;
  status: AssistantQuotaStatus;
  usedPercent: number | null;
  resetsAt: string | null;
}

export interface AssistantQuotaSnapshot {
  provider: string;
  plan: string | null;
  updatedAt: string;
  quotas: AssistantQuota[];
}

export interface AssistantSession extends AssistantSessionSummary {
  messages: AssistantMessage[];
  context?: AssistantContextUsage | null;
}
