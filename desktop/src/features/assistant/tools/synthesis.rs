use crate::features::assistant::runs::RunItem;
use crate::features::assistant::runs::RunJob;
use crate::features::assistant::runs::RunOwner;
use crate::features::assistant::runs::RunPlan;
use crate::features::assistant::runs::RunSkip;
use crate::features::assistant::sources::Sources;
use crate::features::assistant::tools::ToolContext;
use crate::features::assistant::tools::ToolOutput;
use crate::features::assistant::tools::args::optional_str;
use crate::features::assistant::tools::args::required_strings;
use crate::features::assistant::tools::project::project_of;
use crate::features::assistant::tools::run::MAX_RUN_CHAPTERS;
use crate::features::assistant::tools::run::submit_plan;
use crate::features::assistant::tools::script::cast_members;
use crate::features::assistant::tools::script::require_script;
use crate::features::assistant::tools::script::require_unit;
use crate::features::assistant::tools::script::unit_seq;
use crate::features::assistant::tools::script::unit_title;
use crate::features::audiobook::models::Audiobook;
use crate::features::audiobook::rules::DIALOGUE_TYPE;
use crate::features::audiobook::rules::SegmentState;
use crate::features::audiobook::rules::segment_state;
use crate::features::audiobook::rules::speaker_of;
use crate::features::audiobook::rules::voiced_blocks;
use crate::features::scripting::chapters::ProjectChapter;
use crate::features::scripting::models::CastMember;
use crate::features::scripting::models::ScriptBlock;
use crate::features::scripting::models::ScriptUnit;
use serde_json::Map;
use serde_json::Value;
use serde_json::json;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Mode {
    Missing,
    All,
}

impl Mode {
    fn parse(raw: Option<String>) -> Result<Self, String> {
        match raw.as_deref() {
            None | Some("missing") => Ok(Self::Missing),
            Some("all") => Ok(Self::All),
            Some(other) => Err(format!("unsupported mode '{other}'; use missing or all")),
        }
    }

    fn as_str(self) -> &'static str {
        match self {
            Self::Missing => "missing",
            Self::All => "all",
        }
    }

    fn takes(self, state: SegmentState) -> bool {
        match self {
            Self::Missing => state != SegmentState::Done,
            Self::All => true,
        }
    }
}

type Picked<'a> = Vec<(&'a ScriptBlock, SegmentState)>;

struct Selection<'a> {
    items: Vec<RunItem>,
    skipped: Vec<RunSkip>,
    blocks: Vec<&'a ScriptBlock>,
    regenerated: usize,
}

pub(super) fn properties() -> Map<String, Value> {
    json!({
        "projectId": { "type": "integer", "description": "Synthesis: project id from read_project." },
        "units": {
            "type": "array",
            "minItems": 1,
            "maxItems": MAX_RUN_CHAPTERS,
            "items": { "type": "string" },
            "description": "Synthesis: unit ids from read_script. Pick only the units the user asked for."
        },
        "mode": {
            "type": "string",
            "enum": ["missing", "all"],
            "description": "Synthesis: which blocks to generate, default missing."
        }
    })
    .as_object()
    .cloned()
    .unwrap_or_default()
}

pub(super) fn start_synthesis(
    args: &Value,
    ctx: &ToolContext,
    sources: &Sources,
) -> Result<ToolOutput, String> {
    let project = project_of(args, ctx, sources)?;
    let unit_ids = required_strings(args, "units")?;
    if unit_ids.len() > MAX_RUN_CHAPTERS {
        return Err(format!(
            "select at most {MAX_RUN_CHAPTERS} units for one run"
        ));
    }
    let mode = Mode::parse(optional_str(args, "mode")?)?;
    let script = require_script(sources, project.id)?;
    let units = unit_ids
        .iter()
        .map(|id| require_unit(&script, project.id, id))
        .collect::<Result<Vec<_>, _>>()?;
    let chapters = sources.scripts.chapters(project.id)?;
    let book = sources.audiobooks.book(project.id)?.unwrap_or_default();
    let selection = select_units(&book, &units, &chapters, mode);
    if !selection.items.is_empty() {
        let cast = cast_members(&script, &project, sources)?;
        require_voices(&selection.blocks, &book, &cast)?;
    }
    let call = format!("start_synthesis(project {}, {})", project.id, mode.as_str());
    let plan = RunPlan {
        job: RunJob::Synthesis,
        owner: RunOwner::project(project.id),
        title: project.name.clone(),
        target: None,
        mode: Some(mode.as_str().to_string()),
        overwrite: mode == Mode::All,
        warnings: regeneration_warnings(selection.regenerated),
        items: selection.items,
        skipped: selection.skipped,
    };
    submit_plan(plan, &call, ctx)
}

