use crate::features::audiobook::models::Audiobook;
use crate::features::audiobook::rules::audiobook_progress;
use crate::features::project::models::ProjectModuleState;
use crate::features::project::models::ProjectSummary;
use crate::features::scripting::models::Script;

pub const SCRIPTING_MODULE: &str = "scripting";
pub const AUDIOBOOK_MODULE: &str = "audiobook";

pub fn script_progress(script: &Script) -> ProjectModuleState {
    let done = script
        .units
        .iter()
        .filter(|unit| unit.has_content())
        .count();
    let total = script.units.len();
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
    project: &ProjectSummary,
    script: Option<&Script>,
    book: &Audiobook,
) -> Vec<ProjectModuleState> {
    match script {
        Some(script) => vec![script_progress(script), audiobook_progress(book, script)],
        None => vec![
            ProjectModuleState::idle(SCRIPTING_MODULE, range_len(project)),
            ProjectModuleState::idle(AUDIOBOOK_MODULE, 0),
        ],
    }
}

fn range_len(project: &ProjectSummary) -> usize {
    match (project.range_from, project.range_to) {
        (Some(from), Some(to)) if to >= from => usize::try_from(to - from + 1).unwrap_or(0),
        _ => 0,
    }
}

#[cfg(test)]
#[path = "../../../test/features/scripting/progress.test.rs"]
mod tests;
