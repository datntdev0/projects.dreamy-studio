import { LanguageKey } from "@app/core/language/language.models";
import { TargetLang } from "./novel.models";

export type KnowledgeTab = "graph" | "list" | "review";
export type KnowledgeListKind = "entity" | "fact";
export type EntityType = "character" | "persona" | "location" | "organization" | "artifact" | "skill" | "term" | "event";
export type PredicateKind = "scalar" | "relationship";
export type KnowledgeLang = "src" | TargetLang;
export type AnalyzeMode = "missing" | "range" | "all";
export type Severity = "error" | "warning";
export type RuleId = "character_predicate" | "persona_link" | "relation_signature" | "scalar_single" | "relation_unique" | "entity_duplicate" | "dangling_ref" | "evidence" | "source_stale";
export type ItemState = "same" | "edited" | "new" | "deleted" | "merged" | "removed";
export type DraftPreviewState = "idle" | "invalid" | "resolved" | "open" | "clean" | "warn";

export interface EntityTypeDef {
  key: EntityType;
  icon: string;
  color: string;
  abstract: boolean;
  labelKey: LanguageKey;
  hintKey: LanguageKey;
}

export interface PredicateDef {
  key: string;
  kind: PredicateKind;
  labelKey: LanguageKey;
  domain: EntityType[];
  range: EntityType[];
  limit: boolean;
}

export interface RuleDef {
  id: RuleId;
  severity: Severity;
  labelKey: LanguageKey;
  descKey: LanguageKey;
}

export interface KnowledgeEvidence {
  chapter: number;
  p: number;
  q: string;
  verified: boolean;
}

interface KnowledgeBase {
  id: string;
  ev: KnowledgeEvidence[];
  stale: string | null;
}

export interface KnowledgeEntity extends KnowledgeBase {
  kind: "entity";
  type: EntityType;
  name: string;
  summary: string;
}

export interface KnowledgeFact extends KnowledgeBase {
  kind: "fact";
  pred: string;
  subject: string;
  object: string | null;
  value: string | null;
}

export type KnowledgeItem = KnowledgeEntity | KnowledgeFact;

export type ItemPatch = Partial<Omit<KnowledgeEntity, "id" | "kind">> & Partial<Omit<KnowledgeFact, "id" | "kind">>;

export type KnowledgeEdit =
  | { k: "add"; item: KnowledgeItem }
  | { k: "edit"; id: string; patch: ItemPatch }
  | { k: "del"; id: string }
  | { k: "merge"; sources: string[]; target: string }
  | { k: "split"; id: string; item: KnowledgeEntity; facts: string[] };

export interface KnowledgeIssue {
  id: string;
  rule: RuleId;
  sev: Severity;
  ids: string[];
  message: string;
  values: string[];
}

export interface RuleCount {
  rule: RuleDef;
  count: number;
}

export interface AnalyzedChapter {
  lang: KnowledgeLang;
  at: string;
  entities: number;
  facts: number;
}

export interface WireKnowledge {
  items: KnowledgeItem[];
  analyzed: Record<number, AnalyzedChapter>;
}

export interface NovelKnowledge {
  items: KnowledgeItem[];
  analyzed: Record<number, AnalyzedChapter>;
}

export interface KnowledgeChange {
  upsert: KnowledgeItem[];
  remove: string[];
}

export interface KnowledgeView {
  tab: KnowledgeTab;
  q: string;
  type: string;
  chapter: number;
  onlyIssues: boolean;
  sel: string | null;
  rule: RuleId | "all";
  spoiler: boolean;
  upTo: number;
}

export interface AnalyzeRequest {
  mode: AnalyzeMode;
  from: number;
  to: number;
  overwrite: boolean;
  lang: KnowledgeLang;
}

export interface AnalyzeSummary {
  run: number[];
  keep: number[];
  overwrite: number[];
  noSource: number[];
  missing: number[];
  batches: number[][];
}

export interface KnowledgeEditRequest {
  novelId: number;
  ids: string[];
  issueId: string | null;
  add: KnowledgeListKind | null;
}

export interface KnowledgeAnalyzeRequest {
  novelId: number;
  preset: Partial<AnalyzeRequest>;
}

export interface KnowledgeVisibility {
  items: KnowledgeItem[];
  entities: number;
  facts: number;
  hiddenEntities: number;
  hiddenFacts: number;
}

export interface DraftPreview {
  state: DraftPreviewState;
  added: KnowledgeIssue[];
  fixed: KnowledgeIssue[];
}

export interface GraphLink {
  source: string;
  target: string;
  label: string;
}
