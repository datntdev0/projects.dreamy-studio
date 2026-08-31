import { entity, fact, ontology } from '@testing/knowledge';
import { describe, expect, it } from 'vitest';

// prettier-ignore
import { applyEdits, blankEntity, blankFact, cloneItem, createdItems, createdOf, describeEdit, isIncomplete, isPresent, itemState, previewOf, scopeOf, typeRefused, withCreated, withDelete, withoutDelete, withPatch } from './novel.knowledge.draft';
import { EvidenceRef, KnowledgeEdit, KnowledgeItem } from './novel.knowledge.models';
import { checkKnowledge } from './novel.knowledge.rules';

const t = (key: string, params?: Record<string, string | number>): string =>
  params ? `${key}:${Object.values(params).join('|')}` : key;
const onto = ontology();
const ref = (chapter: number, p = 1, q = 'q'): EvidenceRef => ({ chapter, p, q });

function base(): KnowledgeItem[] {
  return [
    entity('a', 'location', 'Alpha', { titles: ['T'] }),
    entity('b', 'location', 'Beta'),
    entity('o', 'organization', 'Org'),
    fact('f', 'located_in', 'o', 'a'),
    fact('g', 'located_in', 'o', 'b'),
  ];
}

describe('applyEdits', () => {
  it('renames, retypes and updates props without mutating the base', () => {
    const items = base();
    const out = applyEdits(items, [
      { k: 'rename', id: 'a', name: 'A2' },
      { k: 'retype', id: 'a', type: 'organization' },
      { k: 'props', id: 'a', titles: [], aliases: ['x'] },
      { k: 'rename', id: 'f', name: 'ignored' },
    ]);
    expect(out[0]).toMatchObject({ name: 'A2', type: 'organization', titles: [], aliases: ['x'] });
    expect(items[0]).toMatchObject({ name: 'Alpha' });
  });

  it('deletes with dependent facts', () => {
    const out = applyEdits(base(), [{ k: 'del', id: 'a' }]);
    expect(out.map((item) => item.id)).toEqual(['b', 'o', 'g']);
  });

  it('merges entities, retargeting and tidying facts', () => {
    const items = base();
    items[1] = entity('b', 'location', 'Beta', {
      titles: ['t', 'U'],
      ev: [{ chapter: 9, p: 1, q: 'z', verified: true }],
    });
    const out = applyEdits(items, [{ k: 'merge', sources: ['b', 'a', 'missing'], target: 'a' }]);
    expect(out.map((item) => item.id)).toEqual(['a', 'o', 'f']);
    const merged = out[0] as { titles: string[]; ev: unknown[] };
    expect(merged.titles).toEqual(['T', 'U']);
    expect(merged.ev).toHaveLength(2);
    const fct = out[2] as { ev: unknown[] };
    expect(fct.ev).toHaveLength(1);
  });

  it('drops self referencing facts after a merge', () => {
    const items = [...base(), fact('self', 'located_in', 'a', 'b')];
    const out = applyEdits(items, [{ k: 'merge', sources: ['b'], target: 'a' }]);
    expect(out.find((item) => item.id === 'self')).toBeUndefined();
  });

  it('edits facts', () => {
    const out = applyEdits(base(), [
      { k: 'fact', id: 'f', pred: 'trait', object: 'b' },
      { k: 'fact', id: 'a', pred: 'x' },
      { k: 'fact', id: 'missing' },
    ]);
    expect(out.find((item) => item.id === 'f')).toMatchObject({ pred: 'trait', object: 'b' });
  });

  it('edits evidence', () => {
    const out = applyEdits(base(), [
      { k: 'evidence', id: 'a', add: [ref(3), ref(1, 1, 'quote')], remove: [ref(1, 1, 'quote')] },
      { k: 'evidence', id: 'missing', add: [ref(1)] },
    ]);
    expect((out[0] as { ev: { chapter: number }[] }).ev.map((ev) => ev.chapter)).toEqual([3, 1]);
  });

  it('adds entities, facts and characters', () => {
    const out = applyEdits(base(), [
      { k: 'add_entity', ref: 'n1', type: 'persona', name: 'P', ev: [ref(1)] },
      { k: 'add_fact', ref: 'n2', pred: 'trait', subject: 'n1', ev: [ref(1)] },
      { k: 'character', persona: 'n1' },
      { k: 'character', persona: 'n1' },
      { k: 'character', persona: 'missing' },
    ]);
    expect(out.map((item) => item.id)).toEqual([
      'a',
      'b',
      'o',
      'f',
      'g',
      'n1',
      'n2',
      'n1.character',
      'n1.link',
    ]);
  });

  it('clones items', () => {
    const item = entity('a', 'location', 'A');
    expect(cloneItem(item)).toEqual(item);
    expect(cloneItem(item)).not.toBe(item);
  });
});

