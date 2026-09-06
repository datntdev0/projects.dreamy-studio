// prettier-ignore
import { audiobook, audioRecord, availability, cast, envOf, HERO_CAST, NARRATOR_CAST } from '@testing/audiobook';
import { libraryVoice } from '@testing/fixtures';
import { scriptBlock, scriptUnit } from '@testing/scripting';
import { describe, expect, it } from 'vitest';

import { CloudAccount } from '../settings/cloud.models';
import * as generate from './audiobook.generate';
import { AudioEnv } from './audiobook.models';
import { emptyUnitAudio } from './audiobook.rules';

const accounts = [
  { id: 'elevenlabs', requiresKey: true },
  { id: 'edge-read-aloud', requiresKey: false },
] as CloudAccount[];

const voices = [
  libraryVoice({ id: 1, engine: 'vieneu-turbo', engineKind: 'local', sampleText: '' }),
  libraryVoice({ id: 2, engine: 'edge-read-aloud', engineKind: 'cloud', sampleText: 'Sample' }),
  libraryVoice({ id: 3, engine: 'elevenlabs', engineKind: 'cloud' }),
];

function setup(narrator: number | null, hero: number | null) {
  return envOf({
    voices,
    cast: cast(NARRATOR_CAST, HERO_CAST),
    book: audiobook({
      voices: { narr: { voice: narrator, speed: 1 }, E1: { voice: hero, speed: 1.1 } },
    }),
  });
}

const narration = scriptBlock({ id: 'n', type: 'narration', text: 'Wren walks home.' });
const line = scriptBlock({
  id: 'd',
  type: 'dialogue',
  text: 'Hello there',
  who: 'E1',
  paren: 'soft',
});

const doneNarration = audioRecord({ text: 'Wren walks home.', voice: 1, speed: 1, paren: '' });

const staleLine = audioRecord({ text: 'old', speaker: 'E1', voice: 2, speed: 1.1, paren: 'soft' });

const first = scriptUnit({ id: 'U01', no: 1, blocks: [narration, line] });

const second = scriptUnit({
  id: 'U02',
  no: 2,
  blocks: [
    { ...narration, id: 'n2' },
    { ...line, id: 'd2' },
  ],
});

const outline = scriptUnit({ id: 'U03', no: 3, blocks: null });

const silent = scriptUnit({
  id: 'U04',
  no: 4,
  blocks: [scriptBlock({ id: 'x', type: 'note', text: 'Internal' })],
});

function withAudio(env: AudioEnv, units: AudioEnv['book']['units']): AudioEnv {
  return { ...env, book: { ...env.book, units } };
}

function produced(env: AudioEnv): AudioEnv {
  return withAudio(env, {
    U01: { ...emptyUnitAudio(), audio: { n: doneNarration, d: staleLine } },
    U02: { ...emptyUnitAudio(), audio: { n2: doneNarration } },
  });
}

describe('billing', () => {
  it('treats keyless accounts as free and unknown ones as paid', () => {
    expect(generate.billingOf(accounts, 'edge-read-aloud')).toBe('free');
    expect(generate.billingOf(accounts, 'elevenlabs')).toBe('paid');
    expect(generate.billingOf(accounts, 'unknown')).toBe('paid');
  });

  it('prices only paid groups', () => {
    const base = { key: 'k', kind: 'cloud', name: '', chars: 1000 } as const;
    expect(generate.withCost({ ...base, billing: 'paid', cost: 0 }).cost).toBeCloseTo(0.016);
    expect(generate.withCost({ ...base, billing: 'free', cost: 0 }).cost).toBe(0);
    expect(generate.withCost({ ...base, billing: 'local', cost: 0 }).cost).toBe(0);
  });
});

