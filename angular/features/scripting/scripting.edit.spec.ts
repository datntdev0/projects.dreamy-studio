import { script, scriptBlock, scriptUnit, source } from '@testing/scripting';
import { describe, expect, it } from 'vitest';

import * as edit from './scripting.edit';
import { CastMember, Script, ScriptBlock } from './scripting.models';
import { castOf, configOf, findUnit, newScript } from './scripting.rules';

const STAMP = '2026-11-22T00:00:00Z';

const cast: CastMember[] = castOf('audiobook', [{ id: 'E1', name: 'Wren' }], []);

function listOf(...overrides: Partial<ScriptBlock>[]): ScriptBlock[] {
  return overrides.map((item, index) => scriptBlock({ id: `B${index + 1}`, ...item }));
}

function withBlocks(...overrides: Partial<ScriptBlock>[]): Script {
  const blocks = listOf(...overrides);
  return script([scriptUnit({ blocks })], { seq: blocks.length });
}

function idsOf(model: Script): string[] {
  return (findUnit(model, 'U01')?.blocks ?? []).map((item) => item.id);
}

describe('scripting edit: blocks', () => {
  it('inserts after a block and inherits its source row', () => {
    const model = withBlocks({ ref: '1.1', snap: 'x' }, { type: 'dialogue', who: 'E1' });
    const change = edit.insertBlock(model, 'U01', 'B1', 'narration', cast, STAMP);
    expect(idsOf(change.script)).toEqual(['B1', 'B3', 'B2']);
    const added = findUnit(change.script, 'U01')?.blocks?.[1];
    expect(added).toMatchObject({ ref: '1.1', snap: 'x', who: '' });
    expect(change.view).toEqual({ sel: 'B3', focus: 'B3' });
    expect(change.script.seq).toBe(3);
    expect(findUnit(change.script, 'U01')?.updated).toBe(STAMP);
    expect(model.seq).toBe(2);
  });

  it('inserts dialogue with the latest speaker and headings outside source rows', () => {
    const model = withBlocks({ type: 'dialogue', who: 'E9' }, { ref: '1.1', snap: 'x' });
    const dialogue = edit.insertBlock(model, 'U01', null, 'dialogue', cast, STAMP);
    expect(findUnit(dialogue.script, 'U01')?.blocks?.[2].who).toBe('E9');
    const heading = edit.insertBlock(model, 'U01', 'B2', 'pause', cast, STAMP);
    expect(findUnit(heading.script, 'U01')?.blocks?.[2]).toMatchObject({ ref: null, snap: null });
    const fresh = edit.insertBlock(withBlocks({}), 'U01', null, 'dialogue', cast, STAMP);
    expect(findUnit(fresh.script, 'U01')?.blocks?.[1].who).toBe('E1');
    const extra = edit.insertBlock(model, 'U01', null, 'scene', cast, STAMP, { loc: 'X' });
    expect(findUnit(extra.script, 'U01')?.blocks?.[2].loc).toBe('X');
  });

  it('keeps the script when the unit is missing', () => {
    const model = script([scriptUnit()]);
    expect(edit.insertBlock(model, 'U01', null, 'note', cast, STAMP).script).toBe(model);
    expect(edit.insertBlock(model, 'zz', null, 'note', cast, STAMP).script).toBe(model);
    expect(edit.removeBlock(model, 'U01', 'B1', STAMP).script).toBe(model);
    expect(edit.setBlockType(model, 'U01', 'B1', 'note', cast, STAMP).script).toBe(model);
    expect(edit.patchBlock(model, 'U01', 'B1', {}, STAMP).script).toBe(model);
    expect(edit.moveBlock(model, 'U01', 'B1', 'up', STAMP).script).toBe(model);
    expect(edit.duplicateBlock(model, 'U01', 'B1', STAMP).script).toBe(model);
  });

  it('removes a block and selects its neighbour', () => {
    const model = withBlocks({}, { type: 'pause' }, {});
    const second = edit.removeBlock(model, 'U01', 'B2', STAMP);
    expect(idsOf(second.script)).toEqual(['B1', 'B3']);
    expect(second.view).toEqual({ sel: 'B1', focus: 'B1' });
    const first = edit.removeBlock(model, 'U01', 'B1', STAMP);
    expect(first.view).toEqual({ sel: 'B2', focus: null });
    const only = edit.removeBlock(withBlocks({}), 'U01', 'B1', STAMP);
    expect(only.view).toEqual({ sel: null, focus: null });
    expect(edit.removeBlock(model, 'U01', 'B9', STAMP).script).toBe(model);
  });

  it('changes the block type with sensible defaults', () => {
    const model = withBlocks({ type: 'narration' }, { type: 'dialogue', who: 'E5' });
    const dialogue = edit.setBlockType(model, 'U01', 'B1', 'dialogue', cast, STAMP);
    expect(findUnit(dialogue.script, 'U01')?.blocks?.[0]).toMatchObject({
      type: 'dialogue',
      who: 'E1',
    });
    expect(dialogue.view).toEqual({ focus: 'B1' });
    const keep = edit.setBlockType(model, 'U01', 'B2', 'dialogue', cast, STAMP);
    expect(findUnit(keep.script, 'U01')?.blocks?.[1].who).toBe('E5');
    const pause = edit.setBlockType(model, 'U01', 'B1', 'pause', cast, STAMP);
    expect(findUnit(pause.script, 'U01')?.blocks?.[0].ms).toBe(800);
    expect(pause.view).toEqual({ focus: null });
  });

  it('patches fields', () => {
    const model = withBlocks({ type: 'scene', loc: 'A' });
    const patched = edit.patchBlock(
      model,
      'U01',
      'B1',
      {
        text: 't',
        who: 'E1',
        paren: 'soft',
        loc: 'tower',
        time: 'NIGHT',
        beat: 'b',
        seconds: 1.26,
      },
      STAMP,
    );
    expect(findUnit(patched.script, 'U01')?.blocks?.[0]).toMatchObject({
      text: 't',
      who: 'E1',
      paren: 'soft',
      loc: 'TOWER',
      time: 'NIGHT',
      beat: 'b',
      ms: 1260,
    });
    expect(edit.pauseMs(99)).toBe(30000);
    expect(edit.pauseMs(-3)).toBe(0);
    expect(edit.pauseMs(Number.NaN)).toBe(0);
    expect(edit.applyPatch(scriptBlock({ ms: 5 }), {}).ms).toBe(5);
  });

  it('moves and duplicates blocks', () => {
    const model = withBlocks({}, {}, {});
    expect(idsOf(edit.moveBlock(model, 'U01', 'B2', 'up', STAMP).script)).toEqual([
      'B2',
      'B1',
      'B3',
    ]);
    expect(idsOf(edit.moveBlock(model, 'U01', 'B2', 'down', STAMP).script)).toEqual([
      'B1',
      'B3',
      'B2',
    ]);
    expect(edit.moveBlock(model, 'U01', 'B1', 'up', STAMP).script).toBe(model);
    expect(edit.moveBlock(model, 'U01', 'B3', 'down', STAMP).script).toBe(model);
    expect(edit.moveBlock(model, 'U01', 'B2', 'up', STAMP).view).toEqual({ sel: 'B2' });
    const copy = edit.duplicateBlock(model, 'U01', 'B1', STAMP);
    expect(idsOf(copy.script)).toEqual(['B1', 'B4', 'B2', 'B3']);
    expect(copy.view).toEqual({ sel: 'B4' });
    expect(copy.script.seq).toBe(4);
  });

  it('chooses the next type for Enter and Tab', () => {
    const audio = configOf('audiobook');
    const film = configOf('film');
    expect(edit.typeAfterEnter(audio, 'heading')).toBe('narration');
    expect(edit.typeAfterEnter(audio, 'dialogue')).toBe('narration');
    expect(edit.typeAfterEnter(film, 'scene')).toBe('action');
    expect(edit.typeAfterEnter(film, 'note')).toBe('action');
    expect(edit.typeAfterEnter({ ...film, types: ['note'] }, 'scene')).toBe('note');
    expect(edit.typeAfterEnter({ ...film, types: ['pause'] }, 'scene')).toBe('scene');
    expect(edit.cycleType(audio, 'heading', false)).toBe('narration');
    expect(edit.cycleType(audio, 'note', false)).toBe('heading');
    expect(edit.cycleType(audio, 'heading', true)).toBe('note');
    expect(edit.cycleType({ ...audio, types: ['pause'] }, 'pause', false)).toBe('pause');
  });
});

