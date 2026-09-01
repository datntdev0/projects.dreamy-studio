import {
  audiobook,
  audioRecord,
  availability,
  cast,
  EXTRA_CAST,
  HERO_CAST,
  NARRATOR_CAST,
} from '@testing/audiobook';
import { libraryVoice } from '@testing/fixtures';
import { script, scriptBlock, scriptUnit } from '@testing/scripting';
import { describe, expect, it } from 'vitest';

import {
  buildContext,
  ContextInput,
  DEFAULT_TEST_TEXT,
  listRowsOf,
  passesFilter,
  segmentRowsOf,
  voiceGroupsOf,
} from './audiobook.context';
import { emptyBook, emptyUnitAudio, emptyView } from './audiobook.rules';

const voices = [
  libraryVoice({ id: 1, name: 'Local', engine: 'vieneu-turbo' }),
  libraryVoice({ id: 2, name: 'Edge', engine: 'edge-read-aloud', engineKind: 'cloud' }),
  libraryVoice({ id: 3, name: 'Nano', engine: 'vieneu-nano' }),
];

const blocks = [
  scriptBlock({ id: 'h', type: 'heading', text: 'Title' }),
  scriptBlock({ id: 'p', type: 'pause', text: '', ms: 1500 }),
  scriptBlock({ id: 'n', type: 'narration', text: 'Wren walks.' }),
  scriptBlock({ id: 'd', type: 'dialogue', text: 'Hello', who: 'E1' }),
  scriptBlock({ id: 'x', type: 'note', text: 'Internal' }),
];

const unit = scriptUnit({ id: 'U01', no: 1, status: 'locked', blocks });

function input(overrides: Partial<ContextInput> = {}): ContextInput {
  const book = audiobook({
    voices: { narr: { voice: 1, speed: 1 }, E1: { voice: 2, speed: 1.2 } },
    lex: [{ id: 'L01', term: 'Wren', say: 'Ren', kind: 'names' }],
    units: {
      U01: {
        ...emptyUnitAudio(),
        audio: {
          h: audioRecord({ text: 'Title', voice: 1 }),
          d: audioRecord({ text: 'Hello', voice: 2, speed: 1.2, flag: 'bad' }),
        },
      },
    },
  });
  return {
    projectId: 1,
    script: script([unit, scriptUnit({ id: 'U02', no: 2, blocks: null })]),
    cast: cast(NARRATOR_CAST, HERO_CAST, EXTRA_CAST),
    book,
    view: emptyView(),
    voices,
    availability: availability(),
    jobs: [],
    ...overrides,
  };
}

describe('segment rows', () => {
  it('numbers voiced blocks and carries state, speaker and highlights', () => {
    const env = { book: input().book, cast: input().cast, voices };
    const rows = segmentRowsOf(env, unit, ['n']);
    expect(rows.map((row) => [row.n, row.block.id, row.state])).toEqual([
      [1, 'h', 'done'],
      [2, 'n', 'running'],
      [3, 'd', 'flag'],
    ]);
    expect(rows[1].speaker?.id).toBe('narr');
    expect(rows[1].parts.map((part) => part.say)).toEqual(['Ren', null]);
    expect(rows[1].readText).toBe('Ren walks.');
    expect(rows[2].speakerClass).toBe('spk-0');
    expect(rows[0].speakerClass).toBe('spk-n');
  });

  it('filters rows and keeps pauses only for the all filter', () => {
    const env = { book: input().book, cast: input().cast, voices };
    const rows = segmentRowsOf(env, unit, []);
    expect(listRowsOf(unit, rows, 'all').map((row) => row.kind)).toEqual([
      'segment',
      'pause',
      'segment',
      'segment',
    ]);
    expect(listRowsOf(unit, rows, 'todo')).toHaveLength(2);
    expect(listRowsOf(unit, rows, 'flag')).toHaveLength(1);
    expect(listRowsOf(unit, rows, 'stale')).toEqual([]);
    expect(listRowsOf(null, rows, 'all')).toEqual([]);
    expect(passesFilter('todo', { ...rows[0], state: 'running' })).toBe(true);
    expect(passesFilter('stale', { ...rows[0], state: 'stale' })).toBe(true);
  });
});

describe('voice groups', () => {
  it('lists every voice by engine kind with usability', () => {
    const groups = voiceGroupsOf(voices, availability());
    expect(groups.map((group) => group.kind)).toEqual(['local', 'cloud']);
    expect(groups[0].options.map((option) => [option.voice.id, option.usable])).toEqual([
      [1, true],
      [3, false],
    ]);
    expect(groups[0].options[1].issue?.kind).toBe('model');
    expect(groups[1].options[0]).toMatchObject({ usable: true, engineName: 'Edge Read Aloud' });
  });
});

