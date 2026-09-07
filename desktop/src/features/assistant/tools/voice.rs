use crate::features::assistant::edits::ensure_editable;
use crate::features::assistant::models::AssistantChange;
use crate::features::assistant::models::ChangeTarget;
use crate::features::assistant::sources::Sources;
use crate::features::assistant::tools::ToolContext;
use crate::features::assistant::tools::ToolOutput;
use crate::features::assistant::tools::args::array_of;
use crate::features::assistant::tools::args::output;
use crate::features::assistant::tools::project::project_id_property;
use crate::features::assistant::tools::project::project_of;
use crate::features::assistant::tools::script::cast_members;
use crate::features::assistant::tools::script::require_script;
use crate::features::audiobook::audio::require_speed;
use crate::features::audiobook::models::Audiobook;
use crate::features::audiobook::models::AudiobookConfig;
use crate::features::audiobook::models::SpeakerVoice;
use crate::features::audiobook::rules::SegmentState;
use crate::features::audiobook::rules::segment_state;
use crate::features::audiobook::rules::voiced_blocks;
use crate::features::library::models::LibraryVoice;
use crate::features::scripting::models::CastMember;
use crate::features::scripting::models::Script;
use serde::Deserialize;
use serde::Deserializer;
use serde_json::Value;
use serde_json::json;
use std::collections::BTreeMap;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Entry {
    speaker: String,
    #[serde(default, deserialize_with = "present")]
    voice: Option<Option<i64>>,
    speed: Option<f64>,
}

fn present<'de, D: Deserializer<'de>>(deserializer: D) -> Result<Option<Option<i64>>, D::Error> {
    Option::<i64>::deserialize(deserializer).map(Some)
}

pub(super) fn definitions() -> Vec<Value> {
    vec![
        json!({
            "name": "list_voice",
            "description": "List the voices of the voice library that an audiobook can use: id, name, description, gender, language, engine, engine kind (local or cloud) and source. It does not tell whether the engine is installed or configured on this computer; the app shows that to the user. Use these ids with edit_audiobook_voices and never invent one.",
            "inputSchema": {
                "type": "object",
                "properties": {},
                "additionalProperties": false
            }
        }),
        json!({
            "name": "edit_audiobook_voices",
            "description": "Choose the voice and the speed of speakers of a project audiobook. `speaker` is a cast id from read_script, `voice` a voice id from list_voice (null removes the voice of that speaker) and `speed` a number between 0.5 and 2 (1 is natural). Pass `voice`, `speed` or both for each speaker; what you leave out is kept. Speakers you do not list are unchanged, and if any entry is invalid nothing is written. Changing a voice or speed makes the generated audio of that speaker outdated; the result reports how many audio segments became outdated. Requires editing to be enabled for the session.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "projectId": project_id_property(),
                    "voices": {
                        "type": "array",
                        "minItems": 1,
                        "description": "Settings per speaker.",
                        "items": {
                            "type": "object",
                            "properties": {
                                "speaker": { "type": "string", "description": "Cast id from read_script." },
                                "voice": { "type": ["integer", "null"], "description": "Voice id from list_voice, or null to remove the voice." },
                                "speed": { "type": "number", "minimum": 0.5, "maximum": 2, "description": "Speaking speed, 1 is natural." }
                            },
                            "required": ["speaker"],
                            "additionalProperties": false
                        }
                    }
                },
                "required": ["projectId", "voices"],
                "additionalProperties": false
            }
        }),
    ]
}

pub(super) fn list_voice(sources: &Sources) -> Result<ToolOutput, String> {
    let voices: Vec<Value> = sources.voices.list()?.iter().map(voice_json).collect();
    let label = format!("list_voice() → {} giọng", voices.len());
    Ok(output(Value::Array(voices), label))
}

pub(super) fn edit_audiobook_voices(
    args: &Value,
    ctx: &ToolContext,
    sources: &Sources,
) -> Result<ToolOutput, String> {
    ensure_editable(ctx)?;
    let project = project_of(args, ctx, sources)?;
    let entries = parse_entries(array_of(args, "voices"))?;
    let script = require_script(sources, project.id)?;
    let cast = cast_members(&script, &project, sources)?;
    let library = sources.voices.list()?;
    check_entries(&entries, &cast, &library)?;
    let book = sources.audiobooks.book(project.id)?.unwrap_or_default();
    let voices = merged_voices(&book, &entries);
    let outdated = outdated_after(&script, &book, &voices);
    let config = AudiobookConfig {
        voices: voices.clone(),
        mix: book.mix,
    };
    sources.audiobooks.config_save(project.id, config)?;
    ctx.sink.changed(AssistantChange::in_project(
        ChangeTarget::Audiobook,
        project.id,
        None,
    ));
    let label = format!(
        "edit_audiobook_voices(project {}) → {} người nói",
        project.id,
        entries.len()
    );
    let value = json!({
        "projectId": project.id,
        "voices": changed_json(&entries, &voices, &cast, &library),
        "outdatedAudio": outdated,
    });
    Ok(output(value, label))
}

