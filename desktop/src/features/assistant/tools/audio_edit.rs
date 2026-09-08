use crate::features::assistant::edits::ensure_editable;
use crate::features::assistant::models::AssistantChange;
use crate::features::assistant::models::ChangeTarget;
use crate::features::assistant::sources::Sources;
use crate::features::assistant::tools::ToolContext;
use crate::features::assistant::tools::ToolOutput;
use crate::features::assistant::tools::args::optional_number;
use crate::features::assistant::tools::args::output;
use crate::features::assistant::tools::args::required_str;
use crate::features::assistant::tools::project::project_id_property;
use crate::features::assistant::tools::project::project_of;
use crate::features::audiobook::models::MixSettings;
use crate::features::audiobook::rules::record_of;
use serde_json::Value;
use serde_json::json;

const MIX_FIELDS: [&str; 5] = ["gap", "intro", "outro", "vol", "sentence"];
const TOLERANCE: f64 = 1e-9;

pub(super) fn definitions() -> Vec<Value> {
    vec![json!({
        "name": "flag_audio_segment",
        "description": "Flag the generated audio of one block for review with a short note, or clear the flag with an empty `flag`. A flagged segment is treated as needing regeneration. The block must already have generated audio (see read_audiobook).",
        "inputSchema": {
            "type": "object",
            "properties": {
                "projectId": project_id_property(),
                "unitId": { "type": "string", "description": "Unit id from read_script." },
                "blockId": { "type": "string", "description": "Block id from read_audiobook." },
                "flag": { "type": "string", "description": "Short note about the problem; an empty string clears the flag." }
            },
            "required": ["projectId", "unitId", "blockId", "flag"],
            "additionalProperties": false
        }
    })]
}

pub(super) fn edit_audiobook_mix(
    args: &Value,
    ctx: &ToolContext,
    sources: &Sources,
) -> Result<ToolOutput, String> {
    ensure_editable(ctx)?;
    let project = project_of(args, ctx, sources)?;
    let given = MIX_FIELDS
        .iter()
        .map(|field| optional_number(args, field))
        .collect::<Result<Vec<_>, _>>()?;
    if given.iter().all(Option::is_none) {
        return Err(format!("pass at least one of {}", MIX_FIELDS.join(", ")));
    }
    let book = sources.audiobooks.book(project.id)?.unwrap_or_default();
    let current = values_of(&book.mix);
    let wanted: [f64; 5] = std::array::from_fn(|index| given[index].unwrap_or(current[index]));
    let stored = sources.audiobooks.mix_save(project.id, mix_of(wanted))?;
    ctx.sink.changed(AssistantChange::in_project(
        ChangeTarget::Audiobook,
        project.id,
        None,
    ));
    let adjusted: Vec<&str> = MIX_FIELDS
        .iter()
        .zip(wanted)
        .zip(values_of(&stored))
        .filter(|((_, asked), saved)| (asked - saved).abs() > TOLERANCE)
        .map(|((field, _), _)| *field)
        .collect();
    let label = format!("edit_audiobook_mix(project {})", project.id);
    let value = json!({
        "projectId": project.id,
        "mix": stored,
        "adjusted": adjusted,
    });
    Ok(output(value, label))
}

pub(super) fn flag_audio_segment(
    args: &Value,
    ctx: &ToolContext,
    sources: &Sources,
) -> Result<ToolOutput, String> {
    ensure_editable(ctx)?;
    let project = project_of(args, ctx, sources)?;
    let unit_id = required_str(args, "unitId")?;
    let block_id = required_str(args, "blockId")?;
    let flag = required_str(args, "flag")?;
    let book = sources.audiobooks.book(project.id)?.unwrap_or_default();
    if record_of(&book, &unit_id, &block_id).is_none() {
        return Err(format!(
            "block {block_id} of unit {unit_id} has no generated audio yet, so it cannot be flagged"
        ));
    }
    let record = sources
        .audiobooks
        .flag_set(project.id, &unit_id, &block_id, &flag)?;
    ctx.sink.changed(AssistantChange::in_project(
        ChangeTarget::Audiobook,
        project.id,
        Some(unit_id.clone()),
    ));
    let label = format!(
        "flag_audio_segment(project {}, unit {unit_id}, block {block_id})",
        project.id
    );
    let value = json!({
        "projectId": project.id,
        "unitId": unit_id,
        "blockId": block_id,
        "flag": Some(record.flag).filter(|text| !text.is_empty()),
    });
    Ok(output(value, label))
}

fn values_of(mix: &MixSettings) -> [f64; 5] {
    [mix.gap, mix.intro, mix.outro, mix.vol, mix.sentence]
}

fn mix_of(values: [f64; 5]) -> MixSettings {
    let [gap, intro, outro, vol, sentence] = values;
    MixSettings {
        gap,
        intro,
        outro,
        vol,
        sentence,
    }
}
