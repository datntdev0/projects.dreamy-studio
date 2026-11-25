use crate::features::knowledge::models::KnowledgeEntity;
use crate::features::knowledge::models::KnowledgeFact;
use crate::features::knowledge::models::KnowledgeItem;
use crate::features::knowledge::ontology::Ontology;
use crate::features::knowledge::ontology::PredicateDef;
use crate::features::knowledge::ontology::PredicateKind;
use crate::features::knowledge::ontology::Severity;
use serde::Serialize;
use std::collections::HashMap;
use std::collections::HashSet;
use unicode_normalization::UnicodeNormalization;
use unicode_normalization::char::is_combining_mark;

const PERSONA_OF: &str = "persona_of";

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeIssue {
    pub id: String,
    pub rule: String,
    pub severity: Severity,
    pub ids: Vec<String>,
    pub message: String,
    pub values: Vec<String>,
}

struct RawIssue {
    ids: Vec<String>,
    key: String,
    message: String,
    values: Vec<String>,
}

impl RawIssue {
    fn new(ids: Vec<String>, key: String, message: String) -> Self {
        Self {
            ids,
            key,
            message,
            values: Vec::new(),
        }
    }
}

struct Context<'a> {
    ontology: &'a Ontology,
    items: &'a [KnowledgeItem],
    map: HashMap<&'a str, &'a KnowledgeItem>,
    entities: Vec<&'a KnowledgeEntity>,
    facts: Vec<&'a KnowledgeFact>,
}

impl<'a> Context<'a> {
    fn new(ontology: &'a Ontology, items: &'a [KnowledgeItem]) -> Self {
        let mut map = HashMap::new();
        let mut entities = Vec::new();
        let mut facts = Vec::new();
        for item in items {
            match item {
                KnowledgeItem::Entity(entity) => {
                    map.insert(entity.id.as_str(), item);
                    entities.push(entity);
                }
                KnowledgeItem::Fact(fact) => {
                    map.insert(fact.id.as_str(), item);
                    facts.push(fact);
                }
            }
        }
        Self {
            ontology,
            items,
            map,
            entities,
            facts,
        }
    }

    fn entity(&self, id: Option<&str>) -> Option<&'a KnowledgeEntity> {
        match self.map.get(id?) {
            Some(KnowledgeItem::Entity(entity)) => Some(entity),
            _ => None,
        }
    }

    fn name_of(&self, id: Option<&str>) -> String {
        match self.entity(id) {
            Some(entity) if entity.name.is_empty() => "—".to_string(),
            Some(entity) => entity.name.clone(),
            None => "?".to_string(),
        }
    }

    fn predicate(&self, pred: &str) -> Option<&'a PredicateDef> {
        self.ontology
            .predicates
            .iter()
            .find(|item| item.key == pred)
    }

    fn personas_of(&self, character_id: &str) -> Vec<&'a KnowledgeEntity> {
        let mut out = Vec::new();
        for fact in &self.facts {
            let persona = self.entity(Some(fact.subject.as_str()));
            if fact.pred == PERSONA_OF
                && fact.object.as_deref() == Some(character_id)
                && let Some(persona) = persona
            {
                out.push(persona);
            }
        }
        out
    }

    fn fact_text(&self, fact: &KnowledgeFact) -> String {
        let tail = match fact.object.as_deref() {
            None => format!(
                ": {}",
                fact.ev.first().map(|ev| ev.q.as_str()).unwrap_or("")
            ),
            Some(object) => format!(" -> {}", self.name_of(Some(object))),
        };
        format!(
            "{} - {}{}",
            self.name_of(Some(fact.subject.as_str())),
            fact.pred,
            tail
        )
    }

    fn item_text(&self, item: &KnowledgeItem) -> String {
        match item {
            KnowledgeItem::Entity(entity) => entity.name.clone(),
            KnowledgeItem::Fact(fact) => self.fact_text(fact),
        }
    }
}

