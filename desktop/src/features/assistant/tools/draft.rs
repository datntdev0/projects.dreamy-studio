use crate::features::assistant::cards;
use crate::features::assistant::drafts;
use crate::features::assistant::drafts::CurrentBlock;
use crate::features::assistant::drafts::DRAFT_KIND;
use crate::features::assistant::drafts::DraftCard;
use crate::features::assistant::drafts::MAX_BLOCKS;
use crate::features::assistant::drafts::Plan;
use crate::features::assistant::drafts::Rules;
use crate::features::assistant::sources::Sources;
use crate::features::assistant::tools::ToolContext;
use crate::features::assistant::tools::ToolOutput;
use crate::features::assistant::tools::args::array_of;
use crate::features::assistant::tools::args::optional_str;
use crate::features::assistant::tools::args::output;
use crate::features::assistant::tools::args::required_str;
use crate::features::assistant::tools::project::project_id_property;
use crate::features::assistant::tools::project::project_of;
use crate::features::assistant::tools::script::UnitTarget;
use crate::features::assistant::tools::script::cast_members;
use crate::features::assistant::tools::script::paragraph_counts;
use crate::features::assistant::tools::script::unit_target;
use crate::features::project::models::ProjectSummary;
use crate::features::scripting::models::CastMember;
use crate::features::scripting::models::Script;
use crate::features::scripting::models::ScriptBlock;
use serde_json::Value;
use serde_json::json;

const WAITING_NOTE: &str = "waiting for the user to confirm on the card";
const BLOCK_TYPES: [&str; 7] = [
    "heading",
    "narration",
    "dialogue",
    "pause",
    "note",
    "scene",
    "action",
];

pub(super) fn definitions() -> Vec<Value> {
    vec![json!({
        "name": "submit_script_draft",
        "description": "Submit a rewrite of ONE script unit as a draft the user reviews on a card and applies or rejects as a whole; nothing is written until then. Read the unit, the cast and the source chapter first. `blocks` replaces every block of the unit, in reading order (at most 400). `type` must be one of the `cfg.types` of read_script; `text` is required except for pause and scene; `who` is a cast id from read_script (or the `ref` of an `extraCast` member) and only matters for dialogue: leave it empty when the speaker is unclear. `extraCast` declares speakers missing from the cast, each with a unique `ref` and a `name`. `refs` are source paragraphs `chapter.paragraph` you checked; wrong ones are removed. A block whose type, text, speaker and parenthetical equal a current block keeps its id and its generated audio. Call it once per unit; a later call replaces the earlier card. Blocks that fail validation come back in `dropped` with the reason: fix them and submit again.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "projectId": project_id_property(),
                "unitId": { "type": "string", "description": "Unit id from read_script (for a chapter without a unit yet, the chapterId)." },
                "summary": { "type": "string", "description": "One or two sentences about what the draft changes, in the user's language." },
                "extraCast": {
                    "type": "array",
                    "description": "New speakers to add to the cast when the draft is applied.",
                    "items": {
                        "type": "object",
                        "properties": {
                            "ref": { "type": "string", "description": "Temporary id used in `who`, unique in this draft and not a cast id." },
                            "name": { "type": "string", "description": "Display name of the speaker." }
                        },
                        "required": ["ref", "name"],
                        "additionalProperties": false
                    }
                },
                "blocks": {
                    "type": "array",
                    "minItems": 1,
                    "maxItems": MAX_BLOCKS,
                    "description": "The new blocks of the unit, in order.",
                    "items": block_schema()
                }
            },
            "required": ["projectId", "unitId", "blocks"],
            "additionalProperties": false
        }
    })]
}

pub(super) fn block_schema() -> Value {
    json!({
        "type": "object",
        "properties": {
            "type": { "type": "string", "enum": BLOCK_TYPES },
            "text": { "type": "string", "description": "Not used by pause and scene blocks." },
            "who": { "type": "string", "description": "Speaker id of a dialogue block." },
            "paren": { "type": "string", "description": "Delivery note of a dialogue block, for example whispering." },
            "ms": { "type": "integer", "minimum": 0, "description": "Pause length in milliseconds, default 800." },
            "loc": { "type": "string", "description": "Location of a scene block." },
            "time": { "type": "string", "description": "Scene time: DAWN, MORNING, NOON, AFTERNOON, SUNSET, NIGHT or CONTINUOUS." },
            "beat": { "type": "string", "description": "Story beat note." },
            "refs": { "type": "array", "items": { "type": "string" }, "description": "Source paragraphs as chapter.paragraph." },
            "chars": { "type": "array", "items": { "type": "string" }, "description": "Cast ids of the characters present." }
        },
        "required": ["type"],
        "additionalProperties": false
    })
}

