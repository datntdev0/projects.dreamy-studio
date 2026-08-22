use crate::features::knowledge::models::AnalysisEntity;
use crate::features::knowledge::models::AnalysisEvidence;
use crate::features::knowledge::models::AnalysisFact;
use crate::features::knowledge::models::ChapterAnalysis;
use crate::features::knowledge::ontology::Ontology;
use crate::features::knowledge::ontology::PredicateDef;
use crate::features::knowledge::ontology::PredicateKind;
use crate::features::knowledge::text::norm;
use serde::Deserialize;
use serde_json::Value;
use std::collections::HashMap;
use std::collections::HashSet;

const PERSONA: &str = "persona";
const CHARACTER: &str = "character";
const PERSONA_OF: &str = "persona_of";
const NOT_JSON: &str = "The model did not return a JSON result.";

#[derive(Deserialize)]
struct RawReply {
    entities: Option<Vec<RawEntity>>,
    facts: Option<Vec<RawFact>>,
}

#[derive(Deserialize)]
struct RawEntity {
    id: Option<String>,
    #[serde(rename = "type")]
    kind: Option<String>,
    name: Option<String>,
    titles: Option<Vec<Value>>,
    aliases: Option<Vec<Value>>,
    ev: Option<Vec<Value>>,
}

#[derive(Deserialize)]
struct RawFact {
    id: Option<String>,
    pred: Option<String>,
    subject: Option<String>,
    object: Option<String>,
    ev: Option<Vec<Value>>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Reading {
    pub analysis: ChapterAnalysis,
    pub issues: Vec<String>,
}

enum End {
    Found(usize),
    Absent,
    Skipped,
}

struct Cleaner {
    count: usize,
    entities: Vec<AnalysisEntity>,
    ids: HashMap<String, usize>,
    dropped: HashSet<String>,
    facts: Vec<AnalysisFact>,
    issues: Vec<String>,
}

pub fn parse_reply(text: &str, paragraph_count: usize) -> Result<Reading, String> {
    let reply = read_reply(text)?;
    let mut cleaner = Cleaner {
        count: paragraph_count,
        entities: Vec::new(),
        ids: HashMap::new(),
        dropped: HashSet::new(),
        facts: Vec::new(),
        issues: Vec::new(),
    };
    for entity in reply.entities.unwrap_or_default() {
        cleaner.entity(entity);
    }
    for fact in reply.facts.unwrap_or_default() {
        cleaner.fact(fact);
    }
    Ok(Reading {
        analysis: ChapterAnalysis {
            ontology: Ontology::get().version,
            source_hash: String::new(),
            analyzed_at: String::new(),
            entities: cleaner.entities,
            facts: cleaner.facts,
        },
        issues: cleaner.issues,
    })
}

fn read_reply(text: &str) -> Result<RawReply, String> {
    let (Some(start), Some(end)) = (text.find('{'), text.rfind('}')) else {
        return Err(NOT_JSON.to_string());
    };
    if end < start {
        return Err(NOT_JSON.to_string());
    }
    let reply: RawReply = serde_json::from_str(&text[start..=end])
        .map_err(|error| format!("The model returned an unreadable result: {error}"))?;
    if reply.entities.is_none() && reply.facts.is_none() {
        return Err("The model returned neither entities nor facts.".to_string());
    }
    Ok(reply)
}

impl Cleaner {
    fn entity(&mut self, raw: RawEntity) {
        let id = trimmed(raw.id).unwrap_or_default();
        let name = trimmed(raw.name);
        let label = entity_label(&id, name.as_deref());
        let kind = trimmed(raw.kind);
        if !kind.as_deref().is_some_and(known_type) {
            let found = kind.map_or("type is missing".to_string(), |kind| {
                format!("type \"{kind}\" is not in the ontology")
            });
            self.issues
                .push(format!("{label}: {found}; use one of: {}", type_keys()));
            self.drop_id(id);
            return;
        }
        let (Some(kind), Some(name)) = (kind, name) else {
            self.issues.push(format!("{label}: name is missing"));
            self.drop_id(id);
            return;
        };
        if !id.is_empty() && self.ids.contains_key(&id) {
            self.issues.push(format!(
                "{label}: the id {id} is already used by another entity"
            ));
            return;
        }
        let mut entity = AnalysisEntity {
            id: String::new(),
            kind,
            name,
            titles: Vec::new(),
            aliases: Vec::new(),
            ev: self.evidence(raw.ev, &label),
        };
        if entity.kind == PERSONA {
            merge_names(&mut entity.titles, strings(raw.titles));
            merge_names(&mut entity.aliases, strings(raw.aliases));
        }
        let index = self.place(entity);
        if !id.is_empty() {
            self.ids.insert(id, index);
        }
    }

