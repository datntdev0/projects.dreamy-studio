use crate::features::knowledge::models::AnalysisEntity;
use crate::features::knowledge::models::AnalysisEvidence;
use crate::features::knowledge::models::AnalysisFact;
use crate::features::knowledge::models::AnalyzedChapter;
use crate::features::knowledge::models::ChapterAnalysis;
use crate::features::knowledge::models::KnowledgeEntity;
use crate::features::knowledge::models::KnowledgeEvidence;
use crate::features::knowledge::models::KnowledgeFact;
use crate::features::knowledge::models::KnowledgeItem;
use crate::features::knowledge::models::KnowledgeLang;
use crate::features::knowledge::models::WireKnowledge;
use crate::features::knowledge::ontology::Ontology;
use crate::features::knowledge::text::contains;
use crate::features::knowledge::text::norm;
use crate::features::knowledge::text::text_hash;
use sha2::Digest;
use sha2::Sha256;
use std::collections::BTreeMap;
use std::collections::BTreeSet;
use std::collections::HashMap;
use std::collections::HashSet;

#[derive(Debug, Clone)]
pub struct LoadedChapter {
    pub seq: i64,
    pub id: String,
    pub file: ChapterAnalysis,
    pub text: Option<Vec<String>>,
    pub dirty: bool,
}

pub fn entity_id(entity_type: &str, name: &str) -> String {
    format!("E{}", short_hash(&[entity_type, &norm(name)]))
}

pub fn fact_id(pred: &str, subject: &str, object: Option<&str>) -> String {
    format!("F{}", short_hash(&[pred, subject, object.unwrap_or("")]))
}

pub fn merge(lang: KnowledgeLang, chapters: &[LoadedChapter]) -> WireKnowledge {
    let mut merger = Merger::default();
    for chapter in chapters {
        merger.add_chapter(chapter);
    }
    WireKnowledge {
        lang: lang.as_str().to_string(),
        ontology: Ontology::get().view(),
        items: merger.into_items(),
        analyzed: analyzed(chapters),
    }
}

pub fn is_stale(chapter: &LoadedChapter) -> bool {
    match &chapter.text {
        Some(text) => text_hash(text) != chapter.file.source_hash,
        None => true,
    }
}

