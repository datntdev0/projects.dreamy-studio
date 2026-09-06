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
  listRowsOf,
  segmentRowsOf,
  voiceGroupsOf,
} from './audiobook.context';
import { DEFAULT_MIX, emptyUnitAudio, emptyView } from './audiobook.rules';

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

const unit = scriptUnit({ id: 'U01', no: 1, blocks });

function input(overrides: Partial<ContextInput> = {}): ContextInput {
  const book = audiobook({
    voices: { narr: { voice: 1, speed: 1 }, E1: { voice: 2, speed: 1.2 } },
    units: {
      U01: {
        ...emptyUnitAudio(),
        audio: {
          h: audioRecord({ text: 'Title', voice: 1 }),
          d: audioRecord({ text: 'Hello', speaker: 'E1', voice: 2, speed: 1.2, flag: 'bad' }),
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
  it('numbers voiced blocks and carries state and speaker', () => {
    const env = { book: input().book, cast: input().cast, voices };
    const rows = segmentRowsOf(env, unit, [
      { unitId: 'U01', blockId: 'n', active: true },
      { unitId: 'U01', blockId: 'd', active: false },
    ]);
    expect(rows.map((row) => [row.n, row.block.id, row.state])).toEqual([
      [1, 'h', 'done'],
      [2, 'n', 'generating'],
      [3, 'd', 'queued'],
    ]);
    expect(rows[1].speaker?.id).toBe('narr');
    expect(rows[2].speakerClass).toBe('spk-0');
    expect(rows[0].speakerClass).toBe('spk-n');
  });

  it('lists every segment and keeps pauses between them', () => {
    const env = { book: input().book, cast: input().cast, voices };
    const rows = segmentRowsOf(env, unit, []);
    expect(listRowsOf(unit, rows).map((row) => row.kind)).toEqual([
      'segment',
      'pause',
      'segment',
      'segment',
    ]);
    expect(listRowsOf(null, rows)).toEqual([]);
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
    const ctx = buildContext(input({ view: { ...emptyView(), unit: 'U01' } }));
    expect(ctx.unit?.id).toBe('U01');
    expect(ctx.running).toEqual([]);
    expect(ctx.stat).toMatchObject({ total: 3, done: 1, stale: 1, none: 1 });
    expect(ctx.summary).toMatchObject({ segments: 3, generated: 1, pending: 2 });
    expect(ctx.todo.map((block) => block.id)).toEqual(['n', 'd']);
    expect(ctx.blockers).toEqual([]);
    expect(ctx.canGenerate).toBe(true);
    expect(ctx.canPlay).toBe(true);
    expect(ctx.inspector).toBe('chapter');
    expect(ctx.changed).toBe(0);
    expect(ctx.chapterPanel.mix).toEqual(DEFAULT_MIX);
    expect(ctx.rail.map((row) => [row.unit.id, row.active])).toEqual([
      ['U01', true],
      ['U02', false],
    ]);
    expect(ctx.railSummary).toEqual({ done: 0, total: 2, percent: 0 });
    expect(ctx.engines).toEqual({ localModels: 1, cloudProviders: 1 });
    expect(ctx.generating).toBe(false);
  });

  it('falls back to the first unfinished unit', () => {
    const ctx = buildContext(input());
    expect(ctx.unit?.id).toBe('U01');
    expect(ctx.inspector).toBe('chapter');
    const none = buildContext(input({ script: script([]) }));
    expect(none.unit).toBeNull();
    expect(none.stat).toBeNull();
    expect(none.summary).toBeNull();
    expect(none.canGenerate).toBe(false);
    expect(none.chapterPanel.mix).toBeNull();
    expect(none.railSummary.percent).toBe(0);
  });

  it('reports running jobs, blockers and a meta unit', () => {
    const jobs = [
      { unitId: 'U01', blockId: 'n', active: true },
      { unitId: 'U02', blockId: 'z', active: false },
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
    const uninstalled = buildContext(input({ availability: availability({ engines: [] }) }));
    expect(uninstalled.blockers.map((item) => item.kind)).toEqual(['engine', 'engine']);
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

  it('treats a unit as producible once it has a voiced block', () => {
    const note = scriptBlock({ id: 'x', type: 'note', text: 'Internal' });
    const silent = script([scriptUnit({ id: 'U01', blocks: [note] })]);
    const quiet = buildContext(input({ script: silent, view: { ...emptyView(), unit: 'U01' } }));
    expect(quiet.segments).toEqual([]);
    expect(quiet.todo).toEqual([]);
    expect(quiet.canGenerate).toBe(false);
    const voiced = buildContext(input({ view: { ...emptyView(), unit: 'U01' } }));
    expect(voiced.canGenerate).toBe(true);
  });

  it('shows the project mix for every chapter with blocks', () => {
    const mix = { ...DEFAULT_MIX, gap: 2, sentence: 1.2 };
    const book = audiobook({ ...input().book, mix });
    const first = buildContext(input({ book, view: { ...emptyView(), unit: 'U01' } }));
    expect(first.chapterPanel.mix).toEqual(mix);
    const other = script([unit, scriptUnit({ id: 'U02', no: 2, blocks })]);
    const second = buildContext(
      input({ book, script: other, view: { ...emptyView(), unit: 'U02' } }),
    );
    expect(second.chapterPanel.mix).toBe(first.chapterPanel.mix);
    const plain = buildContext(input({ view: { ...emptyView(), unit: 'U01' } }));
    expect(first.summary?.duration).toBeGreaterThan(plain.summary?.duration ?? 0);
  });

  it('counts changed segments', () => {
    const records = {
      h: audioRecord({ text: 'Title', voice: 1 }),
      n: audioRecord({ text: 'Wren walks.', voice: 1 }),
      d: audioRecord({ text: 'Hello', speaker: 'E1', voice: 2, speed: 1.2 }),
    };
    const book = (audio: typeof records) =>
      audiobook({ ...input().book, units: { U01: { ...emptyUnitAudio(), audio } } });
    const done = buildContext(input({ book: book(records) }));
    expect(done.changed).toBe(0);
    const changed = buildContext(
      input({ book: book({ ...records, n: { ...records.n, text: 'Old words.' } }) }),
    );
    expect(changed.changed).toBe(1);
    expect(changed.segments[1].reasons).toEqual(['text']);
  });
});
