import { ontology, ONTOLOGY_VIEW } from '@testing/knowledge';
import { describe, expect, it } from 'vitest';

// prettier-ignore
import { BATCH_SIZE, buildOntology, EMPTY_ONTOLOGY, PERSONA_PREDICATE } from './novel.knowledge.ontology';

describe('Ontology', () => {
  it('builds frozen definitions from a view', () => {
    const built = ontology();
    expect(built.version).toBe(1);
    expect(built.yaml).toBe('version: 1');
    expect(built.types).toHaveLength(5);
    expect(built.rules.map((rule) => rule.id)).not.toContain('unknown_rule');
    expect(Object.isFrozen(built)).toBe(true);
    expect(PERSONA_PREDICATE).toBe('persona_of');
    expect(BATCH_SIZE).toBe(5);
  });

  it('resolves type styles with a fallback', () => {
    const built = ontology();
    expect(built.typeDef('character')?.icon).toBe('user');
    expect(built.typeDef('weird')?.icon).toBe('tag');
    expect(built.typeDef('weird')?.labelKey).toBe('novel.knowledge.type.weird');
    expect(built.typeDef('weird')?.hintKey).toBe('novel.knowledge.type.weird.hint');
    expect(built.typeDef('nope')).toBeUndefined();
  });

  it('splits predicates by kind', () => {
    const built = ontology();
    expect(built.scalars.map((item) => item.key)).toEqual(['trait']);
    expect(built.relationships.map((item) => item.key)).toEqual(['persona_of', 'located_in']);
    expect(built.predicateDef('trait')?.labelKey).toBe('novel.knowledge.pred.trait');
    expect(built.predicateDef('nope')).toBeUndefined();
  });

  it('falls back for unknown rules', () => {
    const built = buildOntology({
      ...ONTOLOGY_VIEW,
      rules: [{ id: 'evidence', severity: 'error' }],
    });
    expect(built.ruleDef('evidence').severity).toBe('error');
    expect(built.ruleDef('source_stale').severity).toBe('warning');
    expect(EMPTY_ONTOLOGY.types).toEqual([]);
  });
});
