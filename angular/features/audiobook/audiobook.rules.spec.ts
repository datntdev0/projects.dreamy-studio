import {
  audiobook,
  audioRecord,
  availability,
  cast,
  envOf,
  EXTRA_CAST,
  HERO_CAST,
  NARRATOR_CAST,
} from '@testing/audiobook';
import { libraryVoice } from '@testing/fixtures';
import { script, scriptBlock, scriptUnit } from '@testing/scripting';
import { describe, expect, it } from 'vitest';

import * as rules from './audiobook.rules';

const narration = (id: string, text: string, paren = '') =>
  scriptBlock({ id, type: 'narration', text, paren });

const dialogue = (id: string, text: string, who = 'E1') =>
  scriptBlock({ id, type: 'dialogue', text, who });

function unitWith(blocks = [narration('B1', 'Hello world.')], id = 'U01') {
  return scriptUnit({ id, blocks });
}

describe('audiobook defaults', () => {
  it('builds empty views, books and unit audio', () => {
    expect(rules.emptyView()).toEqual({
      unit: null,
      mode: 'prod',
      goto: null,
    });
    const book = rules.emptyBook();
    expect(book).toEqual({ voices: {}, units: {} });
    expect(rules.unitAudioOf(book, 'U01')).toEqual(rules.emptyUnitAudio());
    expect(rules.emptyUnitAudio().mix).toEqual(rules.DEFAULT_MIX);
    expect(rules.emptyUnitAudio().mix).not.toBe(rules.DEFAULT_MIX);
  });
});

describe('voiced blocks and speakers', () => {
  it('keeps only non-empty voiced blocks', () => {
    const unit = unitWith([
      scriptBlock({ id: 'h', type: 'heading', text: 'Title' }),
      narration('n', '  '),
      narration('m', 'Text'),
      scriptBlock({ id: 'p', type: 'pause', text: '', ms: 500 }),
      scriptBlock({ id: 'a', type: 'action', text: 'Action' }),
    ]);
    expect(rules.voicedBlocks(unit).map((item) => item.id)).toEqual(['h', 'm']);
    expect(rules.voicedBlocks(scriptUnit())).toEqual([]);
  });

  it('resolves narrator, speakers and voicing', () => {
    const members = cast(NARRATOR_CAST, HERO_CAST);
    expect(rules.narratorOf(members)).toBe(NARRATOR_CAST);
    expect(rules.narratorOf([HERO_CAST])).toBeNull();
    expect(rules.speakerFor(members, narration('n', 'x'))).toBe(NARRATOR_CAST);
    expect(rules.speakerFor(members, dialogue('d', 'x'))).toBe(HERO_CAST);
    expect(rules.speakerFor(members, dialogue('d', 'x', 'nobody'))).toBeNull();
    const env = envOf({
      book: audiobook({
        voices: { narr: { voice: 1, speed: 0.9 }, E1: { voice: null, speed: 1 } },
      }),
    });
    expect(rules.voicingOf(env, narration('n', 'x'))).toMatchObject({ speed: 0.9 });
    expect(rules.voicingOf(env, narration('n', 'x')).voice?.id).toBe(1);
    expect(rules.voicingOf(env, dialogue('d', 'x')).voice).toBeNull();
    expect(rules.voicingOf(envOf({ book: audiobook() }), narration('n', 'x'))).toEqual({
      speaker: NARRATOR_CAST,
      voice: null,
      speed: 1,
    });
    expect(rules.voicingOf(env, dialogue('d', 'x', 'nobody'))).toEqual({
      speaker: null,
      voice: null,
      speed: 1,
    });
  });
});

