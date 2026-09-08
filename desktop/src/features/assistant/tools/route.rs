use crate::features::assistant::tools::args::optional_str;
use crate::features::assistant::tools::args::required_str;
use serde_json::Value;

struct Branch {
    handler: &'static str,
    keys: &'static [&'static str],
    hint: &'static str,
}

const TRANSLATION_EDITS: [Branch; 2] = [
    Branch {
        handler: "edit_translation_passage",
        keys: &["chapter", "p", "expected", "text"],
        hint: "`chapter`, `p`, `expected` and `text` to change a passage",
    },
    Branch {
        handler: "edit_dictionary",
        keys: &["add", "update", "remove"],
        hint: "`add`, `update` or `remove` to change the dictionary",
    },
];

const AUDIOBOOK_EDITS: [Branch; 2] = [
    Branch {
        handler: "edit_audiobook_voices",
        keys: &["voices"],
        hint: "`voices` to change the voice or speed of speakers",
    },
    Branch {
        handler: "edit_audiobook_mix",
        keys: &["gap", "intro", "outro", "vol", "sentence"],
        hint: "`gap`, `intro`, `outro`, `vol` or `sentence` to change the mix",
    },
];

const SCRIPT_EDITS: [Branch; 2] = [
    Branch {
        handler: "edit_script_unit",
        keys: &["ops"],
        hint: "`unitId` and `ops` to change blocks",
    },
    Branch {
        handler: "edit_script_cast",
        keys: &["add", "rename", "remove"],
        hint: "`add`, `rename` or `remove` to change the cast",
    },
];

pub(super) fn handler<'a>(name: &'a str, args: &Value) -> Result<&'a str, String> {
    match name {
        "read_novel" => Ok(when_present(args, "novelId", "read_novel", "list_novel")),
        "read_translation" => translation_reader(args),
        "read_project" => Ok(when_present(
            args,
            "projectId",
            "read_project",
            "list_project",
        )),
        "read_script" => Ok(when_present(
            args,
            "unitId",
            "read_script_unit",
            "read_script",
        )),
        "read_audiobook" => Ok(when_present(
            args,
            "unitId",
            "read_audiobook_unit",
            "read_audiobook",
        )),
        "read_pipeline" => Ok(when_present(
            args,
            "pipelineId",
            "read_pipeline",
            "list_pipeline",
        )),
        "edit_novel" => Ok(when_present(
            args,
            "chapter",
            "edit_novel_chapter",
            "edit_novel",
        )),
        "edit_translation" => one_branch(name, args, &TRANSLATION_EDITS),
        "edit_audiobook" => one_branch(name, args, &AUDIOBOOK_EDITS),
        "edit_script" => one_branch(name, args, &SCRIPT_EDITS),
        "start_run" => run_starter(args),
        other => Ok(other),
    }
}

fn present(args: &Value, key: &str) -> bool {
    args.get(key).is_some_and(|value| !value.is_null())
}

fn when_present(
    args: &Value,
    key: &str,
    with_key: &'static str,
    without_key: &'static str,
) -> &'static str {
    if present(args, key) {
        with_key
    } else {
        without_key
    }
}

fn translation_reader(args: &Value) -> Result<&'static str, String> {
    match optional_str(args, "part")?.as_deref() {
        None | Some("text") => Ok("read_translation"),
        Some("guide") => Ok("read_translation_guide"),
        Some(other) => Err(format!("unsupported part '{other}'; use text or guide")),
    }
}

fn run_starter(args: &Value) -> Result<&'static str, String> {
    match required_str(args, "kind")?.as_str() {
        "translation" => Ok("start_translation"),
        "analysis" => Ok("start_analysis"),
        "synthesis" => Ok("start_synthesis"),
        other => Err(format!(
            "unsupported kind '{other}'; use translation, analysis or synthesis"
        )),
    }
}

fn one_branch(tool: &str, args: &Value, branches: &[Branch]) -> Result<&'static str, String> {
    let hits: Vec<&Branch> = branches
        .iter()
        .filter(|branch| branch.keys.iter().any(|key| present(args, key)))
        .collect();
    match hits.as_slice() {
        [branch] => Ok(branch.handler),
        [] => Err(format!("tool '{tool}' needs {}", hints(branches))),
        _ => Err(format!(
            "tool '{tool}' makes one kind of change per call: {}",
            hints(branches)
        )),
    }
}

fn hints(branches: &[Branch]) -> String {
    branches
        .iter()
        .map(|branch| branch.hint)
        .collect::<Vec<_>>()
        .join(", or ")
}
