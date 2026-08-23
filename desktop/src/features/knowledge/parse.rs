use crate::features::knowledge::models::AnalysisEntity;
use crate::features::knowledge::models::AnalysisEvidence;
use crate::features::knowledge::models::AnalysisFact;
use crate::features::knowledge::models::ChapterDraft;
use crate::features::knowledge::ontology::Ontology;
use crate::features::knowledge::ontology::PredicateDef;
use crate::features::knowledge::ontology::PredicateKind;
use crate::features::knowledge::text::contains;
use crate::features::knowledge::text::locate;
use crate::features::knowledge::text::norm;
use serde::Deserialize;
use serde::de::DeserializeOwned;
use serde_json::Value;
use std::collections::HashMap;

const PERSONA: &str = "persona";
const CHARACTER: &str = "character";
const PERSONA_OF: &str = "persona_of";
const NOT_JSON: &str = "The model did not return a JSON result.";

#[derive(Deserialize)]
struct RawCandidates {
    entities: Option<Vec<RawCandidate>>,
}

#[derive(Deserialize)]
struct RawCandidate {
    #[serde(rename = "type")]
    kind: Option<String>,
    name: Option<String>,
    titles: Option<Vec<Value>>,
    aliases: Option<Vec<Value>>,
    character: Option<String>,
}

#[derive(Deserialize)]
struct RawFacts {
    facts: Option<Vec<RawFact>>,
}

#[derive(Deserialize)]
struct RawFact {
    id: Option<String>,
    pred: Option<String>,
    subject: Option<String>,
    object: Option<String>,
    ev: Option<Vec<Value>>,
}

