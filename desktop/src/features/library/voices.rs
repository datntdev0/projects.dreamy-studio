use crate::features::backend::models::SynthesisRequest;
use crate::features::backend::models::SynthesizedAudio;
use crate::features::backend::service::Synthesizer;
use crate::features::library::assets;
use crate::features::library::models::LibraryError;
use crate::features::library::models::LibraryErrorCode;
use crate::features::library::models::LibraryResult;
use crate::features::library::models::LibraryVoice;
use crate::features::library::models::VoiceEngineKind;
use crate::features::library::models::VoiceGender;
use crate::features::library::models::VoiceInput;
use crate::features::library::models::VoicePatch;
use crate::features::library::models::VoiceReference;
use crate::features::library::models::VoiceSource;
use crate::features::library::sounds;
use crate::features::library::sounds::SoundFormat;
use crate::infra::backend_client::ClientError;
use crate::shared::ffmpeg;
use base64::Engine;
use rusqlite::Connection;
use rusqlite::OptionalExtension;
use rusqlite::params;
use std::fs;
use std::path::Path;
use std::path::PathBuf;

pub const VOICE_NAME_MAX: usize = 255;
pub const SAMPLE_TEXT_MAX: usize = 500;
pub const RECORDING_MAX_MS: i64 = 30_500;
pub const PRESET_ONLY_ENGINES: [&str; 1] = ["edge-read-aloud"];

const ENGINE_UNAVAILABLE_CODES: [&str; 4] = [
    "MODEL_NOT_FOUND",
    "MODEL_NOT_INSTALLED",
    "MODEL_BUSY",
    "ENGINE_UNSUPPORTED",
];
const REFERENCE_FILE: &str = "reference.wav";
const STAGING_PREFIX: &str = ".staging-";
const VOICE_COLUMNS: &str = "id, name, description, engine, engine_kind, source, language, gender, preset, reference_kind, reference_sound_id, reference_name, prompt, sample_text, sample_duration_ms, created_at, updated_at";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ReferenceKind {
    Sound,
    File,
    Recording,
}

impl ReferenceKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Sound => "sound",
            Self::File => "file",
            Self::Recording => "recording",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NewVoice {
    pub name: String,
    pub description: String,
    pub engine: String,
    pub engine_kind: VoiceEngineKind,
    pub source: VoiceSource,
    pub language: String,
    pub gender: VoiceGender,
    pub preset: Option<String>,
    pub prompt: String,
    pub reference_kind: Option<ReferenceKind>,
    pub reference_sound_id: Option<i64>,
    pub reference_name: String,
    pub sample_text: String,
}

#[derive(Debug, Clone)]
pub struct VoiceFiles {
    workspace_dir: PathBuf,
}

impl VoiceFiles {
    pub fn new(workspace_dir: PathBuf) -> Self {
        Self { workspace_dir }
    }

    pub fn reference_path(&self, id: i64) -> PathBuf {
        self.voice_dir(id).join(REFERENCE_FILE)
    }

    pub fn existing_reference(&self, id: i64) -> Option<PathBuf> {
        let path = self.reference_path(id);
        path.is_file().then_some(path)
    }

    pub fn staging_path(&self, suffix: &str) -> LibraryResult<PathBuf> {
        let directory = self.voices_dir();
        fs::create_dir_all(&directory)?;
        Ok(directory.join(format!("{STAGING_PREFIX}{}.{suffix}", uuid::Uuid::new_v4())))
    }

    pub fn copy_reference(&self, from: i64, staged: &Path) -> LibraryResult<()> {
        fs::copy(self.reference_path(from), staged)?;
        Ok(())
    }

    pub fn adopt_reference(&self, id: i64, staged: &Path) -> LibraryResult<()> {
        let directory = self.voice_dir(id);
        fs::create_dir_all(&directory)?;
        fs::rename(staged, self.reference_path(id))?;
        Ok(())
    }

    pub fn remove(&self, id: i64) -> LibraryResult<()> {
        let directory = self.voice_dir(id);
        if directory.exists() {
            fs::remove_dir_all(directory)?;
        }
        Ok(())
    }

    fn voices_dir(&self) -> PathBuf {
        self.workspace_dir.join("library").join("voices")
    }

    fn voice_dir(&self, id: i64) -> PathBuf {
        self.voices_dir().join(id.to_string())
    }
}

