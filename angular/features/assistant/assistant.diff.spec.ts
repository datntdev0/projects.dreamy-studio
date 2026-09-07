import { scriptDraft } from '@testing/fixtures';
import { describe, expect, it } from 'vitest';

import { draftDiff } from './assistant.diff';
import { ScriptDraft, ScriptDraftBlock, ScriptDraftCurrentBlock } from './assistant.models';

function current(id: string, text: string): ScriptDraftCurrentBlock {
  return { id, type: 'narration', text, who: 'narr', paren: '' };
}

function kept(id: string, text: string): ScriptDraftBlock {
  return { ...scriptDraft().blocks[0], id, text, kept: true };
}

function fresh(text: string): ScriptDraftBlock {
  return { ...scriptDraft().blocks[0], id: null, text, kept: false };
}

function draftOf(before: ScriptDraftCurrentBlock[], after: ScriptDraftBlock[]): ScriptDraft {
  return scriptDraft({ current: before, blocks: after });
}

function shape(draft: ScriptDraft): string[] {
  return draftDiff(draft).rows.map((row) =>
    row.kind === 'gap' ? `gap:${row.count}` : `${row.kind}:${row.text}`,
  );
}

describe('draftDiff', () => {
  it('shows removed and added blocks after the unchanged ones collapsed into a gap', () => {
    expect(shape(scriptDraft())).toEqual([
      'gap:1',
      'removed:Old line',
      'added:Hello there',
      'added:Welcome',
    ]);
  });

  it('counts added, removed and moved rows', () => {
    const diff = draftDiff(scriptDraft());
    expect(diff).toMatchObject({ added: 2, removed: 1, moved: 0 });
  });

  it('puts the removed blocks before the added ones of the same change', () => {
    const draft = draftOf(
      [current('a', 'A'), current('b', 'B'), current('c', 'C')],
      [kept('a', 'A'), fresh('B2'), kept('c', 'C')],
    );
    expect(shape(draft)).toEqual(['gap:1', 'removed:B', 'added:B2', 'gap:1']);
  });

  it('keeps unchanged blocks between two changes in one gap', () => {
    const draft = draftOf(
      [current('a', 'A'), current('b', 'B'), current('c', 'C'), current('d', 'D')],
      [fresh('A2'), kept('b', 'B'), kept('c', 'C'), fresh('D2')],
    );
    expect(shape(draft)).toEqual(['removed:A', 'added:A2', 'gap:2', 'removed:D', 'added:D2']);
  });

  it('adds new blocks without removing anything', () => {
    const draft = draftOf([current('a', 'A')], [kept('a', 'A'), fresh('New 1'), fresh('New 2')]);
    expect(shape(draft)).toEqual(['gap:1', 'added:New 1', 'added:New 2']);
  });

  it('lists the removed blocks when the draft keeps nothing', () => {
    const draft = draftOf([current('a', 'A'), current('b', 'B')], [fresh('X')]);
    expect(shape(draft)).toEqual(['removed:A', 'removed:B', 'added:X']);
  });

  it('removes every block when the draft is empty', () => {
    const draft = draftOf([current('a', 'A'), current('b', 'B')], []);
    expect(shape(draft)).toEqual(['removed:A', 'removed:B']);
  });

  it('reports a moved block instead of hiding the reorder', () => {
    const draft = draftOf([current('a', 'A'), current('b', 'B')], [kept('b', 'B'), kept('a', 'A')]);
    const diff = draftDiff(draft);
    expect(shape(draft)).toEqual(['gap:1', 'moved:A']);
    expect(diff.moved).toBe(1);
  });

  it('has no rows when nothing changes', () => {
    const draft = draftOf([current('a', 'A')], [kept('a', 'A')]);
    expect(draftDiff(draft).rows).toEqual([]);
  });

  it('treats a kept block missing from a truncated current list as unchanged', () => {
    const draft = draftOf([current('a', 'A')], [kept('a', 'A'), kept('z', 'Z'), fresh('N')]);
    expect(shape(draft)).toEqual(['gap:2', 'added:N']);
  });

  it('resolves speaker names and keeps unique keys', () => {
    const rows = draftDiff(scriptDraft()).rows;
    expect(rows.map((row) => row.speaker)).toEqual(['', 'Lin Mo', 'Lin Mo', 'Innkeeper']);
    expect(rows[2]).toMatchObject({ type: 'dialogue', text: 'Hello there', paren: 'softly' });
    expect(new Set(rows.map((row) => row.key)).size).toBe(rows.length);
  });
});
