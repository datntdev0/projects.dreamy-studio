use crate::features::knowledge::edit_content::apply_content;
use crate::features::knowledge::merge::LoadedChapter;
use crate::features::knowledge::merge::entity_id;
use crate::features::knowledge::merge::fact_id;
use crate::features::knowledge::models::AnalysisEntity;
use crate::features::knowledge::models::AnalysisEvidence;
use crate::features::knowledge::models::AnalysisFact;
use crate::features::knowledge::models::ChapterAnalysis;
use crate::features::knowledge::models::KnowledgeEdit;
use crate::features::knowledge::models::KnowledgeError;
use crate::features::knowledge::models::KnowledgeErrorCode;
use crate::features::knowledge::models::KnowledgeResult;
use crate::features::knowledge::ontology::Ontology;
use crate::features::knowledge::ontology::PredicateDef;
use crate::features::knowledge::ontology::PredicateKind;
use crate::features::knowledge::text::norm;
use std::collections::HashMap;
use std::collections::HashSet;

const PERSONA: &str = "persona";

pub(crate) struct FactRef {
    pub chapter: usize,
    pub index: usize,
    pub id: String,
    pub pred: String,
    pub subject: String,
    pub object: Option<String>,
}

pub fn apply(
    chapters: &mut Vec<LoadedChapter>,
    edits: &[KnowledgeEdit],
) -> KnowledgeResult<HashMap<String, String>> {
    let mut work = chapters.clone();
    let mut remap = HashMap::new();
    for edit in edits {
        apply_one(&mut work, &mut remap, edit)?;
    }
    for (after, before) in work.iter_mut().zip(chapters.iter()) {
        after.dirty = before.dirty || after.file != before.file;
    }
    *chapters = work;
    Ok(remap)
}

fn apply_one(
    chapters: &mut Vec<LoadedChapter>,
    remap: &mut HashMap<String, String>,
    edit: &KnowledgeEdit,
) -> KnowledgeResult<()> {
    match edit {
        KnowledgeEdit::Rename { id, name } => rename(chapters, remap, id, name),
        KnowledgeEdit::Retype { id, entity_type } => retype(chapters, remap, id, entity_type),
        KnowledgeEdit::Del { id } => del(chapters, remap, id),
        KnowledgeEdit::Merge { sources, target } => {
            merge_entities(chapters, remap, sources, target)
        }
        KnowledgeEdit::Fact {
            id,
            pred,
            subject,
            object,
        } => change_fact(
            chapters,
            remap,
            id,
            FactChange {
                pred: pred.as_deref(),
                subject: subject.as_deref(),
                object: object.as_deref(),
            },
        ),
        _ => apply_content(chapters, remap, edit),
    }
}

pub(crate) fn resolve_id(remap: &HashMap<String, String>, id: &str) -> String {
    remap.get(id).cloned().unwrap_or_else(|| id.to_string())
}

pub(crate) fn record_remap(remap: &mut HashMap<String, String>, old: &str, new: &str) {
    for value in remap.values_mut() {
        if value == old {
            *value = new.to_string();
        }
    }
    remap.insert(old.to_string(), new.to_string());
    remap.retain(|key, value| key != value);
}

pub(crate) fn entity_locations(chapters: &[LoadedChapter], id: &str) -> Vec<(usize, usize)> {
    let mut found = Vec::new();
    for (chapter_index, chapter) in chapters.iter().enumerate() {
        for (entity_index, entity) in chapter.file.entities.iter().enumerate() {
            if entity_id(&entity.kind, &entity.name) == id {
                found.push((chapter_index, entity_index));
            }
        }
    }
    found
}

pub(crate) fn fact_refs(chapters: &[LoadedChapter]) -> Vec<FactRef> {
    let mut found = Vec::new();
    for (chapter_index, chapter) in chapters.iter().enumerate() {
        let ids = entity_ids(&chapter.file);
        for (index, fact) in chapter.file.facts.iter().enumerate() {
            if let Some(item) = fact_ref(chapter_index, index, fact, &ids) {
                found.push(item);
            }
        }
    }
    found
}

