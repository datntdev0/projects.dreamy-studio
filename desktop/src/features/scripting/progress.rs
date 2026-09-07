use crate::features::audiobook::models::Audiobook;
use crate::features::audiobook::rules::audiobook_progress;
use crate::features::project::models::ProjectModuleState;
use crate::features::scripting::chapters::ProjectChapter;
use crate::features::scripting::models::Script;
use crate::features::scripting::models::ScriptUnit;
use std::collections::HashMap;

pub const SCRIPTING_MODULE: &str = "scripting";
pub const AUDIOBOOK_MODULE: &str = "audiobook";

pub fn unit_slots<'a>(
    chapters: &[ProjectChapter],
    script: &'a Script,
) -> Vec<Option<&'a ScriptUnit>> {
    let linked: HashMap<&str, &ScriptUnit> = script
        .units
        .iter()
        .filter_map(|unit| unit.chapter_id.as_deref().map(|id| (id, unit)))
        .collect();
    let free = script.units.iter().filter(|unit| unit.chapter_id.is_none());
    chapters
        .iter()
        .map(|chapter| linked.get(chapter.id.as_str()).copied())
        .chain(free.map(Some))
        .collect()
}

pub fn script_progress(chapters: &[ProjectChapter], script: &Script) -> ProjectModuleState {
    let slots = unit_slots(chapters, script);
    let done = slots
        .iter()
        .flatten()
        .filter(|unit| unit.has_content())
        .count();
    let total = slots.len();
    let state = if done == total {
        "done"
    } else if done > 0 {
        "doing"
    } else {
        "idle"
    };
    ProjectModuleState {
        id: SCRIPTING_MODULE.to_string(),
        state: state.to_string(),
        done,
        total,
        note: format!("{done}/{total} {}s", script.cfg.unit),
    }
}

pub fn module_states(
    chapters: &[ProjectChapter],
    script: Option<&Script>,
    book: &Audiobook,
) -> Vec<ProjectModuleState> {
    match script {
        Some(script) => vec![
            script_progress(chapters, script),
            audiobook_progress(book, chapters, script),
        ],
        None => vec![
            ProjectModuleState::idle(SCRIPTING_MODULE, chapters.len()),
            ProjectModuleState::idle(AUDIOBOOK_MODULE, chapters.len()),
        ],
    }
}

#[cfg(test)]
#[path = "../../../test/features/scripting/progress.test.rs"]
mod tests;