describe('generation plan', () => {
  it('groups characters by engine and totals the cost', () => {
    const env = setup(1, 3);
    const groups = generate.generateGroups(env, availability(), accounts, [narration, line, line]);
    expect(groups.map((group) => group.key)).toEqual(['local', 'elevenlabs']);
    expect(groups[0]).toMatchObject({ kind: 'local', billing: 'local', chars: 16, cost: 0 });
    expect(groups[1]).toMatchObject({
      kind: 'cloud',
      name: 'ElevenLabs',
      billing: 'paid',
      chars: 22,
    });
    expect(groups[1].cost).toBeCloseTo(22 * 0.000016);
    const free = generate.generateGroups(setup(1, 2), availability(), accounts, [line]);
    expect(free[0]).toMatchObject({ billing: 'free', cost: 0 });
  });

  it('plans the not-done blocks of a unit', () => {
    const env = setup(1, 2);
    const unit = scriptUnit({ id: 'U01', no: 2, blocks: [narration, line] });
    const noAudio = generate.generatePlanOf(env, availability(), accounts, [unit]);
    expect(noAudio).toMatchObject({ unitIds: ['U01'], segments: 2, regenerated: 0, cost: 0 });
    const withStale = {
      ...env,
      book: {
        ...env.book,
        units: {
          U01: {
            ...emptyUnitAudio(),
            audio: {
              d: {
                text: 'old',
                speaker: 'E1',
                voice: 2,
                speed: 1.1,
                paren: 'soft',
                dur: 1,
                at: '',
                flag: '',
              },
            },
          },
        },
      },
    };
    expect(generate.generatePlanOf(withStale, availability(), accounts, [unit]).regenerated).toBe(
      1,
    );
  });

  it('plans the not-done blocks across several chapters', () => {
    const env = produced(setup(1, 3));
    const plan = generate.generatePlanOf(env, availability(), accounts, [first, second]);
    expect(plan.unitIds).toEqual(['U01', 'U02']);
    expect(plan.segments).toBe(2);
    expect(plan.regenerated).toBe(1);
    expect(plan.groups.map((group) => [group.key, group.chars])).toEqual([['elevenlabs', 22]]);
    expect(plan.cost).toBeCloseTo(22 * 0.000016);
    const fresh = generate.generatePlanOf(setup(1, 3), availability(), accounts, [first, second]);
    expect(fresh).toMatchObject({ segments: 4, regenerated: 0 });
    expect(fresh.groups.map((group) => [group.key, group.chars])).toEqual([
      ['local', 32],
      ['elevenlabs', 22],
    ]);
  });

  it('plans nothing for no chapters or chapters already produced', () => {
    const env = produced(setup(1, 3));
    expect(generate.generatePlanOf(env, availability(), accounts, [])).toEqual({
      unitIds: [],
      segments: 0,
      regenerated: 0,
      overwritten: 0,
      groups: [],
      cost: 0,
    });
    const done = withAudio(env, { U02: { ...emptyUnitAudio(), audio: { n2: doneNarration } } });
    const only = scriptUnit({ id: 'U02', blocks: [{ ...narration, id: 'n2' }] });
    expect(generate.generatePlanOf(done, availability(), accounts, [only])).toMatchObject({
      unitIds: ['U02'],
      segments: 0,
      cost: 0,
    });
  });

  it('plans every voiced block and counts the overwritten ones when overwriting', () => {
    const env = produced(setup(1, 3));
    const plan = generate.generatePlanOf(env, availability(), accounts, [first, second], true);
    expect(plan).toMatchObject({ segments: 4, regenerated: 1, overwritten: 2 });
    const kept = generate.generatePlanOf(env, availability(), accounts, [first, second], false);
    expect(kept).toMatchObject({ segments: 2, overwritten: 0 });
  });
});

describe('chapter choices', () => {
  it('summarises the progress of every chapter with blocks', () => {
    const env = produced(setup(1, 2));
    const units = [first, second, outline, silent];
    const chapters = generate.generateChaptersOf(env, availability(), units);
    expect(chapters.map((chapter) => chapter.unit.id)).toEqual(['U01', 'U02', 'U04']);
    expect(chapters[0]).toEqual({
      unit: first,
      total: 2,
      todo: 1,
      blocked: false,
      complete: false,
    });
    expect(chapters[1]).toMatchObject({ total: 2, todo: 1, blocked: false, complete: false });
    expect(chapters[2]).toMatchObject({ total: 0, todo: 0, blocked: false, complete: false });
  });

  it('marks finished and blocked chapters', () => {
    const env = withAudio(setup(1, null), {
      U01: { ...emptyUnitAudio(), audio: { n: doneNarration } },
    });
    const narrated = scriptUnit({ id: 'U01', blocks: [narration] });
    expect(generate.generateChapterOf(env, availability(), narrated)).toMatchObject({
      total: 1,
      todo: 0,
      blocked: false,
      complete: true,
    });
    expect(generate.generateChapterOf(env, availability(), first)).toMatchObject({
      todo: 1,
      blocked: true,
      complete: false,
    });
  });
});

describe('audio start', () => {
  it('queues the todo blocks of every chapter in order', () => {
    const env = produced(setup(1, 2));
    const start = generate.audioStartOf(env, [first, second]);
    expect(start.tasks).toEqual([
      { chapterId: 'U01', segmentId: 'd' },
      { chapterId: 'U02', segmentId: 'd2' },
    ]);
    expect(Object.keys(start.requests)).toEqual(['d', 'd2']);
    expect(start.requests['d2']).toEqual({
      text: 'Hello there',
      speaker: 'E1',
      voice: 2,
      speed: 1.1,
      paren: 'soft',
    });
    const all = generate.audioStartOf(setup(1, 2), [first, second, silent]);
    expect(all.tasks.map((task) => task.segmentId)).toEqual(['n', 'd', 'n2', 'd2']);
  });

  it('skips blocks without a voice and starts empty for no chapters', () => {
    const start = generate.audioStartOf(setup(null, 2), [first, second]);
    expect(start.tasks.map((task) => task.segmentId)).toEqual(['d', 'd2']);
    expect(start.requests['n']).toBeUndefined();
    expect(generate.audioStartOf(setup(1, 2), [])).toEqual({ tasks: [], requests: {} });
  });

  it('queues the generated blocks too when overwriting', () => {
    const env = produced(setup(1, 2));
    const start = generate.audioStartOf(env, [first, second], true);
    expect(start.tasks.map((task) => task.segmentId)).toEqual(['n', 'd', 'n2', 'd2']);
  });
});

describe('requests', () => {
  it('builds a segment request from the script text and voicing', () => {
    const env = setup(1, 2);
    expect(generate.segmentRequestOf(env, narration)).toEqual({
      text: 'Wren walks home.',
      speaker: 'narr',
      voice: 1,
      speed: 1,
      paren: '',
    });
    expect(generate.segmentRequestOf(env, line)?.speed).toBe(1.1);
    expect(generate.segmentRequestOf(setup(null, 2), narration)).toBeNull();
  });

  it('builds a preview request with a fallback sample text', () => {
    expect(generate.previewRequestOf(voices[0], 0.9)).toEqual({
      voiceId: 1,
      speed: 0.9,
      text: generate.PREVIEW_FALLBACK_TEXT,
    });
    expect(generate.previewRequestOf(voices[1], 1).text).toBe('Sample');
  });
});