describe('draft edits', () => {
  it('tracks created items', () => {
    const edits: KnowledgeEdit[] = [
      { k: 'add_entity', ref: 'n1', type: 'location', name: 'N', ev: [ref(1)] },
      { k: 'add_fact', ref: 'n2', pred: 'trait', subject: 'n1', object: 'a', ev: [] },
      { k: 'del', id: 'x' },
    ];
    expect(createdOf(edits, 'n1')?.k).toBe('add_entity');
    expect(createdOf(edits, 'zzz')).toBeUndefined();
    expect(createdItems(edits).map((item) => item.id)).toEqual(['n1', 'n2']);
  });

  it('scopes ids to related items', () => {
    expect([...scopeOf(base(), ['a'])].sort()).toEqual(['a', 'f']);
    expect([...scopeOf(base(), ['f'])].sort()).toEqual(['a', 'f', 'o']);
    expect([...scopeOf(base(), ['zzz'])]).toEqual(['zzz']);
  });

  it('creates and deletes drafts', () => {
    const blank = blankEntity(base(), [], 'location');
    expect(blank.id).toBe('new1');
    const edits = withCreated([], {
      ...blank,
      name: 'X',
      titles: ['t'],
      ev: [{ chapter: 1, p: 1, q: 'q', verified: true }],
    });
    expect(edits[0]).toMatchObject({ k: 'add_entity', ref: 'new1', titles: ['t'] });
    expect(blankEntity(base(), edits, 'location').id).toBe('new2');
    const factBlank = blankFact(onto, base(), edits, 'a', 'b');
    expect(factBlank.pred).toBe('located_in');
    expect(blankFact(onto, base(), [], 'a', null).pred).toBe('trait');
    const withFact = withCreated(edits, {
      ...factBlank,
      ev: [{ chapter: 1, p: 1, q: 'q', verified: true }],
    });
    expect(withFact[1]).toMatchObject({ k: 'add_fact', object: 'b' });
    expect(withDelete(withFact, 'new1')).toHaveLength(1);
    const deleted = withDelete([{ k: 'rename', id: 'a', name: 'x' }], 'a');
    expect(deleted).toEqual([{ k: 'del', id: 'a' }]);
    expect(withoutDelete(deleted, 'a')).toEqual([]);
  });

  it('patches created drafts', () => {
    let edits = withCreated([], { ...blankEntity(base(), [], 'location'), name: 'N', ev: [] });
    edits = withPatch(base(), edits, 'new1', {
      name: 'M',
      type: 'organization',
      titles: ['x'],
      aliases: [],
      evidenceAdd: [ref(1), ref(1)],
      evidenceRemove: [ref(9)],
    });
    expect(edits[0]).toMatchObject({
      name: 'M',
      type: 'organization',
      titles: ['x'],
      aliases: undefined,
    });
    expect((edits[0] as { ev: unknown[] }).ev).toHaveLength(1);
    edits = withCreated(edits, { ...blankFact(onto, base(), edits, 'a', 'b'), ev: [] });
    edits = withPatch(base(), edits, 'new2', {
      pred: 'trait',
      subject: 'b',
      object: null,
      evidenceAdd: [ref(2)],
    });
    expect(edits[1]).toMatchObject({ pred: 'trait', subject: 'b', object: undefined });
    edits = withPatch(base(), edits, 'new2', { object: 'a' });
    expect(edits[1]).toMatchObject({ object: 'a' });
    expect(withPatch(base(), edits, 'new2', {})[1]).toMatchObject({ object: 'a' });
  });

  it('patches existing entities', () => {
    let edits = withPatch(base(), [], 'a', {
      name: 'A2',
      type: 'organization',
      titles: ['T', 'U'],
      aliases: ['al'],
    });
    expect(edits.map((edit) => edit.k)).toEqual(['rename', 'retype', 'props']);
    edits = withPatch(base(), edits, 'a', { name: 'Alpha' });
    expect(edits.map((edit) => edit.k)).toEqual(['retype', 'props']);
    expect(withPatch(base(), [], 'zzz', { name: 'x' })).toEqual([]);
    expect(withPatch(base(), [], 'a', { titles: ['T'] })).toEqual([]);
  });

  it('patches existing facts', () => {
    let edits = withPatch(base(), [], 'f', { pred: 'trait', subject: 'b', object: 'o' });
    expect(edits[0]).toMatchObject({ k: 'fact', pred: 'trait', subject: 'b', object: 'o' });
    edits = withPatch(base(), edits, 'f', { pred: 'located_in', subject: 'o', object: 'a' });
    expect(edits).toEqual([]);
    const scalar = [...base(), fact('s', 'trait', 'a', null)];
    expect(withPatch(scalar, [], 's', { object: 'b' })).toEqual([]);
  });

  it('patches evidence', () => {
    const items = [
      entity('a', 'location', 'A', { ev: [{ chapter: 1, p: 1, q: 'quote', verified: true }] }),
    ];
    let edits = withPatch(items, [], 'a', { evidenceAdd: [ref(2), ref(2)] });
    expect(edits[0]).toMatchObject({ k: 'evidence', add: [ref(2)] });
    edits = withPatch(items, edits, 'a', { evidenceRemove: [ref(2)] });
    expect(edits).toEqual([]);
    edits = withPatch(items, edits, 'a', { evidenceRemove: [ref(1, 1, 'quote'), ref(7)] });
    expect(edits[0]).toMatchObject({ remove: [ref(1, 1, 'quote')] });
    edits = withPatch(items, edits, 'a', { evidenceAdd: [ref(1, 1, 'quote')] });
    expect(edits).toEqual([]);
  });
});

