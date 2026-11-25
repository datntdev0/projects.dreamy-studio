use crate::features::knowledge::edit::entity_locations;
use crate::features::knowledge::edit::fact_refs;
use crate::features::knowledge::edit::next_local_id;
use crate::features::knowledge::edit::record_remap;
use crate::features::knowledge::edit::resolve_id;
use crate::features::knowledge::edit::seq_list;
use crate::features::knowledge::edit::text_has;
use crate::features::knowledge::edit::tidy_facts;
use crate::features::knowledge::merge::LoadedChapter;
use crate::features::knowledge::merge::entity_id;
use crate::features::knowledge::merge::fact_id;
use crate::features::knowledge::merge::merge;
use crate::features::knowledge::models::AnalysisEntity;
use crate::features::knowledge::models::AnalysisEvidence;
use crate::features::knowledge::models::AnalysisFact;
use crate::features::knowledge::models::ChapterAnalysis;
use crate::features::knowledge::models::EvidenceRef;
use crate::features::knowledge::models::KnowledgeEdit;
use crate::features::knowledge::models::KnowledgeEntity;
use crate::features::knowledge::models::KnowledgeError;
use crate::features::knowledge::models::KnowledgeErrorCode;
use crate::features::knowledge::models::KnowledgeItem;
use crate::features::knowledge::models::KnowledgeLang;
use crate::features::knowledge::models::KnowledgeResult;
use crate::features::knowledge::ontology::Ontology;
use crate::features::knowledge::ontology::PredicateDef;
use crate::features::knowledge::ontology::PredicateKind;
use crate::features::knowledge::text::contains;
use crate::features::knowledge::text::norm;
use std::collections::HashMap;
use std::collections::HashSet;

const PERSONA: &str = "persona";
const CHARACTER: &str = "character";
const PERSONA_OF: &str = "persona_of";

type Grouped = Vec<(usize, Vec<AnalysisEvidence>)>;

#[derive(Clone, Copy)]
enum Prop {
    Titles,
    Aliases,
}

impl Prop {
    fn list(self, entity: &AnalysisEntity) -> &[String] {
        match self {
            Prop::Titles => &entity.titles,
            Prop::Aliases => &entity.aliases,
        }
    }

    fn list_mut(self, entity: &mut AnalysisEntity) -> &mut Vec<String> {
        match self {
            Prop::Titles => &mut entity.titles,
            Prop::Aliases => &mut entity.aliases,
        }
    }
}

struct FactKey {
    pred: String,
    subject: String,
    object: Option<String>,
}

enum Target {
    Entity(String),
    Fact(FactKey),
}

#[derive(Clone, Copy)]
enum Slot {
    Entity(usize),
    Fact(usize),
}

struct NewEntity<'a> {
    reference: &'a str,
    entity_type: &'a str,
    name: &'a str,
    titles: &'a [String],
    aliases: &'a [String],
    ev: &'a [EvidenceRef],
}

struct NewFact<'a> {
    reference: &'a str,
    pred: &'a str,
    subject: &'a str,
    object: Option<&'a str>,
    ev: &'a [EvidenceRef],
}

pub(crate) fn apply_content(
    chapters: &mut [LoadedChapter],
    remap: &mut HashMap<String, String>,
    edit: &KnowledgeEdit,
) -> KnowledgeResult<()> {
    match edit {
        KnowledgeEdit::Props {
            id,
            titles,
            aliases,
        } => props(chapters, remap, id, titles.as_deref(), aliases.as_deref()),
        KnowledgeEdit::Evidence { id, add, remove } => evidence(
            chapters,
            remap,
            id,
            add.as_deref().unwrap_or_default(),
            remove.as_deref().unwrap_or_default(),
        ),
        KnowledgeEdit::AddEntity {
            reference,
            entity_type,
            name,
            titles,
            aliases,
            ev,
        } => add_entity(
            chapters,
            remap,
            NewEntity {
                reference,
                entity_type,
                name,
                titles: titles.as_deref().unwrap_or_default(),
                aliases: aliases.as_deref().unwrap_or_default(),
                ev,
            },
        ),
        KnowledgeEdit::AddFact {
            reference,
            pred,
            subject,
            object,
            ev,
        } => add_fact(
            chapters,
            remap,
            NewFact {
                reference,
                pred,
                subject,
                object: object.as_deref(),
                ev,
            },
        ),
        KnowledgeEdit::Character { persona } => character(chapters, remap, persona),
        _ => Err(KnowledgeError::invalid("not a content edit")),
    }
}

fn error(code: KnowledgeErrorCode, detail: impl Into<String>) -> KnowledgeError {
    KnowledgeError::new(code, detail)
}

