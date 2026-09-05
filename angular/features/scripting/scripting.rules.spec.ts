import { script, scriptBlock, scriptUnit, source } from '@testing/scripting';
import { describe, expect, it } from 'vitest';

import { CastMember, ScriptBlock } from './scripting.models';
// prettier-ignore
import { activeUnit, appendUnit, BLOCK_TYPES, castOf, chaptersOf, configOf, countWords, emptyView, findBlock, findUnit, firstSpeaker, hasContent, hasDefaultFor, headingText, makeBlock, makeSource, makeUnit, metricsOf, narratorMember, newScript, nextChapterRange, nextUnitChapters, numberWord, pad2, paragraphChapter, paragraphNumber, placeholderMeta, presetDef, presetOfTemplate, replaceUnit, scenesOf, scriptProgress,speakerClass, speakerOf } from './scripting.rules';

function blocks(...overrides: Partial<ScriptBlock>[]): ScriptBlock[] {
  return overrides.map((item, index) => scriptBlock({ id: `B${index + 1}`, ...item }));
}

describe('scripting rules: text helpers', () => {
  it('formats numbers and counts words', () => {
    expect(pad2(3)).toBe('03');
    expect(numberWord(2)).toBe('two');
    expect(numberWord(40)).toBe('40');
    expect(countWords('  one two   three ')).toBe(3);
    expect(countWords('')).toBe(0);
    expect(countWords(null)).toBe(0);
    expect(headingText(3, 'Tide')).toBe('Chapter three. Tide.');
    expect(headingText(3, '')).toBe('Chapter three.');
  });

  it('parses paragraph references', () => {
    expect(paragraphChapter('3.2')).toBe(3);
    expect(paragraphNumber('3.2')).toBe(2);
  });
});

describe('scripting rules: configuration', () => {
  it('describes presets and templates', () => {
    expect(configOf('audiobook').types).toEqual([
      'heading',
      'narration',
      'dialogue',
      'pause',
      'note',
    ]);
    expect(configOf('film').ranges).toBe(true);
    expect(configOf('film').types).not.toBe(configOf('film').types);
    expect(presetOfTemplate('audiobook')).toBe('audiobook');
    expect(presetOfTemplate('filmseries')).toBe('film');
    expect(presetOfTemplate('blank')).toBeNull();
    expect(presetDef('film').id).toBe('film');
    expect(BLOCK_TYPES.dialogue.who).toBe(true);
    expect(BLOCK_TYPES.pause.text).toBe(false);
    expect(BLOCK_TYPES.scene.labelKey).toBe('scripting.type.scene');
  });

  it('builds blocks, units and scripts', () => {
    const ids = { seq: 4 };
    const block = makeBlock(ids, 'pause', { ms: 800 });
    expect(block.id).toBe('B5');
    expect(ids.seq).toBe(5);
    expect(block.time).toBe('MORNING');
    expect(placeholderMeta(1000)).toEqual({ blocks: 26, words: 1000 });
    expect(placeholderMeta(100).blocks).toBe(8);
    const base = newScript('film', { choose: true });
    expect(base.choose).toBe(true);
    const unit = makeUnit(base, { title: 'x' });
    expect(unit.id).toBe('U01');
    const grown = appendUnit(appendUnit(base), { chs: [1, 2] });
    expect(grown.units.map((item) => item.id)).toEqual(['U01', 'U02']);
    expect(grown.useq).toBe(2);
    expect(findUnit(grown, 'U02')?.chs).toEqual([1, 2]);
    expect(findUnit(grown, 'U09')).toBeUndefined();
  });

  it('finds and replaces units and blocks', () => {
    const unit = scriptUnit({ blocks: blocks({}, { type: 'pause' }) });
    const model = script([unit]);
    expect(findBlock(unit, 'B2')?.type).toBe('pause');
    expect(findBlock(null, 'B2')).toBeUndefined();
    expect(replaceUnit(model, { ...unit, title: 'New' }).units[0].title).toBe('New');
  });

  it('picks the active unit', () => {
    const model = script([scriptUnit({ id: 'U01' }), scriptUnit({ id: 'U02', no: 2 })]);
    expect(activeUnit(model, 'U02')?.id).toBe('U02');
    expect(activeUnit(model, null)?.id).toBe('U01');
    expect(activeUnit(model, 'zzz')?.id).toBe('U01');
    expect(activeUnit(script(), null)).toBeNull();
  });

  it('lists chapters and clamps ranges', () => {
    expect(chaptersOf({ ch: null, chs: [2, 4] })).toEqual([2, 3, 4]);
    expect(chaptersOf({ ch: 5, chs: null })).toEqual([5]);
    expect(chaptersOf({ ch: null, chs: null })).toEqual([]);
    expect(nextChapterRange(null, 0, 3, 10)).toEqual([3, 3]);
    expect(nextChapterRange([2, 4], 1, 99, 10)).toEqual([2, 10]);
    expect(nextChapterRange([2, 4], 0, 6, 10)).toEqual([6, 6]);
    expect(nextChapterRange([2, 4], 1, 1, 10)).toEqual([1, 1]);
    expect(nextChapterRange([2, 4], 0, Number.NaN, 10)).toEqual([2, 4]);
    expect(nextChapterRange([2, 4], 0, -5, 10)).toEqual([1, 4]);
  });

  it('proposes the chapters of a new unit', () => {
    const film = newScript('film');
    expect(nextUnitChapters(film, 10)).toBeNull();
    const withRange = appendUnit(film, { chs: [1, 3] });
    expect(nextUnitChapters(withRange, 10)).toEqual([4, 4]);
    expect(nextUnitChapters(withRange, 3)).toEqual([3, 3]);
    expect(nextUnitChapters(withRange, 0)).toEqual([4, 4]);
  });
});

