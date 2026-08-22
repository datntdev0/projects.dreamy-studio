import { parse } from "yaml";
import source from "../../../desktop/src/features/knowledge/ontology.yml?raw";
import { OntologyPredicateView, OntologyRuleView, OntologyTypeView, OntologyView, Severity } from "@app/features/novel/novel.knowledge.models";

interface TypeDoc {
  abstract?: boolean;
  properties?: string[];
}

interface PredicateDoc {
  domain?: string[];
  range?: string[];
  single?: boolean;
  unique_range?: boolean;
}

interface RuleDoc {
  severity: Severity;
}

interface OntologyDoc {
  version: number;
  entity_types: Record<string, TypeDoc | null>;
  scalars: Record<string, PredicateDoc | null>;
  relationships: Record<string, PredicateDoc | null>;
  rules: Record<string, RuleDoc>;
}

function typeOf([key, def]: [string, TypeDoc | null]): OntologyTypeView {
  return { key, abstract: def?.abstract === true, properties: def?.properties ?? [] };
}

function scalarOf([key, def]: [string, PredicateDoc | null]): OntologyPredicateView {
  return { key, kind: "scalar", domain: def?.domain ?? [], range: [], limit: def?.single === true };
}

function relationshipOf([key, def]: [string, PredicateDoc | null]): OntologyPredicateView {
  return { key, kind: "relationship", domain: def?.domain ?? [], range: def?.range ?? [], limit: def?.unique_range === true };
}

function ruleOf([id, def]: [string, RuleDoc]): OntologyRuleView {
  return { id, severity: def.severity };
}

function ontologyFrom(text: string): OntologyView {
  const yaml = text.replace(/\r\n/g, "\n");
  const doc = parse(yaml) as OntologyDoc;
  return {
    version: doc.version,
    yaml,
    types: Object.entries(doc.entity_types).map(typeOf),
    predicates: [...Object.entries(doc.scalars).map(scalarOf), ...Object.entries(doc.relationships).map(relationshipOf)],
    rules: Object.entries(doc.rules).map(ruleOf),
  };
}

export const ONTOLOGY_VIEW: OntologyView = ontologyFrom(source);
