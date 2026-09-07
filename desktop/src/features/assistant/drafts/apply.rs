use crate::features::assistant::drafts::card::DraftBlock;
use crate::features::assistant::drafts::card::DraftCard;
use crate::features::assistant::drafts::card::DraftMember;
use crate::features::assistant::drafts::rev::base_rev;
use crate::features::assistant::models::AssistantChange;
use crate::features::assistant::models::AssistantError;
use crate::features::assistant::models::AssistantResult;
use crate::features::assistant::models::ChangeTarget;
use crate::features::assistant::sources::Sources;
use crate::features::scripting::models::CastMember;
use crate::features::scripting::models::Script;
use crate::features::scripting::models::ScriptBlock;
use crate::features::scripting::models::ScriptUnit;
use chrono::SecondsFormat;
use chrono::Utc;
use std::collections::HashMap;
use std::collections::HashSet;

const EXTRA_KIND: &str = "extra";
const MEMBER_PREFIX: &str = "spk";
const BLOCK_PREFIX: &str = "B";
const RADIX: u64 = 36;

pub fn apply(card: &DraftCard, sources: &Sources) -> AssistantResult<AssistantChange> {
    let script = require_script(card, sources)?;
    let stored = script.units.iter().find(|unit| unit.id == card.unit_id);
    require_unit(card, stored, sources)?;
    let current: &[ScriptBlock] = stored
        .and_then(|unit| unit.blocks.as_deref())
        .unwrap_or_default();
    if base_rev(current, &script.extra_cast) != card.base_rev {
        return Err(AssistantError::conflict(
            "the unit changed since the draft; ask the assistant to draft it again",
        ));
    }
    let members = new_members(&card.extra_cast, &script.extra_cast);
    let (blocks, seq) = materialize(card, &members, &script, current)?;
    let unit = unit_of(stored, &card.unit_id, blocks);
    save(card, &script, &members, unit, seq, sources)?;
    Ok(change_of(card))
}

fn require_script(card: &DraftCard, sources: &Sources) -> AssistantResult<Script> {
    sources
        .scripts
        .script(card.project_id)
        .map_err(AssistantError::storage)?
        .ok_or_else(|| AssistantError::not_found("the project has no script yet"))
}

fn require_unit(
    card: &DraftCard,
    stored: Option<&ScriptUnit>,
    sources: &Sources,
) -> AssistantResult<()> {
    if stored.is_some() {
        return Ok(());
    }
    let chapters = sources
        .scripts
        .chapters(card.project_id)
        .map_err(AssistantError::storage)?;
    if chapters.iter().any(|chapter| chapter.id == card.unit_id) {
        return Ok(());
    }
    Err(AssistantError::not_found(format!(
        "unit {} no longer exists in the project",
        card.unit_id
    )))
}

fn new_members(drafted: &[DraftMember], stored: &[CastMember]) -> Vec<(String, CastMember)> {
    let mut taken: HashSet<String> = stored.iter().map(|member| member.id.clone()).collect();
    let stamp = radix(Utc::now().timestamp_millis().unsigned_abs());
    let mut members = Vec::new();
    for (offset, member) in drafted.iter().enumerate() {
        let mut id = format!("{MEMBER_PREFIX}{stamp}");
        while taken.contains(&id) {
            id.push('x');
        }
        taken.insert(id.clone());
        members.push((
            member.id.clone(),
            CastMember {
                id,
                name: member.name.clone(),
                kind: EXTRA_KIND.to_string(),
                c: (stored.len() + offset) as i64,
            },
        ));
    }
    members
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

fn materialize(
    card: &DraftCard,
    members: &[(String, CastMember)],
    script: &Script,
    current: &[ScriptBlock],
) -> AssistantResult<(Vec<ScriptBlock>, i64)> {
    let renames: HashMap<&str, &str> = members
        .iter()
        .map(|(reference, member)| (reference.as_str(), member.id.as_str()))
        .collect();
    let mut taken: HashSet<String> = current.iter().map(|block| block.id.clone()).collect();
    let mut seq = script.seq;
    let mut blocks = Vec::with_capacity(card.blocks.len());
    for block in &card.blocks {
        let id = block_id(block, current, &mut taken, &mut seq)?;
        blocks.push(renamed(block, id, &renames));
    }
    Ok((blocks, seq))
}

fn block_id(
    block: &DraftBlock,
    current: &[ScriptBlock],
    taken: &mut HashSet<String>,
    seq: &mut i64,
) -> AssistantResult<String> {
    if let Some(kept) = &block.id {
        return require_kept(kept, current);
    }
    loop {
        *seq += 1;
        let id = format!("{BLOCK_PREFIX}{seq}");
        if taken.insert(id.clone()) {
            return Ok(id);
        }
    }
}

fn require_kept(kept: &str, current: &[ScriptBlock]) -> AssistantResult<String> {
    if current.iter().any(|block| block.id == kept) {
        return Ok(kept.to_string());
    }
    Err(AssistantError::conflict(format!(
        "block {kept} no longer exists in the unit"
    )))
}

fn renamed(block: &DraftBlock, id: String, renames: &HashMap<&str, &str>) -> ScriptBlock {
    let mut script = block.to_script(id);
    script.who = renamed_id(&script.who, renames);
    script.chars = script
        .chars
        .iter()
        .map(|item| renamed_id(item, renames))
        .collect();
    script
}

fn renamed_id(id: &str, renames: &HashMap<&str, &str>) -> String {
    renames
        .get(id)
        .map_or_else(|| id.to_string(), |new| (*new).to_string())
}

fn unit_of(stored: Option<&ScriptUnit>, unit_id: &str, blocks: Vec<ScriptBlock>) -> ScriptUnit {
    let updated = Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true);
    match stored {
        Some(unit) => ScriptUnit {
            blocks: Some(blocks),
            meta: None,
            updated,
            ..unit.clone()
        },
        None => ScriptUnit {
            id: unit_id.to_string(),
            chapter_id: Some(unit_id.to_string()),
            blocks: Some(blocks),
            updated,
            ..ScriptUnit::default()
        },
    }
}

fn save(
    card: &DraftCard,
    script: &Script,
    members: &[(String, CastMember)],
    unit: ScriptUnit,
    seq: i64,
    sources: &Sources,
) -> AssistantResult<()> {
    if !members.is_empty() {
        let extra_cast: Vec<CastMember> = script
            .extra_cast
            .iter()
            .cloned()
            .chain(members.iter().map(|(_, member)| member.clone()))
            .collect();
        sources
            .scripts
            .cast_save(card.project_id, extra_cast)
            .map_err(AssistantError::storage)?;
    }
    sources
        .scripts
        .unit_save(card.project_id, unit, seq)
        .map_err(AssistantError::storage)
}

fn change_of(card: &DraftCard) -> AssistantChange {
    AssistantChange {
        target: ChangeTarget::Script,
        novel_id: None,
        project_id: Some(card.project_id),
        chapter_id: Some(card.unit_id.clone()),
        lang: None,
        translation_target: None,
    }
}

#[cfg(test)]
#[path = "../../../../test/features/assistant/drafts/apply.test.rs"]
mod tests;
