use crate::infra::storage::StorageError;
use serde::Deserialize;
use serde::Serialize;
use std::fmt;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NovelSummary {
    pub id: i64,
    pub title: String,
    pub name: String,
    pub author: String,
    pub lang: String,
    pub description: String,
    pub origin: String,
    pub created_at: String,
    pub updated_at: String,
    pub chapter_count: i64,
    pub word_count: i64,
    pub translated_count: i64,
    pub analyzed_count: i64,
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NovelInput {
    pub title: String,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub author: String,
    pub lang: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NovelPatch {
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub author: Option<String>,
    #[serde(default)]
    pub lang: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub tags: Option<Vec<String>>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChapterRow {
    pub id: String,
    pub novel_id: i64,
    pub seq: i64,
    pub title: String,
    pub word_count: i64,
    pub translation_status: String,
    pub analysis_status: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ParagraphRow {
    pub n: usize,
    pub text: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PackageSummary {
    pub title: String,
    pub author: String,
    pub lang: String,
    pub chapter_count: usize,
    pub word_count: i64,
    pub has_cover: bool,
    pub cover: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportSummary {
    pub path: String,
    pub chapter_count: usize,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum InspectStep {
    Format,
    Open,
    Manifest,
    Chapters,
    List,
    Cover,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum InspectStatus {
    Running,
    Ok,
    Warn,
    Fail,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct InspectEvent {
    pub step: InspectStep,
    pub status: InspectStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
}

impl InspectEvent {
    pub fn new(step: InspectStep, status: InspectStatus, detail: Option<String>) -> Self {
        Self {
            step,
            status,
            detail,
        }
    }
}

pub trait InspectSink {
    fn emit(&self, event: InspectEvent);
}

impl<F: Fn(InspectEvent)> InspectSink for F {
    fn emit(&self, event: InspectEvent) {
        self(event)
    }
}

pub struct NullSink;

impl InspectSink for NullSink {
    fn emit(&self, _event: InspectEvent) {}
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum NovelErrorCode {
    NoWorkspace,
    NotFound,
    InvalidInput,
    TagLimit,
    CoverInvalid,
    CoverTooLarge,
    ChapterFileMissing,
    ChapterLocked,
    ParagraphOutOfRange,
    PackageFormat,
    PackageOpen,
    PackageManifest,
    PackageChapters,
    PackageLimit,
    Io,
    Db,
    Task,
}

impl NovelErrorCode {
    pub fn as_str(self) -> &'static str {
        match self {
            NovelErrorCode::NoWorkspace => "no_workspace",
            NovelErrorCode::NotFound => "not_found",
            NovelErrorCode::InvalidInput => "invalid_input",
            NovelErrorCode::TagLimit => "tag_limit",
            NovelErrorCode::CoverInvalid => "cover_invalid",
            NovelErrorCode::CoverTooLarge => "cover_too_large",
            NovelErrorCode::ChapterFileMissing => "chapter_file_missing",
            NovelErrorCode::ChapterLocked => "chapter_locked",
            NovelErrorCode::ParagraphOutOfRange => "paragraph_out_of_range",
            NovelErrorCode::PackageFormat => "package_format",
            NovelErrorCode::PackageOpen => "package_open",
            NovelErrorCode::PackageManifest => "package_manifest",
            NovelErrorCode::PackageChapters => "package_chapters",
            NovelErrorCode::PackageLimit => "package_limit",
            NovelErrorCode::Io => "io",
            NovelErrorCode::Db => "db",
            NovelErrorCode::Task => "task",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct NovelError {
    pub code: NovelErrorCode,
    pub detail: String,
}

impl NovelError {
    pub fn new(code: NovelErrorCode, detail: impl Into<String>) -> Self {
        Self {
            code,
            detail: detail.into(),
        }
    }

    pub fn invalid(detail: impl Into<String>) -> Self {
        Self::new(NovelErrorCode::InvalidInput, detail)
    }

    pub fn not_found(detail: impl Into<String>) -> Self {
        Self::new(NovelErrorCode::NotFound, detail)
    }
}

pub type NovelResult<T> = Result<T, NovelError>;

impl fmt::Display for NovelError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{} ({})", self.detail, self.code.as_str())
    }
}

impl std::error::Error for NovelError {}

impl From<std::io::Error> for NovelError {
    fn from(source: std::io::Error) -> Self {
        Self::new(NovelErrorCode::Io, source.to_string())
    }
}

impl From<rusqlite::Error> for NovelError {
    fn from(source: rusqlite::Error) -> Self {
        Self::new(NovelErrorCode::Db, source.to_string())
    }
}

impl From<StorageError> for NovelError {
    fn from(source: StorageError) -> Self {
        match source {
            StorageError::Io(error) => Self::new(NovelErrorCode::Io, error.to_string()),
            other => Self::new(NovelErrorCode::Db, other.to_string()),
        }
    }
}
