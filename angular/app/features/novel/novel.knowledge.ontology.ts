import { EntityType, EntityTypeDef, PredicateDef, RuleDef, RuleId } from "./novel.knowledge.models";
import { ONTOLOGY_VERSION, ONTOLOGY_YAML, PREDICATE_DATA, RULE_DATA, TYPE_DATA } from "./novel.knowledge.ontology.data";

export { ONTOLOGY_VERSION };

const TYPE_STYLE: Record<EntityType, { icon: string; color: string }> = {
  character: { icon: "user", color: "primary" },
  persona: { icon: "shirt", color: "acc-twilight" },
  location: { icon: "globe", color: "info" },
  organization: { icon: "users", color: "secondary" },
  artifact: { icon: "package", color: "warning" },
  skill: { icon: "spark", color: "success" },
  term: { icon: "tag", color: "acc-sunset" },
  event: { icon: "activity", color: "acc-breeze" },
};

export const ENTITY_TYPES: EntityTypeDef[] = TYPE_DATA.map((data) => ({ ...data, ...TYPE_STYLE[data.key] }));

export const PREDICATES: PredicateDef[] = PREDICATE_DATA;

export const RULES: RuleDef[] = RULE_DATA;

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

export function ontologyYaml(): string {
  return ONTOLOGY_YAML;
}