struct Candidate {
    kind: String,
    name: String,
    titles: Vec<String>,
    aliases: Vec<String>,
    character: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CandidateReading {
    pub chapters: Vec<ChapterDraft>,
    pub issues: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FactReading {
    pub facts: Vec<AnalysisFact>,
    pub issues: Vec<String>,
}

enum End {
    Found(usize),
    Absent,
    Skipped,
}

struct FactCleaner<'a> {
    entities: &'a [AnalysisEntity],
    paragraphs: &'a [String],
    ids: HashMap<&'a str, usize>,
    facts: Vec<AnalysisFact>,
    issues: Vec<String>,
}

pub fn parse_candidates(text: &str, chapters: &[Vec<String>]) -> Result<CandidateReading, String> {
    let reply: RawCandidates = read_json(text)?;
    let raw = reply
        .entities
        .ok_or_else(|| "The model returned no entities.".to_string())?;
    let mut issues = Vec::new();
    let mut unique: Vec<Candidate> = Vec::new();
    for item in raw {
        if let Some(candidate) = candidate(item, &mut issues) {
            fold(&mut unique, candidate);
        }
    }
    same_spelling(&mut unique);
    let mut placed: Vec<Vec<Placed>> = vec![Vec::new(); chapters.len()];
    for candidate in unique {
        let names = names_of(&candidate);
        let mut found = false;
        for (index, paragraphs) in chapters.iter().enumerate() {
            let ev = found_in(paragraphs, &names);
            if ev.is_empty() {
                continue;
            }
            found = true;
            placed[index].push(Placed {
                entity: AnalysisEntity {
                    id: String::new(),
                    kind: candidate.kind.clone(),
                    name: candidate.name.clone(),
                    titles: candidate.titles.clone(),
                    aliases: candidate.aliases.clone(),
                    ev,
                },
                character: candidate.character.clone(),
            });
        }
        if !found {
            issues.push(format!(
                "entity \"{}\" ({}): neither the name nor the aliases appear in the chapter text",
                candidate.name, candidate.kind
            ));
        }
    }
    Ok(CandidateReading {
        chapters: placed.into_iter().map(draft_of).collect(),
        issues,
    })
}

#[derive(Clone)]
struct Placed {
    entity: AnalysisEntity,
    character: Option<String>,
}

fn draft_of(placed: Vec<Placed>) -> ChapterDraft {
    let mut entities: Vec<AnalysisEntity> = placed.iter().map(|item| item.entity.clone()).collect();
    let mut links: Vec<(usize, usize)> = Vec::new();
    for (persona, item) in placed.iter().enumerate() {
        let Some(name) = &item.character else {
            continue;
        };
        let key = norm(name);
        let position = entities
            .iter()
            .position(|entity| entity.kind == CHARACTER && norm(&entity.name) == key);
        let character = match position {
            Some(position) => position,
            None => {
                entities.push(AnalysisEntity {
                    id: String::new(),
                    kind: CHARACTER.to_string(),
                    name: name.clone(),
                    titles: Vec::new(),
                    aliases: Vec::new(),
                    ev: Vec::new(),
                });
                entities.len() - 1
            }
        };
        let ev = item.entity.ev.clone();
        merge_evidence(&mut entities[character].ev, ev);
        links.push((persona, character));
    }
    for (index, entity) in entities.iter_mut().enumerate() {
        entity.id = entity_id(index);
    }
    let facts = links
        .into_iter()
        .enumerate()
        .map(|(index, (persona, character))| AnalysisFact {
            id: format!("F{}", index + 1),
            pred: PERSONA_OF.to_string(),
            subject: entities[persona].id.clone(),
            object: Some(entities[character].id.clone()),
            ev: entities[persona].ev.clone(),
        })
        .collect();
    ChapterDraft { entities, facts }
}

pub fn parse_facts(
    text: &str,
    entities: &[AnalysisEntity],
    paragraphs: &[String],
) -> Result<FactReading, String> {
    let reply: RawFacts = read_json(text)?;
    let raw = reply
        .facts
        .ok_or_else(|| "The model returned no facts.".to_string())?;
    let mut cleaner = FactCleaner {
        entities,
        paragraphs,
        ids: entities
            .iter()
            .enumerate()
            .map(|(index, entity)| (entity.id.as_str(), index))
            .collect(),
        facts: Vec::new(),
        issues: Vec::new(),
    };
    for fact in raw {
        cleaner.fact(fact);
    }
    Ok(FactReading {
        facts: cleaner.facts,
        issues: cleaner.issues,
    })
}

fn read_json<T: DeserializeOwned>(text: &str) -> Result<T, String> {
    let (Some(start), Some(end)) = (text.find('{'), text.rfind('}')) else {
        return Err(NOT_JSON.to_string());
    };
    if end < start {
        return Err(NOT_JSON.to_string());
    }
    serde_json::from_str(&text[start..=end])
        .map_err(|error| format!("The model returned an unreadable result: {error}"))
}

fn candidate(raw: RawCandidate, issues: &mut Vec<String>) -> Option<Candidate> {
    let name = trimmed(raw.name);
    let kind = trimmed(raw.kind);
    let label = match &name {
        Some(name) => format!("entity \"{name}\""),
        None => "an entity without a name".to_string(),
    };
    if kind.as_deref() == Some(CHARACTER) {
        issues.push(format!(
            "{label}: a character is not listed as an entity; set the character property of the persona instead"
        ));
        return None;
    }
    let known = kind.as_deref().is_some_and(known_type);
    if !known {
        let found = kind.map_or("type is missing".to_string(), |kind| {
            format!("type \"{kind}\" is not in the ontology")
        });
        issues.push(format!("{label}: {found}; use one of: {}", type_keys()));
        return None;
    }
    let (Some(kind), Some(name)) = (kind, name) else {
        issues.push(format!("{label}: the name is missing"));
        return None;
    };
    let mut candidate = Candidate {
        kind,
        name,
        titles: Vec::new(),
        aliases: Vec::new(),
        character: None,
    };
    if candidate.kind == PERSONA {
        merge_names(&mut candidate.titles, strings(raw.titles));
        merge_names(&mut candidate.aliases, strings(raw.aliases));
        candidate
            .aliases
            .retain(|alias| norm(alias) != norm(&candidate.name));
        candidate.character = trimmed(raw.character);
    }
    Some(candidate)
}

fn fold(unique: &mut Vec<Candidate>, candidate: Candidate) {
    let key = norm(&candidate.name);
    match unique
        .iter_mut()
        .find(|item| item.kind == candidate.kind && norm(&item.name) == key)
    {
        Some(target) => {
            merge_names(&mut target.titles, candidate.titles);
            merge_names(&mut target.aliases, candidate.aliases);
            if target.character.is_none() {
                target.character = candidate.character;
            }
        }
        None => unique.push(candidate),
    }
}

fn same_spelling(unique: &mut [Candidate]) {
    let mut seen: Vec<String> = Vec::new();
    for candidate in unique {
        let Some(character) = candidate.character.as_mut() else {
            continue;
        };
        match seen.iter().find(|item| norm(item) == norm(character)) {
            Some(first) => *character = first.clone(),
            None => seen.push(character.clone()),
        }
    }
}

fn names_of(candidate: &Candidate) -> Vec<String> {
    let mut names = vec![candidate.name.clone()];
    merge_names(&mut names, candidate.aliases.clone());
    names
}

fn found_in(paragraphs: &[String], names: &[String]) -> Vec<AnalysisEvidence> {
    let mut ev = Vec::new();
    for name in names {
        if let Some(p) = (1..=paragraphs.len()).find(|p| contains(paragraphs, *p, name)) {
            merge_evidence(&mut ev, vec![AnalysisEvidence { p, q: name.clone() }]);
        }
    }
    ev
}

impl FactCleaner<'_> {
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
        if def.key == PERSONA_OF {
            self.issues.push(format!(
                "{label}: persona_of is not listed in facts; it comes from the character of the persona"
            ));
            return;
        }
        let Some((subject, object)) = self.ends(def, &raw, &label) else {
            return;
        };
        let subject = self.entities[subject].id.clone();
        let object = object.map(|index| self.entities[index].id.clone());
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
            None => {
                self.issues.push(format!(
                    "{label}: the {role} \"{id}\" is not in the entity list"
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
            match read_evidence(&value, self.paragraphs) {
                Ok(item) => merge_evidence(&mut out, vec![item]),
                Err(problem) => self
                    .issues
                    .push(format!("{label}: evidence item {}: {problem}", index + 1)),
            }
        }
        out
    }
}

fn read_evidence(value: &Value, paragraphs: &[String]) -> Result<AnalysisEvidence, String> {
    let hint = value
        .get("p")
        .and_then(Value::as_u64)
        .and_then(|p| usize::try_from(p).ok())
        .unwrap_or(0);
    let Some(q) = value.get("q").and_then(Value::as_str).map(str::trim) else {
        return Err("must look like {\"p\": paragraph number, \"q\": quote}".to_string());
    };
    if q.is_empty() {
        return Err("the quote is empty".to_string());
    }
    match locate(paragraphs, hint, q) {
        Some(p) => Ok(AnalysisEvidence {
            p,
            q: q.to_string(),
        }),
        None => Err("the quote is not in the chapter text; copy it verbatim".to_string()),
    }
}

pub fn entity_id(index: usize) -> String {
    format!("E{}", index + 1)
}

fn trimmed(value: Option<String>) -> Option<String> {
    value
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn known_type(kind: &str) -> bool {
    Ontology::get()
        .types
        .iter()
        .any(|item| item.key == kind && !item.abstract_)
}

fn type_keys() -> String {
    let keys: Vec<&str> = Ontology::get()
        .types
        .iter()
        .filter(|item| !item.abstract_)
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