pub fn check(ontology: &Ontology, items: &[KnowledgeItem]) -> Vec<KnowledgeIssue> {
    let ctx = Context::new(ontology, items);
    let mut out = Vec::new();
    for rule in &ontology.rules {
        let raws = match rule.key.as_str() {
            "character_predicate" => check_character_predicate(&ctx),
            "persona_link" => check_persona_link(&ctx),
            "relation_signature" => check_signature(&ctx),
            "dangling_ref" => check_dangling(&ctx),
            "relation_unique" => check_relation_unique(&ctx),
            "entity_duplicate" => check_duplicate(&ctx),
            "evidence" => check_evidence(&ctx),
            "source_stale" => check_stale(&ctx),
            _ => continue,
        };
        for raw in raws {
            out.push(KnowledgeIssue {
                id: format!("{}|{}|{}", rule.key, raw.key, raw.ids.join(",")),
                rule: rule.key.clone(),
                severity: rule.severity,
                ids: raw.ids,
                message: raw.message,
                values: raw.values,
            });
        }
    }
    out
}

fn check_character_predicate(ctx: &Context) -> Vec<RawIssue> {
    let mut out = Vec::new();
    for fact in &ctx.facts {
        let subject = ctx.entity(Some(fact.subject.as_str()));
        let object = ctx.entity(fact.object.as_deref());
        let character = match (subject, object) {
            (Some(entity), _) if entity.entity_type == "character" => entity,
            (_, Some(entity)) if entity.entity_type == "character" => entity,
            _ => continue,
        };
        if fact.pred == PERSONA_OF {
            continue;
        }
        let personas = ctx
            .personas_of(&character.id)
            .iter()
            .map(|persona| persona.id.clone())
            .collect();
        out.push(RawIssue {
            ids: vec![fact.id.clone()],
            key: fact.id.clone(),
            message: format!(
                "The fact \"{}\" is attached to the character \"{}\"; facts must be attached to a persona of the character instead.",
                fact.pred, character.name
            ),
            values: personas,
        });
    }
    out
}

fn check_persona_link(ctx: &Context) -> Vec<RawIssue> {
    let mut out = Vec::new();
    for persona in &ctx.entities {
        if persona.entity_type != "persona" {
            continue;
        }
        let mut links = Vec::new();
        for fact in &ctx.facts {
            let linked = ctx.entity(fact.object.as_deref());
            if fact.pred == PERSONA_OF
                && fact.subject == persona.id
                && linked.is_some_and(|entity| entity.entity_type == "character")
            {
                links.push(*fact);
            }
        }
        if links.is_empty() {
            out.push(RawIssue::new(
                vec![persona.id.clone()],
                format!("none|{}", persona.id),
                format!(
                    "The persona \"{}\" has no persona_of fact linking it to a character.",
                    persona.name
                ),
            ));
        }
        if links.len() > 1 {
            let names = links
                .iter()
                .map(|link| ctx.name_of(link.object.as_deref()))
                .collect::<Vec<_>>()
                .join(", ");
            let mut ids = vec![persona.id.clone()];
            ids.extend(links.iter().map(|link| link.id.clone()));
            out.push(RawIssue::new(
                ids,
                format!("many|{}", persona.id),
                format!(
                    "The persona \"{}\" is linked to several characters ({}); a persona must have exactly one persona_of fact.",
                    persona.name, names
                ),
            ));
        }
    }
    out
}

fn types_text(types: &[String]) -> String {
    types.join(" / ")
}

