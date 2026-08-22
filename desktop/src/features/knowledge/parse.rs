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

const PERSONA: &str = "persona";
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
    pred: Option<String>,
    subject: Option<String>,
    object: Option<String>,
    ev: Option<Vec<Value>>,
}

struct Cleaner {
    count: usize,
    entities: Vec<AnalysisEntity>,
    ids: HashMap<String, usize>,
    facts: Vec<AnalysisFact>,
}

pub fn parse_reply(text: &str, paragraph_count: usize) -> Result<ChapterAnalysis, String> {
    let reply = read_reply(text)?;
    let mut cleaner = Cleaner {
        count: paragraph_count,
        entities: Vec::new(),
        ids: HashMap::new(),
        facts: Vec::new(),
    };
    for entity in reply.entities.unwrap_or_default() {
        cleaner.entity(entity);
    }
    for fact in reply.facts.unwrap_or_default() {
        cleaner.fact(fact);
    }
    Ok(ChapterAnalysis {
        ontology: Ontology::get().version,
        source_hash: String::new(),
        analyzed_at: String::new(),
        entities: cleaner.entities,
        facts: cleaner.facts,
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
        let Some(kind) = trimmed(raw.kind).filter(|kind| known_type(kind)) else {
            return;
        };
        let Some(name) = trimmed(raw.name) else {
            return;
        };
        let id = trimmed(raw.id).unwrap_or_default();
        if !id.is_empty() && self.ids.contains_key(&id) {
            return;
        }
        let mut entity = AnalysisEntity {
            id: String::new(),
            kind,
            name,
            titles: Vec::new(),
            aliases: Vec::new(),
            ev: evidence(raw.ev, self.count),
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
        let Some(def) = trimmed(raw.pred.clone()).and_then(|pred| predicate(&pred)) else {
            return;
        };
        let Some((subject, object)) = self.ends(def, &raw) else {
            return;
        };
        let subject = entity_id(subject);
        let object = object.map(entity_id);
        let ev = evidence(raw.ev, self.count);
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

    fn ends(&self, def: &PredicateDef, raw: &RawFact) -> Option<(usize, Option<usize>)> {
        let subject = self.resolve(raw.subject.as_deref())?;
        let object = raw
            .object
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty());
        match (def.kind, object) {
            (PredicateKind::Scalar, None) => Some((subject, None)),
            (PredicateKind::Relationship, Some(id)) => {
                let object = self.resolve(Some(id))?;
                (object != subject).then_some((subject, Some(object)))
            }
            _ => None,
        }
    }

    fn resolve(&self, id: Option<&str>) -> Option<usize> {
        self.ids.get(id?.trim()).copied()
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

fn evidence(values: Option<Vec<Value>>, count: usize) -> Vec<AnalysisEvidence> {
    let mut out = Vec::new();
    for value in values.unwrap_or_default() {
        let p = value
            .get("p")
            .and_then(Value::as_u64)
            .and_then(|p| usize::try_from(p).ok());
        let q = value.get("q").and_then(Value::as_str).map(str::trim);
        if let (Some(p), Some(q)) = (p, q)
            && (1..=count).contains(&p)
            && !q.is_empty()
        {
            let item = AnalysisEvidence {
                p,
                q: q.to_string(),
            };
            merge_evidence(&mut out, vec![item]);
        }
    }
    out
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
