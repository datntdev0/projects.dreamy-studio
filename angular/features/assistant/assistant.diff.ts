import { LanguageKey } from '@shared/language/language.models';

// prettier-ignore
import { ScriptDraft, ScriptDraftBlock, ScriptDraftCurrentBlock, ScriptDraftDiff, ScriptDraftDiffKind, ScriptDraftDiffRow } from './assistant.models';
import { draftSpeakerName } from './assistant.proposals';

export const DIFF_SIGNS: Record<ScriptDraftDiffKind, string> = {
  added: '+',
  removed: '−',
  moved: '↕',
  gap: '',
};

export const DIFF_ROW_KEYS: Record<ScriptDraftDiffKind, LanguageKey> = {
  added: 'assistant.draft.rowAdded',
  removed: 'assistant.draft.rowRemoved',
  moved: 'assistant.draft.rowMoved',
  gap: 'assistant.draft.gap',
};

interface DiffState {
  rows: ScriptDraftDiffRow[];
  pending: ScriptDraftDiffRow[];
  keptIds: Set<string>;
  positions: Map<string, number>;
  unchanged: number;
  cursor: number;
}

export function draftDiff(draft: ScriptDraft): ScriptDraftDiff {
  const state = startState(draft);
  draft.blocks.forEach((block, position) => visit(draft, state, block, position));
  closeHunk(state, removedBefore(draft, state, draft.current.length));
  if (state.rows.length > 0) {
    flushGap(state);
  }
  return summarize(state.rows);
}

function startState(draft: ScriptDraft): DiffState {
  const keptIds = new Set<string>();
  for (const block of draft.blocks) {
    if (block.kept && block.id !== null) {
      keptIds.add(block.id);
    }
  }
  const positions = new Map<string, number>();
  draft.current.forEach((block, position) => positions.set(block.id, position));
  return { rows: [], pending: [], keptIds, positions, unchanged: 0, cursor: 0 };
}

function visit(
  draft: ScriptDraft,
  state: DiffState,
  block: ScriptDraftBlock,
  position: number,
): void {
  if (!block.kept || block.id === null) {
    state.pending.push(blockRow(draft, 'added', `a${position}`, block));
    return;
  }
  const at = state.positions.get(block.id);
  if (at === undefined) {
    state.unchanged += 1;
  } else if (at < state.cursor) {
    state.pending.push(blockRow(draft, 'moved', `m${position}`, block));
  } else {
    closeHunk(state, removedBefore(draft, state, at));
    state.cursor = at + 1;
    state.unchanged += 1;
  }
}

function removedBefore(draft: ScriptDraft, state: DiffState, end: number): ScriptDraftDiffRow[] {
  const removed: ScriptDraftDiffRow[] = [];
  for (let at = state.cursor; at < end; at += 1) {
    const block = draft.current[at];
    if (!state.keptIds.has(block.id)) {
      removed.push(blockRow(draft, 'removed', `r${block.id}`, block));
    }
  }
  return removed;
}

function closeHunk(state: DiffState, removed: ScriptDraftDiffRow[]): void {
  const hunk = [...removed, ...state.pending];
  state.pending = [];
  if (hunk.length > 0) {
    flushGap(state);
    state.rows.push(...hunk);
  }
}

function flushGap(state: DiffState): void {
  if (state.unchanged > 0) {
    state.rows.push({
      key: `g${state.rows.length}`,
      kind: 'gap',
      type: null,
      text: '',
      paren: '',
      speaker: '',
      count: state.unchanged,
    });
    state.unchanged = 0;
  }
}

function blockRow(
  draft: ScriptDraft,
  kind: ScriptDraftDiffKind,
  key: string,
  block: ScriptDraftBlock | ScriptDraftCurrentBlock,
): ScriptDraftDiffRow {
  return {
    key,
    kind,
    type: block.type,
    text: block.text,
    paren: block.paren,
    speaker: draftSpeakerName(draft, block.who),
    count: 1,
  };
}

function summarize(rows: ScriptDraftDiffRow[]): ScriptDraftDiff {
  return {
    rows,
    added: rows.filter((row) => row.kind === 'added').length,
    removed: rows.filter((row) => row.kind === 'removed').length,
    moved: rows.filter((row) => row.kind === 'moved').length,
  };
}
