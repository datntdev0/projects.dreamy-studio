import { scriptBlock, scriptUnit, source } from '@testing/scripting';
import { describe, expect, it } from 'vitest';

// prettier-ignore
import { aiAudioBlocks, aiFilmBlocks, defaultAudioBlocks, defaultDraftSelection, draftAudioBlocks, draftBlocksFor, draftLoadOf, draftOptionOf, draftReasonOf, estimateDraft, narrationBlock, rowBlocks, sceneBlock, sceneBody, speakerFor, toggleDraftUnit } from './scripting.draft';
import { CastMember, DraftRequest, KbStatus, ScriptBeat } from './scripting.models';
import { castOf, configOf } from './scripting.rules';

const cast: CastMember[] = castOf(
  'audiobook',
  [
    { id: 'E1', name: 'Wren' },
    { id: 'E3', name: 'Maro' },
  ],
  [],
);

const QUOTED = { id: '1.1', text: '“Go,” she said. “Stay.” Then nothing.' };

const kb: KbStatus = { novel: true, available: true, ready: true, missing: [] };

function beat(overrides: Partial<ScriptBeat> = {}): ScriptBeat {
  return {
    event: 'E18',
    text: 'Maro climbs',
    refs: ['1.1'],
    chars: ['E1', 'E3'],
    loc: 'TOWER',
    time: 'DAY',
    ...overrides,
  };
}

describe('scripting draft: audio blocks', () => {
  it('picks the speaker', () => {
    expect(speakerFor(QUOTED, 'E3', true, cast, {})).toBe('E3');
    expect(speakerFor(QUOTED, '', true, cast, { '1.1': 'E3' })).toBe('E3');
    expect(speakerFor(QUOTED, '', true, cast, {})).toBe('E1');
    expect(speakerFor(QUOTED, '', false, cast, { '1.1': 'E3' })).toBe('');
  });

  it('splits a paragraph into dialogue and narration', () => {
    const ids = { seq: 0 };
    const blocks = rowBlocks(ids, QUOTED, '', true, cast, { '1.1': 'E3' });
    expect(blocks.map((item) => [item.id, item.type, item.text, item.who])).toEqual([
      ['B1', 'dialogue', 'Go.', 'E3'],
      ['B2', 'narration', 'she said.', ''],
      ['B3', 'dialogue', 'Stay.', 'E3'],
      ['B4', 'narration', 'Then nothing.', ''],
    ]);
    expect(blocks[0]).toMatchObject({ ref: '1.1', snap: QUOTED.text });
    expect(narrationBlock({ seq: 9 }, QUOTED)).toMatchObject({ id: 'B10', text: QUOTED.text });
  });

  it('builds the default and AI audio drafts', () => {
    const ids = { seq: 0 };
    const unit = { no: 2, title: 'Tide' };
    const plain = defaultAudioBlocks(ids, unit, [QUOTED]);
    expect(plain.map((item) => item.type)).toEqual(['heading', 'pause', 'narration']);
    expect(plain[0].text).toBe('Chapter two. Tide.');
    expect(plain[1].ms).toBe(800);
    expect(plain[2].text).toBe(QUOTED.text);
    const smart = aiAudioBlocks({ seq: 0 }, unit, [QUOTED], cast, {});
    expect(smart.map((item) => item.type)).toEqual([
      'heading',
      'pause',
      'dialogue',
      'narration',
      'dialogue',
      'narration',
    ]);
    const custom = draftAudioBlocks({ seq: 0 }, unit, [QUOTED], {
      split: true,
      guess: false,
      cast,
      hints: {},
    });
    expect(custom[2].who).toBe('');
  });
});

describe('scripting draft: film blocks', () => {
  const map = { '1.1': '“Go,” she said. “Stay.” He did.', '1.2': 'Plain action.' };

  it('builds scenes from beats', () => {
    const ids = { seq: 0 };
    const scene = sceneBlock(ids, beat());
    expect(scene).toMatchObject({ type: 'scene', loc: 'TOWER', time: 'DAY', beat: 'Maro climbs' });
    const body = sceneBody(ids, scene, map);
    expect(body.map((item) => [item.type, item.who, item.text])).toEqual([
      ['dialogue', 'E1', 'Go.'],
      ['action', '', 'she said.'],
      ['dialogue', 'E3', 'Stay.'],
      ['action', '', 'He did.'],
    ]);
    const noChars = sceneBody(ids, sceneBlock(ids, beat({ chars: [] })), map);
    expect(noChars[0].who).toBe('');
    expect(sceneBody(ids, sceneBlock(ids, beat({ refs: ['9.9'] })), map)).toEqual([]);
  });

  it('falls back to the beat text when the evidence is missing', () => {
    const blocks = aiFilmBlocks(
      { seq: 0 },
      [beat({ refs: ['9.9'] }), beat({ refs: ['1.2'], text: 'B' })],
      map,
    );
    expect(blocks.map((item) => [item.type, item.text || item.beat])).toEqual([
      ['scene', 'Maro climbs'],
      ['action', 'Maro climbs'],
      ['scene', 'B'],
      ['action', 'Plain action.'],
    ]);
  });

  it('selects the draft builder by preset', () => {
    const request: DraftRequest = {
      preset: 'audiobook',
      unit: { id: 'U01', no: 1, title: 'T', ch: 1, chs: null },
      source: [QUOTED],
      beats: [],
      cast,
    };
    expect(draftBlocksFor({ seq: 0 }, request, { '1.1': 'E3' })?.[2].who).toBe('E3');
    expect(draftBlocksFor({ seq: 0 }, { ...request, source: null }, {})).toBeNull();
    const film = draftBlocksFor(
      { seq: 0 },
      { ...request, preset: 'film', beats: [beat()], source: [QUOTED] },
      {},
    );
    expect(film?.[0].type).toBe('scene');
    const noSource = draftBlocksFor(
      { seq: 0 },
      { ...request, preset: 'film', source: null, beats: [beat()] },
      {},
    );
    expect(noSource?.map((item) => item.type)).toEqual(['scene', 'action']);
  });
});