describe('voice usability', () => {
  const local = libraryVoice({ id: 1, engine: 'vieneu-turbo', engineKind: 'local' });
  const missing = libraryVoice({ id: 2, engine: 'vieneu-nano', engineKind: 'local' });
  const edge = libraryVoice({ id: 3, engine: 'edge-read-aloud', engineKind: 'cloud' });
  const eleven = libraryVoice({ id: 4, engine: 'elevenlabs', engineKind: 'cloud' });
  const unknown = libraryVoice({ id: 5, engine: 'ghost', engineKind: 'cloud' });

  it('reports why a voice cannot be used', () => {
    const ok = availability();
    expect(rules.voiceIssueOf(local, ok)).toBeNull();
    expect(rules.voiceIssueOf(missing, ok)).toEqual({ kind: 'model', engine: 'VieNeu Nano' });
    expect(rules.voiceIssueOf(edge, ok)).toBeNull();
    expect(rules.voiceIssueOf(eleven, ok)).toEqual({ kind: 'cloud', engine: 'ElevenLabs' });
    expect(rules.voiceIssueOf(unknown, ok)).toEqual({ kind: 'cloud', engine: 'ghost' });
  });

  it('treats a missing voice as unusable', () => {
    expect(rules.isUsable(null, availability())).toBe(false);
    expect(rules.isUsable(local, availability())).toBe(true);
    expect(rules.isUsable(missing, availability())).toBe(false);
  });
});

describe('segment state', () => {
  const block = narration('B1', 'Hello world.');
  const unit = unitWith([block]);

  function envWith(record: ReturnType<typeof audioRecord> | null, extra = {}) {
    const book = audiobook({
      voices: { narr: { voice: 1, speed: 1 } },
      units: record ? { U01: { ...rules.emptyUnitAudio(), audio: { B1: record } } } : {},
      ...extra,
    });
    return envOf({ book });
  }

  it('estimates duration with a floor', () => {
    expect(rules.estimateDuration('', 1)).toBe(0.8);
    expect(rules.estimateDuration('one two three four five six', 1)).toBeCloseTo(6 / 2.6 + 0.25);
    expect(rules.estimateDuration('one two three four five six', 2)).toBeLessThan(
      rules.estimateDuration('one two three four five six', 1),
    );
    expect(rules.estimateDuration('one two three four five six', 0)).toBeCloseTo(6 / 2.6 + 0.25);
  });

  it('is none without audio and done when everything matches', () => {
    expect(rules.segmentInfo(envWith(null), unit, block)).toEqual({
      state: 'none',
      record: null,
      reasons: [],
    });
    const info = rules.segmentInfo(envWith(audioRecord()), unit, block);
    expect(info.state).toBe('done');
    expect(info.reasons).toEqual([]);
  });

  it('collects every stale reason in order', () => {
    const record = audioRecord({ text: 'old', voice: 9, speed: 2, paren: 'soft' });
    const info = rules.segmentInfo(envWith(record), unit, block);
    expect(info.state).toBe('stale');
    expect(info.reasons).toEqual(['text', 'voice', 'speed', 'tone']);
    expect(rules.staleReasons(envWith(null), block, audioRecord({ voice: null }))).toEqual([
      'voice',
    ]);
    expect(rules.staleReasons(envWith(null), block, audioRecord({ speaker: 'E1' }))).toEqual([
      'speaker',
    ]);
  });

  it('prefers the failure flag over staleness', () => {
    const flagged = audioRecord({ flag: 'bad stress', text: 'old' });
    expect(rules.segmentInfo(envWith(flagged), unit, block).state).toBe('flag');
  });

  it('sums unit statistics and derives the unit state', () => {
    const second = narration('B2', 'Second line.');
    const third = narration('B3', 'Third line.');
    const wide = unitWith([block, second, third]);
    const audio = (records: Record<string, ReturnType<typeof audioRecord>>) =>
      envOf({
        book: audiobook({
          voices: { narr: { voice: 1, speed: 1 } },
          units: { U01: { ...rules.emptyUnitAudio(), audio: records } },
        }),
      });
    expect(rules.unitStat(audio({}), wide)).toMatchObject({ total: 3, none: 3, state: 'none' });
    const partial = rules.unitStat(audio({ B1: audioRecord() }), wide);
    expect(partial).toMatchObject({ done: 1, none: 2, state: 'doing', meta: false, dur: 2 });
    const stale = rules.unitStat(
      audio({ B1: audioRecord(), B2: audioRecord({ text: 'x' }) }),
      wide,
    );
    expect(stale).toMatchObject({ done: 1, stale: 1, none: 1, state: 'stale' });
    const done = rules.unitStat(
      audio({
        B1: audioRecord(),
        B2: audioRecord({ text: 'Second line.' }),
        B3: audioRecord({ text: 'Third line.' }),
      }),
      wide,
    );
    expect(done).toMatchObject({ done: 3, state: 'done', dur: 6 });
    expect(rules.unitStat(audio({}), unitWith([]))).toMatchObject({ total: 0, state: 'none' });
  });

  it('reads meta units from the stored meta state', () => {
    const meta = scriptUnit({ id: 'U09', blocks: null });
    const env = envOf({
      book: audiobook({ units: { U09: { ...rules.emptyUnitAudio(), meta: 'stale' } } }),
    });
    expect(rules.unitStat(env, meta)).toEqual({
      total: 0,
      done: 0,
      stale: 0,
      none: 0,
      dur: 0,
      state: 'stale',
      meta: true,
    });
    expect(rules.unitStat(envOf({ book: audiobook() }), meta).state).toBe('none');
  });

  it('computes durations, summaries and todo lists', () => {
    const stat = {
      total: 3,
      done: 1,
      stale: 1,
      none: 1,
      dur: 10,
      state: 'stale',
      meta: false,
    } as const;
    const mix = { gap: 1, intro: 2, outro: 3, vol: 0 };
    expect(rules.unitDuration(stat, mix)).toBe(10 + 2 + 2 + 3);
    expect(rules.unitDuration({ ...stat, total: 0 }, mix)).toBe(10 + 5);
    expect(rules.summaryOf(stat, mix, 2)).toEqual({
      segments: 3,
      generated: 1,
      running: 2,
      pending: 2,
      duration: 17,
    });
    expect(rules.todoBlocks(envWith(audioRecord()), unit)).toEqual([]);
    expect(rules.todoBlocks(envWith(null), unit)).toEqual([block]);
  });
});

