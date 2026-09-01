import { describe, expect, it } from 'vitest';

import { PROJECT_FIXTURES } from '../../stories/screens/project-management.fixtures';
// prettier-ignore
import { mockSourceOf, seedScripts, SPEAKER_HINTS, TEA_WOMAN } from '../../stories/screens/scripting.fixtures';
import { scriptingHandlers, withThirdChapter } from '../../stories/screens/scripting.mocks';
import { Script } from './scripting.models';
import { findUnit } from './scripting.rules';

const WIRE_BASE = {
  translation_get: () => ({ guidelines: '', dict: [], chapters: {}, warnings: [] }),
};

function project(id: number) {
  const found = PROJECT_FIXTURES.find((item) => item.id === id);
  if (!found) {
    throw new Error('missing project');
  }
  return found;
}

function unitOf(script: Script, id: string) {
  const unit = findUnit(script, id);
  if (!unit) {
    throw new Error('missing unit');
  }
  return unit;
}

describe('scripting seeds: Harrowmere audiobook', () => {
  const script = seedScripts()[1];

  it('has one unit per chapter', () => {
    expect(script.cfg.preset).toBe('audiobook');
    expect(script.units).toHaveLength(12);
    expect(script.units.map((unit) => unit.id)[11]).toBe('U12');
    expect(script.extraCast).toEqual([]);
    expect(script.units[0].title).toBe('Ngọn đèn cuối cùng');
    expect(script.units[3].title).toBe('The Ledger of Names');
    expect(script.useq).toBe(12);
  });

  it('numbers the blocks B1 to B33', () => {
    const all = script.units.flatMap((unit) => unit.blocks ?? []);
    expect(all).toHaveLength(33);
    expect(script.seq).toBe(33);
    expect(unitOf(script, 'U01').blocks?.at(0)?.id).toBe('B1');
    expect(unitOf(script, 'U01').blocks).toHaveLength(13);
    expect(unitOf(script, 'U02').blocks).toHaveLength(14);
    expect(unitOf(script, 'U03').blocks?.map((block) => block.id)).toEqual([
      'B27',
      'B28',
      'B29',
      'B30',
      'B31',
      'B32',
    ]);
    expect(unitOf(script, 'U02').blocks?.find((block) => block.type === 'note')?.id).toBe('B33');
  });

  it('splits the dialogue with the proto speakers and tones', () => {
    const first = unitOf(script, 'U01').blocks ?? [];
    expect(first[0].text).toBe('Chapter one. Ngọn đèn cuối cùng.');
    expect(first[1]).toMatchObject({ type: 'pause', ms: 800 });
    const dialogues = first.filter((block) => block.type === 'dialogue');
    expect(dialogues.map((block) => [block.ref, block.who, block.paren])).toEqual([
      ['1.3', SPEAKER_HINTS['1.3'], 'dry, curt'],
      ['1.3', SPEAKER_HINTS['1.3'], ''],
      ['1.4', SPEAKER_HINTS['1.4'], 'cold, does not turn back'],
      ['1.4', SPEAKER_HINTS['1.4'], ''],
    ]);
    expect(dialogues[0].text).toBe('Cô đang phí dầu đấy.');
    const second = unitOf(script, 'U02').blocks ?? [];
    expect(second.filter((block) => block.who === 'E5')[0].paren).toBe(
      'reading the letter, formal',
    );
    expect(second.filter((block) => block.who === TEA_WOMAN.id)).toHaveLength(2);
    expect(second.findIndex((block) => block.type === 'note')).toBe(
      second.findIndex((block) => block.ref === '2.3') - 1,
    );
  });

  it('keeps placeholder content for chapters without sample text', () => {
    const fourth = unitOf(script, 'U04');
    expect(fourth.blocks).toBeNull();
    expect(fourth.meta).toEqual({ blocks: 8, words: 128 });
    expect(script.units[11].meta?.words).toBe(117);
  });

  it('writes chapter 3 from the current source text', () => {
    const owner = project(1);
    const blocks = unitOf(script, 'U03').blocks ?? [];
    const source = mockSourceOf(owner, 3) ?? [];
    for (const block of blocks.filter((item) => item.ref !== null)) {
      const paragraph = source.find((item) => item.id === block.ref);
      expect(paragraph?.text).toContain(block.text);
    }
    expect(mockSourceOf(owner, 4)).toBeNull();
    expect(mockSourceOf(project(2), 1)).toBeNull();
    expect(mockSourceOf(project(3), 1)?.[0].text).toContain('Wren Aldous');
  });
});

