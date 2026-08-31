import { chapter } from '@testing/fixtures';
import { entity, fact, ontology } from '@testing/knowledge';
import { describe, expect, it } from 'vitest';

import { KnowledgeIssue, KnowledgeItem } from './novel.knowledge.models';
// prettier-ignore
import { batchesOf, chapterOf, chaptersOfItem, characterOf, checkKnowledge, EMPTY_KNOWLEDGE, emptyView, entitiesOf, entityIn, errorCount, factsAbout, factsOf, factText, flaggedIds, graphLinks, isEntity, isFact, issuesOfItem, itemText, mapOf, matchesList, nameOf, personasOf, planAnalysis, predicateLabel, ruleCounts, tokensOf, typeLabel, visibilityOf } from './novel.knowledge.rules';

const t = (key: string, params?: Record<string, string | number>): string =>
  params ? `${key}:${Object.values(params).join('|')}` : key;
const onto = ontology();

const hero = entity('e1', 'character', 'Hero');
const persona = entity('e2', 'persona', 'Mask');
const place = entity('e3', 'location', 'Town');
const org = entity('e4', 'organization', 'Guild');

describe('novel.knowledge.rules helpers', () => {
  it('builds empty state and splits kinds', () => {
    expect(EMPTY_KNOWLEDGE.items).toEqual([]);
    expect(emptyView('EN').lang).toBe('EN');
    const f = fact('f1', 'trait', 'e2', null);
    expect(entitiesOf([hero, f])).toEqual([hero]);
    expect(factsOf([hero, f])).toEqual([f]);
    expect(isEntity(hero)).toBe(true);
    expect(isFact(f)).toBe(true);
    expect(entityIn(mapOf([hero, f]), 'e1')).toBe(hero);
    expect(entityIn(mapOf([hero, f]), 'f1')).toBeUndefined();
    expect(entityIn(mapOf([hero]), null)).toBeUndefined();
  });

  it('finds chapters of items', () => {
    const item = entity('x', 'location', 'X', {
      ev: [
        { chapter: 5, p: 1, q: '', verified: true },
        { chapter: 2, p: 1, q: '', verified: true },
        { chapter: 5, p: 2, q: '', verified: true },
      ],
    });
    expect(chapterOf(item)).toBe(2);
    expect(chapterOf(entity('y', 'location', 'Y', { ev: [] }))).toBe(0);
    expect(chaptersOfItem(item)).toEqual([2, 5]);
  });

  it('labels and renders text', () => {
    expect(predicateLabel(onto, 'trait', t)).toBe('novel.knowledge.pred.trait');
    expect(predicateLabel(onto, 'zzz', t)).toBe('zzz');
    expect(typeLabel(onto, 'location', t)).toBe('novel.knowledge.type.location');
    expect(typeLabel(onto, 'zzz', t)).toBe('zzz');
    const map = mapOf([hero, place]);
    expect(nameOf(map, 'e1')).toBe('Hero');
    expect(nameOf(map, 'nope')).toBe('?');
    expect(nameOf(mapOf([entity('z', 'location', '')]), 'z')).toBe('—');
    const rel = fact('f', 'located_in', 'e4', 'e3');
    const scalar = fact('g', 'trait', 'e2', null, { ev: [] });
    const all = mapOf([org, place, persona]);
    expect(factText(onto, all, rel, t)).toContain('→ Town');
    expect(factText(onto, all, scalar, t)).toContain(': ');
    expect(itemText(onto, all, org, t)).toBe('Guild');
    expect(itemText(onto, all, rel, t)).toContain('Guild');
  });

  it('relates facts, personas and characters', () => {
    const link = fact('l', 'persona_of', 'e2', 'e1');
    const other = fact('o', 'trait', 'e2', null);
    const items: KnowledgeItem[] = [hero, persona, link, other];
    expect(factsAbout(items, 'e2').map((f) => f.id)).toEqual(['l', 'o']);
    expect(factsAbout(items, 'e1').map((f) => f.id)).toEqual(['l']);
    expect(personasOf(items, 'e1')).toEqual([persona]);
    expect(personasOf(items, 'other')).toEqual([]);
    expect(characterOf(items, 'e2')).toBe(hero);
    expect(characterOf(items, 'e1')).toBeUndefined();
  });
});

function ids(items: KnowledgeItem[]): string[] {
  return checkKnowledge(onto, items, t).map((issue) => issue.rule);
}

