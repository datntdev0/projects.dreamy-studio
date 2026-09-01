import { entity, fact } from '@testing/knowledge';
import { describe, expect, it } from 'vitest';

import { KnowledgeItem, NovelKnowledge } from '../novel/novel.knowledge.models';
// prettier-ignore
import { EMPTY_KB, kbAvailable, kbCharactersOf, kbMissing, kbPlaceNames, kbSnapshotOf, kbStatusOf } from './scripting.knowledge';

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
  fact('F1', 'persona_of', 'P1', 'C3'),
  fact('F2', 'located_in', 'L1', 'L2'),
];

describe('scripting knowledge adapter', () => {
  const kb = kbSnapshotOf(knowledgeOf(ITEMS));

  it('projects the knowledge', () => {
    expect(kb.analyzed).toEqual([1, 2]);
    expect(kb.characters.map((item) => item.id)).toEqual(['C1', 'C3']);
    expect(kb.characters[0].refs).toEqual(['1.1']);
    expect(kb.places.map((item) => item.id)).toEqual(['L1', 'L2', 'L3', 'O1']);
    expect(kb.places[0].refs).toEqual(['1.1', '2.3']);
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
    expect(kbStatusOf(kb, true, [1, 3])).toEqual({
      novel: true,
      available: true,
      missing: [3],
    });
    expect(kbStatusOf(kb, false, [1])).toEqual({
      novel: false,
      available: false,
      missing: [],
    });
  });
});
