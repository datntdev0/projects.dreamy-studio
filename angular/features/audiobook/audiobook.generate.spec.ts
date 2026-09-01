import { audiobook, availability, cast, envOf, HERO_CAST, NARRATOR_CAST } from '@testing/audiobook';
import { libraryVoice } from '@testing/fixtures';
import { scriptBlock, scriptUnit } from '@testing/scripting';
import { describe, expect, it } from 'vitest';

import { CloudAccount } from '../settings/cloud.models';
import * as generate from './audiobook.generate';
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
    const noAudio = generate.generatePlanOf(env, availability(), accounts, unit);
    expect(noAudio).toMatchObject({
      unitId: 'U01',
      unitNo: 2,
      segmentIds: ['n', 'd'],
      segments: 2,
      regenerated: 0,
      cost: 0,
    });
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
    expect(generate.generatePlanOf(withStale, availability(), accounts, unit).regenerated).toBe(1);
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