describe('checkKnowledge', () => {
  it('is clean for a consistent graph', () => {
    const items: KnowledgeItem[] = [
      hero,
      persona,
      place,
      org,
      fact('l', 'persona_of', 'e2', 'e1'),
      fact('r', 'located_in', 'e4', 'e3'),
      fact('s', 'trait', 'e2', null),
    ];
    expect(checkKnowledge(onto, items, t)).toEqual([]);
  });

  it('flags facts attached to characters', () => {
    const items: KnowledgeItem[] = [
      hero,
      persona,
      fact('l', 'persona_of', 'e2', 'e1'),
      fact('s', 'trait', 'e1', null),
      fact('o', 'located_in', 'e4', 'e1'),
      org,
    ];
    const issues = checkKnowledge(onto, items, t).filter(
      (issue) => issue.rule === 'character_predicate',
    );
    expect(issues).toHaveLength(2);
    expect(issues[0].values).toEqual(['e2']);
  });

  it('flags personas without or with many links', () => {
    const second = entity('e9', 'character', 'Other');
    const none = checkKnowledge(onto, [persona], t).filter(
      (issue) => issue.rule === 'persona_link',
    );
    expect(none).toHaveLength(1);
    const many = checkKnowledge(
      onto,
      [
        persona,
        hero,
        second,
        fact('a', 'persona_of', 'e2', 'e1'),
        fact('b', 'persona_of', 'e2', 'e9'),
      ],
      t,
    ).filter((issue) => issue.rule === 'persona_link');
    expect(many).toHaveLength(1);
    expect(many[0].ids).toEqual(['e2', 'a', 'b']);
  });

  it('flags signature violations and unknown predicates', () => {
    const items: KnowledgeItem[] = [
      place,
      org,
      persona,
      fact('a', 'located_in', 'e3', 'e4'),
      fact('b', 'trait', 'e4', null),
      fact('c', 'mystery', 'e3', null),
      fact('d', 'located_in', 'e4', 'e4'),
    ];
    const issues = checkKnowledge(onto, items, t).filter(
      (issue) => issue.rule === 'relation_signature',
    );
    expect(issues.map((issue) => issue.ids[0]).sort()).toEqual(['a', 'b', 'c', 'd']);
  });

  it('flags dangling references', () => {
    const issues = checkKnowledge(
      onto,
      [place, fact('a', 'located_in', 'ghost', 'e3'), fact('b', 'located_in', 'e3', 'ghost')],
      t,
    ).filter((issue) => issue.rule === 'dangling_ref');
    expect(issues).toHaveLength(2);
  });

  it('flags relations claimed by several subjects', () => {
    const second = entity('e5', 'organization', 'Order');
    const issues = checkKnowledge(
      onto,
      [
        org,
        second,
        place,
        fact('a', 'located_in', 'e4', 'e3'),
        fact('b', 'located_in', 'e5', 'e3'),
      ],
      t,
    ).filter((issue) => issue.rule === 'relation_unique');
    expect(issues).toHaveLength(1);
    expect(issues[0].ids).toEqual(['a', 'b']);
    expect(
      ids([
        org,
        place,
        fact('a', 'located_in', 'e4', 'e3'),
        fact('b', 'located_in', 'e4', 'e3', { id: 'c' }),
      ]),
    ).not.toContain('relation_unique');
  });

  it('flags near duplicate entities of the same type', () => {
    const items = [
      entity('a', 'location', 'Đại Thành'),
      entity('b', 'location', 'Dai Thanh Pho'),
      entity('c', 'organization', 'Dai Thanh'),
      entity('d', 'location', ''),
    ];
    const issues = checkKnowledge(onto, items, t).filter(
      (issue) => issue.rule === 'entity_duplicate',
    );
    expect(issues).toHaveLength(1);
    expect(tokensOf('Đại Thành!')).toEqual(['dai', 'thanh']);
  });

  it('flags missing or unverified evidence and stale sources', () => {
    const items: KnowledgeItem[] = [
      entity('a', 'location', 'A', { ev: [] }),
      entity('b', 'location', 'B', { ev: [{ chapter: 1, p: 1, q: '', verified: false }] }),
      entity('c', 'location', 'C', { stale: [3, 4] }),
    ];
    expect(ids(items).filter((rule) => rule === 'evidence')).toHaveLength(2);
    expect(ids(items)).toContain('source_stale');
  });

  it('summarises issues', () => {
    const issues = checkKnowledge(
      onto,
      [entity('a', 'location', 'A', { ev: [], stale: [1] }), fact('f', 'located_in', 'ghost', 'a')],
      t,
    );
    expect(ruleCounts(onto, issues).find((count) => count.rule.id === 'evidence')?.count).toBe(1);
    expect(issuesOfItem(issues, 'a').length).toBeGreaterThan(0);
    expect(errorCount(issues)).toBeGreaterThan(0);
    const flagged = flaggedIds(
      [entity('a', 'location', 'A'), fact('f', 'located_in', 'a', 'b')],
      [
        {
          id: 'i',
          rule: 'evidence',
          sev: 'warning',
          ids: ['f', 'missing'],
          message: '',
          values: [],
        } as KnowledgeIssue,
      ],
    );
    expect([...flagged].sort()).toEqual(['a', 'b', 'f', 'missing']);
    const scalarFlag = flaggedIds(
      [fact('g', 'trait', 'a', null)],
      [
        {
          id: 'i',
          rule: 'evidence',
          sev: 'warning',
          ids: ['g'],
          message: '',
          values: [],
        } as KnowledgeIssue,
      ],
    );
    expect([...scalarFlag].sort()).toEqual(['a', 'g']);
  });
});