fn parse_entries(raw: &[Value]) -> Result<Vec<Entry>, String> {
    if raw.is_empty() {
        return Err("argument 'voices' must list at least one speaker".to_string());
    }
    let mut entries: Vec<Entry> = Vec::new();
    for (index, value) in raw.iter().enumerate() {
        let entry = parse_entry(value).map_err(|reason| format!("voices[{index}]: {reason}"))?;
        if entries.iter().any(|known| known.speaker == entry.speaker) {
            return Err(format!(
                "voices[{index}]: speaker '{}' is listed twice",
                entry.speaker
            ));
        }
        entries.push(entry);
    }
    Ok(entries)
}

fn parse_entry(value: &Value) -> Result<Entry, String> {
    let mut entry: Entry =
        serde_json::from_value(value.clone()).map_err(|error| error.to_string())?;
    entry.speaker = entry.speaker.trim().to_string();
    if entry.speaker.is_empty() {
        return Err("`speaker` must not be empty".to_string());
    }
    if entry.voice.is_none() && entry.speed.is_none() {
        return Err(format!(
            "pass a `voice` or a `speed` for speaker '{}'",
            entry.speaker
        ));
    }
    if let Some(speed) = entry.speed {
        require_speed(speed).map_err(|error| error.to_string())?;
    }
    Ok(entry)
}

fn check_entries(
    entries: &[Entry],
    cast: &[CastMember],
    library: &[LibraryVoice],
) -> Result<(), String> {
    for entry in entries {
        if !cast.iter().any(|member| member.id == entry.speaker) {
            return Err(format!(
                "speaker '{}' is not in the cast of the script; use an id from read_script",
                entry.speaker
            ));
        }
        if let Some(Some(voice)) = entry.voice
            && !library.iter().any(|item| item.id == voice)
        {
            return Err(format!(
                "voice {voice} is not in the voice library; use an id from list_voice"
            ));
        }
    }
    Ok(())
}

fn merged_voices(book: &Audiobook, entries: &[Entry]) -> BTreeMap<String, SpeakerVoice> {
    let mut voices = book.voices.clone();
    for entry in entries {
        let current = voices.get(&entry.speaker).cloned().unwrap_or_default();
        let updated = SpeakerVoice {
            voice: entry.voice.unwrap_or(current.voice),
            speed: entry.speed.unwrap_or(current.speed),
        };
        voices.insert(entry.speaker.clone(), updated);
    }
    voices
}

fn outdated_after(
    script: &Script,
    book: &Audiobook,
    voices: &BTreeMap<String, SpeakerVoice>,
) -> usize {
    let after = Audiobook {
        voices: voices.clone(),
        ..book.clone()
    };
    script
        .units
        .iter()
        .flat_map(|unit| voiced_blocks(unit).map(move |block| (unit, block)))
        .filter(|(unit, block)| {
            segment_state(book, &unit.id, block) == SegmentState::Done
                && segment_state(&after, &unit.id, block) == SegmentState::Stale
        })
        .count()
}

fn changed_json(
    entries: &[Entry],
    voices: &BTreeMap<String, SpeakerVoice>,
    cast: &[CastMember],
    library: &[LibraryVoice],
) -> Vec<Value> {
    entries
        .iter()
        .map(|entry| {
            let stored = voices.get(&entry.speaker).cloned().unwrap_or_default();
            json!({
                "speaker": entry.speaker,
                "name": cast.iter().find(|member| member.id == entry.speaker).map(|member| &member.name),
                "voice": stored.voice,
                "voiceName": library.iter().find(|item| Some(item.id) == stored.voice).map(|item| &item.name),
                "speed": stored.speed,
            })
        })
        .collect()
}

fn voice_json(voice: &LibraryVoice) -> Value {
    json!({
        "voiceId": voice.id,
        "name": voice.name,
        "description": voice.description,
        "gender": voice.gender.as_str(),
        "language": voice.language,
        "engine": voice.engine,
        "engineKind": voice.engine_kind.as_str(),
        "source": voice.source.as_str(),
    })
}