describe('scripting edit: units', () => {
  it('starts writing from scratch', () => {
    const model = script([scriptUnit({ status: 'review', meta: { blocks: 8, words: 1 } })]);
    const change = edit.startUnit(model, 'U01', cast, STAMP);
    const unit = findUnit(change.script, 'U01');
    expect(unit).toMatchObject({ status: 'draft', meta: null });
    expect(unit?.blocks).toHaveLength(1);
    expect(unit?.blocks?.[0].type).toBe('heading');
    expect(change.view.sel).toBe('B1');
    expect(edit.startUnit(model, 'zz', cast, STAMP).script).toBe(model);
  });

  it('locks and unlocks with stale detection', () => {
    const unit = scriptUnit({ blocks: listOf({ ref: '1.1', snap: 'old' }) });
    const model = script([unit]);
    expect(findUnit(edit.lockUnit(model, 'U01', STAMP), 'U01')).toMatchObject({
      status: 'locked',
      updated: STAMP,
    });
    expect(edit.lockUnit(model, 'zz', STAMP)).toBe(model);
    const locked = edit.lockUnit(model, 'U01', STAMP);
    expect(findUnit(edit.unlockUnit(locked, 'U01', source('new'), STAMP), 'U01')?.status).toBe(
      'review',
    );
    expect(findUnit(edit.unlockUnit(locked, 'U01', source('old'), STAMP), 'U01')?.status).toBe(
      'draft',
    );
    expect(findUnit(edit.unlockUnit(locked, 'U01', null, STAMP), 'U01')?.status).toBe('draft');
    expect(edit.unlockUnit(locked, 'zz', null, STAMP)).toBe(locked);
  });

  it('edits the unit title and chapters', () => {
    const model = script([scriptUnit()]);
    expect(findUnit(edit.setUnitTitle(model, 'U01', '  Name ', STAMP), 'U01')?.title).toBe('Name');
    expect(edit.setUnitTitle(model, 'zz', 'x', STAMP)).toBe(model);
    expect(findUnit(edit.setUnitChapters(model, 'U01', [2, 3], STAMP), 'U01')?.chs).toEqual([2, 3]);
    expect(edit.setUnitChapters(model, 'zz', [2, 3], STAMP)).toBe(model);
    expect(edit.addUnitWith(model, [4, 4]).units[1]).toMatchObject({ id: 'U02', chs: [4, 4] });
  });

  it('switches the preset and clears the drafts', () => {
    const model = script([scriptUnit({ blocks: listOf({}), meta: { blocks: 8, words: 1 } })], {
      choose: true,
    });
    const next = edit.setPreset(model, 'film');
    expect(next.cfg.preset).toBe('film');
    expect(next.choose).toBe(false);
    expect(next.units[0].blocks).toBeNull();
    expect(next.units[0].meta).not.toBeNull();
  });
});

