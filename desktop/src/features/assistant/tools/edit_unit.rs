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
use crate::features::assistant::tools::edit_cast;
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
        "name": "edit_script",
        "description": "Change the script of one project; make one kind of change per call. BLOCKS: pass `unitId` and `ops` to change a unit that already has blocks in small steps (use submit_script_draft to rewrite a whole unit). `ops` run in order and are all checked first: if one fails, nothing is written. Every op has a `k`: set {id, expected, type?, text?, who?, paren?, ms?, loc?, time?, beat?} changes fields of a block; insert {after, ref?, block} adds a block after the block id `after` (null puts it first), and `ref` is a temporary id that later ops of the call may use and that comes back in `remap` with the real id; delete {id, expected} removes a block; move {id, after} moves a block after the block id `after` (null puts it first). For set and delete `expected` is the exact current text of the block as read_script returned it (an empty string for blocks without text). Blocks follow the rules of submit_script_draft. Changing text, speaker or parenthetical makes the generated audio outdated; the result reports how many segments. CAST: pass `add`, `rename` and/or `remove` to change the extra members of the cast, the speakers the user added by hand (kind `extra`); the narrator and the characters of the novel knowledge cannot be changed. Names must not be empty or equal, ignoring case, to another member, and a member can be removed only when no block names it in `who`. Removals run first, then renames, then additions; if anything is invalid nothing is written.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "projectId": project_id_property(),
                "unitId": { "type": "string", "description": "Unit id from read_script; required with `ops`." },
                "add": edit_cast::add_property(),
                "rename": edit_cast::rename_property(),
                "remove": edit_cast::remove_property(),
                "ops": {
                    "type": "array",
                    "minItems": 1,
                    "maxItems": ops::MAX_OPS,
                    "description": "Block operations to apply in order.",
                    "items": {
                        "type": "object",
                        "properties": {
                            "k": { "type": "string", "enum": ["set", "insert", "delete", "move"], "description": "Operation kind." },
                            "id": { "type": "string", "description": "Block id, or the ref of a block inserted earlier in this call." },
                            "expected": { "type": "string", "description": "Exact current text of the block (set, delete)." },
                            "after": { "type": ["string", "null"], "description": "Block id to place the block after (insert, move); null puts it first." },
                            "ref": { "type": "string", "description": "Temporary id of an inserted block, not equal to any block id." },
                            "block": block_schema(),
                            "type": { "type": "string" },
                            "text": { "type": "string" },
                            "who": { "type": "string", "description": "An empty string clears the speaker." },
                            "paren": { "type": "string" },
                            "ms": { "type": "integer", "minimum": 0 },
                            "loc": { "type": "string" },
                            "time": { "type": "string" },
                            "beat": { "type": "string" }
                        },
                        "required": ["k"]
                    }
                }
            },
            "required": ["projectId"],
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
