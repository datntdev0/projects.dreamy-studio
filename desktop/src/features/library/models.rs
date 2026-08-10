use crate::infra::storage::StorageError;
use serde::Deserialize;
use serde::Serialize;
use std::fmt;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum LibraryKind {
    Image,
    Sound,
    Video,
    Prompt,
}

impl LibraryKind {
    pub const ALL: [Self; 4] = [Self::Image, Self::Sound, Self::Video, Self::Prompt];

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Image => "image",
            Self::Sound => "sound",
            Self::Video => "video",
            Self::Prompt => "prompt",
        }
    }
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
pub struct KindCounts {
    pub image: i64,
    pub sound: i64,
    pub video: i64,
    pub prompt: i64,
}

impl KindCounts {
    pub fn get_mut(&mut self, kind: LibraryKind) -> &mut i64 {
        match kind {
            LibraryKind::Image => &mut self.image,
            LibraryKind::Sound => &mut self.sound,
            LibraryKind::Video => &mut self.video,
            LibraryKind::Prompt => &mut self.prompt,
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