fn predicate(key: &str) -> Option<&'static PredicateDef> {
    Ontology::get()
        .predicates
        .iter()
        .find(|item| item.key == key)
}

fn entity_index(file: &ChapterAnalysis, id: &str) -> Option<usize> {
    file.entities
        .iter()
        .position(|entity| entity_id(&entity.kind, &entity.name) == id)
}

fn chapter_position(chapters: &[LoadedChapter], seq: i64) -> Option<usize> {
    chapters.iter().position(|chapter| chapter.seq == seq)
}

fn ordered_indexes(chapters: &[LoadedChapter], locations: &[(usize, usize)]) -> Vec<usize> {
    let mut indexes: Vec<usize> = locations.iter().map(|(chapter, _)| *chapter).collect();
    indexes.sort_unstable();
    indexes.dedup();
    indexes.sort_by_key(|index| chapters[*index].seq);
    indexes
}

fn persona_locations(chapters: &[LoadedChapter], id: &str) -> KnowledgeResult<Vec<(usize, usize)>> {
    let locations = entity_locations(chapters, id);
    let Some((chapter, position)) = locations.first() else {
        return Err(KnowledgeError::not_found(format!("entity {id} not found")));
    };
    if chapters[*chapter].file.entities[*position].kind != PERSONA {
        return Err(KnowledgeError::invalid("only a persona has this property"));
    }
    Ok(locations)
}

fn add_names(target: &mut Vec<String>, extra: &[String]) {
    let mut seen: HashSet<String> = target.iter().map(|value| norm(value)).collect();
    for value in extra {
        let value = value.trim();
        if seen.insert(norm(value)) && !value.is_empty() {
            target.push(value.to_string());
        }
    }
}

fn clean_names(values: &[String]) -> Vec<String> {
    let mut cleaned = Vec::new();
    add_names(&mut cleaned, values);
    cleaned
}

fn add_evidence(target: &mut Vec<AnalysisEvidence>, items: &[AnalysisEvidence]) {
    let mut seen: HashSet<(usize, String)> =
        target.iter().map(|item| (item.p, norm(&item.q))).collect();
    for item in items {
        if seen.insert((item.p, norm(&item.q))) {
            target.push(item.clone());
        }
    }
}

fn group_evidence(chapters: &[LoadedChapter], refs: &[EvidenceRef]) -> KnowledgeResult<Grouped> {
    let mut groups: Grouped = Vec::new();
    let mut unknown: Vec<String> = Vec::new();
    let mut invalid: Vec<String> = Vec::new();
    for item in refs {
        let Some(index) = chapter_position(chapters, item.chapter) else {
            unknown.push(item.chapter.to_string());
            continue;
        };
        let valid = chapters[index]
            .text
            .as_deref()
            .is_some_and(|text| contains(text, item.p, &item.q));
        if !valid {
            invalid.push(format!("chapter {} paragraph {}", item.chapter, item.p));
            continue;
        }
        let evidence = AnalysisEvidence {
            p: item.p,
            q: item.q.clone(),
        };
        match groups.iter_mut().find(|group| group.0 == index) {
            Some(group) => group.1.push(evidence),
            None => groups.push((index, vec![evidence])),
        }
    }
    if !unknown.is_empty() {
        let detail = format!("chapters not analyzed: {}", unknown.join(", "));
        return Err(KnowledgeError::not_found(detail));
    }
    if !invalid.is_empty() {
        let detail = format!("quote not found in {}", invalid.join(", "));
        return Err(error(KnowledgeErrorCode::EvidenceInvalid, detail));
    }
    Ok(groups)
}

fn merged_entity(chapters: &[LoadedChapter], id: &str) -> KnowledgeResult<KnowledgeEntity> {
    merge(KnowledgeLang::Src, chapters)
        .items
        .into_iter()
        .find_map(|item| match item {
            KnowledgeItem::Entity(entity) if entity.id == id => Some(entity),
            _ => None,
        })
        .ok_or_else(|| KnowledgeError::not_found(format!("entity {id} not found")))
}

fn upsert_entity(file: &mut ChapterAnalysis, kind: &str, name: &str) -> usize {
    let id = entity_id(kind, name);
    if let Some(position) = entity_index(file, &id) {
        return position;
    }
    file.entities.push(AnalysisEntity {
        id: next_local_id(file, 'E'),
        kind: kind.to_string(),
        name: name.to_string(),
        titles: Vec::new(),
        aliases: Vec::new(),
        ev: Vec::new(),
    });
    file.entities.len() - 1
}