fn check_signature(ctx: &Context) -> Vec<RawIssue> {
    let mut out = Vec::new();
    for fact in &ctx.facts {
        let subject = ctx.entity(Some(fact.subject.as_str()));
        let object = ctx.entity(fact.object.as_deref());
        let Some(subject) = subject else {
            continue;
        };
        if fact.object.is_some() && object.is_none() {
            continue;
        }
        let Some(def) = ctx.predicate(&fact.pred) else {
            out.push(RawIssue::new(
                vec![fact.id.clone()],
                format!("unknown|{}|{}", fact.pred, fact.id),
                format!(
                    "The predicate \"{}\" is not defined in the ontology.",
                    fact.pred
                ),
            ));
            continue;
        };
        let involves_character = subject.entity_type == "character"
            || object.is_some_and(|entity| entity.entity_type == "character");
        if involves_character && fact.pred != PERSONA_OF {
            continue;
        }
        let relationship = def.kind == PredicateKind::Relationship;
        let bad_domain = !def.domain.contains(&subject.entity_type);
        let bad_range =
            relationship && !object.is_some_and(|entity| def.range.contains(&entity.entity_type));
        if bad_domain || bad_range {
            let object_type = object.map_or("", |entity| entity.entity_type.as_str());
            let (want, have) = if relationship {
                (
                    format!("{} -> {}", types_text(&def.domain), types_text(&def.range)),
                    format!(
                        "{} -> {}",
                        subject.entity_type,
                        if object.is_some() { object_type } else { "?" }
                    ),
                )
            } else {
                (types_text(&def.domain), subject.entity_type.clone())
            };
            out.push(RawIssue::new(
                vec![fact.id.clone()],
                format!("{}|{}|{}", fact.pred, subject.entity_type, object_type),
                format!(
                    "The predicate \"{}\" expects {} but the fact has {}.",
                    fact.pred, want, have
                ),
            ));
        }
    }
    out
}

fn check_dangling(ctx: &Context) -> Vec<RawIssue> {
    let mut out = Vec::new();
    for fact in &ctx.facts {
        let mut missing = Vec::new();
        if ctx.entity(Some(fact.subject.as_str())).is_none() {
            missing.push(format!("\"{}\"", fact.subject));
        }
        if let Some(object) = fact.object.as_deref()
            && ctx.entity(Some(object)).is_none()
        {
            missing.push(format!("\"{object}\""));
        }
        if !missing.is_empty() {
            out.push(RawIssue::new(
                vec![fact.id.clone()],
                fact.id.clone(),
                format!(
                    "The fact \"{}\" ({}) refers to missing entities: {}.",
                    fact.pred,
                    fact.id,
                    missing.join(", ")
                ),
            ));
        }
    }
    out
}