fn short_hash(parts: &[&str]) -> String {
    Sha256::digest(parts.join("\0").as_bytes())
        .iter()
        .take(6)
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

fn analyzed(chapters: &[LoadedChapter]) -> BTreeMap<i64, AnalyzedChapter> {
    chapters
        .iter()
        .map(|chapter| {
            let summary = AnalyzedChapter {
                at: chapter.file.analyzed_at.clone(),
                entities: chapter.file.entities.len(),
                facts: chapter.file.facts.len(),
                stale: is_stale(chapter),
            };
            (chapter.seq, summary)
        })
        .collect()
}

fn is_verified(chapter: &LoadedChapter, evidence: &AnalysisEvidence) -> bool {
    chapter
        .text
        .as_deref()
        .is_some_and(|text| contains(text, evidence.p, &evidence.q))
}

fn resolve_fact(
    fact: &AnalysisFact,
    ids: &HashMap<String, String>,
) -> Option<(String, Option<String>)> {
    let subject = ids.get(&fact.subject)?.clone();
    let object = match &fact.object {
        Some(local) => Some(ids.get(local)?.clone()),
        None => None,
    };
    if object.as_deref() == Some(subject.as_str()) {
        return None;
    }
    Some((subject, object))
}

#[derive(Default)]
struct Merger {
    entities: Index<EntityAcc>,
    facts: Index<FactAcc>,
}

impl Merger {
    fn add_chapter(&mut self, chapter: &LoadedChapter) {
        let stale = is_stale(chapter);
        let ids = self.add_entities(chapter, stale);
        self.add_facts(chapter, stale, &ids);
    }

    fn add_entities(&mut self, chapter: &LoadedChapter, stale: bool) -> HashMap<String, String> {
        let mut ids = HashMap::new();
        for entity in &chapter.file.entities {
            let id = entity_id(&entity.kind, &entity.name);
            self.entities
                .entry(&id, || EntityAcc::new(&id, &entity.kind))
                .add(chapter, entity, stale);
            ids.insert(entity.id.clone(), id);
        }
        ids
    }

    fn add_facts(&mut self, chapter: &LoadedChapter, stale: bool, ids: &HashMap<String, String>) {
        for fact in &chapter.file.facts {
            let Some((subject, object)) = resolve_fact(fact, ids) else {
                continue;
            };
            let id = fact_id(&fact.pred, &subject, object.as_deref());
            self.facts
                .entry(&id, || FactAcc::new(&id, &fact.pred, subject, object))
                .add(chapter, fact, stale);
        }
    }

    fn into_items(self) -> Vec<KnowledgeItem> {
        let entities = self
            .entities
            .items
            .into_iter()
            .map(|entity| KnowledgeItem::Entity(entity.finish()));
        let facts = self
            .facts
            .items
            .into_iter()
            .map(|fact| KnowledgeItem::Fact(fact.finish()));
        entities.chain(facts).collect()
    }
}

struct Index<T> {
    items: Vec<T>,
    lookup: HashMap<String, usize>,
}

impl<T> Default for Index<T> {
    fn default() -> Self {
        Self {
            items: Vec::new(),
            lookup: HashMap::new(),
        }
    }
}

impl<T> Index<T> {
    fn entry(&mut self, id: &str, create: impl FnOnce() -> T) -> &mut T {
        let position = match self.lookup.get(id) {
            Some(position) => *position,
            None => {
                self.items.push(create());
                self.lookup.insert(id.to_string(), self.items.len() - 1);
                self.items.len() - 1
            }
        };
        &mut self.items[position]
    }
}

struct EntityAcc {
    id: String,
    entity_type: String,
    names: NameTally,
    titles: NameList,
    aliases: NameList,
    ev: EvidenceSet,
    stale: BTreeSet<i64>,
}

impl EntityAcc {
    fn new(id: &str, entity_type: &str) -> Self {
        Self {
            id: id.to_string(),
            entity_type: entity_type.to_string(),
            names: NameTally::default(),
            titles: NameList::default(),
            aliases: NameList::default(),
            ev: EvidenceSet::default(),
            stale: BTreeSet::new(),
        }
    }

    fn add(&mut self, chapter: &LoadedChapter, entity: &AnalysisEntity, stale: bool) {
        self.names.add(&entity.name, chapter.seq);
        self.titles.extend(&entity.titles);
        self.aliases.extend(&entity.aliases);
        self.ev.extend(chapter, &entity.ev);
        if stale {
            self.stale.insert(chapter.seq);
        }
    }

    fn finish(self) -> KnowledgeEntity {
        KnowledgeEntity {
            id: self.id,
            entity_type: self.entity_type,
            name: self.names.best(),
            titles: self.titles.values,
            aliases: self.aliases.values,
            ev: self.ev.finish(),
            stale: self.stale.into_iter().collect(),
        }
    }
}

struct FactAcc {
    id: String,
    pred: String,
    subject: String,
    object: Option<String>,
    ev: EvidenceSet,
    stale: BTreeSet<i64>,
}

impl FactAcc {
    fn new(id: &str, pred: &str, subject: String, object: Option<String>) -> Self {
        Self {
            id: id.to_string(),
            pred: pred.to_string(),
            subject,
            object,
            ev: EvidenceSet::default(),
            stale: BTreeSet::new(),
        }
    }

    fn add(&mut self, chapter: &LoadedChapter, fact: &AnalysisFact, stale: bool) {
        self.ev.extend(chapter, &fact.ev);
        if stale {
            self.stale.insert(chapter.seq);
        }
    }

    fn finish(self) -> KnowledgeFact {
        KnowledgeFact {
            id: self.id,
            pred: self.pred,
            subject: self.subject,
            object: self.object,
            ev: self.ev.finish(),
            stale: self.stale.into_iter().collect(),
        }
    }
}

struct Spelling {
    value: String,
    count: usize,
    last_seq: i64,
}

#[derive(Default)]
struct NameTally {
    spellings: Vec<Spelling>,
}

impl NameTally {
    fn add(&mut self, name: &str, seq: i64) {
        match self.spellings.iter_mut().find(|item| item.value == name) {
            Some(item) if item.last_seq != seq => {
                item.count += 1;
                item.last_seq = seq;
            }
            Some(_) => {}
            None => self.spellings.push(Spelling {
                value: name.to_string(),
                count: 1,
                last_seq: seq,
            }),
        }
    }

    fn best(&self) -> String {
        let mut best: Option<&Spelling> = None;
        for item in &self.spellings {
            if best.is_none_or(|current| item.count > current.count) {
                best = Some(item);
            }
        }
        best.map(|item| item.value.clone()).unwrap_or_default()
    }
}

#[derive(Default)]
struct NameList {
    values: Vec<String>,
    seen: HashSet<String>,
}

impl NameList {
    fn extend(&mut self, values: &[String]) {
        for value in values {
            let key = norm(value);
            if !key.is_empty() && self.seen.insert(key) {
                self.values.push(value.clone());
            }
        }
    }
}

#[derive(Default)]
struct EvidenceSet {
    items: Vec<KnowledgeEvidence>,
    seen: HashSet<(i64, usize, String)>,
}

impl EvidenceSet {
    fn extend(&mut self, chapter: &LoadedChapter, evidence: &[AnalysisEvidence]) {
        for item in evidence {
            if self.seen.insert((chapter.seq, item.p, norm(&item.q))) {
                self.items.push(KnowledgeEvidence {
                    chapter: chapter.seq,
                    p: item.p,
                    q: item.q.clone(),
                    verified: is_verified(chapter, item),
                });
            }
        }
    }

    fn finish(mut self) -> Vec<KnowledgeEvidence> {
        self.items.sort_by_key(|item| (item.chapter, item.p));
        self.items
    }
}

#[cfg(test)]
#[path = "../../../test/features/knowledge/merge.test.rs"]
mod tests;
