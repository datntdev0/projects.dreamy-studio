use crate::features::assistant::drafts::MAX_BLOCKS;
use crate::features::assistant::drafts::Rules;
use crate::features::assistant::drafts::outdated_audio;
use crate::features::assistant::drafts::ref_chapters;
use crate::features::assistant::drafts::rewritten_unit;
use crate::features::assistant::edits::ensure_editable;
use crate::features::assistant::models::AssistantChange;
use crate::features::assistant::models::ChangeTarget;
use crate::features::assistant::sources::Sources;
use crate::features::assistant::tools::ToolContext;
use crate::features::assistant::tools::ToolOutput;
use crate::features::assistant::tools::args::array_of;
use crate::features::assistant::tools::args::output;
use crate::features::assistant::tools::args::required_str;
use crate::features::assistant::tools::draft::allowed_types;
use crate::features::assistant::tools::draft::block_schema;
use crate::features::assistant::tools::project::project_id_property;
use crate::features::assistant::tools::project::project_of;
use crate::features::assistant::tools::script::cast_members;
use crate::features::assistant::tools::script::paragraph_counts;
use crate::features::assistant::tools::script::require_script;
use crate::features::assistant::tools::script::require_unit;
use crate::features::assistant::tools::script::unit_blocks;
use serde_json::Value;
use serde_json::json;

mod ops;

pub(super) fn definitions() -> Vec<Value> {
    vec![json!({
        "name": "edit_script_unit",
        "description": "Make small, precise changes to the blocks of one script unit that already has blocks; use submit_script_draft to rewrite a whole unit instead. `ops` run in order and are all checked first: if one fails, nothing is written. Every op has a `k`: set {id, expected, type?, text?, who?, paren?, ms?, loc?, time?, beat?} changes the given fields of a block; insert {after, ref?, block} adds a block after the block id `after` (null puts it first) and `ref` is a temporary name that later ops of the same call may use as an id and that comes back in `remap` with the real id; delete {id, expected} removes a block; move {id, after} moves a block after the block id `after` (null moves it first). For set and delete `expected` must be the exact current text of the block as read_script_unit returned it (an empty string for blocks without text). Blocks follow the same rules as in submit_script_draft: allowed types are the `cfg.types` of read_script, `who` must be a cast id and only matters for dialogue, refs are checked against the source paragraphs. Changing text, speaker or parenthetical of a block makes its generated audio outdated; the result reports how many audio segments are outdated. Requires editing to be enabled for the session.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "projectId": project_id_property(),
                "unitId": { "type": "string", "description": "Unit id from read_script." },
                "ops": {
                    "type": "array",
                    "minItems": 1,
                    "maxItems": ops::MAX_OPS,
                    "description": "Operations to apply in order.",
                    "items": {
                        "type": "object",
                        "properties": {
                            "k": { "type": "string", "enum": ["set", "insert", "delete", "move"], "description": "Operation kind." },
                            "id": { "type": "string", "description": "Block id (set, delete, move), or the ref of a block inserted earlier in this call." },
                            "expected": { "type": "string", "description": "Exact current text of the block (set, delete)." },
                            "after": { "type": ["string", "null"], "description": "Block id to place the block after (insert, move); null puts it first." },
                            "ref": { "type": "string", "description": "Temporary name of an inserted block, not equal to any block id." },
                            "block": block_schema(),
                            "type": { "type": "string", "description": "New block type (set)." },
                            "text": { "type": "string", "description": "New text (set)." },
                            "who": { "type": "string", "description": "New speaker id (set); an empty string clears it." },
                            "paren": { "type": "string", "description": "New parenthetical (set)." },
                            "ms": { "type": "integer", "minimum": 0, "description": "New pause length in milliseconds (set)." },
                            "loc": { "type": "string", "description": "New scene location (set)." },
                            "time": { "type": "string", "description": "New scene time (set)." },
                            "beat": { "type": "string", "description": "New story beat note (set)." }
                        },
                        "required": ["k"]
                    }
                }
            },
            "required": ["projectId", "unitId", "ops"],
            "additionalProperties": false
        }
    })]
}

pub(super) fn edit_script_unit(
    args: &Value,
    ctx: &ToolContext,
    sources: &Sources,
) -> Result<ToolOutput, String> {
    ensure_editable(ctx)?;
    let project = project_of(args, ctx, sources)?;
    let unit_id = required_str(args, "unitId")?;
    let operations = ops::parse(array_of(args, "ops"))?;
    let script = require_script(sources, project.id)?;
    let unit = require_unit(&script, project.id, &unit_id)?;
    let current = unit_blocks(unit);
    if current.is_empty() {
        return Err(format!(
            "unit {unit_id} has no blocks yet; write it with submit_script_draft first"
        ));
    }
    let cast = cast_members(&script, &project, sources)?;
    let chapters = ref_chapters(&ops::inserted_blocks(&operations));
    let counts = paragraph_counts(&project, sources, &chapters)?;
    let rules = Rules {
        allowed: &allowed_types(&script)?,
        cast: &cast,
        paragraphs: counts.as_ref(),
    };
    let edited = ops::run(&operations, current.to_vec(), script.seq, &rules)?;
    let book = sources.audiobooks.book(project.id)?;
    let stale = outdated_audio(book.as_ref(), &unit.id, &edited.blocks);
    let total = edited.blocks.len();
    let saved = rewritten_unit(Some(unit), &unit.id, edited.blocks);
    sources.scripts.unit_save(project.id, saved, edited.seq)?;
    ctx.sink.changed(AssistantChange::in_project(
        ChangeTarget::Script,
        project.id,
        Some(unit.id.clone()),
    ));
    let label = format!(
        "edit_script_unit(project {}, unit {unit_id}) → {} thao tác, {total} khối",
        project.id,
        operations.len()
    );
    let value = json!({
        "projectId": project.id,
        "unitId": unit.id,
        "applied": operations.len(),
        "blocks": total,
        "maxBlocks": MAX_BLOCKS,
        "remap": edited.remap,
        "staleAudio": stale,
        "warnings": edited.warnings,
    });
    Ok(output(value, label))
}
