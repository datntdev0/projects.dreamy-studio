use crate::features::knowledge::models::KnowledgeEntity;
use crate::features::knowledge::models::KnowledgeItem;
use crate::features::knowledge::models::WireKnowledge;
use crate::features::project::models::ProjectSummary;
use crate::features::scripting::models::CastMember;
use crate::features::scripting::models::Script;
use chrono::Utc;
use std::collections::HashSet;

pub const NARRATOR_ID: &str = "narr";
pub const SOURCE_LANG: &str = "src";

const AUDIOBOOK_PRESET: &str = "audiobook";
const CHARACTER_TYPE: &str = "character";
const NARRATOR_KIND: &str = "narrator";
const KNOWLEDGE_KIND: &str = "kb";
const TRANSLATION_KIND: &str = "translation";
const ENGLISH: &str = "EN";
const VIETNAMESE: &str = "VI";
const EXTRA_KIND: &str = "extra";
const MEMBER_PREFIX: &str = "spk";
const RADIX: u64 = 36;

pub fn knowledge_lang(project: &ProjectSummary) -> &'static str {
    if project.src_kind.as_deref() != Some(TRANSLATION_KIND) {
        return SOURCE_LANG;
    }
    if project.src_lang.as_deref() == Some(ENGLISH) {
        ENGLISH
    } else {
        VIETNAMESE
    }
}

pub fn project_cast(script: &Script, knowledge: Option<&WireKnowledge>) -> Vec<CastMember> {
    let narrator = (script.cfg.preset == AUDIOBOOK_PRESET).then(narrator_member);
    narrator
        .into_iter()
        .chain(knowledge_members(knowledge))
        .chain(script.extra_cast.iter().cloned())
        .collect()
}

pub fn extra_member(name: &str, color: i64, taken: &mut HashSet<String>) -> CastMember {
    let stamp = radix(Utc::now().timestamp_millis().unsigned_abs());
    let mut id = format!("{MEMBER_PREFIX}{stamp}");
    while taken.contains(&id) {
        id.push('x');
    }
    taken.insert(id.clone());
    CastMember {
        id,
        name: name.to_string(),
        kind: EXTRA_KIND.to_string(),
        c: color,
    }
}

fn radix(mut value: u64) -> String {
    if value == 0 {
        return "0".to_string();
    }
    let mut digits = Vec::new();
    while value > 0 {
        let digit = (value % RADIX) as u32;
        digits.push(char::from_digit(digit, RADIX as u32).unwrap_or('0'));
        value /= RADIX;
    }
    digits.iter().rev().collect()
}

fn narrator_member() -> CastMember {
    CastMember {
        id: NARRATOR_ID.to_string(),
        name: "Narrator".to_string(),
        kind: NARRATOR_KIND.to_string(),
        c: -1,
    }
}

fn knowledge_members(knowledge: Option<&WireKnowledge>) -> Vec<CastMember> {
    distinct_characters(knowledge)
        .into_iter()
        .enumerate()
        .map(|(index, entity)| CastMember {
            id: entity.id.clone(),
            name: entity.name.clone(),
            kind: KNOWLEDGE_KIND.to_string(),
            c: index as i64,
        })
        .collect()
}

fn distinct_characters(knowledge: Option<&WireKnowledge>) -> Vec<&KnowledgeEntity> {
    let all: Vec<&KnowledgeEntity> = knowledge
        .into_iter()
        .flat_map(|snapshot| snapshot.items.iter())
        .filter_map(character_of)
        .collect();
    all.iter()
        .copied()
        .filter(|entity| !is_contained(entity, &all))
        .collect()
}

fn character_of(item: &KnowledgeItem) -> Option<&KnowledgeEntity> {
    match item {
        KnowledgeItem::Entity(entity) if entity.entity_type == CHARACTER_TYPE => Some(entity),
        _ => None,
    }
}

fn is_contained(entity: &KnowledgeEntity, all: &[&KnowledgeEntity]) -> bool {
    all.iter()
        .any(|other| other.name.len() > entity.name.len() && other.name.contains(&entity.name))
}

#[cfg(test)]
#[path = "../../../test/features/scripting/cast.test.rs"]
mod tests;
