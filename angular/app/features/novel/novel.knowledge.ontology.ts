import { EntityType, EntityTypeDef, PredicateDef, RuleDef, RuleId } from "./novel.knowledge.models";

export const ONTOLOGY_VERSION = 3;

export const ENTITY_TYPES: EntityTypeDef[] = [
  { key: "character", icon: "user", color: "primary", abstract: true, labelKey: "novel.knowledge.type.character", hintKey: "novel.knowledge.type.character.hint" },
  { key: "persona", icon: "shirt", color: "acc-twilight", abstract: false, labelKey: "novel.knowledge.type.persona", hintKey: "novel.knowledge.type.persona.hint" },
  { key: "location", icon: "globe", color: "info", abstract: false, labelKey: "novel.knowledge.type.location", hintKey: "novel.knowledge.type.location.hint" },
  { key: "organization", icon: "users", color: "secondary", abstract: false, labelKey: "novel.knowledge.type.organization", hintKey: "novel.knowledge.type.organization.hint" },
  { key: "artifact", icon: "package", color: "warning", abstract: false, labelKey: "novel.knowledge.type.artifact", hintKey: "novel.knowledge.type.artifact.hint" },
  { key: "skill", icon: "spark", color: "success", abstract: false, labelKey: "novel.knowledge.type.skill", hintKey: "novel.knowledge.type.skill.hint" },
  { key: "term", icon: "tag", color: "acc-sunset", abstract: false, labelKey: "novel.knowledge.type.term", hintKey: "novel.knowledge.type.term.hint" },
  { key: "event", icon: "activity", color: "acc-breeze", abstract: false, labelKey: "novel.knowledge.type.event", hintKey: "novel.knowledge.type.event.hint" },
];

const NAMED: EntityType[] = ["persona", "location", "organization", "artifact", "skill", "term"];
const PERSONA: EntityType[] = ["persona"];
const CHARACTER: EntityType[] = ["character"];
const LOCATION: EntityType[] = ["location"];
const ORGANIZATION: EntityType[] = ["organization"];
const ARTIFACT: EntityType[] = ["artifact"];
const SKILL: EntityType[] = ["skill"];
const EVENT: EntityType[] = ["event"];
const NONE: EntityType[] = [];

export const PREDICATES: PredicateDef[] = [
  { key: "alias", kind: "scalar", labelKey: "novel.knowledge.pred.alias", domain: NAMED, range: NONE, limit: false },
  { key: "gender", kind: "scalar", labelKey: "novel.knowledge.pred.gender", domain: PERSONA, range: NONE, limit: true },
  { key: "age", kind: "scalar", labelKey: "novel.knowledge.pred.age", domain: PERSONA, range: NONE, limit: true },
  { key: "appearance", kind: "scalar", labelKey: "novel.knowledge.pred.appearance", domain: PERSONA, range: NONE, limit: false },
  { key: "occupation", kind: "scalar", labelKey: "novel.knowledge.pred.occupation", domain: PERSONA, range: NONE, limit: false },
  { key: "vital_status", kind: "scalar", labelKey: "novel.knowledge.pred.vital_status", domain: PERSONA, range: NONE, limit: true },
  { key: "founded_at", kind: "scalar", labelKey: "novel.knowledge.pred.founded_at", domain: ORGANIZATION, range: NONE, limit: true },
  { key: "occurred_at", kind: "scalar", labelKey: "novel.knowledge.pred.occurred_at", domain: EVENT, range: NONE, limit: true },
  { key: "meaning", kind: "scalar", labelKey: "novel.knowledge.pred.meaning", domain: ["term", "skill", "artifact"], range: NONE, limit: true },
  { key: "persona_of", kind: "relationship", labelKey: "novel.knowledge.pred.persona_of", domain: PERSONA, range: CHARACTER, limit: false },
  { key: "kin_of", kind: "relationship", labelKey: "novel.knowledge.pred.kin_of", domain: PERSONA, range: PERSONA, limit: false },
  { key: "ally_of", kind: "relationship", labelKey: "novel.knowledge.pred.ally_of", domain: PERSONA, range: PERSONA, limit: false },
  { key: "enemy_of", kind: "relationship", labelKey: "novel.knowledge.pred.enemy_of", domain: PERSONA, range: PERSONA, limit: false },
  { key: "mentor_of", kind: "relationship", labelKey: "novel.knowledge.pred.mentor_of", domain: PERSONA, range: PERSONA, limit: false },
  { key: "member_of", kind: "relationship", labelKey: "novel.knowledge.pred.member_of", domain: PERSONA, range: ORGANIZATION, limit: false },
  { key: "leader_of", kind: "relationship", labelKey: "novel.knowledge.pred.leader_of", domain: PERSONA, range: ORGANIZATION, limit: true },
  { key: "resides_at", kind: "relationship", labelKey: "novel.knowledge.pred.resides_at", domain: PERSONA, range: LOCATION, limit: false },
  { key: "owns", kind: "relationship", labelKey: "novel.knowledge.pred.owns", domain: ["persona", "organization"], range: ARTIFACT, limit: false },
  { key: "has_skill", kind: "relationship", labelKey: "novel.knowledge.pred.has_skill", domain: PERSONA, range: SKILL, limit: false },
  { key: "participates_in", kind: "relationship", labelKey: "novel.knowledge.pred.participates_in", domain: ["persona", "organization"], range: EVENT, limit: false },
  { key: "occurs_at", kind: "relationship", labelKey: "novel.knowledge.pred.occurs_at", domain: EVENT, range: LOCATION, limit: false },
  { key: "located_in", kind: "relationship", labelKey: "novel.knowledge.pred.located_in", domain: ["location", "organization"], range: LOCATION, limit: false },
  { key: "created_by", kind: "relationship", labelKey: "novel.knowledge.pred.created_by", domain: ARTIFACT, range: PERSONA, limit: false },
];