    fn drop_id(&mut self, id: String) {
        if !id.is_empty() {
            self.dropped.insert(id);
        }
    }

    fn place(&mut self, entity: AnalysisEntity) -> usize {
        let key = norm(&entity.name);
        let found = self
            .entities
            .iter()
            .position(|item| item.kind == entity.kind && norm(&item.name) == key);
        match found {
            Some(index) => {
                let target = &mut self.entities[index];
                merge_names(&mut target.titles, entity.titles);
                merge_names(&mut target.aliases, entity.aliases);
                merge_evidence(&mut target.ev, entity.ev);
                index
            }
            None => {
                let index = self.entities.len();
                self.entities.push(AnalysisEntity {
                    id: entity_id(index),
                    ..entity
                });
                index
            }
        }
    }

    fn fact(&mut self, raw: RawFact) {
        let pred = trimmed(raw.pred.clone()).unwrap_or_default();
        let label = fact_label(trimmed(raw.id.clone()).as_deref(), &pred);
        let Some(def) = predicate(&pred) else {
            let found = if pred.is_empty() {
                "predicate is missing".to_string()
            } else {
                format!("predicate \"{pred}\" is not in the ontology")
            };
            self.issues.push(format!(
                "{label}: {found}; use one of: {}",
                predicate_keys()
            ));
            return;
        };
        let Some((subject, object)) = self.ends(def, &raw, &label) else {
            return;
        };
        let subject = entity_id(subject);
        let object = object.map(entity_id);
        let ev = self.evidence(raw.ev, &label);
        let found = self
            .facts
            .iter_mut()
            .find(|fact| fact.pred == def.key && fact.subject == subject && fact.object == object);
        match found {
            Some(fact) => merge_evidence(&mut fact.ev, ev),
            None => {
                let id = format!("F{}", self.facts.len() + 1);
                self.facts.push(AnalysisFact {
                    id,
                    pred: def.key.clone(),
                    subject,
                    object,
                    ev,
                });
            }
        }
    }

    fn ends(
        &mut self,
        def: &PredicateDef,
        raw: &RawFact,
        label: &str,
    ) -> Option<(usize, Option<usize>)> {
        let subject = self.end("subject", raw.subject.as_deref(), label);
        let object = raw
            .object
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty());
        let object = match (def.kind, object) {
            (PredicateKind::Scalar, None) => End::Absent,
            (PredicateKind::Scalar, Some(_)) => {
                self.issues.push(format!(
                    "{label}: {} is a scalar predicate and must not have an object; put the quote in ev",
                    def.key
                ));
                End::Skipped
            }
            (PredicateKind::Relationship, None) => {
                self.issues
                    .push(format!("{label}: {} needs an object", def.key));
                End::Skipped
            }
            (PredicateKind::Relationship, Some(id)) => self.end("object", Some(id), label),
        };
        let End::Found(subject) = subject else {
            return None;
        };
        let object = match object {
            End::Found(index) => Some(index),
            End::Absent => None,
            End::Skipped => return None,
        };
        if object == Some(subject) {
            self.issues.push(format!(
                "{label}: the subject and the object are the same entity"
            ));
            return None;
        }
        self.signature(def, subject, object, label)
            .then_some((subject, object))
    }

    fn end(&mut self, role: &str, id: Option<&str>, label: &str) -> End {
        let id = id.map(str::trim).filter(|value| !value.is_empty());
        let Some(id) = id else {
            self.issues.push(format!("{label}: the {role} is missing"));
            return End::Skipped;
        };
        match self.ids.get(id) {
            Some(index) => End::Found(*index),
            None if self.dropped.contains(id) => End::Skipped,
            None => {
                self.issues.push(format!(
                    "{label}: the {role} \"{id}\" is not an entity id in this reply"
                ));
                End::Skipped
            }
        }
    }

