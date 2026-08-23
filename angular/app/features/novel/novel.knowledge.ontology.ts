import { LanguageKey } from "@app/core/language/language.models";
import { EntityType, EntityTypeDef, OntologyPredicateView, OntologyTypeView, OntologyView, PredicateDef, RuleDef, RuleId } from "./novel.knowledge.models";

interface TypeStyle {
  icon: string;
  color: string;
}

export const PERSONA_PREDICATE = "persona_of";
export const BATCH_SIZE = 5;

const RULE_IDS: RuleId[] = ["character_predicate", "persona_link", "relation_signature", "dangling_ref", "relation_unique", "entity_duplicate", "evidence", "source_stale"];

const FALLBACK_STYLE: TypeStyle = { icon: "tag", color: "mute" };

const TYPE_STYLE: Record<string, TypeStyle> = {
  character: { icon: "user", color: "acc-twilight" },
  persona: { icon: "shirt", color: "primary" },
  location: { icon: "globe", color: "info" },
  organization: { icon: "users", color: "secondary" },
  artifact: { icon: "package", color: "warning" },
  skill: { icon: "spark", color: "success" },
  term: { icon: "tag", color: "acc-sunset" },
  event: { icon: "activity", color: "acc-breeze" },
};

function isRuleId(id: string): id is RuleId {
  return (RULE_IDS as string[]).includes(id);
}

function keyOf(prefix: string, key: string, suffix: string = ""): LanguageKey {
  return `${prefix}.${key}${suffix}` as LanguageKey;
}

function typeDefOf(view: OntologyTypeView): EntityTypeDef {
  const style = TYPE_STYLE[view.key] ?? FALLBACK_STYLE;
  return { key: view.key, icon: style.icon, color: style.color, abstract: view.abstract, properties: [...view.properties], labelKey: keyOf("novel.knowledge.type", view.key), hintKey: keyOf("novel.knowledge.type", view.key, ".hint") };
}

function predicateDefOf(view: OntologyPredicateView): PredicateDef {
  return { key: view.key, kind: view.kind, labelKey: keyOf("novel.knowledge.pred", view.key), domain: [...view.domain], range: [...view.range], limit: view.limit };
}

function ruleDefOf(id: RuleId, severity: RuleDef["severity"]): RuleDef {
  return { id, severity, labelKey: keyOf("novel.knowledge.rule", id), descKey: keyOf("novel.knowledge.rule", id, ".desc") };
}

export class Ontology {
  readonly version: number;
  readonly yaml: string;
  readonly types: readonly EntityTypeDef[];
  readonly predicates: readonly PredicateDef[];
  readonly rules: readonly RuleDef[];
  private readonly typeIndex: ReadonlyMap<EntityType, EntityTypeDef>;
  private readonly predicateIndex: ReadonlyMap<string, PredicateDef>;
  private readonly ruleIndex: ReadonlyMap<RuleId, RuleDef>;

  constructor(view: OntologyView) {
    this.version = view.version;
    this.yaml = view.yaml;
    this.types = Object.freeze(view.types.map(typeDefOf));
    this.predicates = Object.freeze(view.predicates.map(predicateDefOf));
    this.rules = Object.freeze(view.rules.filter((rule) => isRuleId(rule.id)).map((rule) => ruleDefOf(rule.id as RuleId, rule.severity)));
    this.typeIndex = new Map(this.types.map((item) => [item.key, item]));
    this.predicateIndex = new Map(this.predicates.map((item) => [item.key, item]));
    this.ruleIndex = new Map(this.rules.map((item) => [item.id, item]));
    Object.freeze(this);
  }

  get scalars(): PredicateDef[] {
    return this.predicates.filter((item) => item.kind === "scalar");
  }

  get relationships(): PredicateDef[] {
    return this.predicates.filter((item) => item.kind === "relationship");
  }

  typeDef(key: string): EntityTypeDef | undefined {
    return this.typeIndex.get(key);
  }

  predicateDef(key: string): PredicateDef | undefined {
    return this.predicateIndex.get(key);
  }

  ruleDef(id: RuleId): RuleDef {
    return this.ruleIndex.get(id) ?? ruleDefOf(id, "warning");
  }
}

export function buildOntology(view: OntologyView): Ontology {
  return new Ontology(view);
}

export const EMPTY_ONTOLOGY: Ontology = buildOntology({ version: 0, yaml: "", types: [], predicates: [], rules: [] });