describe('scripting edit: source repair', () => {
  const src = source('Alpha.', 'Beta.', 'Gamma.');

  it('resets a unit to the default and keeps matching ids', () => {
    const unit = scriptUnit({
      status: 'review',
      blocks: [
        scriptBlock({ id: 'B7', type: 'heading', text: 'Chapter one. First.' }),
        scriptBlock({ id: 'B8', type: 'pause', ms: 800 }),
        scriptBlock({ id: 'B9', type: 'narration', text: 'Alpha.', ref: '1.1' }),
        scriptBlock({ id: 'B10', type: 'narration', text: 'edited', ref: '1.2' }),
      ],
    });
    const model = script([unit], { seq: 10 });
    const next = edit.applyDefault(model, 'U01', src, STAMP);
    const blocks = findUnit(next ?? model, 'U01')?.blocks ?? [];
    expect(blocks.map((item) => item.id)).toEqual(['B7', 'B8', 'B9', 'B14', 'B15']);
    expect(blocks[3].text).toBe('Beta.');
    expect(next?.seq).toBe(15);
    expect(findUnit(next ?? model, 'U01')).toMatchObject({ status: 'draft', meta: null });
    expect(edit.applyDefault(model, 'U01', null, STAMP)).toBeNull();
    expect(edit.applyDefault(model, 'zz', src, STAMP)).toBeNull();
    const locked = edit.applyDefault(script([scriptUnit({ status: 'draft' })]), 'U01', src, STAMP);
    expect(findUnit(locked ?? model, 'U01')?.blocks).toHaveLength(5);
  });

  it('resets many units and lists the resettable ones', () => {
    const model = script([
      scriptUnit({ id: 'U01' }),
      scriptUnit({ id: 'U02', no: 2, status: 'locked' }),
      scriptUnit({ id: 'U03', no: 3, meta: { blocks: 8, words: 1 } }),
      scriptUnit({ id: 'U04', no: 4 }),
    ]);
    const sources = { U01: src, U02: src, U03: src, U04: null };
    expect(edit.resettableUnits(model, sources).map((item) => item.id)).toEqual(['U01']);
    const result = edit.resetUnits(model, ['U01', 'U04'], sources, STAMP);
    expect(result.count).toBe(1);
    expect(findUnit(result.script, 'U01')?.blocks).toHaveLength(5);
    expect(edit.resetUnits(model, [], sources, STAMP)).toEqual({ script: model, count: 0 });
  });

  it('keeps the narration when the source changed', () => {
    const unit = scriptUnit({
      blocks: listOf({ ref: '1.2', snap: 'old' }, { ref: '1.3', snap: 'old' }),
    });
    const next = edit.keepRef(script([unit]), 'U01', '1.2', src, STAMP);
    expect(findUnit(next, 'U01')?.blocks?.map((item) => item.snap)).toEqual(['Beta.', 'old']);
    const model = script([unit]);
    expect(edit.keepRef(model, 'U01', '1.2', null, STAMP)).toBe(model);
    expect(edit.keepRef(model, 'U01', '9.9', src, STAMP)).toBe(model);
    expect(edit.keepRef(model, 'zz', '1.2', src, STAMP)).toBe(model);
  });

  it('regenerates a paragraph', () => {
    const quoted = source('Plain.', '“Go,” she said.');
    const unit = scriptUnit({
      blocks: listOf(
        { id: 'B1', ref: '1.1', text: 'old', snap: 'old' },
        { type: 'dialogue', who: 'E4', ref: '1.2', text: 'old', snap: 'old' },
        { type: 'narration', ref: '1.2', text: 'old', snap: 'old' },
        { type: 'note', text: 'tail' },
      ),
    });
    const model = script([unit], { seq: 4 });
    const one = edit.regenerateRef(model, 'U01', '1.1', quoted, STAMP);
    expect(findUnit(one, 'U01')?.blocks?.[0]).toMatchObject({
      id: 'B5',
      text: 'Plain.',
      snap: 'Plain.',
    });
    const two = edit.regenerateRef(model, 'U01', '1.2', quoted, STAMP);
    const blocks = findUnit(two, 'U01')?.blocks ?? [];
    expect(blocks.map((item) => [item.type, item.who, item.text])).toEqual([
      ['narration', '', 'old'],
      ['dialogue', 'E4', 'Go.'],
      ['narration', '', 'she said.'],
      ['note', '', 'tail'],
    ]);
    expect(edit.regenerateRef(model, 'U01', '1.9', quoted, STAMP)).toBe(model);
    expect(edit.regenerateRef(model, 'U01', '1.1', null, STAMP)).toBe(model);
  });

  it('adds narration for an uncovered paragraph in order', () => {
    const unit = scriptUnit({ blocks: listOf({ ref: '1.3', snap: 'Gamma.' }) });
    const model = script([unit], { seq: 1 });
    const next = edit.coverRef(model, 'U01', '1.2', src, STAMP);
    expect(findUnit(next, 'U01')?.blocks?.map((item) => item.ref)).toEqual(['1.2', '1.3']);
    const tail = edit.coverRef(model, 'U01', '1.3', src, STAMP);
    expect(findUnit(tail, 'U01')?.blocks?.map((item) => item.ref)).toEqual(['1.3', '1.3']);
    expect(edit.coverRef(model, 'U01', '9.9', src, STAMP)).toBe(model);
    expect(edit.coverRef(model, 'U01', '1.2', null, STAMP)).toBe(model);
  });
});