export const RULES: RuleDef[] = [
  { id: "character_predicate", severity: "error", labelKey: "novel.knowledge.rule.character_predicate", descKey: "novel.knowledge.rule.character_predicate.desc" },
  { id: "persona_link", severity: "error", labelKey: "novel.knowledge.rule.persona_link", descKey: "novel.knowledge.rule.persona_link.desc" },
  { id: "relation_signature", severity: "error", labelKey: "novel.knowledge.rule.relation_signature", descKey: "novel.knowledge.rule.relation_signature.desc" },
  { id: "dangling_ref", severity: "error", labelKey: "novel.knowledge.rule.dangling_ref", descKey: "novel.knowledge.rule.dangling_ref.desc" },
  { id: "scalar_single", severity: "warning", labelKey: "novel.knowledge.rule.scalar_single", descKey: "novel.knowledge.rule.scalar_single.desc" },
  { id: "relation_unique", severity: "warning", labelKey: "novel.knowledge.rule.relation_unique", descKey: "novel.knowledge.rule.relation_unique.desc" },
  { id: "entity_duplicate", severity: "warning", labelKey: "novel.knowledge.rule.entity_duplicate", descKey: "novel.knowledge.rule.entity_duplicate.desc" },
  { id: "evidence", severity: "warning", labelKey: "novel.knowledge.rule.evidence", descKey: "novel.knowledge.rule.evidence.desc" },
  { id: "source_stale", severity: "warning", labelKey: "novel.knowledge.rule.source_stale", descKey: "novel.knowledge.rule.source_stale.desc" },
];

export const PERSONA_PREDICATE = "persona_of";
export const BATCH_SIZE = 5;

export function typeDef(type: string): EntityTypeDef | undefined {
  return ENTITY_TYPES.find((item) => item.key === type);
}

export function predicateDef(key: string): PredicateDef | undefined {
  return PREDICATES.find((item) => item.key === key);
}

export function ruleDef(id: RuleId): RuleDef {
  return RULES.find((item) => item.id === id) ?? RULES[0];
}

function list(values: string[]): string {
  return `[${values.join(", ")}]`;
}

function entityLines(): string[] {
  const out = ["# Entity types. A character is abstract: it only links to personas through persona_of.", "entity_types:"];
  for (const type of ENTITY_TYPES) {
    out.push(`  ${type.key}: { abstract: ${type.abstract} }`);
  }
  return out;
}

function predicateLines(kind: "scalar" | "relationship"): string[] {
  const out: string[] = [];
  for (const def of PREDICATES) {
    if (def.kind !== kind) {
      continue;
    }
    const range = kind === "relationship" ? `, range: ${list(def.range)}` : "";
    const limit = def.limit ? (kind === "scalar" ? ", single: true" : ", unique_range: true") : "";
    out.push(`  ${def.key}: { domain: ${list(def.domain)}${range}${limit} }`);
  }
  return out;
}

function ruleLines(): string[] {
  const out = ["# Conflict checks. They run in code, never in an LLM.", "rules:"];
  for (const rule of RULES) {
    out.push(`  ${rule.id}: { severity: ${rule.severity} }`);
  }
  return out;
}

export function ontologyYaml(): string {
  const lines = ["# ontology.yml: knowledge definition of the novel", "# Used for the analysis prompt and for the deterministic conflict checker.", "", `version: ${ONTOLOGY_VERSION}`, ""];
  lines.push(...entityLines(), "");
  lines.push("# Scalar predicates: entity -> literal. single: true means one value per entity.", "scalars:", ...predicateLines("scalar"), "");
  lines.push("# Relationship predicates: entity -> entity. Every predicate of a character is declared on its persona.", "relationships:", ...predicateLines("relationship"), "");
  lines.push(...ruleLines());
  return lines.join("\n");
}