pub(crate) fn fact_locations(chapters: &[LoadedChapter], id: &str) -> Vec<(usize, usize)> {
    fact_refs(chapters)
        .into_iter()
        .filter(|item| item.id == id)
        .map(|item| (item.chapter, item.index))
        .collect()
}

#[cfg(test)]
pub(crate) fn merged_id_of(file: &ChapterAnalysis, local_entity_id: &str) -> Option<String> {
    file.entities
        .iter()
        .find(|entity| entity.id == local_entity_id)
        .map(|entity| entity_id(&entity.kind, &entity.name))
}

pub(crate) fn next_local_id(file: &ChapterAnalysis, prefix: char) -> String {
    let ids: Vec<&str> = match prefix {
        'E' => file.entities.iter().map(|item| item.id.as_str()).collect(),
        _ => file.facts.iter().map(|item| item.id.as_str()).collect(),
    };
    let largest = ids
        .iter()
        .filter_map(|id| id.strip_prefix(prefix))
        .filter_map(|number| number.parse::<u64>().ok())
        .max()
        .unwrap_or(0);
    format!("{prefix}{}", largest + 1)
}

pub(crate) fn fold_entity(file: &mut ChapterAnalysis, keep: usize, drop: usize) {
    if keep == drop {
        return;
    }
    let dropped = file.entities.remove(drop);
    let keep = if drop < keep { keep - 1 } else { keep };
    let kept_id = file.entities[keep].id.clone();
    union_entity(&mut file.entities[keep], &dropped);
    retarget_facts(&mut file.facts, &dropped.id, &kept_id);
    tidy_facts(file);
}

pub(crate) fn tidy_facts(file: &mut ChapterAnalysis) {
    let facts = std::mem::take(&mut file.facts);
    let mut kept: Vec<AnalysisFact> = Vec::new();
    for fact in facts {
        if fact.object.as_deref() == Some(fact.subject.as_str()) {
            continue;
        }
        match kept.iter_mut().find(|item| same_fact_key(item, &fact)) {
            Some(item) => union_evidence(&mut item.ev, &fact.ev),
            None => kept.push(fact),
        }
    }
    file.facts = kept;
}

pub(crate) fn text_has(text: &Option<Vec<String>>, needle: &str) -> bool {
    let needle = norm(needle);
    if needle.is_empty() {
        return false;
    }
    text.as_deref()
        .is_some_and(|paragraphs| paragraphs.iter().any(|item| norm(item).contains(&needle)))
}

pub(crate) fn seq_list(chapters: &[LoadedChapter], indexes: &[usize]) -> String {
    indexes
        .iter()
        .map(|index| chapters[*index].seq.to_string())
        .collect::<Vec<_>>()
        .join(", ")
}

fn entity_ids(file: &ChapterAnalysis) -> HashMap<String, String> {
    file.entities
        .iter()
        .map(|entity| (entity.id.clone(), entity_id(&entity.kind, &entity.name)))
        .collect()
}

fn fact_ref(
    chapter: usize,
    index: usize,
    fact: &AnalysisFact,
    ids: &HashMap<String, String>,
) -> Option<FactRef> {
    let subject = ids.get(&fact.subject)?.clone();
    let object = match &fact.object {
        Some(local) => Some(ids.get(local)?.clone()),
        None => None,
    };
    if object.as_deref() == Some(subject.as_str()) {
        return None;
    }
    Some(FactRef {
        chapter,
        index,
        id: fact_id(&fact.pred, &subject, object.as_deref()),
        pred: fact.pred.clone(),
        subject,
        object,
    })
}

fn same_fact_key(left: &AnalysisFact, right: &AnalysisFact) -> bool {
    left.pred == right.pred && left.subject == right.subject && left.object == right.object
}