fn select_units<'a>(
    book: &Audiobook,
    units: &[&'a ScriptUnit],
    chapters: &[ProjectChapter],
    mode: Mode,
) -> Selection<'a> {
    let mut selection = Selection {
        items: Vec::new(),
        skipped: Vec::new(),
        blocks: Vec::new(),
        regenerated: 0,
    };
    for unit in units {
        let picked = picked_blocks(book, unit, mode);
        if picked.is_empty() {
            selection.skipped.push(skipped_unit(unit, chapters));
            continue;
        }
        selection.regenerated += count_state(&picked, SegmentState::Done);
        selection
            .blocks
            .extend(picked.iter().map(|(block, _)| *block));
        selection.items.push(run_item(unit, chapters, &picked));
    }
    selection
}

fn picked_blocks<'a>(book: &Audiobook, unit: &'a ScriptUnit, mode: Mode) -> Picked<'a> {
    voiced_blocks(unit)
        .map(|block| (block, segment_state(book, &unit.id, block)))
        .filter(|(_, state)| mode.takes(*state))
        .collect()
}

fn count_state(picked: &Picked, wanted: SegmentState) -> usize {
    picked.iter().filter(|(_, state)| *state == wanted).count()
}

fn run_item(unit: &ScriptUnit, chapters: &[ProjectChapter], picked: &Picked) -> RunItem {
    RunItem {
        id: unit.id.clone(),
        seq: unit_seq(unit, chapters),
        title: unit_title(unit, chapters),
        tasks: picked.len(),
        note: breakdown(picked),
        block_ids: Some(picked.iter().map(|(block, _)| block.id.clone()).collect()),
    }
}

fn breakdown(picked: &Picked) -> Option<String> {
    let outdated =
        count_state(picked, SegmentState::Stale) + count_state(picked, SegmentState::Flag);
    let parts: Vec<String> = [
        (count_state(picked, SegmentState::None), "new"),
        (outdated, "outdated"),
        (
            count_state(picked, SegmentState::Done),
            "up to date, generated again",
        ),
    ]
    .into_iter()
    .filter(|(count, _)| *count > 0)
    .map(|(count, label)| format!("{count} {label}"))
    .collect();
    (!parts.is_empty()).then(|| parts.join(", "))
}

fn skipped_unit(unit: &ScriptUnit, chapters: &[ProjectChapter]) -> RunSkip {
    RunSkip {
        id: unit.id.clone(),
        seq: unit_seq(unit, chapters),
        title: unit_title(unit, chapters),
        reason: skip_reason(unit).to_string(),
    }
}

fn skip_reason(unit: &ScriptUnit) -> &'static str {
    if voiced_blocks(unit).next().is_none() {
        "the unit has no voiced blocks"
    } else {
        "every voiced block already has up-to-date audio"
    }
}

fn regeneration_warnings(regenerated: usize) -> Vec<String> {
    if regenerated == 0 {
        return Vec::new();
    }
    vec![format!(
        "{regenerated} block(s) with up-to-date audio will be generated again"
    )]
}

fn require_voices(
    blocks: &[&ScriptBlock],
    book: &Audiobook,
    cast: &[CastMember],
) -> Result<(), String> {
    let mut silent: Vec<&str> = Vec::new();
    let mut lost = 0;
    for block in blocks {
        match speaker_of(block) {
            Some(id) if is_listed(block, id, cast) => {
                if book.voicing(Some(id)).voice.is_none() && !silent.contains(&id) {
                    silent.push(id);
                }
            }
            _ => lost += 1,
        }
    }
    let mut problems = Vec::new();
    if !silent.is_empty() {
        let names: Vec<String> = silent.iter().map(|id| speaker_label(id, cast)).collect();
        problems.push(format!("no voice is assigned to {}", names.join(", ")));
    }
    if lost > 0 {
        problems.push(format!(
            "{lost} dialogue block(s) have no speaker from the cast"
        ));
    }
    if problems.is_empty() {
        return Ok(());
    }
    Err(format!(
        "cannot generate audio yet: {}. Ask the user to assign the voices in the audiobook module, then try again.",
        problems.join("; ")
    ))
}

fn is_listed(block: &ScriptBlock, speaker: &str, cast: &[CastMember]) -> bool {
    block.kind != DIALOGUE_TYPE || cast.iter().any(|member| member.id == speaker)
}

fn speaker_label(id: &str, cast: &[CastMember]) -> String {
    match cast.iter().find(|member| member.id == id) {
        Some(member) => format!("{} ({id})", member.name),
        None => id.to_string(),
    }
}
