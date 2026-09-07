use crate::features::audiobook::models::AudioRecord;
use crate::features::audiobook::models::Audiobook;
use crate::features::project::models::ProjectModuleState;
use crate::features::scripting::chapters::ProjectChapter;
use crate::features::scripting::models::Script;
use crate::features::scripting::models::ScriptBlock;
use crate::features::scripting::models::ScriptUnit;
use crate::features::scripting::progress::AUDIOBOOK_MODULE;
use crate::features::scripting::progress::unit_slots;

pub const NARRATOR_ID: &str = "narr";
pub const PAUSE_TYPE: &str = "pause";
const DIALOGUE_TYPE: &str = "dialogue";
const VOICED_TYPES: [&str; 3] = ["heading", "narration", DIALOGUE_TYPE];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SegmentState {
    None,
    Done,
    Stale,
    Flag,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum UnitState {
    None,
    Doing,
    Stale,
    Done,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct UnitStat {
    pub total: usize,
    pub done: usize,
    pub stale: usize,
    pub none: usize,
    pub dur: f64,
    pub state: UnitState,
}

pub fn is_voiced(block: &ScriptBlock) -> bool {
    VOICED_TYPES.contains(&block.kind.as_str()) && !block.text.trim().is_empty()
}

pub fn voiced_blocks(unit: &ScriptUnit) -> impl Iterator<Item = &ScriptBlock> {
    unit.blocks
        .iter()
        .flatten()
        .filter(|block| is_voiced(block))
}

pub fn speaker_of(block: &ScriptBlock) -> Option<&str> {
    if block.kind == DIALOGUE_TYPE {
        return (!block.who.is_empty()).then_some(block.who.as_str());
    }
    Some(NARRATOR_ID)
}

pub fn record_of<'a>(
    book: &'a Audiobook,
    unit_id: &str,
    block_id: &str,
) -> Option<&'a AudioRecord> {
    book.unit(unit_id).and_then(|unit| unit.audio.get(block_id))
}

pub fn is_current(book: &Audiobook, block: &ScriptBlock, record: &AudioRecord) -> bool {
    let speaker = speaker_of(block);
    let voicing = book.voicing(speaker);
    record.text == block.text
        && record.speaker.as_deref() == speaker
        && record.voice == voicing.voice
        && record.speed == voicing.speed
        && record.paren == block.paren
}

pub fn segment_state(book: &Audiobook, unit_id: &str, block: &ScriptBlock) -> SegmentState {
    match record_of(book, unit_id, &block.id) {
        None => SegmentState::None,
        Some(record) if !record.flag.is_empty() => SegmentState::Flag,
        Some(record) if is_current(book, block, record) => SegmentState::Done,
        Some(_) => SegmentState::Stale,
    }
}

pub fn unit_stat(book: &Audiobook, unit: &ScriptUnit) -> UnitStat {
    let mut stat = UnitStat {
        total: 0,
        done: 0,
        stale: 0,
        none: 0,
        dur: 0.0,
        state: UnitState::None,
    };
    for block in voiced_blocks(unit) {
        stat.total += 1;
        match segment_state(book, &unit.id, block) {
            SegmentState::None => stat.none += 1,
            SegmentState::Done => stat.done += 1,
            SegmentState::Stale | SegmentState::Flag => stat.stale += 1,
        }
        stat.dur += record_of(book, &unit.id, &block.id).map_or(0.0, |record| record.dur);
    }
    stat.state = unit_state_of(&stat);
    stat
}

fn unit_state_of(stat: &UnitStat) -> UnitState {
    if stat.total == 0 || (stat.done == 0 && stat.stale == 0) {
        UnitState::None
    } else if stat.done == stat.total {
        UnitState::Done
    } else if stat.stale > 0 {
        UnitState::Stale
    } else {
        UnitState::Doing
    }
}

fn count_state(states: &[UnitState], wanted: UnitState) -> usize {
    states.iter().filter(|state| **state == wanted).count()
}

pub fn audiobook_progress(
    book: &Audiobook,
    chapters: &[ProjectChapter],
    script: &Script,
) -> ProjectModuleState {
    let states: Vec<UnitState> = unit_slots(chapters, script)
        .into_iter()
        .map(|slot| slot.map_or(UnitState::None, |unit| unit_stat(book, unit).state))
        .collect();
    let done = count_state(&states, UnitState::Done);
    let stale = count_state(&states, UnitState::Stale);
    let total = states.len();
    let state = if stale > 0 {
        "stale"
    } else if total > 0 && done == total {
        "done"
    } else if states.iter().any(|state| *state != UnitState::None) {
        "doing"
    } else {
        "idle"
    };
    let review = if stale > 0 {
        format!(" · {stale} need review")
    } else {
        String::new()
    };
    ProjectModuleState {
        id: AUDIOBOOK_MODULE.to_string(),
        state: state.to_string(),
        done,
        total,
        note: format!("{done}/{total} {}s{review}", script.cfg.unit),
    }
}

#[cfg(test)]
#[path = "../../../test/features/audiobook/rules.test.rs"]
mod tests;