describe('scripting edit: cast', () => {
  const model = newScript('audiobook');

  it('adds, renames and removes extra characters', () => {
    const added = edit.addExtraMember(model, cast, ' Tea Woman ', 'x1');
    expect(added.result).toBe('added');
    expect(added.script.extraCast).toEqual([{ id: 'x1', name: 'Tea Woman', kind: 'extra', c: 2 }]);
    expect(edit.addExtraMember(model, cast, '  ', 'x2').result).toBe('empty');
    expect(edit.addExtraMember(model, cast, 'wren', 'x2').result).toBe('duplicate');
    const renamed = edit.renameExtraMember(added.script, 'x1', ' Old Woman ');
    expect(renamed.extraCast[0].name).toBe('Old Woman');
    expect(edit.renameExtraMember(added.script, 'x1', ' ')).toBe(added.script);
    expect(edit.renameExtraMember(added.script, 'zz', 'a')).toBe(added.script);
    expect(edit.removeExtraMember(added.script, 'x1').extraCast).toEqual([]);
    expect(edit.removeExtraMember(added.script, 'zz')).toBe(added.script);
  });

  it('refuses to remove a character in use', () => {
    const used = script([scriptUnit({ blocks: listOf({ type: 'dialogue', who: 'x1' }) })], {
      extraCast: [{ id: 'x1', name: 'A', kind: 'extra', c: 1 }],
    });
    expect(edit.castUsage(used, 'x1')).toBe(1);
    expect(edit.castUsage(used, 'x9')).toBe(0);
    expect(edit.removeExtraMember(used, 'x1')).toBe(used);
  });
});