fn group_by_pred_object<'a>(facts: &[&'a KnowledgeFact]) -> Vec<(String, Vec<&'a KnowledgeFact>)> {
    let mut groups: Vec<(String, Vec<&'a KnowledgeFact>)> = Vec::new();
    let mut index: HashMap<String, usize> = HashMap::new();
    for fact in facts {
        let key = format!("{}|{}", fact.pred, fact.object.as_deref().unwrap_or("null"));
        match index.get(&key) {
            Some(position) => groups[*position].1.push(*fact),
            None => {
                index.insert(key.clone(), groups.len());
                groups.push((key, vec![*fact]));
            }
        }
    }
    groups
}

fn distinct(values: Vec<&str>) -> Vec<&str> {
    let mut seen = HashSet::new();
    let mut out = Vec::new();
    for value in values {
        if seen.insert(value) {
            out.push(value);
        }
    }
    out
}

fn limited(def: &PredicateDef) -> bool {
    match def.kind {
        PredicateKind::Scalar => def.single,
        PredicateKind::Relationship => def.unique_range,
    }
}

fn check_relation_unique(ctx: &Context) -> Vec<RawIssue> {
    let mut out = Vec::new();
    let mut relations = Vec::new();
    for fact in &ctx.facts {
        let Some(object) = fact.object.as_deref() else {
            continue;
        };
        let limit = ctx.predicate(&fact.pred).is_some_and(limited);
        if limit
            && ctx.entity(Some(fact.subject.as_str())).is_some()
            && ctx.entity(Some(object)).is_some()
        {
            relations.push(*fact);
        }
    }
    for (key, group) in group_by_pred_object(&relations) {
        let subjects = distinct(group.iter().map(|fact| fact.subject.as_str()).collect());
        if subjects.len() > 1 {
            let names = subjects
                .iter()
                .map(|id| ctx.name_of(Some(id)))
                .collect::<Vec<_>>()
                .join(", ");
            out.push(RawIssue::new(
                group.iter().map(|fact| fact.id.clone()).collect(),
                key,
                format!(
                    "{} all have \"{}\" with {}, but only one is allowed.",
                    names,
                    group[0].pred,
                    ctx.name_of(group[0].object.as_deref())
                ),
            ));
        }
    }
    out
}

fn tokens_of(name: &str) -> Vec<String> {
    let plain: String = name
        .nfd()
        .filter(|ch| !is_combining_mark(*ch))
        .map(|ch| match ch {
            'đ' => 'd',
            'Đ' => 'D',
            other => other,
        })
        .collect::<String>()
        .to_lowercase();
    plain
        .split(|ch: char| !ch.is_alphanumeric())
        .filter(|token| !token.is_empty())
        .map(str::to_string)
        .collect()
}

fn is_subset(a: &[String], b: &[String]) -> bool {
    let (small, big) = if a.len() <= b.len() { (a, b) } else { (b, a) };
    !small.is_empty() && small.iter().all(|token| big.contains(token))
}

fn check_duplicate(ctx: &Context) -> Vec<RawIssue> {
    let mut out = Vec::new();
    let tokens: Vec<Vec<String>> = ctx
        .entities
        .iter()
        .map(|entity| tokens_of(&entity.name))
        .collect();
    for i in 0..ctx.entities.len() {
        for j in (i + 1)..ctx.entities.len() {
            let a = ctx.entities[i];
            let b = ctx.entities[j];
            if a.entity_type == b.entity_type && is_subset(&tokens[i], &tokens[j]) {
                out.push(RawIssue::new(
                    vec![a.id.clone(), b.id.clone()],
                    format!("{},{}", a.id, b.id),
                    format!(
                        "The {} entities \"{}\" and \"{}\" look like duplicates.",
                        a.entity_type, a.name, b.name
                    ),
                ));
            }
        }
    }
    out
}

fn check_evidence(ctx: &Context) -> Vec<RawIssue> {
    let mut out = Vec::new();
    for item in ctx.items {
        let (id, ev) = match item {
            KnowledgeItem::Entity(entity) => (&entity.id, &entity.ev),
            KnowledgeItem::Fact(fact) => (&fact.id, &fact.ev),
        };
        let label = ctx.item_text(item);
        if ev.is_empty() {
            out.push(RawIssue::new(
                vec![id.clone()],
                format!("{id}|none"),
                format!("{label} has no evidence quote."),
            ));
        } else if ev.iter().any(|evidence| !evidence.verified) {
            out.push(RawIssue::new(
                vec![id.clone()],
                format!("{id}|quote"),
                format!("{label} has an evidence quote that is not found in the chapter text."),
            ));
        }
    }
    out
}

fn check_stale(ctx: &Context) -> Vec<RawIssue> {
    let mut out = Vec::new();
    for item in ctx.items {
        let (id, stale) = match item {
            KnowledgeItem::Entity(entity) => (&entity.id, &entity.stale),
            KnowledgeItem::Fact(fact) => (&fact.id, &fact.stale),
        };
        if !stale.is_empty() {
            let chapters = stale
                .iter()
                .map(i64::to_string)
                .collect::<Vec<_>>()
                .join(", ");
            out.push(RawIssue::new(
                vec![id.clone()],
                id.clone(),
                format!("The source of chapters {chapters} changed after this item was analyzed."),
            ));
        }
    }
    out
}