pub fn default_sample_text(language: &str) -> &'static str {
    match language {
        "vi" => "Xin chào, đây là giọng đọc mẫu dành cho câu chuyện của bạn.",
        "ja" => "こんにちは、これはあなたの物語のためのサンプル音声です。",
        "zh" => "你好，这是为你的故事准备的示例声音。",
        "ko" => "안녕하세요, 당신의 이야기를 위한 샘플 음성입니다.",
        _ => "Hello, this is a sample voice for your story.",
    }
}

pub fn normalize_name(name: &str) -> LibraryResult<String> {
    let name = name.trim();
    if name.is_empty() || name.chars().count() > VOICE_NAME_MAX {
        return Err(voice_invalid("voice name must contain 1 to 255 characters"));
    }
    Ok(name.to_string())
}

pub fn normalize_sample_text(text: &str) -> LibraryResult<String> {
    let text = text.split_whitespace().collect::<Vec<_>>().join(" ");
    if text.is_empty() || text.chars().count() > SAMPLE_TEXT_MAX {
        return Err(voice_invalid(
            "sample text must contain 1 to 500 characters",
        ));
    }
    Ok(text)
}

pub fn normalize_patch(patch: &VoicePatch) -> LibraryResult<VoicePatch> {
    Ok(VoicePatch {
        sample_text: patch
            .sample_text
            .as_deref()
            .map(normalize_sample_text)
            .transpose()?,
        description: patch
            .description
            .as_deref()
            .map(|text| text.trim().to_string()),
    })
}

pub fn validate_input(input: &VoiceInput) -> LibraryResult<NewVoice> {
    let engine = input.engine.trim();
    if engine.is_empty() {
        return Err(voice_invalid("voice engine is required"));
    }
    if input.source != VoiceSource::Preset && PRESET_ONLY_ENGINES.contains(&engine) {
        return Err(voice_invalid("this engine only supports preset voices"));
    }
    let preset = input
        .preset
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());
    if input.source == VoiceSource::Preset && preset.is_none() {
        return Err(voice_invalid("preset voices need a preset"));
    }
    let prompt = input.prompt.trim();
    if input.source == VoiceSource::Design && prompt.is_empty() {
        return Err(voice_invalid("designed voices need a description"));
    }
    if input.source == VoiceSource::Clone && input.reference.is_none() {
        return Err(reference_invalid("cloned voices need reference audio"));
    }
    Ok(NewVoice {
        name: normalize_name(&input.name)?,
        description: input.description.trim().to_string(),
        engine: engine.to_string(),
        engine_kind: input.engine_kind,
        source: input.source,
        language: input.language.trim().to_string(),
        gender: input.gender,
        preset: (input.source == VoiceSource::Preset)
            .then(|| preset.map(str::to_string))
            .flatten(),
        prompt: if input.source == VoiceSource::Design {
            prompt.to_string()
        } else {
            String::new()
        },
        reference_kind: None,
        reference_sound_id: None,
        reference_name: String::new(),
        sample_text: default_sample_text(input.language.trim()).to_string(),
    })
}

pub fn copy_of(voice: &LibraryVoice, name: &str) -> LibraryResult<NewVoice> {
    let keeps_reference = voice.reference_kind.as_deref() == Some(ReferenceKind::Sound.as_str());
    Ok(NewVoice {
        name: normalize_name(name)?,
        description: voice.description.clone(),
        engine: voice.engine.clone(),
        engine_kind: voice.engine_kind,
        source: voice.source,
        language: voice.language.clone(),
        gender: voice.gender,
        preset: voice.preset.clone(),
        prompt: voice.prompt.clone(),
        reference_kind: keeps_reference.then_some(ReferenceKind::Sound),
        reference_sound_id: if keeps_reference {
            voice.reference_sound_id
        } else {
            None
        },
        reference_name: if keeps_reference {
            voice.reference_name.clone()
        } else {
            String::new()
        },
        sample_text: voice.sample_text.clone(),
    })
}

pub fn reference_kind_of(reference: &VoiceReference) -> ReferenceKind {
    match reference {
        VoiceReference::Sound { .. } => ReferenceKind::Sound,
        VoiceReference::File { .. } => ReferenceKind::File,
        VoiceReference::Recording { .. } => ReferenceKind::Recording,
    }
}

pub fn recording_extension(mime: &str) -> &'static str {
    let essence = mime.split(';').next().unwrap_or_default().trim();
    match essence {
        "audio/ogg" => "ogg",
        "audio/mp4" | "audio/aac" => "m4a",
        "audio/wav" | "audio/wave" | "audio/x-wav" => "wav",
        "audio/mpeg" => "mp3",
        _ => "webm",
    }
}