describe('scripting draft: availability and estimate', () => {
  const audio = configOf('audiobook');
  const film = configOf('film');

  it('explains why a unit cannot be drafted', () => {
    const input = { config: audio, unit: scriptUnit(), source: source('x'), kb };
    expect(draftReasonOf(input)).toBeNull();
    expect(draftReasonOf({ ...input, unit: scriptUnit({ status: 'locked' }) })?.key).toBe(
      'scripting.draft.reason.locked',
    );
    expect(
      draftReasonOf({ ...input, unit: scriptUnit({ meta: { blocks: 8, words: 1 } }) })?.key,
    ).toBe('scripting.draft.reason.meta');
    expect(draftReasonOf({ ...input, source: null })?.key).toBe('scripting.draft.reason.noSource');
    const filmInput = {
      config: film,
      unit: scriptUnit({ ch: null, chs: [1, 2] }),
      source: null,
      kb,
    };
    expect(draftReasonOf(filmInput)).toBeNull();
    expect(draftReasonOf({ ...filmInput, kb: { ...kb, novel: false } })?.key).toBe(
      'scripting.draft.reason.noNovel',
    );
    expect(draftReasonOf({ ...filmInput, kb: { ...kb, available: false } })?.key).toBe(
      'scripting.draft.reason.noKb',
    );
    expect(draftReasonOf({ ...filmInput, unit: scriptUnit({ ch: null }) })?.key).toBe(
      'scripting.draft.reason.noChapters',
    );
    expect(draftReasonOf({ ...filmInput, kb: { ...kb, ready: false, missing: [2, 3] } })).toEqual({
      key: 'scripting.draft.reason.missingKb',
      params: { chapters: '2, 3' },
    });
  });

  it('builds options and the default selection', () => {
    const empty = draftOptionOf({
      config: audio,
      unit: scriptUnit({ id: 'U01' }),
      source: source('x'),
      kb,
    });
    const full = draftOptionOf({
      config: audio,
      unit: scriptUnit({ id: 'U02', blocks: [scriptBlock()] }),
      source: source('x'),
      kb,
    });
    const off = draftOptionOf({ config: audio, unit: scriptUnit({ id: 'U03' }), source: null, kb });
    expect(empty.hasContent).toBe(false);
    expect(full.hasContent).toBe(true);
    expect(off.reason).not.toBeNull();
    const options = [full, empty, off];
    expect(defaultDraftSelection(options, 'U02', [])).toEqual(['U02']);
    expect(defaultDraftSelection(options, 'U03', [])).toEqual(['U01']);
    expect(defaultDraftSelection(options, null, ['U02'])).toEqual(['U02']);
    expect(defaultDraftSelection(options, null, ['U03'])).toEqual(['U01']);
    expect(defaultDraftSelection([off], null, [])).toEqual([]);
    expect(toggleDraftUnit(['U01'], 'U02', true)).toEqual(['U01', 'U02']);
    expect(toggleDraftUnit(['U01', 'U02'], 'U01', false)).toEqual(['U02']);
    expect(toggleDraftUnit(['U01'], 'U01', true)).toEqual(['U01']);
  });

  it('estimates the load and the cost', () => {
    expect(draftLoadOf(audio, source('one two', 'three'), [])).toEqual({
      words: 3,
      extra: 0,
      beats: 0,
    });
    expect(draftLoadOf(audio, null, [])).toEqual({ words: 0, extra: 0, beats: 0 });
    const beats = [
      beat({ refs: ['1.1', '1.2'], text: 'big event' }),
      beat({ refs: ['1.2', '1.9'] }),
    ];
    expect(draftLoadOf(film, source('a b', 'c d e'), beats)).toEqual({
      words: 5,
      extra: 4,
      beats: 2,
    });
    expect(draftLoadOf(film, null, [])).toEqual({ words: 0, extra: 0, beats: 0 });
    expect(estimateDraft([])).toEqual({ tin: 0, tout: 0, cost: 0 });
    const estimate = estimateDraft([{ words: 1000, extra: 100, beats: 1 }]);
    expect(estimate.tin).toBe(Math.round(1000 * 1.35 + 100 * 1.5 + 350));
    expect(estimate.tout).toBe(1500 + 120);
    expect(estimate.cost).toBeCloseTo((1850 / 1e6) * 3 + (1620 / 1e6) * 15);
  });
});