describe('scripting rules: cast', () => {
  const extra: CastMember = { id: 'x1', name: 'Extra', kind: 'extra', c: 4 };

  it('builds the cast per preset', () => {
    const characters = [
      { id: 'E1', name: 'Wren' },
      { id: 'E3', name: 'Maro' },
    ];
    const audio = castOf('audiobook', characters, [extra]);
    expect(audio.map((member) => member.id)).toEqual(['narr', 'E1', 'E3', 'x1']);
    expect(audio[1]).toEqual({ id: 'E1', name: 'Wren', kind: 'kb', c: 0 });
    expect(castOf('film', characters, []).map((member) => member.id)).toEqual(['E1', 'E3']);
    expect(firstSpeaker(audio)).toBe('E1');
    expect(firstSpeaker([narratorMember()])).toBe('');
    expect(speakerOf(audio, 'E3')?.name).toBe('Maro');
    expect(speakerOf(audio, 'zz')).toBeUndefined();
  });

  it('classifies speakers', () => {
    expect(speakerClass(undefined)).toBe('spk-x');
    expect(speakerClass(narratorMember())).toBe('spk-n');
    expect(speakerClass({ id: 'a', name: 'a', kind: 'kb', c: 7 })).toBe('spk-1');
  });
});

describe('scripting rules: source rows', () => {
  const src = source('A one.', 'B two.', 'C three.');

  it('indexes source paragraphs by id', () => {
    expect(makeSource([{ id: '1.1', text: 'x' }]).map).toEqual({ '1.1': 'x' });
    expect(src.list.map((item) => item.id)).toEqual(['1.1', '1.2', '1.3']);
  });

  it('computes the default availability', () => {
    expect(hasDefaultFor(configOf('audiobook'), src)).toBe(true);
    expect(hasDefaultFor(configOf('audiobook'), null)).toBe(false);
    expect(hasDefaultFor(configOf('film'), src)).toBe(false);
  });
});

describe('scripting rules: scenes and metrics', () => {
  it('groups scene bodies', () => {
    const list = blocks(
      { type: 'action' },
      { type: 'scene' },
      { type: 'action' },
      { type: 'scene' },
      { type: 'dialogue' },
      { type: 'note' },
    );
    const scenes = scenesOf(list);
    expect(scenes).toHaveLength(2);
    expect(scenes[0]).toMatchObject({ index: 1, no: 1, end: 3 });
    expect(scenes[0].body.map((item) => item.id)).toEqual(['B3']);
    expect(scenes[1]).toMatchObject({ index: 3, no: 2, end: 6 });
    expect(scenes[1].body).toHaveLength(2);
    expect(scenesOf(null)).toEqual([]);
  });

  it('measures words, pauses and speakers', () => {
    const cast = castOf('audiobook', [{ id: 'E1', name: 'Wren' }], []);
    const metrics = metricsOf(
      cast,
      blocks(
        { type: 'heading', text: 'One two' },
        { type: 'pause', ms: 1500 },
        { type: 'narration', text: 'a b c' },
        { type: 'dialogue', who: 'E1', text: 'hi there' },
        { type: 'dialogue', who: '', text: 'who' },
        { type: 'action', text: 'runs fast now' },
        { type: 'note', text: 'ignored words here' },
        { type: 'scene' },
      ),
    );
    expect(metrics.blocks).toBe(8);
    expect(metrics.words).toBe(2 + 3 + 2 + 1 + 3);
    expect(metrics.pause).toBe(1.5);
    expect(metrics.scenes).toBe(1);
    expect(metrics.lines).toBe(2);
    expect(metrics.byWho).toEqual({ narr: 5, E1: 2, '?': 1 });
    expect(metrics.byType.dialogue).toBe(2);
    expect(metrics.secs).toBeCloseTo(11 / 2.5 + 1.5);
    expect(metricsOf([], null).blocks).toBe(0);
    expect(metricsOf([], blocks({ type: 'narration', text: 'x' })).byWho).toEqual({ narr: 1 });
  });
});

describe('scripting rules: progress and view', () => {
  it('detects unit content', () => {
    const written = scriptUnit({ blocks: blocks({}) });
    const placeholder = scriptUnit({ id: 'U02', no: 2, meta: { blocks: 8, words: 1 } });
    const empty = scriptUnit({ id: 'U03', no: 3, blocks: [] });
    expect([hasContent(written), hasContent(placeholder), hasContent(empty)]).toEqual([
      true,
      true,
      false,
    ]);
  });

  it('derives the module progress', () => {
    const written = scriptUnit({ blocks: blocks({}) });
    const placeholder = scriptUnit({ id: 'U02', no: 2, meta: { blocks: 8, words: 1 } });
    const empty = scriptUnit({ id: 'U03', no: 3 });
    expect(scriptProgress(script([written, placeholder]))).toEqual({
      id: 'scripting',
      state: 'done',
      done: 2,
      total: 2,
      note: '2/2 chapters',
    });
    expect(scriptProgress(script([written, empty]))).toMatchObject({
      state: 'doing',
      done: 1,
      note: '1/2 chapters',
    });
    expect(scriptProgress(script([empty, empty])).state).toBe('idle');
    const film = script([empty], { cfg: configOf('film') });
    expect(scriptProgress(film).note).toBe('0/1 episodes');
  });

  it('starts with an empty view', () => {
    expect(emptyView()).toEqual({ unit: null, sel: null, focus: null, goto: null });
  });
});
