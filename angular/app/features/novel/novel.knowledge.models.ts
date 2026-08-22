import { LanguageKey } from "@app/core/language/language.models";
import { EntityType, PredicateKind, RuleId } from "./novel.knowledge.ontology.data";
import { TargetLang } from "./novel.models";

export type { EntityType, PredicateKind, RuleId };

export type KnowledgeTab = "graph" | "list" | "review";
export type KnowledgeListKind = "entity" | "fact";
export type KnowledgeLang = "src" | TargetLang;
export type AnalyzeMode = "missing" | "range" | "all";
export type Severity = "error" | "warning";
export type ItemState = "same" | "edited" | "new" | "deleted" | "merged" | "removed";
export type DraftPreviewState = "idle" | "invalid" | "resolved" | "open" | "clean" | "warn";

export interface EntityTypeDef {
  key: EntityType;
  icon: string;
  color: string;
  abstract: boolean;
  properties: string[];
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

export interface EvidenceRef {
  chapter: number;
  p: number;
  q: string;
}

interface KnowledgeBase {
  id: string;
  ev: KnowledgeEvidence[];
  stale: number[];
}

export interface KnowledgeEntity extends KnowledgeBase {
  kind: "entity";
  type: EntityType;
  name: string;
  titles: string[];
  aliases: string[];
}

export interface KnowledgeFact extends KnowledgeBase {
  kind: "fact";
  pred: string;
  subject: string;
  object: string | null;
}

export type KnowledgeItem = KnowledgeEntity | KnowledgeFact;

export type KnowledgeEdit =
  | { k: "rename"; id: string; name: string }
  | { k: "retype"; id: string; type: EntityType }
  | { k: "del"; id: string }
  | { k: "merge"; sources: string[]; target: string }
  | { k: "fact"; id: string; pred?: string; subject?: string; object?: string }
  | { k: "props"; id: string; titles?: string[]; aliases?: string[] }
  | { k: "evidence"; id: string; add?: EvidenceRef[]; remove?: EvidenceRef[] }
  | { k: "add_entity"; ref: string; type: EntityType; name: string; titles?: string[]; aliases?: string[]; ev: EvidenceRef[] }
  | { k: "add_fact"; ref: string; pred: string; subject: string; object?: string; ev: EvidenceRef[] }
  | { k: "character"; persona: string };

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
  at: string;
  entities: number;
  facts: number;
  stale: boolean;
}

export interface WireKnowledge {
  lang: KnowledgeLang;
  items: KnowledgeItem[];
  analyzed: Record<number, AnalyzedChapter>;
}

export interface NovelKnowledge {
  lang: KnowledgeLang;
  items: KnowledgeItem[];
  analyzed: Record<number, AnalyzedChapter>;
}

export interface KnowledgeEditResult {
  knowledge: WireKnowledge;
  remap: Record<string, string>;
}

export interface KnowledgeView {
  lang: KnowledgeLang;
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
