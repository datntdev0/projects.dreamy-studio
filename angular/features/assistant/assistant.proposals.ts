import { LanguageKey } from '@shared/language/language.models';

// prettier-ignore
import { DictProposal, FindingCategory, FindingSeverity, KnowledgeChangeOp, MarkedText, PipelineJobKind, PipelineRun, ProposalStatus, ScriptDraft, ScriptDraftRow, ScriptDraftView, TranslationFinding, TranslationReview } from './assistant.models';

export const SEVERITY_KEYS: Record<FindingSeverity, LanguageKey> = {
  error: 'assistant.review.severity.error',
  warning: 'assistant.review.severity.warning',
  info: 'assistant.review.severity.info',
};

export const SEVERITY_BADGES: Record<FindingSeverity, string> = {
  error: 'badge-danger',
  warning: 'badge-warning',
  info: 'badge-info',
};

export const CATEGORY_KEYS: Record<FindingCategory, LanguageKey> = {
  name: 'assistant.review.category.name',
  dict: 'assistant.review.category.dict',
  meaning: 'assistant.review.category.meaning',
  omission: 'assistant.review.category.omission',
  style: 'assistant.review.category.style',
};

export const OP_KEYS: Record<KnowledgeChangeOp, LanguageKey> = {
  merge: 'assistant.kb.op.merge',
  rename: 'assistant.kb.op.rename',
  retype: 'assistant.kb.op.retype',
  add_entity: 'assistant.kb.op.addEntity',
  add_fact: 'assistant.kb.op.addFact',
  fact: 'assistant.kb.op.fact',
  del: 'assistant.kb.op.del',
  props: 'assistant.kb.op.props',
  evidence: 'assistant.kb.op.evidence',
  character: 'assistant.kb.op.character',
};

export const OP_ICONS: Record<KnowledgeChangeOp, string> = {
  merge: 'merge',
  rename: 'pen',
  retype: 'layers',
  add_entity: 'plus',
  add_fact: 'link',
  fact: 'swap',
  del: 'trash',
  props: 'tag',
  evidence: 'book',
  character: 'user',
};

export const STATUS_KEYS: Record<ProposalStatus, LanguageKey> = {
  pending: 'assistant.proposal.pending',
  applied: 'assistant.proposal.applied',
  rejected: 'assistant.proposal.rejected',
};

export const PIPELINE_RUN_KINDS: Record<PipelineJobKind, string> = {
  translation: 'translation',
  analysis: 'analysis',
  synthesis: 'audio',
};

export const PIPELINE_MODE_KEYS: Record<string, LanguageKey> = {
  missing: 'assistant.pipeline.mode.missing',
  all: 'assistant.pipeline.mode.all',
};

export function markText(text: string, needle: string): MarkedText {
  const index = needle === '' ? -1 : text.indexOf(needle);
  if (index < 0) {
    return { before: text, mark: '', after: '' };
  }
  return { before: text.slice(0, index), mark: needle, after: text.slice(index + needle.length) };
}

export function pendingIds(review: TranslationReview): string[] {
  const out: string[] = [];
  for (const item of [...review.findings, ...review.dictionary]) {
    if (item.status === 'pending') {
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
    if (item.status !== 'pending') {
      count += 1;
    }
  }
  return count;
}

export function canRun(run: PipelineRun): boolean {
  return run.status === 'pending' && run.totalTasks > 0;
}

export function overwritesAudio(run: PipelineRun): boolean {
  return run.overwrite || run.mode === 'all';
}

export function runItemIds(run: PipelineRun): string[] {
  return run.items.map((item) => item.id);
}

export function runKindOf(run: PipelineRun): string {
  return PIPELINE_RUN_KINDS[run.job];
}

export const DRAFT_COLLAPSED_ROWS = 12;

export function canApplyDraft(draft: ScriptDraft): boolean {
  return draft.status === 'pending' && draft.blocks.length > 0;
}

export function changedDraftBlocks(draft: ScriptDraft): number {
  return Math.max(draft.blocks.length - draft.stats.kept, 0);
}

export function isNewSpeaker(draft: ScriptDraft, id: string): boolean {
  return draft.extraCast.some((member) => member.id === id);
}

export function draftSpeakerName(draft: ScriptDraft, who: string): string {
  const speaker = draft.speakers.find((item) => item.id === who);
  if (speaker) {
    return speaker.name;
  }
  return draft.extraCast.find((member) => member.id === who)?.name ?? who;
}

export function draftRows(draft: ScriptDraft, view: ScriptDraftView): ScriptDraftRow[] {
  if (view === 'before') {
    return draft.current.map((block) => ({
      key: block.id,
      type: block.type,
      text: block.text,
      paren: block.paren,
      speaker: draftSpeakerName(draft, block.who),
      kept: false,
    }));
  }
  return draft.blocks.map((block, index) => ({
    key: `${index}:${block.id ?? 'new'}`,
    type: block.type,
    text: block.text,
    paren: block.paren,
    speaker: draftSpeakerName(draft, block.who),
    kept: block.kept,
  }));
}