pub fn decode_recording(data: &str, duration_ms: i64) -> LibraryResult<Vec<u8>> {
    if duration_ms <= 0 || duration_ms > RECORDING_MAX_MS {
        return Err(reference_invalid("recordings must last up to 30 seconds"));
    }
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(data.trim())
        .map_err(|error| reference_invalid(error.to_string()))?;
    if bytes.is_empty() {
        return Err(reference_invalid("recording is empty"));
    }
    Ok(bytes)
}

pub fn upload_extension(path: &Path) -> LibraryResult<&'static str> {
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default();
    SoundFormat::from_extension(extension)
        .map(SoundFormat::extension)
        .ok_or_else(|| reference_invalid("reference audio must be mp3, wav or aac"))
}

pub fn convert_reference(source: &Path, target: &Path) -> LibraryResult<i64> {
    let options = ["-vn", "-ac", "1"].map(str::to_string);
    if let Err(detail) = ffmpeg::run(&ffmpeg::wav_args(source, target, &options)) {
        let _ = fs::remove_file(target);
        return Err(reference_invalid(detail));
    }
    let analysis = sounds::analyze(target, SoundFormat::Wav)
        .map_err(|error| reference_invalid(error.detail))?;
    Ok(analysis.duration_ms)
}

pub fn synthesis_error(error: ClientError) -> LibraryError {
    match error {
        ClientError::Unreachable(detail) => {
            LibraryError::new(LibraryErrorCode::VoiceBackendOffline, detail)
        }
        ClientError::Api { code, message, .. }
            if ENGINE_UNAVAILABLE_CODES.contains(&code.as_str()) =>
        {
            LibraryError::new(LibraryErrorCode::VoiceEngineUnavailable, message)
        }
        ClientError::Api { code, message, .. } => LibraryError::new(
            LibraryErrorCode::VoiceSynthesisFailed,
            format!("{code}: {message}"),
        ),
        ClientError::Invalid(detail) => {
            LibraryError::new(LibraryErrorCode::VoiceSynthesisFailed, detail)
        }
    }
}

pub fn synthesis_request(
    voice: &LibraryVoice,
    reference: Option<&Path>,
    text: &str,
    sentence_pause_ms: i64,
) -> LibraryResult<SynthesisRequest> {
    if voice.engine_kind == VoiceEngineKind::Cloud {
        return Err(LibraryError::new(
            LibraryErrorCode::VoiceEngineUnavailable,
            "cloud voices cannot be previewed yet",
        ));
    }
    Ok(SynthesisRequest {
        model: voice.engine.clone(),
        text: text.to_string(),
        source: voice.source.as_str().to_string(),
        language: voice.language.clone(),
        gender: voice.gender.as_str().to_string(),
        preset: voice.preset.clone().unwrap_or_default(),
        prompt: voice.prompt.clone(),
        reference_path: reference
            .map(|path| path.to_string_lossy().into_owned())
            .unwrap_or_default(),
        sentence_pause_ms,
    })
}

pub fn synthesize(
    synthesizer: &dyn Synthesizer,
    voice: &LibraryVoice,
    reference: Option<&Path>,
    text: &str,
    sentence_pause_ms: i64,
) -> LibraryResult<SynthesizedAudio> {
    let request = synthesis_request(voice, reference, text, sentence_pause_ms)?;
    synthesizer.synthesize(&request).map_err(synthesis_error)
}