describe('blockers', () => {
  const ok = availability();

  it('has none for a unit with usable voices', () => {
    expect(rules.blockersOf(envOf(), ok, unitWith())).toEqual([]);
  });

  it('reports lost dialogue, missing voice and engine problems', () => {
    const unit = scriptUnit({
      id: 'U01',
      blocks: [dialogue('d1', 'x', 'ghost'), dialogue('d2', 'y', 'ghost'), narration('n', 'z')],
    });
    const env = envOf({ book: audiobook() });
    const blockers = rules.blockersOf(env, ok, unit);
    expect(blockers.map((item) => item.kind)).toEqual(['who', 'voice']);
    expect(blockers[0]).toMatchObject({ blockId: 'd1', message: { params: { count: 2 } } });
    expect(blockers[1]).toMatchObject({ speakerId: 'narr' });
  });

  it('reports engine blockers per speaker once', () => {
    const voices = [
      libraryVoice({ id: 1, name: 'Slow', engine: 'vieneu-nano' }),
      libraryVoice({ id: 2, name: 'Cloud', engine: 'elevenlabs', engineKind: 'cloud' }),
    ];
    const env = envOf({
      voices,
      cast: cast(NARRATOR_CAST, HERO_CAST),
      book: audiobook({
        voices: { narr: { voice: 1, speed: 1 }, E1: { voice: 2, speed: 1 } },
      }),
    });
    const unit = unitWith([narration('n1', 'a'), narration('n2', 'b'), dialogue('d', 'c')]);
    const blockers = rules.blockersOf(env, ok, unit);
    expect(blockers.map((item) => item.message.key)).toEqual([
      'audiobook.blocker.engine.model',
      'audiobook.blocker.engine.cloud',
    ]);
    expect(blockers[0].message.params).toEqual({
      speaker: 'Narrator',
      voice: 'Slow',
      engine: 'VieNeu Nano',
    });
  });

  it('counts dialogues without a speaker across units', () => {
    const doc = script([
      unitWith([dialogue('a', 'x', 'ghost'), dialogue('b', 'x')]),
      scriptUnit({ id: 'U02', blocks: null }),
      unitWith([dialogue('c', 'x', '')], 'U03'),
    ]);
    expect(rules.countLostDialogues(doc, cast())).toBe(2);
  });
});