fn retarget_facts(facts: &mut [AnalysisFact], from: &str, to: &str) {
    for fact in facts {
        if fact.subject == from {
            fact.subject = to.to_string();
        }
        if fact.object.as_deref() == Some(from) {
            fact.object = Some(to.to_string());
        }
    }
}

fn union_entity(target: &mut AnalysisEntity, extra: &AnalysisEntity) {
    union_names(&mut target.titles, &extra.titles);
    union_names(&mut target.aliases, &extra.aliases);
    union_evidence(&mut target.ev, &extra.ev);
}

fn union_names(target: &mut Vec<String>, extra: &[String]) {
    let mut seen: HashSet<String> = target.iter().map(|value| norm(value)).collect();
    for value in extra {
        let key = norm(value);
        if !key.is_empty() && seen.insert(key) {
            target.push(value.clone());
        }
    }
}

fn union_evidence(target: &mut Vec<AnalysisEvidence>, extra: &[AnalysisEvidence]) {
    let mut seen: HashSet<(usize, String)> =
        target.iter().map(|item| (item.p, norm(&item.q))).collect();
    for item in extra {
        if seen.insert((item.p, norm(&item.q))) {
            target.push(item.clone());
        }
    }
}

fn error(code: KnowledgeErrorCode, detail: impl Into<String>) -> KnowledgeError {
    KnowledgeError::new(code, detail)
}

fn chapter_indexes(locations: &[(usize, usize)]) -> Vec<usize> {
    let mut indexes: Vec<usize> = locations.iter().map(|(chapter, _)| *chapter).collect();
    indexes.sort_unstable();
    indexes.dedup();
    indexes
}

fn local_ids_of(file: &ChapterAnalysis, id: &str) -> Vec<String> {
    file.entities
        .iter()
        .filter(|entity| entity_id(&entity.kind, &entity.name) == id)
        .map(|entity| entity.id.clone())
        .collect()
}

fn index_of_local(file: &ChapterAnalysis, local: &str) -> Option<usize> {
    file.entities.iter().position(|entity| entity.id == local)
}

fn entity_at(chapters: &[LoadedChapter], location: (usize, usize)) -> &AnalysisEntity {
    &chapters[location.0].file.entities[location.1]
}

fn existing_entity(chapters: &[LoadedChapter], id: &str) -> KnowledgeResult<Vec<(usize, usize)>> {
    let locations = entity_locations(chapters, id);
    if locations.is_empty() {
        return Err(KnowledgeError::not_found(format!("entity {id} not found")));
    }
    Ok(locations)
}

fn fold_collisions(file: &mut ChapterAnalysis, local: &str) {
    while let Some((keep, other)) = collision(file, local) {
        fold_entity(file, keep, other);
    }
}

fn collision(file: &ChapterAnalysis, local: &str) -> Option<(usize, usize)> {
    let keep = index_of_local(file, local)?;
    let entity = &file.entities[keep];
    let key = (entity.kind.as_str(), norm(&entity.name));
    let other = file.entities.iter().enumerate().position(|(index, item)| {
        index != keep && item.kind == key.0 && norm(&item.name) == key.1
    })?;
    Some((keep, other))
}

fn record_moves(
    chapters: &[LoadedChapter],
    remap: &mut HashMap<String, String>,
    before: &[FactRef],
    moves: &[(String, String)],
) {
    for (old, new) in moves {
        record_remap(remap, old, new);
    }
    let alive: HashSet<String> = fact_refs(chapters)
        .into_iter()
        .map(|item| item.id)
        .collect();
    for item in before {
        let subject = moved(moves, &item.subject);
        let object = item.object.as_deref().map(|id| moved(moves, id));
        let new = fact_id(&item.pred, &subject, object.as_deref());
        if new != item.id && alive.contains(&new) {
            record_remap(remap, &item.id, &new);
        }
    }
}

fn moved(moves: &[(String, String)], id: &str) -> String {
    moves
        .iter()
        .find(|(old, _)| old == id)
        .map(|(_, new)| new.clone())
        .unwrap_or_else(|| id.to_string())
}