describe('buildContext', () => {
  it('builds the production view for the active unit', () => {
    const ctx = buildContext(input({ view: { ...emptyView(), unit: 'U01', sel: 'd' } }));
    expect(ctx.unit?.id).toBe('U01');
    expect(ctx.locked).toBe(true);
    expect(ctx.running).toEqual([]);
    expect(ctx.stat).toMatchObject({ total: 3, done: 1, stale: 1, none: 1 });
    expect(ctx.summary).toMatchObject({ segments: 3, generated: 1, pending: 2 });
    expect(ctx.todo.map((block) => block.id)).toEqual(['n', 'd']);
    expect(ctx.blockers).toEqual([]);
    expect(ctx.canGenerate).toBe(true);
    expect(ctx.canPlay).toBe(true);
    expect(ctx.inspector).toBe('segment');
    expect(ctx.selected?.block.id).toBe('d');
    expect(ctx.segmentPanel).toMatchObject({
      canFlag: false,
      canClearFlag: true,
      usable: true,
      changed: false,
    });
    expect(ctx.chapterPanel).toMatchObject({ locked: true, total: 3, generated: 1, attention: 2 });
    expect(ctx.chapterPanel.mix).toEqual(emptyUnitAudio().mix);
    expect(ctx.rail.map((row) => [row.unit.id, row.active])).toEqual([
      ['U01', true],
      ['U02', false],
    ]);
    expect(ctx.railSummary).toEqual({ done: 0, total: 2, percent: 0 });
    expect(ctx.engines).toEqual({ localModels: 1, cloudProviders: 1 });
    expect(ctx.generating).toBe(false);
  });

  it('falls back to the first unfinished unit and an empty selection', () => {
    const ctx = buildContext(input());
    expect(ctx.unit?.id).toBe('U01');
    expect(ctx.inspector).toBe('chapter');
    expect(ctx.segmentPanel).toBeNull();
    const none = buildContext(input({ script: script([]) }));
    expect(none.unit).toBeNull();
    expect(none.stat).toBeNull();
    expect(none.summary).toBeNull();
    expect(none.canGenerate).toBe(false);
    expect(none.chapterPanel).toMatchObject({ locked: false, total: 0, mix: null });
    expect(none.railSummary.percent).toBe(0);
  });

  it('reports running jobs, blockers and a meta unit', () => {
    const jobs = [
      { unitId: 'U01', blockId: 'n' },
      { unitId: 'U02', blockId: 'z' },
    ];
    const running = buildContext(input({ jobs, view: { ...emptyView(), unit: 'U01' } }));
    expect(running.running).toEqual(['n']);
    expect(running.generating).toBe(true);
    expect(running.canGenerate).toBe(false);
    expect(running.summary?.running).toBe(1);
    const meta = buildContext(input({ view: { ...emptyView(), unit: 'U02' } }));
    expect(meta.segments).toEqual([]);
    expect(meta.blockers).toEqual([]);
    expect(meta.chapterPanel.mix).toBeNull();
    expect(meta.canGenerate).toBe(false);
    const open = buildContext(
      input({
        script: script([{ ...unit, status: 'draft' }]),
        availability: availability({ backendRunning: false }),
      }),
    );
    expect(open.blockers.map((item) => item.kind)).toEqual(['lock', 'engine']);
  });

  it('describes speakers for the voices view', () => {
    const ctx = buildContext(input({ view: { ...emptyView(), mode: 'voices', unit: 'U01' } }));
    expect(ctx.inspector).toBe('voices');
    const [narrator, hero, extra] = ctx.speakers;
    expect(narrator).toMatchObject({
      status: 'ready',
      uses: 2,
      nameEditable: false,
      deleteBlock: 'narrator',
      canPreview: true,
      previewSendsText: false,
      engineName: 'VieNeu Turbo',
    });
    expect(hero).toMatchObject({
      status: 'ready',
      previewSendsText: true,
      deleteBlock: 'kb',
      speed: 1.2,
    });
    expect(extra).toMatchObject({
      status: 'unused',
      nameEditable: true,
      deleteBlock: null,
      voice: null,
      engineName: null,
    });
    const unvoiced = buildContext(
      input({ book: { ...input().book, voices: { narr: { voice: 3, speed: 1 } } } }),
    );
    expect(unvoiced.speakers[0]).toMatchObject({ status: 'engine', canPreview: false });
    expect(unvoiced.speakers[1].status).toBe('noVoice');
    expect(unvoiced.lostDialogues).toBe(0);
  });

  it('describes reading rules, symbols and the quick test', () => {
    const ctx = buildContext(input({ view: { ...emptyView(), mode: 'rules', unit: 'U01' } }));
    expect(ctx.inspector).toBe('rules');
    expect(ctx.lexicon).toEqual([{ rule: ctx.book.lex[0], occurrences: 1 }]);
    expect(ctx.symbols.map((item) => item.id)).toEqual(['S1', 'S2', 'S3', 'S4']);
    expect(ctx.testText).toBe('Wren walks.');
    expect(ctx.testOutput).toBe('Ren walks.');
    expect(ctx.rulesPanel).toMatchObject({ pronunciations: 1, activeSymbols: 4 });
    const typed = buildContext(input({ view: { ...emptyView(), test: 'Wren!' } }));
    expect(typed.testOutput).toBe('Ren!');
    const empty = buildContext(input({ book: { ...emptyBook(), voices: {} } }));
    expect(empty.testText).toBe(DEFAULT_TEST_TEXT);
    const noSymbols = buildContext(input({ book: { ...input().book, symbols: [] } }));
    expect(noSymbols.symbols.every((item) => !item.on)).toBe(true);
  });

  it('flags changed read text in the segment panel', () => {
    const ctx = buildContext(input({ view: { ...emptyView(), unit: 'U01', sel: 'n' } }));
    expect(ctx.segmentPanel).toMatchObject({ changed: true, canFlag: false, canClearFlag: false });
    expect(ctx.segmentPanel?.row.record).toBeNull();
  });
});