fn upsert_fact(
    file: &mut ChapterAnalysis,
    pred: &str,
    subject: String,
    object: Option<String>,
) -> usize {
    let found = file
        .facts
        .iter()
        .position(|fact| fact.pred == pred && fact.subject == subject && fact.object == object);
    if let Some(position) = found {
        return position;
    }
    file.facts.push(AnalysisFact {
        id: next_local_id(file, 'F'),
        pred: pred.to_string(),
        subject,
        object,
        ev: Vec::new(),
    });
    file.facts.len() - 1
}

fn ensure_entity(chapters: &mut [LoadedChapter], index: usize, id: &str) -> KnowledgeResult<usize> {
    if let Some(position) = entity_index(&chapters[index].file, id) {
        return Ok(position);
    }
    let merged = merged_entity(chapters, id)?;
    Ok(upsert_entity(
        &mut chapters[index].file,
        &merged.entity_type,
        &merged.name,
    ))
}

fn ensure_fact(
    chapters: &mut [LoadedChapter],
    index: usize,
    key: &FactKey,
) -> KnowledgeResult<usize> {
    let subject = ensure_entity(chapters, index, &key.subject)?;
    let object = match &key.object {
        Some(id) => Some(ensure_entity(chapters, index, id)?),
        None => None,
    };
    let file = &mut chapters[index].file;
    let subject = file.entities[subject].id.clone();
    let object = object.map(|position| file.entities[position].id.clone());
    Ok(upsert_fact(file, &key.pred, subject, object))
}

fn find_fact(file: &ChapterAnalysis, key: &FactKey) -> Option<usize> {
    let subject = entity_index(file, &key.subject).map(|position| &file.entities[position].id)?;
    let object = match &key.object {
        Some(id) => Some(entity_index(file, id).map(|position| &file.entities[position].id)?),
        None => None,
    };
    file.facts.iter().position(|fact| {
        fact.pred == key.pred && &fact.subject == subject && fact.object.as_ref() == object
    })
}

fn find_slot(file: &ChapterAnalysis, target: &Target) -> Option<Slot> {
    match target {
        Target::Entity(id) => entity_index(file, id).map(Slot::Entity),
        Target::Fact(key) => find_fact(file, key).map(Slot::Fact),
    }
}

fn materialize(
    chapters: &mut [LoadedChapter],
    index: usize,
    target: &Target,
) -> KnowledgeResult<Slot> {
    match target {
        Target::Entity(id) => Ok(Slot::Entity(ensure_entity(chapters, index, id)?)),
        Target::Fact(key) => Ok(Slot::Fact(ensure_fact(chapters, index, key)?)),
    }
}

fn slot_ev(file: &mut ChapterAnalysis, slot: Slot) -> &mut Vec<AnalysisEvidence> {
    match slot {
        Slot::Entity(position) => &mut file.entities[position].ev,
        Slot::Fact(position) => &mut file.facts[position].ev,
    }
}

fn props(
    chapters: &mut [LoadedChapter],
    remap: &HashMap<String, String>,
    id: &str,
    titles: Option<&[String]>,
    aliases: Option<&[String]>,
) -> KnowledgeResult<()> {
    if titles.is_none() && aliases.is_none() {
        return Err(KnowledgeError::invalid("props needs titles or aliases"));
    }
    let id = resolve_id(remap, id);
    let locations = persona_locations(chapters, &id)?;
    let indexes = ordered_indexes(chapters, &locations);
    if let Some(values) = titles {
        set_list(chapters, &indexes, &id, Prop::Titles, values)?;
    }
    if let Some(values) = aliases {
        set_list(chapters, &indexes, &id, Prop::Aliases, values)?;
    }
    Ok(())
}

fn set_list(
    chapters: &mut [LoadedChapter],
    indexes: &[usize],
    id: &str,
    prop: Prop,
    wanted: &[String],
) -> KnowledgeResult<()> {
    let wanted = clean_names(wanted);
    let keys: HashSet<String> = wanted.iter().map(|value| norm(value)).collect();
    let current = current_keys(chapters, indexes, id, prop);
    for index in indexes {
        prune_list(&mut chapters[*index].file, id, prop, &keys);
    }
    for value in wanted
        .iter()
        .filter(|value| !current.contains(&norm(value)))
    {
        add_value(chapters, indexes, id, prop, value)?;
    }
    Ok(())
}

fn current_keys(
    chapters: &[LoadedChapter],
    indexes: &[usize],
    id: &str,
    prop: Prop,
) -> HashSet<String> {
    let mut keys = HashSet::new();
    for index in indexes {
        for entity in &chapters[*index].file.entities {
            if entity_id(&entity.kind, &entity.name) == id {
                keys.extend(prop.list(entity).iter().map(|value| norm(value)));
            }
        }
    }
    keys
}