describe('speakers and progress', () => {
  it('counts uses per speaker kind', () => {
    const doc = script([
      unitWith([
        scriptBlock({ id: 'h', type: 'heading', text: 'T' }),
        narration('n', 'x'),
        dialogue('d', 'y'),
      ]),
      scriptUnit({ id: 'U02', blocks: null }),
    ]);
    expect(rules.speakerUseCount(doc, NARRATOR_CAST)).toBe(2);
    expect(rules.speakerUseCount(doc, HERO_CAST)).toBe(1);
    expect(rules.speakerUseCount(doc, EXTRA_CAST)).toBe(0);
  });

  it('clamps speed and mix values', () => {
    expect(rules.clampSpeed(0)).toBe(1);
    expect(rules.clampSpeed(Number.NaN)).toBe(1);
    expect(rules.clampSpeed(0.1)).toBe(0.6);
    expect(rules.clampSpeed(1.23)).toBe(1.25);
    expect(rules.clampSpeed(1.22)).toBe(1.2);
    expect(rules.clampSpeed(3)).toBe(1.5);
    expect(rules.clampSpeed(1.2)).toBe(1.2);
    expect(rules.clampMix('gap', 9)).toBe(5);
    expect(rules.clampMix('vol', -50)).toBe(-12);
    expect(rules.clampMix('intro', Number.NaN)).toBe(0);
    expect(rules.clampMix('outro', 2.5)).toBe(2.5);
    expect(rules.speakerVoiceOf(audiobook(), 'x')).toEqual({ voice: null, speed: 1 });
    expect(
      rules.speakerVoiceOf(audiobook({ voices: { x: { voice: 2, speed: 1.1 } } }), 'x').voice,
    ).toBe(2);
  });

  it('derives the module progress', () => {
    const doc = script([unitWith(), unitWith([narration('B2', 'Two.')], 'U02')]);
    const make = (units: Record<string, ReturnType<typeof rules.emptyUnitAudio>>) =>
      envOf({ book: audiobook({ voices: { narr: { voice: 1, speed: 1 } }, units }) });
    const withAudio = (text: string, id: string) => ({
      ...rules.emptyUnitAudio(),
      audio: { [id]: audioRecord({ text }) },
    });
    expect(rules.audiobookProgress(make({}), doc)).toEqual({
      id: 'audiobook',
      state: 'idle',
      done: 0,
      total: 2,
      note: '0/2 chapters',
    });
    expect(
      rules.audiobookProgress(make({ U01: withAudio('Hello world.', 'B1') }), doc),
    ).toMatchObject({ state: 'doing', done: 1 });
    expect(
      rules.audiobookProgress(
        make({ U01: withAudio('Hello world.', 'B1'), U02: withAudio('Two.', 'B2') }),
        doc,
      ),
    ).toMatchObject({ state: 'done', done: 2, note: '2/2 chapters' });
    expect(rules.audiobookProgress(make({ U01: withAudio('old', 'B1') }), doc)).toMatchObject({
      state: 'stale',
      note: '0/2 chapters · 1 need review',
    });
    expect(rules.audiobookProgress(envOf(), script([]))).toMatchObject({ state: 'idle', total: 0 });
  });

  it('chooses the default unit', () => {
    const doc = script([
      unitWith(),
      unitWith([narration('B2', 'Two.')], 'U02'),
      scriptUnit({ id: 'U03', blocks: null }),
    ]);
    const stat = (state: string) => ({ state }) as never;
    expect(rules.defaultUnitOf(doc, [stat('done'), stat('doing'), stat('none')])?.id).toBe('U02');
    expect(rules.defaultUnitOf(doc, [stat('done'), stat('done'), stat('none')])?.id).toBe('U01');
    const metaOnly = script([scriptUnit({ id: 'U09', blocks: null })]);
    expect(rules.defaultUnitOf(metaOnly, [stat('none')])?.id).toBe('U09');
    expect(rules.defaultUnitOf(script([]), [])).toBeNull();
  });
});

describe('formatting', () => {
  it('formats seconds, cost, titles and stamps', () => {
    expect(rules.formatSeconds(65.4)).toBe('1:05');
    expect(rules.formatCost(0.0123)).toBe('≈ $0.012');
    expect(rules.excerptTitle('Intro', 'short')).toBe('Intro · short');
    expect(rules.excerptTitle('Intro', 'x'.repeat(60))).toBe(`Intro · ${'x'.repeat(48)}…`);
    expect(rules.stampNow()).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
