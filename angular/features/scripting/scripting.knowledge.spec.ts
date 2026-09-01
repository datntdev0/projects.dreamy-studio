import { entity, fact } from '@testing/knowledge';
import { describe, expect, it } from 'vitest';

import { KnowledgeItem, NovelKnowledge } from '../novel/novel.knowledge.models';
// prettier-ignore
import { EMPTY_KB, kbAvailable, kbBeatsOf, kbCharactersOf, kbMissing, kbPlaceNames, kbReady, kbSnapshotOf, kbStatusOf } from './scripting.knowledge';

function ev(chapter: number, p: number) {
  return { chapter, p, q: 'quote', verified: true };
}

function knowledgeOf(items: KnowledgeItem[], analyzed: number[] = [1, 2]): NovelKnowledge {
  const rows = Object.fromEntries(
    analyzed.map((seq) => [seq, { at: '', entities: 0, facts: 0, stale: false }]),
  );
  return { lang: 'VI', items, analyzed: rows };
}

const ITEMS: KnowledgeItem[] = [
  entity('C1', 'character', 'Wren Aldous', { ev: [ev(1, 1)] }),
  entity('C2', 'character', 'Wren', { ev: [ev(1, 1)] }),
  entity('C3', 'character', 'Maro Quill', { ev: [ev(1, 5)] }),
  entity('P1', 'persona', 'Maro the clerk', { ev: [ev(1, 3)] }),
  entity('L1', 'location', 'Lantern Tower', { ev: [ev(1, 1), ev(2, 3)] }),
  entity('L2', 'location', 'Harrowmere', { ev: [ev(1, 1)] }),
  entity('L3', 'location', 'Salt shop', { ev: [ev(2, 1)] }),
  entity('O1', 'organization', 'Council', { ev: [ev(1, 3)] }),
  entity('V1', 'event', 'Maro climbs', { ev: [ev(1, 3), ev(1, 5)] }),
  entity('V2', 'event', 'Letter found', { ev: [ev(2, 1)] }),
  entity('V3', 'event', 'Later event', { ev: [ev(3, 1)] }),
  fact('F1', 'persona_of', 'P1', 'C3'),
  fact('F2', 'participates_in', 'P1', 'V1'),
  fact('F3', 'participates_in', 'C1', 'V1'),
  fact('F4', 'participates_in', 'C1', 'V1'),
  fact('F5', 'located_in', 'L1', 'L2'),
  fact('F6', 'occurs_at', 'V2', 'L3'),
  fact('F7', 'participates_in', 'P9', 'V2'),
  fact('F8', 'occurs_at', 'V3', null),
];

describe('scripting knowledge adapter', () => {
  const kb = kbSnapshotOf(knowledgeOf(ITEMS));

  it('projects the knowledge', () => {
    expect(kb.analyzed).toEqual([1, 2]);
    expect(kb.characters.map((item) => item.id)).toEqual(['C1', 'C3']);
    expect(kb.characters[0].refs).toEqual(['1.1']);
    expect(kb.places.map((item) => [item.id, item.container, item.organization])).toEqual([
      ['L1', false, false],
      ['L2', true, false],
      ['L3', false, false],
      ['O1', false, true],
    ]);
    expect(kb.events.map((item) => [item.id, item.order, item.place])).toEqual([
      ['V1', 0, null],
      ['V2', 1, 'L3'],
      ['V3', 2, null],
    ]);
    expect(kb.participants).toEqual({ V1: ['C3', 'C1'] });
    expect(kbCharactersOf(kb)).toHaveLength(2);
    expect(kbCharactersOf(null)).toEqual([]);
    expect(kbPlaceNames(kb)).toEqual(['Lantern Tower', 'Harrowmere', 'Salt shop', 'Council']);
    expect(kbPlaceNames(null)).toEqual([]);
  });

  it('reports availability and missing chapters', () => {
    expect(kbAvailable(kb)).toBe(true);
    expect(kbAvailable(null)).toBe(false);
    expect(kbAvailable(EMPTY_KB)).toBe(false);
    expect(kbMissing(kb, [1, 2, 3])).toEqual([3]);
    expect(kbMissing(null, [1])).toEqual([]);
    expect(kbMissing(EMPTY_KB, [1])).toEqual([]);
    expect(kbReady(kb, [1, 2])).toBe(true);
    expect(kbReady(kb, [1, 3])).toBe(false);
    expect(kbReady(kb, [])).toBe(false);
    expect(kbStatusOf(kb, true, [1, 3])).toEqual({
      novel: true,
      available: true,
      ready: false,
      missing: [3],
    });
    expect(kbStatusOf(kb, false, [1])).toEqual({
      novel: false,
      available: false,
      ready: false,
      missing: [],
    });
  });

  it('builds scene beats for chapters', () => {
    const beats = kbBeatsOf(kb, [1, 2]) ?? [];
    expect(beats.map((item) => item.event)).toEqual(['V1', 'V2']);
    expect(beats[0]).toEqual({
      event: 'V1',
      text: 'Maro climbs',
      refs: ['1.3', '1.5'],
      chars: ['C1', 'C3'],
      loc: 'LANTERN TOWER',
      time: 'DAY',
    });
    expect(beats[1]).toMatchObject({ loc: 'SALT SHOP', refs: ['2.1'], chars: [] });
    expect(kbBeatsOf(kb, [1, 3])).toBeNull();
    expect(kbBeatsOf(null, [1])).toBeNull();
    expect(kbBeatsOf(kb, [])).toBeNull();
  });

  it('falls back to the nearest place when no place is linked', () => {
    const items: KnowledgeItem[] = [
      entity('L1', 'location', 'Near', { ev: [ev(1, 4)] }),
      entity('L2', 'location', 'Far', { ev: [ev(1, 40), ev(2, 1)] }),
      entity('V1', 'event', 'Event', { ev: [ev(1, 5)] }),
      entity('V2', 'event', 'Nowhere', { ev: [ev(2, 90)] }),
    ];
    const near = kbBeatsOf(kbSnapshotOf(knowledgeOf(items)), [1, 2]) ?? [];
    expect(near[0].loc).toBe('NEAR');
    expect(near[1].loc).toBe('FAR');
    const none = kbBeatsOf(kbSnapshotOf(knowledgeOf([items[2]])), [1]) ?? [];
    expect(none[0].loc).toBe('');
  });
});
