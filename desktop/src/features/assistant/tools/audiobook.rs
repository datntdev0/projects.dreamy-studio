use crate::features::assistant::sources::Sources;
use crate::features::assistant::tools::ToolContext;
use crate::features::assistant::tools::ToolOutput;
use crate::features::assistant::tools::args::optional_int;
use crate::features::assistant::tools::args::output;
use crate::features::assistant::tools::args::required_str;
use crate::features::assistant::tools::paging::next_position;
use crate::features::assistant::tools::project::project_id_property;
use crate::features::assistant::tools::project::project_of;
use crate::features::assistant::tools::script::block_page;
use crate::features::assistant::tools::script::require_script;
use crate::features::assistant::tools::script::require_unit;
use crate::features::assistant::tools::script::unit_blocks;
use crate::features::assistant::tools::script::unit_title;
use crate::features::audiobook::models::Audiobook;
use crate::features::audiobook::rules::SegmentState;
use crate::features::audiobook::rules::UnitState;
use crate::features::audiobook::rules::is_voiced;
use crate::features::audiobook::rules::record_of;
use crate::features::audiobook::rules::segment_state;
use crate::features::audiobook::rules::speaker_of;
use crate::features::audiobook::rules::unit_stat;
use crate::features::scripting::chapters::ProjectChapter;
use crate::features::scripting::models::ScriptBlock;
use crate::features::scripting::models::ScriptUnit;
use serde_json::Value;
use serde_json::json;

pub(super) fn definitions() -> Vec<Value> {
    vec![
        json!({
            "name": "read_audiobook",
            "description": "Read the audiobook settings of one project: the voice and speed chosen for each speaker id, the mix settings (gap, intro, outro, vol, sentence) and, for every script unit, how many voiced blocks have audio that is up to date (`done`), outdated or flagged (`stale`) or missing, with the total duration in seconds and a unit `state` of none, doing, stale or done.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "projectId": project_id_property()
                },
                "required": ["projectId"],
                "additionalProperties": false
            }
        }),
        json!({
            "name": "read_audiobook_unit",
            "description": "Read the audio state of the voiced blocks of one script unit (heading, narration and dialogue blocks with text). Each segment has the block id, the 1-based block position `p`, the speaker, the text, the voice and speed that would be used, a `state` (none, done, stale or flag), the duration in seconds and the flag note. A page covers at most 60 blocks or 12000 characters; when `next` is not null, call again with from set to `next`.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "projectId": project_id_property(),
                    "unitId": { "type": "string", "description": "Unit id from read_script." },
                    "from": { "type": "integer", "minimum": 1, "description": "First block position, default 1." },
                    "to": { "type": "integer", "minimum": 1, "description": "Last block position, default the end of the unit." }
                },
                "required": ["projectId", "unitId"],
                "additionalProperties": false
            }
        }),
    ]
}

pub(super) fn read_audiobook(
    args: &Value,
    ctx: &ToolContext,
    sources: &Sources,
) -> Result<ToolOutput, String> {
    let project = project_of(args, ctx, sources)?;
    let chapters = sources.scripts.chapters(project.id)?;
    let script = sources.scripts.script(project.id)?;
    let book = book_of(sources, project.id)?;
    let units: Vec<Value> = script
        .iter()
        .flat_map(|item| item.units.iter())
        .map(|unit| unit_stat_json(&book, unit, &chapters))
        .collect();
    let label = format!(
        "read_audiobook(project {}) → {} đơn vị",
        project.id,
        units.len()
    );
    let value = json!({
        "projectId": project.id,
        "voices": book.voices,
        "mix": book.mix,
        "units": units,
    });
    Ok(output(value, label))
}

pub(super) fn read_audiobook_unit(
    args: &Value,
    ctx: &ToolContext,
    sources: &Sources,
) -> Result<ToolOutput, String> {
    let project = project_of(args, ctx, sources)?;
    let unit_id = required_str(args, "unitId")?;
    let from = optional_int(args, "from")?;
    let to = optional_int(args, "to")?;
    let chapters = sources.scripts.chapters(project.id)?;
    let script = require_script(sources, project.id)?;
    let unit = require_unit(&script, project.id, &unit_id)?;
    let book = book_of(sources, project.id)?;
    let blocks = unit_blocks(unit);
    let (start, end) = block_page(blocks, from, to);
    let segments: Vec<Value> = blocks[start.saturating_sub(1)..end]
        .iter()
        .enumerate()
        .filter(|(_, block)| is_voiced(block))
        .map(|(offset, block)| segment_json(&book, &unit.id, start + offset, block))
        .collect();
    let label = format!(
        "read_audiobook_unit(project {}, unit {unit_id}, ¶{start}–{end}) → {} đoạn",
        project.id,
        segments.len()
    );
    let value = json!({
        "projectId": project.id,
        "unitId": unit.id,
        "title": unit_title(unit, &chapters),
        "total": blocks.len(),
        "from": start,
        "to": end,
        "segments": segments,
        "next": next_position(end, blocks.len()),
    });
    Ok(output(value, label))
}

fn book_of(sources: &Sources, project_id: i64) -> Result<Audiobook, String> {
    Ok(sources.audiobooks.book(project_id)?.unwrap_or_default())
}

fn unit_stat_json(book: &Audiobook, unit: &ScriptUnit, chapters: &[ProjectChapter]) -> Value {
    let stat = unit_stat(book, unit);
    json!({
        "unitId": unit.id,
        "title": unit_title(unit, chapters),
        "voiced": stat.total,
        "done": stat.done,
        "stale": stat.stale,
        "missing": stat.none,
        "duration": stat.dur,
        "state": unit_state_name(stat.state),
    })
}

fn segment_json(book: &Audiobook, unit_id: &str, position: usize, block: &ScriptBlock) -> Value {
    let speaker = speaker_of(block);
    let voicing = book.voicing(speaker);
    let record = record_of(book, unit_id, &block.id);
    json!({
        "id": block.id,
        "p": position,
        "speaker": speaker,
        "text": block.text,
        "voice": voicing.voice,
        "speed": voicing.speed,
        "state": segment_state_name(segment_state(book, unit_id, block)),
        "duration": record.map(|item| item.dur),
        "flag": record.map(|item| item.flag.as_str()).filter(|flag| !flag.is_empty()),
    })
}

fn unit_state_name(state: UnitState) -> &'static str {
    match state {
        UnitState::None => "none",
        UnitState::Doing => "doing",
        UnitState::Stale => "stale",
        UnitState::Done => "done",
    }
}

fn segment_state_name(state: SegmentState) -> &'static str {
    match state {
        SegmentState::None => "none",
        SegmentState::Done => "done",
        SegmentState::Stale => "stale",
        SegmentState::Flag => "flag",
    }
}