fn prune_list(file: &mut ChapterAnalysis, id: &str, prop: Prop, keys: &HashSet<String>) {
    for entity in &mut file.entities {
        if entity_id(&entity.kind, &entity.name) == id {
            prop.list_mut(entity)
                .retain(|value| keys.contains(&norm(value)));
        }
    }
}

fn add_value(
    chapters: &mut [LoadedChapter],
    indexes: &[usize],
    id: &str,
    prop: Prop,
    value: &str,
) -> KnowledgeResult<()> {
    let found = indexes
        .iter()
        .copied()
        .find(|index| text_has(&chapters[*index].text, value));
    let Some(index) = found else {
        let detail =
            format!("{value} not found in the text of the chapters containing the persona");
        return Err(error(KnowledgeErrorCode::TextNotFound, detail));
    };
    let file = &mut chapters[index].file;
    if let Some(position) = entity_index(file, id) {
        prop.list_mut(&mut file.entities[position])
            .push(value.to_string());
    }
    Ok(())
}

fn target_of(chapters: &[LoadedChapter], id: &str) -> KnowledgeResult<Target> {
    if !entity_locations(chapters, id).is_empty() {
        return Ok(Target::Entity(id.to_string()));
    }
    fact_refs(chapters)
        .into_iter()
        .find(|item| item.id == id)
        .map(|item| {
            Target::Fact(FactKey {
                pred: item.pred,
                subject: item.subject,
                object: item.object,
            })
        })
        .ok_or_else(|| KnowledgeError::not_found(format!("item {id} not found")))
}

fn evidence(
    chapters: &mut [LoadedChapter],
    remap: &HashMap<String, String>,
    id: &str,
    add: &[EvidenceRef],
    remove: &[EvidenceRef],
) -> KnowledgeResult<()> {
    if add.is_empty() && remove.is_empty() {
        return Err(KnowledgeError::invalid("evidence needs add or remove"));
    }
    let id = resolve_id(remap, id);
    let target = target_of(chapters, &id)?;
    for item in remove {
        remove_ref(chapters, &target, item)?;
    }
    for (index, items) in group_evidence(chapters, add)? {
        let slot = materialize(chapters, index, &target)?;
        add_evidence(slot_ev(&mut chapters[index].file, slot), &items);
    }
    Ok(())
}

fn ref_missing(item: &EvidenceRef) -> KnowledgeError {
    KnowledgeError::not_found(format!(
        "evidence not found at chapter {} paragraph {}",
        item.chapter, item.p
    ))
}

fn remove_ref(
    chapters: &mut [LoadedChapter],
    target: &Target,
    item: &EvidenceRef,
) -> KnowledgeResult<()> {
    let index = chapter_position(chapters, item.chapter).ok_or_else(|| ref_missing(item))?;
    let file = &mut chapters[index].file;
    let slot = find_slot(file, target).ok_or_else(|| ref_missing(item))?;
    let list = slot_ev(file, slot);
    let key = norm(&item.q);
    let position = list
        .iter()
        .position(|entry| entry.p == item.p && norm(&entry.q) == key)
        .ok_or_else(|| ref_missing(item))?;
    list.remove(position);
    Ok(())
}

fn check_new_entity<'a>(new: &NewEntity<'a>) -> KnowledgeResult<&'a str> {
    if new.ev.is_empty() {
        return Err(KnowledgeError::invalid("an entity needs evidence"));
    }
    if !Ontology::get()
        .types
        .iter()
        .any(|item| item.key == new.entity_type)
    {
        let detail = format!("unknown type {}", new.entity_type);
        return Err(KnowledgeError::invalid(detail));
    }
    let name = new.name.trim();
    if name.is_empty() {
        return Err(KnowledgeError::invalid("name must not be empty"));
    }
    if new.entity_type != PERSONA && !(new.titles.is_empty() && new.aliases.is_empty()) {
        return Err(KnowledgeError::invalid(
            "only a persona has titles or aliases",
        ));
    }
    Ok(name)
}

fn check_name_in_text(
    chapters: &[LoadedChapter],
    groups: &Grouped,
    name: &str,
) -> KnowledgeResult<()> {
    let missing: Vec<usize> = groups
        .iter()
        .map(|group| group.0)
        .filter(|index| !text_has(&chapters[*index].text, name))
        .collect();
    if missing.is_empty() {
        return Ok(());
    }
    let detail = format!(
        "name not found in chapters {}",
        seq_list(chapters, &missing)
    );
    Err(error(KnowledgeErrorCode::TextNotFound, detail))
}