pub(super) fn submit_script_draft(
    args: &Value,
    ctx: &ToolContext,
    sources: &Sources,
) -> Result<ToolOutput, String> {
    let project = project_of(args, ctx, sources)?;
    let unit_id = required_str(args, "unitId")?;
    let summary = optional_str(args, "summary")?.unwrap_or_default();
    let raw_blocks = array_of(args, "blocks");
    let script = script_of(sources, project.id)?;
    let chapters = sources.scripts.chapters(project.id)?;
    let target = unit_target(&script, &chapters, project.id, &unit_id)?;
    let cast = cast_members(&script, &project, sources)?;
    let members = drafts::parse_members(array_of(args, "extraCast"), &cast)?;
    let counts = paragraph_counts(&project, sources, &drafts::ref_chapters(raw_blocks))?;
    let rules = Rules {
        allowed: &allowed_types(&script)?,
        cast: &cast,
        paragraphs: counts.as_ref(),
    };
    let current = current_blocks(&target);
    let plan = drafts::build(raw_blocks, &members, &rules, current)?;
    let card = card_of(
        &project,
        &unit_id,
        summary.trim(),
        (&script, &target, &cast),
        &plan,
        sources,
    )?;
    let card = drafts::attach(card, ctx.sink)?;
    Ok(result_of(&card, &plan))
}

fn script_of(sources: &Sources, project_id: i64) -> Result<Script, String> {
    sources.scripts.script(project_id)?.ok_or_else(|| {
        format!(
            "project {project_id} has no script yet; ask the user to open the scripting module of the project once so the script is created, then try again"
        )
    })
}

pub(super) fn allowed_types(script: &Script) -> Result<Vec<String>, String> {
    if script.cfg.types.is_empty() {
        return Err("the script configuration allows no block type".to_string());
    }
    Ok(script.cfg.types.clone())
}

fn current_blocks<'a>(target: &UnitTarget<'a>) -> &'a [ScriptBlock] {
    target
        .unit
        .and_then(|unit| unit.blocks.as_deref())
        .unwrap_or_default()
}

fn card_of(
    project: &ProjectSummary,
    unit_id: &str,
    summary: &str,
    context: (&Script, &UnitTarget, &[CastMember]),
    plan: &Plan,
    sources: &Sources,
) -> Result<DraftCard, String> {
    let (script, target, cast) = context;
    let current = current_blocks(target);
    let book = sources.audiobooks.book(project.id)?;
    let stale = drafts::stale_audio(book.as_ref(), unit_id, &plan.blocks);
    Ok(DraftCard {
        kind: DRAFT_KIND.to_string(),
        id: String::new(),
        project_id: project.id,
        title: project.name.clone(),
        unit_id: unit_id.to_string(),
        unit_title: target.title.clone(),
        chapter: target.chapter,
        summary: summary.to_string(),
        base_rev: drafts::base_rev(current, &script.extra_cast),
        current: current
            .iter()
            .take(MAX_BLOCKS)
            .map(CurrentBlock::from)
            .collect(),
        current_truncated: current.len() > MAX_BLOCKS,
        blocks: plan.blocks.clone(),
        extra_cast: plan.members.clone(),
        speakers: drafts::speakers_of(&plan.blocks, cast, &plan.members),
        stats: drafts::stats_of(&plan.blocks, stale),
        unresolved: drafts::unresolved_of(&plan.blocks),
        warnings: plan.warnings.clone(),
        status: cards::PENDING.to_string(),
    })
}

fn result_of(card: &DraftCard, plan: &Plan) -> ToolOutput {
    let dropped: Vec<Value> = plan
        .dropped
        .iter()
        .map(|item| json!({ "index": item.index, "reason": item.reason }))
        .collect();
    let value = json!({
        "cardId": card.id,
        "unitId": card.unit_id,
        "accepted": card.blocks.len(),
        "dropped": dropped,
        "warnings": card.warnings,
        "unresolved": card.unresolved,
        "stats": card.stats,
        "status": cards::PENDING,
        "note": WAITING_NOTE,
    });
    let label = format!(
        "submit_script_draft(project {}, unit {}) → {} khối, chờ xác nhận",
        card.project_id,
        card.unit_id,
        card.blocks.len()
    );
    output(value, label)
}