    fn signature(
        &mut self,
        def: &PredicateDef,
        subject: usize,
        object: Option<usize>,
        label: &str,
    ) -> bool {
        let mut valid = true;
        let from = &self.entities[subject];
        if !def.domain.contains(&from.kind) {
            let message = if from.kind == CHARACTER && def.key != PERSONA_OF {
                format!(
                    "{label}: {} cannot be attached to the character {}; a character only takes persona_of, so attach the fact to a persona",
                    def.key, from.name
                )
            } else {
                format!(
                    "{label}: {} needs a subject of type {}, but {} is a {}",
                    def.key,
                    def.domain.join(" or "),
                    from.name,
                    from.kind
                )
            };
            self.issues.push(message);
            valid = false;
        }
        if let Some(object) = object {
            let to = &self.entities[object];
            if !def.range.contains(&to.kind) {
                self.issues.push(format!(
                    "{label}: {} needs an object of type {}, but {} is a {}",
                    def.key,
                    def.range.join(" or "),
                    to.name,
                    to.kind
                ));
                valid = false;
            }
        }
        valid
    }

    fn evidence(&mut self, values: Option<Vec<Value>>, label: &str) -> Vec<AnalysisEvidence> {
        let mut out = Vec::new();
        for (index, value) in values.unwrap_or_default().into_iter().enumerate() {
            match read_evidence(&value, self.count) {
                Ok(item) => merge_evidence(&mut out, vec![item]),
                Err(problem) => self
                    .issues
                    .push(format!("{label}: evidence item {}: {problem}", index + 1)),
            }
        }
        out
    }
}

fn entity_id(index: usize) -> String {
    format!("E{}", index + 1)
}

fn trimmed(value: Option<String>) -> Option<String> {
    value
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn known_type(kind: &str) -> bool {
    Ontology::get().types.iter().any(|item| item.key == kind)
}

fn type_keys() -> String {
    let keys: Vec<&str> = Ontology::get()
        .types
        .iter()
        .map(|item| item.key.as_str())
        .collect();
    keys.join(", ")
}

fn predicate_keys() -> String {
    let keys: Vec<&str> = Ontology::get()
        .predicates
        .iter()
        .map(|item| item.key.as_str())
        .collect();
    keys.join(", ")
}

fn entity_label(id: &str, name: Option<&str>) -> String {
    match (id.is_empty(), name) {
        (false, _) => format!("entity {id}"),
        (true, Some(name)) => format!("entity \"{name}\""),
        (true, None) => "an entity without id or name".to_string(),
    }
}

fn fact_label(id: Option<&str>, pred: &str) -> String {
    match id {
        Some(id) => format!("fact {id}"),
        None if pred.is_empty() => "a fact without id or predicate".to_string(),
        None => format!("a {pred} fact without id"),
    }
}

fn predicate(pred: &str) -> Option<&'static PredicateDef> {
    Ontology::get()
        .predicates
        .iter()
        .find(|item| item.key == pred)
}

fn strings(values: Option<Vec<Value>>) -> Vec<String> {
    values
        .unwrap_or_default()
        .iter()
        .filter_map(|value| value.as_str().map(String::from))
        .collect()
}

fn merge_names(target: &mut Vec<String>, extra: Vec<String>) {
    for value in extra {
        let value = value.trim();
        let key = norm(value);
        if !key.is_empty() && !target.iter().any(|item| norm(item) == key) {
            target.push(value.to_string());
        }
    }
}

fn read_evidence(value: &Value, count: usize) -> Result<AnalysisEvidence, String> {
    let p = value
        .get("p")
        .and_then(Value::as_u64)
        .and_then(|p| usize::try_from(p).ok());
    let q = value.get("q").and_then(Value::as_str).map(str::trim);
    let (Some(p), Some(q)) = (p, q) else {
        return Err("must look like {\"p\": paragraph number, \"q\": quote}".to_string());
    };
    if q.is_empty() {
        return Err("the quote is empty".to_string());
    }
    if !(1..=count).contains(&p) {
        return Err(format!(
            "paragraph {p} does not exist; the chapter has paragraphs 1 to {count}"
        ));
    }
    Ok(AnalysisEvidence {
        p,
        q: q.to_string(),
    })
}

fn merge_evidence(target: &mut Vec<AnalysisEvidence>, extra: Vec<AnalysisEvidence>) {
    for item in extra {
        let key = norm(&item.q);
        if !target
            .iter()
            .any(|known| known.p == item.p && norm(&known.q) == key)
        {
            target.push(item);
        }
    }
}

#[cfg(test)]
#[path = "../../../test/features/knowledge/parse.test.rs"]
mod tests;