fn add_entity(
    chapters: &mut [LoadedChapter],
    remap: &mut HashMap<String, String>,
    new: NewEntity<'_>,
) -> KnowledgeResult<()> {
    let name = check_new_entity(&new)?;
    let groups = group_evidence(chapters, new.ev)?;
    check_name_in_text(chapters, &groups, name)?;
    for (index, items) in &groups {
        write_entity(&mut chapters[*index].file, &new, name, items);
    }
    record_remap(remap, new.reference, &entity_id(new.entity_type, name));
    Ok(())
}

fn write_entity(
    file: &mut ChapterAnalysis,
    new: &NewEntity<'_>,
    name: &str,
    items: &[AnalysisEvidence],
) {
    let position = upsert_entity(file, new.entity_type, name);
    let entity = &mut file.entities[position];
    add_evidence(&mut entity.ev, items);
    if new.entity_type == PERSONA {
        add_names(&mut entity.titles, new.titles);
        add_names(&mut entity.aliases, new.aliases);
    }
}

fn check_new_fact(new: &NewFact<'_>) -> KnowledgeResult<()> {
    if new.ev.is_empty() {
        return Err(KnowledgeError::invalid("a fact needs evidence"));
    }
    let Some(def) = predicate(new.pred) else {
        let detail = format!("unknown predicate {}", new.pred);
        return Err(KnowledgeError::invalid(detail));
    };
    match (def.kind, new.object) {
        (PredicateKind::Scalar, Some(_)) => {
            Err(KnowledgeError::invalid("a scalar fact has no object"))
        }
        (PredicateKind::Relationship, None) => {
            Err(KnowledgeError::invalid("a relationship needs an object"))
        }
        _ => Ok(()),
    }
}

fn check_fact_refs(chapters: &[LoadedChapter], key: &FactKey) -> KnowledgeResult<()> {
    for id in std::iter::once(&key.subject).chain(key.object.iter()) {
        if entity_locations(chapters, id).is_empty() {
            return Err(KnowledgeError::not_found(format!("entity {id} not found")));
        }
    }
    if key.object.as_deref() == Some(key.subject.as_str()) {
        return Err(KnowledgeError::invalid(
            "a fact cannot link an entity to itself",
        ));
    }
    Ok(())
}

fn add_fact(
    chapters: &mut [LoadedChapter],
    remap: &mut HashMap<String, String>,
    new: NewFact<'_>,
) -> KnowledgeResult<()> {
    check_new_fact(&new)?;
    let key = FactKey {
        pred: new.pred.to_string(),
        subject: resolve_id(remap, new.subject),
        object: new.object.map(|id| resolve_id(remap, id)),
    };
    check_fact_refs(chapters, &key)?;
    for (index, items) in group_evidence(chapters, new.ev)? {
        let position = ensure_fact(chapters, index, &key)?;
        let file = &mut chapters[index].file;
        add_evidence(&mut file.facts[position].ev, &items);
        tidy_facts(file);
    }
    let id = fact_id(&key.pred, &key.subject, key.object.as_deref());
    record_remap(remap, new.reference, &id);
    Ok(())
}

fn character(
    chapters: &mut [LoadedChapter],
    remap: &HashMap<String, String>,
    persona: &str,
) -> KnowledgeResult<()> {
    let id = resolve_id(remap, persona);
    let locations = persona_locations(chapters, &id)?;
    let linked = fact_refs(chapters)
        .iter()
        .any(|item| item.pred == PERSONA_OF && item.subject == id);
    if linked {
        return Err(KnowledgeError::invalid(
            "the persona already has a character",
        ));
    }
    for (index, position) in locations {
        link_character(chapters, index, position, &id)?;
    }
    Ok(())
}

fn link_character(
    chapters: &mut [LoadedChapter],
    index: usize,
    position: usize,
    id: &str,
) -> KnowledgeResult<()> {
    let persona = chapters[index].file.entities[position].clone();
    let file = &mut chapters[index].file;
    let character = upsert_entity(file, CHARACTER, &persona.name);
    add_evidence(&mut file.entities[character].ev, &persona.ev);
    let key = FactKey {
        pred: PERSONA_OF.to_string(),
        subject: id.to_string(),
        object: Some(entity_id(CHARACTER, &persona.name)),
    };
    let fact = ensure_fact(chapters, index, &key)?;
    add_evidence(&mut chapters[index].file.facts[fact].ev, &persona.ev);
    Ok(())
}