fn rename(
    chapters: &mut [LoadedChapter],
    remap: &mut HashMap<String, String>,
    id: &str,
    name: &str,
) -> KnowledgeResult<()> {
    let id = resolve_id(remap, id);
    let locations = existing_entity(chapters, &id)?;
    let name = name.trim();
    if name.is_empty() {
        return Err(KnowledgeError::invalid("name must not be empty"));
    }
    let indexes = chapter_indexes(&locations);
    let missing: Vec<usize> = indexes
        .iter()
        .copied()
        .filter(|index| !text_has(&chapters[*index].text, name))
        .collect();
    if !missing.is_empty() {
        let detail = format!(
            "name not found in chapters {}",
            seq_list(chapters, &missing)
        );
        return Err(error(KnowledgeErrorCode::TextNotFound, detail));
    }
    let kind = entity_at(chapters, locations[0]).kind.clone();
    let before = fact_refs(chapters);
    for index in indexes {
        rename_in_file(&mut chapters[index].file, &id, name);
    }
    let moves = [(id, entity_id(&kind, name))];
    record_moves(chapters, remap, &before, &moves);
    Ok(())
}

fn rename_in_file(file: &mut ChapterAnalysis, id: &str, name: &str) {
    for local in local_ids_of(file, id) {
        if let Some(index) = index_of_local(file, &local) {
            file.entities[index].name = name.to_string();
        }
        fold_collisions(file, &local);
    }
}

fn retype(
    chapters: &mut [LoadedChapter],
    remap: &mut HashMap<String, String>,
    id: &str,
    new_type: &str,
) -> KnowledgeResult<()> {
    let id = resolve_id(remap, id);
    let locations = existing_entity(chapters, &id)?;
    if !Ontology::get()
        .types
        .iter()
        .any(|item| item.key == new_type)
    {
        return Err(KnowledgeError::invalid(format!("unknown type {new_type}")));
    }
    check_persona_leave(chapters, &locations, new_type)?;
    let name = entity_at(chapters, locations[0]).name.clone();
    let before = fact_refs(chapters);
    for index in chapter_indexes(&locations) {
        retype_in_file(&mut chapters[index].file, &id, new_type);
    }
    let moves = [(id, entity_id(new_type, &name))];
    record_moves(chapters, remap, &before, &moves);
    Ok(())
}

fn check_persona_leave(
    chapters: &[LoadedChapter],
    locations: &[(usize, usize)],
    new_type: &str,
) -> KnowledgeResult<()> {
    let leaving = new_type != PERSONA
        && locations.iter().any(|location| {
            let entity = entity_at(chapters, *location);
            entity.kind == PERSONA && !(entity.titles.is_empty() && entity.aliases.is_empty())
        });
    if leaving {
        return Err(KnowledgeError::invalid(
            "a persona with titles or aliases cannot change type",
        ));
    }
    Ok(())
}

fn retype_in_file(file: &mut ChapterAnalysis, id: &str, new_type: &str) {
    for local in local_ids_of(file, id) {
        if let Some(index) = index_of_local(file, &local) {
            file.entities[index].kind = new_type.to_string();
        }
        fold_collisions(file, &local);
    }
}

fn del(
    chapters: &mut [LoadedChapter],
    remap: &HashMap<String, String>,
    id: &str,
) -> KnowledgeResult<()> {
    let id = resolve_id(remap, id);
    let entities = entity_locations(chapters, &id);
    if !entities.is_empty() {
        for index in chapter_indexes(&entities) {
            del_entity_in_file(&mut chapters[index].file, &id);
        }
        return Ok(());
    }
    let facts = fact_locations(chapters, &id);
    if facts.is_empty() {
        return Err(KnowledgeError::not_found(format!("item {id} not found")));
    }
    for (chapter, index) in facts.into_iter().rev() {
        chapters[chapter].file.facts.remove(index);
    }
    Ok(())
}

