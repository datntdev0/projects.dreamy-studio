// prettier-ignore
import { KnowledgeEntity, KnowledgeFact, OntologyView } from '@features/novel/novel.knowledge.models';
import { buildOntology, Ontology } from '@features/novel/novel.knowledge.ontology';

export const ONTOLOGY_VIEW: OntologyView = {
  version: 1,
  yaml: 'version: 1',
  types: [
    { key: 'character', abstract: false, properties: ['age'] },
    { key: 'persona', abstract: false, properties: [] },
    { key: 'location', abstract: false, properties: [] },
    { key: 'organization', abstract: false, properties: [] },
    { key: 'weird', abstract: true, properties: [] },
  ],
  predicates: [
    {
      key: 'persona_of',
      kind: 'relationship',
      domain: ['persona'],
      range: ['character'],
      limit: false,
    },
    {
      key: 'located_in',
      kind: 'relationship',
      domain: ['organization'],
      range: ['location'],
      limit: true,
    },
    { key: 'trait', kind: 'scalar', domain: ['persona', 'location'], range: [], limit: false },
  ],
  rules: [
    { id: 'character_predicate', severity: 'error' },
    { id: 'persona_link', severity: 'error' },
    { id: 'relation_signature', severity: 'error' },
    { id: 'dangling_ref', severity: 'error' },
    { id: 'relation_unique', severity: 'warning' },
    { id: 'entity_duplicate', severity: 'warning' },
    { id: 'evidence', severity: 'warning' },
    { id: 'source_stale', severity: 'warning' },
    { id: 'unknown_rule', severity: 'warning' },
  ],
};

export function ontology(): Ontology {
  return buildOntology(ONTOLOGY_VIEW);
}

export function entity(
  id: string,
  type: string,
  name: string,
  overrides: Partial<KnowledgeEntity> = {},
): KnowledgeEntity {
  return {
    id,
    kind: 'entity',
    type,
    name,
    titles: [],
    aliases: [],
    ev: [{ chapter: 1, p: 1, q: 'quote', verified: true }],
    stale: [],
    ...overrides,
  };
}

export function fact(
  id: string,
  pred: string,
  subject: string,
  object: string | null,
  overrides: Partial<KnowledgeFact> = {},
): KnowledgeFact {
  return {
    id,
    kind: 'fact',
    pred,
    subject,
    object,
    ev: [{ chapter: 1, p: 1, q: 'quote', verified: true }],
    stale: [],
    ...overrides,
  };
}