describe('knowledge views', () => {
  const view = { ...emptyView('src'), q: '', type: 'all', chapter: 0 };

  it('matches list entries', () => {
    const named = entity('a', 'persona', 'Alice', {
      aliases: ['Ally'],
      ev: [{ chapter: 2, p: 1, q: '', verified: true }],
    });
    expect(matchesList(named, view, new Set())).toBe(true);
    expect(matchesList(named, { ...view, type: 'location' }, new Set())).toBe(false);
    expect(matchesList(named, { ...view, chapter: 2 }, new Set())).toBe(true);
    expect(matchesList(named, { ...view, chapter: 3 }, new Set())).toBe(false);
    expect(matchesList(named, { ...view, onlyIssues: true }, new Set())).toBe(false);
    expect(matchesList(named, { ...view, onlyIssues: true }, new Set(['a']))).toBe(true);
    expect(matchesList(named, { ...view, q: 'ally' }, new Set())).toBe(true);
    expect(matchesList(named, { ...view, q: 'zzz' }, new Set())).toBe(false);
  });

  it('builds graph links and visibility', () => {
    const items: KnowledgeItem[] = [
      entity('a', 'location', 'A', { ev: [{ chapter: 1, p: 1, q: '', verified: true }] }),
      entity('b', 'location', 'B', { ev: [{ chapter: 5, p: 1, q: '', verified: true }] }),
      fact('f', 'located_in', 'a', 'b', { ev: [{ chapter: 5, p: 1, q: '', verified: true }] }),
      fact('s', 'trait', 'a', null),
      fact('self', 'located_in', 'a', 'a'),
      fact('bad', 'located_in', 'a', 'zzz'),
    ];
    expect(graphLinks(items, (pred) => pred)).toEqual([
      { source: 'a', target: 'b', label: 'located_in' },
    ]);
    const early = visibilityOf(items, 1);
    expect(early.entities).toBe(1);
    expect(early.hiddenEntities).toBe(1);
    expect(early.facts).toBe(2);
    expect(visibilityOf(items, null).entities).toBe(2);
  });
});

describe('analysis planning', () => {
  it('batches sequences', () => {
    expect(batchesOf([3, 1, 2], 2)).toEqual([[1, 2], [3]]);
    expect(batchesOf([1, 2, 3, 4, 5, 6])).toHaveLength(2);
  });

  it('plans by mode', () => {
    const chapters = [1, 2, 3, 4].map((seq) => chapter({ id: `c${seq}`, seq }));
    const analyzed = { 1: { at: '', entities: 1, facts: 1, stale: false } };
    const available = new Set([1, 2, 3]);
    const missing = planAnalysis(
      chapters,
      analyzed,
      { mode: 'missing', from: 1, to: 4, overwrite: true, lang: 'src' },
      available,
    );
    expect(missing.run).toEqual([2, 3]);
    expect(missing.noSource).toEqual([4]);
    expect(missing.keep).toEqual([1]);
    expect(missing.missing).toEqual([2, 3, 4]);
    const range = planAnalysis(
      chapters,
      analyzed,
      { mode: 'range', from: 1, to: 2, overwrite: true, lang: 'src' },
      available,
    );
    expect(range.run).toEqual([1, 2]);
    expect(range.overwrite).toEqual([1]);
    const all = planAnalysis(
      chapters,
      analyzed,
      { mode: 'all', from: 1, to: 4, overwrite: false, lang: 'src' },
      available,
    );
    expect(all.run).toEqual([2, 3]);
  });
});
