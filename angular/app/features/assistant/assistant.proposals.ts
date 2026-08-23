import { LanguageKey } from "@app/core/language/language.models";
import { DictProposal, FindingCategory, FindingSeverity, KnowledgeChangeOp, MarkedText, ProposalStatus, TranslationFinding, TranslationReview } from "./assistant.models";

export const SEVERITY_KEYS: Record<FindingSeverity, LanguageKey> = {
  error: "assistant.review.severity.error",
  warning: "assistant.review.severity.warning",
  info: "assistant.review.severity.info",
};

export const SEVERITY_BADGES: Record<FindingSeverity, string> = {
  error: "badge-danger",
  warning: "badge-warning",
  info: "badge-info",
};

export const CATEGORY_KEYS: Record<FindingCategory, LanguageKey> = {
  name: "assistant.review.category.name",
  dict: "assistant.review.category.dict",
  meaning: "assistant.review.category.meaning",
  omission: "assistant.review.category.omission",
  style: "assistant.review.category.style",
};

export const OP_KEYS: Record<KnowledgeChangeOp, LanguageKey> = {
  merge: "assistant.kb.op.merge",
  rename: "assistant.kb.op.rename",
  retype: "assistant.kb.op.retype",
  add_entity: "assistant.kb.op.addEntity",
  add_fact: "assistant.kb.op.addFact",
  fact: "assistant.kb.op.fact",
  del: "assistant.kb.op.del",
  props: "assistant.kb.op.props",
};

export const OP_ICONS: Record<KnowledgeChangeOp, string> = {
  merge: "merge",
  rename: "pen",
  retype: "layers",
  add_entity: "plus",
  add_fact: "link",
  fact: "swap",
  del: "trash",
  props: "tag",
};

export const STATUS_KEYS: Record<ProposalStatus, LanguageKey> = {
  pending: "assistant.proposal.pending",
  applied: "assistant.proposal.applied",
  rejected: "assistant.proposal.rejected",
};

export function markText(text: string, needle: string): MarkedText {
  const index = needle === "" ? -1 : text.indexOf(needle);
  if (index < 0) {
    return { before: text, mark: "", after: "" };
  }
  return { before: text.slice(0, index), mark: needle, after: text.slice(index + needle.length) };
}

export function pendingIds(review: TranslationReview): string[] {
  const out: string[] = [];
  for (const item of [...review.findings, ...review.dictionary]) {
    if (item.status === "pending") {
      out.push(item.id);
    }
  }
  return out;
}

export function countSeverity(findings: TranslationFinding[], severity: FindingSeverity): number {
  let count = 0;
  for (const finding of findings) {
    if (finding.severity === severity) {
      count += 1;
    }
  }
  return count;
}

export function countResolved(items: Array<TranslationFinding | DictProposal>): number {
  let count = 0;
  for (const item of items) {
    if (item.status !== "pending") {
      count += 1;
    }
  }
  return count;
}