fn del_entity_in_file(file: &mut ChapterAnalysis, id: &str) {
    let locals = local_ids_of(file, id);
    file.entities.retain(|entity| !locals.contains(&entity.id));
    file.facts.retain(|fact| {
        !locals.contains(&fact.subject)
            && !fact
                .object
                .as_ref()
                .is_some_and(|object| locals.contains(object))
    });
}

struct MergePlan {
    sources: Vec<String>,
    target: String,
    name: String,
    kind: String,
}

fn merge_entities(
    chapters: &mut [LoadedChapter],
    remap: &mut HashMap<String, String>,
    sources: &[String],
    target: &str,
) -> KnowledgeResult<()> {
    let target = resolve_id(remap, target);
    let mut resolved: Vec<String> = Vec::new();
    for source in sources {
        let id = resolve_id(remap, source);
        if id != target && !resolved.contains(&id) {
            resolved.push(id);
        }
    }
    if resolved.is_empty() {
        return Err(KnowledgeError::invalid("merge needs at least one source"));
    }
    let target_locations = existing_entity(chapters, &target)?;
    let mut affected = Vec::new();
    for source in &resolved {
        affected.extend(existing_entity(chapters, source)?);
    }
    let first = entity_at(chapters, target_locations[0]);
    let plan = MergePlan {
        sources: resolved,
        target,
        name: first.name.clone(),
        kind: first.kind.clone(),
    };
    check_same_type(chapters, &affected, &plan.kind)?;
    let before = fact_refs(chapters);
    for index in chapter_indexes(&affected) {
        merge_in_file(&mut chapters[index].file, &plan);
    }
    let moves: Vec<(String, String)> = plan
        .sources
        .iter()
        .map(|source| (source.clone(), plan.target.clone()))
        .collect();
    record_moves(chapters, remap, &before, &moves);
    Ok(())
}

fn check_same_type(
    chapters: &[LoadedChapter],
    locations: &[(usize, usize)],
    kind: &str,
) -> KnowledgeResult<()> {
    if locations
        .iter()
        .any(|location| entity_at(chapters, *location).kind != kind)
    {
        return Err(KnowledgeError::invalid("merged entities must share a type"));
    }
    Ok(())
}

fn merge_in_file(file: &mut ChapterAnalysis, plan: &MergePlan) {
    let mut targets = local_ids_of(file, &plan.target).into_iter();
    let mut keep = targets.next();
    for extra in targets {
        fold_locals(file, keep.as_deref(), &extra);
    }
    for source in &plan.sources {
        for local in local_ids_of(file, source) {
            match &keep {
                Some(_) => fold_locals(file, keep.as_deref(), &local),
                None => {
                    rename_entry(file, &local, plan);
                    keep = Some(local);
                }
            }
        }
    }
}

fn fold_locals(file: &mut ChapterAnalysis, keep: Option<&str>, dropped: &str) {
    let positions = keep
        .and_then(|local| index_of_local(file, local))
        .zip(index_of_local(file, dropped));
    if let Some((keep_index, drop_index)) = positions {
        fold_entity(file, keep_index, drop_index);
    }
}

fn rename_entry(file: &mut ChapterAnalysis, local: &str, plan: &MergePlan) {
    if let Some(index) = index_of_local(file, local) {
        file.entities[index].name = plan.name.clone();
        file.entities[index].kind = plan.kind.clone();
    }
}

struct FactChange<'a> {
    pred: Option<&'a str>,
    subject: Option<&'a str>,
    object: Option<&'a str>,
}

fn predicate(key: &str) -> Option<&'static PredicateDef> {
    Ontology::get()
        .predicates
        .iter()
        .find(|item| item.key == key)
}