describe('draft state and preview', () => {
  it('derives item states', () => {
    const items = base();
    const edits: KnowledgeEdit[] = [
      { k: 'add_entity', ref: 'n1', type: 'location', name: 'N', ev: [ref(1)] },
      { k: 'merge', sources: ['b'], target: 'a' },
      { k: 'del', id: 'o' },
      { k: 'rename', id: 'a', name: 'Z' },
    ];
    const current = applyEdits(items, edits);
    expect(itemState(items, edits, current, 'n1')).toBe('new');
    expect(itemState(items, edits, current, 'a')).toBe('edited');
    expect(itemState(items, edits, current, 'b')).toBe('merged');
    expect(itemState(items, edits, current, 'o')).toBe('deleted');
    expect(itemState(items, edits, current, 'f')).toBe('removed');
    expect(itemState(items, [], items, 'a')).toBe('same');
    expect(itemState([], [], items, 'a')).toBe('new');
    expect(isPresent('same')).toBe(true);
    expect(isPresent('deleted')).toBe(false);
    expect(isPresent('merged')).toBe(false);
    expect(isPresent('removed')).toBe(false);
  });

  it('detects incomplete drafts', () => {
    const named = entity('n1', 'location', 'N', { ev: [] });
    const create: KnowledgeEdit[] = [
      { k: 'add_entity', ref: 'n1', type: 'location', name: 'N', ev: [] },
    ];
    expect(isIncomplete(onto, [named], new Set(['n1']), create)).toBe(true);
    expect(isIncomplete(onto, [entity('n1', 'location', '')], new Set(['n1']), [])).toBe(true);
    expect(
      isIncomplete(onto, [entity('n1', 'location', 'N', { aliases: ['x'] })], new Set(['n1']), []),
    ).toBe(true);
    expect(isIncomplete(onto, [entity('n1', 'location', 'N')], new Set(), [])).toBe(false);
    const rel = fact('r', 'located_in', 'ghost', 'n1');
    expect(isIncomplete(onto, [rel], new Set(['r']), [])).toBe(true);
    expect(
      isIncomplete(
        onto,
        [
          entity('n1', 'location', 'N'),
          entity('q', 'organization', 'Q'),
          fact('r', 'located_in', 'q', 'n1'),
        ],
        new Set(['r']),
        [],
      ),
    ).toBe(false);
    expect(
      isIncomplete(
        onto,
        [entity('q', 'organization', 'Q'), fact('s', 'mystery', 'q', null)],
        new Set(['s']),
        [],
      ),
    ).toBe(false);
    expect(
      isIncomplete(
        onto,
        [entity('q', 'organization', 'Q'), fact('s', 'mystery', 'q', 'zzz')],
        new Set(['s']),
        [],
      ),
    ).toBe(true);
    expect(typeRefused(entity('p', 'persona', 'P', { aliases: ['x'] }))).toBe(false);
    expect(typeRefused(entity('p', 'location', 'P', { aliases: ['x'] }))).toBe(true);
  });

  it('previews the effect of edits', () => {
    const items = [entity('a', 'location', 'A', { ev: [] }), entity('o', 'organization', 'O')];
    const open = checkKnowledge(onto, items, t);
    expect(previewOf(onto, items, new Set(), [], null, open, t).state).toBe('idle');
    const edits: KnowledgeEdit[] = [{ k: 'rename', id: 'a', name: 'A2' }];
    expect(
      previewOf(onto, [entity('a', 'location', '')], new Set(['a']), edits, null, open, t).state,
    ).toBe('invalid');
    const issue = open.find((entry) => entry.rule === 'evidence')!;
    const fixedItems = [entity('a', 'location', 'A'), entity('o', 'organization', 'O')];
    const resolved = previewOf(onto, fixedItems, new Set(['a']), edits, issue, open, t);
    expect(resolved.state).toBe('resolved');
    expect(previewOf(onto, items, new Set(['a']), edits, issue, open, t).state).toBe('open');
    expect(previewOf(onto, fixedItems, new Set(['a']), edits, null, open, t).state).toBe('clean');
    const worse = [...fixedItems, entity('z', 'location', 'A')];
    expect(previewOf(onto, worse, new Set(['a']), edits, null, open, t).state).toBe('warn');
    expect(
      previewOf(onto, fixedItems, new Set(['a']), edits, null, open, t).fixed.length,
    ).toBeGreaterThan(0);
  });

  it('describes edits', () => {
    const items = base();
    const current = items;
    const d = (edit: KnowledgeEdit): string => describeEdit(onto, edit, current, items, t);
    expect(d({ k: 'add_entity', ref: 'n1', type: 'location', name: 'N', ev: [] })).toContain('add');
    expect(d({ k: 'add_fact', ref: 'n2', pred: 'trait', subject: 'a', ev: [] })).toContain('add');
    expect(d({ k: 'del', id: 'a' })).toContain('Alpha');
    expect(d({ k: 'merge', sources: ['a', 'b'], target: 'a' })).toContain('Beta');
    expect(d({ k: 'character', persona: 'zzz' })).toContain('zzz.character');
    expect(d({ k: 'rename', id: 'a', name: 'x' })).toContain('field.name');
    expect(d({ k: 'retype', id: 'a', type: 'x' })).toContain('field.type');
    expect(d({ k: 'fact', id: 'f', pred: 'p', subject: 'a', object: 'b' })).toContain('field.pred');
    expect(d({ k: 'props', id: 'a', titles: [], aliases: [] })).toContain('field.titles');
    expect(d({ k: 'evidence', id: 'a' })).toContain('field.ev');
    expect(d({ k: 'del', id: 'zzz' })).toContain('zzz');
  });
});