describe('scripting seeds: other projects', () => {
  const scripts = seedScripts();

  it('seeds the film series with an empty second episode', () => {
    const film = scripts[3];
    expect(film.cfg.preset).toBe('film');
    expect(film.units.map((unit) => [unit.id, unit.chs])).toEqual([
      ['U01', [1, 2]],
      ['U02', [3, 3]],
    ]);
    const blocks = unitOf(film, 'U01').blocks ?? [];
    expect(blocks.map((block) => block.id)).toEqual([
      'B1',
      'B2',
      'B3',
      'B4',
      'B5',
      'B6',
      'B7',
      'B8',
      'B9',
      'B10',
    ]);
    expect(blocks.filter((block) => block.type === 'scene').map((block) => block.loc)).toEqual([
      'LANTERN TOWER',
      'LANTERN TOWER',
      'SUNKEN WHARF',
      'BOARDING HOUSE',
      'SUNKEN WHARF',
    ]);
    expect(blocks[4]).toMatchObject({ type: 'dialogue', who: 'E3', paren: 'dry, curt' });
    expect(unitOf(film, 'U02').blocks).toBeNull();
  });

  it('seeds placeholder scripts', () => {
    expect(scripts[4].units).toHaveLength(8);
    expect(scripts[4].units[0]).toMatchObject({
      title: 'Chapters 1',
      meta: { blocks: 59, words: 2230 },
    });
    expect(scripts[6].cfg.preset).toBe('film');
    expect(scripts[6].units.map((unit) => unit.chs)).toEqual([
      [1, 1],
      [2, 2],
    ]);
    expect(scripts[6].units[1].title).toBe('Episode 2');
  });

  it('seeds the shorts with one narration per paragraph', () => {
    const shorts = scripts[5];
    const types = new Set((shorts.units[0].blocks ?? []).map((block) => block.type));
    expect([...types]).toEqual(['narration']);
    expect(scripts[2]).toBeUndefined();
  });
});

describe('scripting mock backend', () => {
  function handlers() {
    return scriptingHandlers(WIRE_BASE);
  }

  it('serves copies of the stored scripts', () => {
    const backend = handlers();
    const first = backend['scripting_get']({ projectId: 1 }) as Script;
    first.units = [];
    expect((backend['scripting_get']({ projectId: 1 }) as Script).units).toHaveLength(12);
    expect(backend['scripting_get']({ projectId: 2 })).toBeNull();
  });

  it('stores scripts, units and cast and derives the module progress', () => {
    const backend = handlers();
    const initial = backend['project_modules']({ projectId: 1 }) as { id: string; note: string }[];
    expect(initial.find((row) => row.id === 'scripting')?.note).toBe('12/12 chapters');
    const script = backend['scripting_get']({ projectId: 1 }) as Script;
    const original = unitOf(script, 'U03');
    const cleared = { ...original, blocks: [], meta: null };
    backend['scripting_unit_save']({ projectId: 1, unit: cleared, seq: 40 });
    const reduced = backend['project_modules']({ projectId: 1 }) as {
      id: string;
      state: string;
      note: string;
    }[];
    expect(reduced.find((row) => row.id === 'scripting')).toMatchObject({
      state: 'doing',
      note: '11/12 chapters',
    });
    expect(reduced.find((row) => row.id === 'audiobook')?.state).toBe('stale');
    expect((backend['scripting_get']({ projectId: 1 }) as Script).seq).toBe(40);
    backend['scripting_unit_save']({ projectId: 1, unit: original, seq: 40 });
    const again = backend['project_modules']({ projectId: 1 }) as {
      id: string;
      state: string;
      note: string;
    }[];
    expect(again.find((row) => row.id === 'scripting')).toMatchObject({
      state: 'done',
      note: '12/12 chapters',
    });
    backend['scripting_cast_save']({ projectId: 1, extraCast: [] });
    expect((backend['scripting_get']({ projectId: 1 }) as Script).extraCast).toEqual([]);
    backend['scripting_save']({ projectId: 2, script: { ...script, units: [] } });
    expect((backend['scripting_get']({ projectId: 2 }) as Script).units).toEqual([]);
    expect(backend['project_modules']({ projectId: 2 })).toHaveLength(1);
  });

  it('serves no AI draft command', () => {
    expect(handlers()['scripting_draft_generate']).toBeUndefined();
  });

  it('rejects writes to unknown scripts and units', () => {
    const backend = handlers();
    const script = backend['scripting_get']({ projectId: 1 }) as Script;
    expect(() =>
      backend['scripting_unit_save']({ projectId: 2, unit: script.units[0], seq: 1 }),
    ).toThrow();
    expect(() =>
      backend['scripting_unit_save']({ projectId: 1, unit: { id: 'zz' }, seq: 1 }),
    ).toThrow();
    expect(() => backend['scripting_cast_save']({ projectId: 2, extraCast: [] })).toThrow();
  });

  it('adds the third chapter to the Vietnamese translation only once', () => {
    const wire = { guidelines: '', dict: [], chapters: {}, warnings: [] };
    const vi = withThirdChapter(wire, 'VI');
    expect(Object.keys(vi.chapters)).toEqual(['ch-3']);
    expect(vi.chapters['ch-3'].paragraphs).toHaveLength(4);
    expect(withThirdChapter(vi, 'VI')).toBe(vi);
    expect(withThirdChapter(wire, 'EN')).toBe(wire);
    const served = handlers()['translation_get']({ target: 'VI' }) as typeof wire;
    expect(Object.keys(served.chapters)).toEqual(['ch-3']);
  });
});