pub fn list(conn: &Connection) -> LibraryResult<Vec<LibraryVoice>> {
    let sql =
        format!("SELECT {VOICE_COLUMNS} FROM ws_library_voices ORDER BY created_at DESC, id DESC");
    let mut statement = conn.prepare(&sql)?;
    let rows = statement.query_map([], voice_from_row)?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

pub fn get(conn: &Connection, id: i64) -> LibraryResult<LibraryVoice> {
    let sql = format!("SELECT {VOICE_COLUMNS} FROM ws_library_voices WHERE id = ?1");
    conn.query_row(&sql, [id], voice_from_row)
        .optional()?
        .ok_or_else(|| voice_not_found(id))
}

pub fn insert(conn: &Connection, voice: &NewVoice, now: &str) -> LibraryResult<i64> {
    conn.execute(
        "INSERT INTO ws_library_voices (name, description, engine, engine_kind, source, language, gender, preset, prompt, reference_kind, reference_sound_id, reference_name, sample_text, sample_duration_ms, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, NULL, ?14, ?14)",
        params![
            voice.name,
            voice.description,
            voice.engine,
            voice.engine_kind.as_str(),
            voice.source.as_str(),
            voice.language,
            voice.gender.as_str(),
            voice.preset,
            voice.prompt,
            voice.reference_kind.map(ReferenceKind::as_str),
            voice.reference_sound_id,
            voice.reference_name,
            voice.sample_text,
            now,
        ],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn update(
    conn: &Connection,
    id: i64,
    patch: &VoicePatch,
    now: &str,
) -> LibraryResult<LibraryVoice> {
    let current = get(conn, id)?;
    if let Some(text) = patch.sample_text.as_deref()
        && text != current.sample_text
    {
        conn.execute(
            "UPDATE ws_library_voices SET sample_text = ?1, sample_duration_ms = NULL, updated_at = ?2 WHERE id = ?3",
            params![text, now, id],
        )?;
    }
    if let Some(description) = patch.description.as_deref()
        && description != current.description
    {
        conn.execute(
            "UPDATE ws_library_voices SET description = ?1, updated_at = ?2 WHERE id = ?3",
            params![description, now, id],
        )?;
    }
    get(conn, id)
}

pub fn record_sample_duration(
    conn: &Connection,
    id: i64,
    text: &str,
    duration_ms: i64,
) -> LibraryResult<bool> {
    let changed = conn.execute(
        "UPDATE ws_library_voices SET sample_duration_ms = ?1 WHERE id = ?2 AND sample_text = ?3",
        params![duration_ms, id, text],
    )?;
    Ok(changed > 0)
}

pub fn detach_sounds(conn: &Connection, sound_ids: &[i64]) -> LibraryResult<()> {
    for id in sound_ids {
        conn.execute(
            "UPDATE ws_library_voices SET reference_sound_id = NULL WHERE reference_sound_id = ?1",
            [id],
        )?;
    }
    Ok(())
}

pub fn delete(conn: &Connection, ids: &[i64]) -> LibraryResult<Vec<i64>> {
    let mut removed = Vec::new();
    for id in ids {
        if conn.execute("DELETE FROM ws_library_voices WHERE id = ?1", [id])? > 0 {
            removed.push(*id);
        }
    }
    Ok(removed)
}

pub fn voice_invalid(detail: impl Into<String>) -> LibraryError {
    LibraryError::new(LibraryErrorCode::VoiceInvalid, detail)
}

pub fn reference_invalid(detail: impl Into<String>) -> LibraryError {
    LibraryError::new(LibraryErrorCode::VoiceReferenceInvalid, detail)
}

pub fn voice_not_found(id: i64) -> LibraryError {
    LibraryError::new(
        LibraryErrorCode::VoiceNotFound,
        format!("voice {id} does not exist"),
    )
}

fn invalid_column(index: usize, label: &str, value: &str) -> rusqlite::Error {
    rusqlite::Error::FromSqlConversionFailure(
        index,
        rusqlite::types::Type::Text,
        format!("invalid voice {label}: {value}").into(),
    )
}

fn parse_column<T>(
    row: &rusqlite::Row<'_>,
    index: usize,
    label: &str,
    parse: fn(&str) -> Option<T>,
) -> rusqlite::Result<T> {
    let value = row.get::<_, String>(index)?;
    parse(&value).ok_or_else(|| invalid_column(index, label, &value))
}

fn voice_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<LibraryVoice> {
    Ok(LibraryVoice {
        id: row.get(0)?,
        name: row.get(1)?,
        description: row.get(2)?,
        engine: row.get(3)?,
        engine_kind: parse_column(row, 4, "engine kind", VoiceEngineKind::parse)?,
        source: parse_column(row, 5, "source", VoiceSource::parse)?,
        language: row.get(6)?,
        gender: parse_column(row, 7, "gender", VoiceGender::parse)?,
        preset: row.get(8)?,
        reference_kind: row.get(9)?,
        reference_sound_id: row.get(10)?,
        reference_name: row.get(11)?,
        prompt: row.get(12)?,
        sample_text: row.get(13)?,
        sample_duration_ms: row.get(14)?,
        created_at: row.get(15)?,
        updated_at: row.get(16)?,
    })
}

pub fn remove_staged(path: &Path) {
    let _ = assets::remove_if_exists(path);
}

#[cfg(test)]
#[path = "../../../test/features/library/voices.test.rs"]
mod tests;