fn change_fact(
    chapters: &mut [LoadedChapter],
    remap: &mut HashMap<String, String>,
    id: &str,
    change: FactChange<'_>,
) -> KnowledgeResult<()> {
    let id = resolve_id(remap, id);
    let all = fact_refs(chapters);
    let hits: Vec<&FactRef> = all.iter().filter(|item| item.id == id).collect();
    let Some(current) = hits.first() else {
        return Err(KnowledgeError::not_found(format!("fact {id} not found")));
    };
    let pred = checked_pred(current, &change)?;
    let indexes = chapter_indexes(&locations_of(&hits));
    let subject = checked_ref(chapters, remap, &indexes, change.subject, "subject")?;
    let object = checked_ref(chapters, remap, &indexes, change.object, "object")?;
    let new_id = fact_id(
        &pred,
        subject.as_deref().unwrap_or(&current.subject),
        object.as_deref().or(current.object.as_deref()),
    );
    let targets = FactTargets {
        pred: change.pred.map(str::to_string),
        subject,
        object,
    };
    for hit in &hits {
        update_fact(&mut chapters[hit.chapter].file, hit.index, &targets);
    }
    for index in &indexes {
        tidy_facts(&mut chapters[*index].file);
    }
    if new_id != id && !fact_locations(chapters, &new_id).is_empty() {
        record_remap(remap, &id, &new_id);
    }
    Ok(())
}

fn locations_of(hits: &[&FactRef]) -> Vec<(usize, usize)> {
    hits.iter().map(|hit| (hit.chapter, hit.index)).collect()
}

fn checked_pred(current: &FactRef, change: &FactChange<'_>) -> KnowledgeResult<String> {
    if change.pred.is_none() && change.subject.is_none() && change.object.is_none() {
        return Err(KnowledgeError::invalid("fact edit changes nothing"));
    }
    let old = predicate(&current.pred);
    let new = match change.pred {
        Some(key) => predicate(key)
            .ok_or_else(|| KnowledgeError::invalid(format!("unknown predicate {key}")))?,
        None => old.ok_or_else(|| KnowledgeError::invalid("unknown predicate"))?,
    };
    if old.is_some_and(|item| item.kind != new.kind) {
        return Err(KnowledgeError::invalid("predicate kind cannot change"));
    }
    if change.object.is_some() && new.kind == PredicateKind::Scalar {
        return Err(KnowledgeError::invalid("a scalar fact has no object"));
    }
    Ok(new.key.clone())
}

fn checked_ref(
    chapters: &[LoadedChapter],
    remap: &HashMap<String, String>,
    indexes: &[usize],
    given: Option<&str>,
    role: &str,
) -> KnowledgeResult<Option<String>> {
    let Some(given) = given else {
        return Ok(None);
    };
    let id = resolve_id(remap, given);
    existing_entity(chapters, &id)?;
    let missing: Vec<usize> = indexes
        .iter()
        .copied()
        .filter(|index| local_of(&chapters[*index].file, &id).is_none())
        .collect();
    if !missing.is_empty() {
        let detail = format!(
            "{role} not found in chapters {}",
            seq_list(chapters, &missing)
        );
        return Err(error(KnowledgeErrorCode::RefNotFound, detail));
    }
    Ok(Some(id))
}

fn local_of(file: &ChapterAnalysis, id: &str) -> Option<String> {
    local_ids_of(file, id).into_iter().next()
}

struct FactTargets {
    pred: Option<String>,
    subject: Option<String>,
    object: Option<String>,
}

fn update_fact(file: &mut ChapterAnalysis, index: usize, targets: &FactTargets) {
    let subject = targets.subject.as_deref().and_then(|id| local_of(file, id));
    let object = targets.object.as_deref().and_then(|id| local_of(file, id));
    let fact = &mut file.facts[index];
    if let Some(pred) = &targets.pred {
        fact.pred = pred.clone();
    }
    if let Some(subject) = subject {
        fact.subject = subject;
    }
    if let Some(object) = object {
        fact.object = Some(object);
    }
}

#[cfg(test)]
#[path = "../../../test/features/knowledge/edit.test.rs"]
mod tests;
