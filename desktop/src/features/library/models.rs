use crate::infra::storage::StorageError;
use serde::Deserialize;
use serde::Serialize;
use std::fmt;

fn deserialize_optional_collection_id<'de, D>(
    deserializer: D,
) -> Result<Option<Option<i64>>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    Option::<i64>::deserialize(deserializer).map(Some)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum LibraryKind {
    Image,
    Sound,
    Video,
    Prompt,
    Voice,
}

impl LibraryKind {
    pub const ALL: [Self; 5] = [
        Self::Image,
        Self::Sound,
        Self::Video,
        Self::Prompt,
        Self::Voice,
    ];

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Image => "image",
            Self::Sound => "sound",
            Self::Video => "video",
            Self::Prompt => "prompt",
            Self::Voice => "voice",
        }
    }
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
pub struct KindCounts {
    pub image: i64,
    pub sound: i64,
    pub video: i64,
    pub prompt: i64,
    pub voice: i64,
}

impl KindCounts {
    pub fn get_mut(&mut self, kind: LibraryKind) -> &mut i64 {
        match kind {
            LibraryKind::Image => &mut self.image,
            LibraryKind::Sound => &mut self.sound,
            LibraryKind::Video => &mut self.video,
            LibraryKind::Prompt => &mut self.prompt,
            LibraryKind::Voice => &mut self.voice,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryCollection {
    pub id: i64,
    pub name: String,
    pub description: String,
    pub created_at: String,
    pub updated_at: String,
    pub counts: KindCounts,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CollectionInput {
    pub name: String,
    #[serde(default)]
    pub description: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CollectionPatch {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryTag {
    pub tag: String,
    pub counts: KindCounts,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
pub struct LibrarySummary {
    pub assets: KindCounts,
    pub unfiled: KindCounts,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AssetRights {
    Own,
    Licensed,
    Free,
    Other,
}

impl AssetRights {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Own => "own",
            Self::Licensed => "licensed",
            Self::Free => "free",
            Self::Other => "other",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "own" => Some(Self::Own),
            "licensed" => Some(Self::Licensed),
            "free" => Some(Self::Free),
            "other" => Some(Self::Other),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryImage {
    pub id: i64,
    pub name: String,
    pub ext: String,
    pub size: i64,
    pub width: u32,
    pub height: u32,
    pub rights: AssetRights,
    pub origin: String,
    pub collection_id: Option<i64>,
    pub tags: Vec<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetUploadInput {
    pub collection_id: Option<i64>,
    pub tags: Vec<String>,
    pub rights: AssetRights,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetPatch {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub rights: Option<AssetRights>,
    #[serde(default, deserialize_with = "deserialize_optional_collection_id")]
    pub collection_id: Option<Option<i64>>,
    #[serde(default)]
    pub tags: Option<Vec<String>>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetCheck {
    pub path: String,
    pub name: String,
    pub size: i64,
    pub status: AssetCheckStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub code: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum AssetCheckStatus {
    Ok,
    Warn,
    Error,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibrarySound {
    pub id: i64,
    pub name: String,
    pub ext: String,
    pub size: i64,
    pub duration_ms: i64,
    pub sample_rate: u32,
    pub channels: u32,
    pub overview: [u8; 32],
    pub rights: AssetRights,
    pub origin: String,
    pub collection_id: Option<i64>,
    pub tags: Vec<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryVideo {
    pub id: i64,
    pub name: String,
    pub ext: String,
    pub size: i64,
    pub duration_ms: i64,
    pub width: u32,
    pub height: u32,
    pub fps: Option<f64>,
    pub rights: AssetRights,
    pub origin: String,
    pub collection_id: Option<i64>,
    pub tags: Vec<String>,
    pub has_poster: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PromptKind {
    Image,
    Video,
    Voice,
    General,
}

impl PromptKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Image => "image",
            Self::Video => "video",
            Self::Voice => "voice",
            Self::General => "general",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "image" => Some(Self::Image),
            "video" => Some(Self::Video),
            "voice" => Some(Self::Voice),
            "general" => Some(Self::General),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryPrompt {
    pub id: i64,
    pub name: String,
    pub kind: PromptKind,
    pub text: String,
    pub size: i64,
    pub rights: AssetRights,
    pub origin: String,
    pub collection_id: Option<i64>,
    pub tags: Vec<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PromptCreateInput {
    pub name: String,
    pub kind: PromptKind,
    pub text: String,
    #[serde(default)]
    pub collection_id: Option<i64>,
    pub tags: Vec<String>,
    pub rights: AssetRights,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PromptPatch {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub kind: Option<PromptKind>,
    #[serde(default)]
    pub text: Option<String>,
    #[serde(default)]
    pub rights: Option<AssetRights>,
    #[serde(default, deserialize_with = "deserialize_optional_collection_id")]
    pub collection_id: Option<Option<i64>>,
    #[serde(default)]
    pub tags: Option<Vec<String>>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StreamChunk {
    pub mime: String,
    pub total: u64,
    pub start: u64,
    pub end: u64,
    pub bytes: Vec<u8>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StreamKind {
    Sound,
    Video,
}
impl StreamKind {
    pub fn max_chunk(self) -> u64 {
        match self {
            Self::Sound => 2 * 1024 * 1024,
            Self::Video => 8 * 1024 * 1024,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum VoiceSource {
    Preset,
    Clone,
}

impl VoiceSource {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Preset => "preset",
            Self::Clone => "clone",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "preset" => Some(Self::Preset),
            "clone" => Some(Self::Clone),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum VoiceEngineKind {
    Local,
    Cloud,
}

impl VoiceEngineKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Local => "local",
            Self::Cloud => "cloud",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "local" => Some(Self::Local),
            "cloud" => Some(Self::Cloud),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum VoiceGender {
    Female,
    Male,
    Neutral,
}

impl VoiceGender {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Female => "female",
            Self::Male => "male",
            Self::Neutral => "neutral",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "female" => Some(Self::Female),
            "male" => Some(Self::Male),
            "neutral" => Some(Self::Neutral),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum VoiceReference {
    Sound {
        #[serde(rename = "soundId")]
        sound_id: i64,
    },
    File {
        path: String,
        name: String,
    },
    Recording {
        data: String,
        mime: String,
        #[serde(rename = "durationMs")]
        duration_ms: i64,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VoiceInput {
    pub name: String,
    pub engine: String,
    pub engine_kind: VoiceEngineKind,
    pub source: VoiceSource,
    pub language: String,
    pub gender: VoiceGender,
    #[serde(default)]
    pub preset: Option<String>,
    #[serde(default)]
    pub reference: Option<VoiceReference>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VoicePatch {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub sample_text: Option<String>,
    #[serde(default)]
    pub rights: Option<AssetRights>,
    #[serde(default, deserialize_with = "deserialize_optional_collection_id")]
    pub collection_id: Option<Option<i64>>,
    #[serde(default)]
    pub tags: Option<Vec<String>>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryVoice {
    pub id: i64,
    pub name: String,
    pub engine: String,
    pub engine_kind: VoiceEngineKind,
    pub source: VoiceSource,
    pub language: String,
    pub gender: VoiceGender,
    pub preset: Option<String>,
    pub reference_kind: Option<String>,
    pub reference_sound_id: Option<i64>,
    pub reference_name: String,
    pub sample_text: String,
    pub rights: AssetRights,
    pub collection_id: Option<i64>,
    pub tags: Vec<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum LibraryErrorCode {
    NoWorkspace,
    InvalidInput,
    CollectionNotFound,
    CollectionExists,
    TagExists,
    TagNotFound,
    InvalidTag,
    ImageNotFound,
    ImageUnsupported,
    ImageTooLarge,
    ImageUnreadable,
    SoundNotFound,
    SoundUnsupported,
    SoundTooLarge,
    SoundUnreadable,
    VideoNotFound,
    VideoUnsupported,
    VideoTooLarge,
    VideoUnreadable,
    PromptNotFound,
    PromptTooLarge,
    PromptUnreadable,
    PromptEmpty,
    PromptNameInvalid,
    VoiceNotFound,
    VoiceInvalid,
    VoiceReferenceInvalid,
    VoiceEngineUnavailable,
    VoiceBackendOffline,
    VoiceSynthesisFailed,
    TagLimit,
    Io,
    Db,
    Task,
}

impl LibraryErrorCode {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::NoWorkspace => "no_workspace",
            Self::InvalidInput => "invalid_input",
            Self::CollectionNotFound => "collection_not_found",
            Self::CollectionExists => "collection_exists",
            Self::TagExists => "tag_exists",
            Self::TagNotFound => "tag_not_found",
            Self::InvalidTag => "invalid_tag",
            Self::ImageNotFound => "image_not_found",
            Self::ImageUnsupported => "image_unsupported",
            Self::ImageTooLarge => "image_too_large",
            Self::ImageUnreadable => "image_unreadable",
            Self::SoundNotFound => "sound_not_found",
            Self::SoundUnsupported => "sound_unsupported",
            Self::SoundTooLarge => "sound_too_large",
            Self::SoundUnreadable => "sound_unreadable",
            Self::VideoNotFound => "video_not_found",
            Self::VideoUnsupported => "video_unsupported",
            Self::VideoTooLarge => "video_too_large",
            Self::VideoUnreadable => "video_unreadable",
            Self::PromptNotFound => "prompt_not_found",
            Self::PromptTooLarge => "prompt_too_large",
            Self::PromptUnreadable => "prompt_unreadable",
            Self::PromptEmpty => "prompt_empty",
            Self::PromptNameInvalid => "prompt_name_invalid",
            Self::VoiceNotFound => "voice_not_found",
            Self::VoiceInvalid => "voice_invalid",
            Self::VoiceReferenceInvalid => "voice_reference_invalid",
            Self::VoiceEngineUnavailable => "voice_engine_unavailable",
            Self::VoiceBackendOffline => "voice_backend_offline",
            Self::VoiceSynthesisFailed => "voice_synthesis_failed",
            Self::TagLimit => "tag_limit",
            Self::Io => "io",
            Self::Db => "db",
            Self::Task => "task",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct LibraryError {
    pub code: LibraryErrorCode,
    pub detail: String,
}

impl LibraryError {
    pub fn new(code: LibraryErrorCode, detail: impl Into<String>) -> Self {
        Self {
            code,
            detail: detail.into(),
        }
    }
}

pub type LibraryResult<T> = Result<T, LibraryError>;

impl fmt::Display for LibraryError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{} ({})", self.detail, self.code.as_str())
    }
}

impl std::error::Error for LibraryError {}

impl From<rusqlite::Error> for LibraryError {
    fn from(error: rusqlite::Error) -> Self {
        Self::new(LibraryErrorCode::Db, error.to_string())
    }
}

impl From<StorageError> for LibraryError {
    fn from(error: StorageError) -> Self {
        Self::new(LibraryErrorCode::Db, error.to_string())
    }
}

impl From<std::io::Error> for LibraryError {
    fn from(error: std::io::Error) -> Self {
        Self::new(LibraryErrorCode::Io, error.to_string())
    }
}
