use crate::infra::storage::StorageError;
use serde::Deserialize;
use serde::Serialize;
use std::fmt;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectSummary {
    pub id: i64,
    pub name: String,
    pub folder: String,
    pub template: String,
    pub description: String,
    pub novel_id: Option<i64>,
    pub novel_missing: bool,
    pub src_kind: Option<String>,
    pub src_lang: Option<String>,
    pub range_from: Option<i64>,
    pub range_to: Option<i64>,
    pub archived: bool,
    pub created_at: String,
    pub updated_at: String,
    pub opened_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectInput {
    pub name: String,
    pub template: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub novel_id: Option<i64>,
    #[serde(default)]
    pub src_kind: Option<String>,
    #[serde(default)]
    pub range_from: Option<i64>,
    #[serde(default)]
    pub range_to: Option<i64>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectPatch {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DirEntry {
    pub name: String,
    pub kind: String,
    pub size: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ProjectErrorCode {
    NoWorkspace,
    NotFound,
    InvalidInput,
    RangeInvalid,
    NovelNotFound,
    PathInvalid,
    CoverInvalid,
    CoverTooLarge,
    Io,
    Db,
    Task,
}

impl ProjectErrorCode {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::NoWorkspace => "no_workspace",
            Self::NotFound => "not_found",
            Self::InvalidInput => "invalid_input",
            Self::RangeInvalid => "range_invalid",
            Self::NovelNotFound => "novel_not_found",
            Self::PathInvalid => "path_invalid",
            Self::CoverInvalid => "cover_invalid",
            Self::CoverTooLarge => "cover_too_large",
            Self::Io => "io",
            Self::Db => "db",
            Self::Task => "task",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ProjectError {
    pub code: ProjectErrorCode,
    pub detail: String,
}

impl ProjectError {
    pub fn new(code: ProjectErrorCode, detail: impl Into<String>) -> Self {
        Self {
            code,
            detail: detail.into(),
        }
    }

    pub fn invalid(detail: impl Into<String>) -> Self {
        Self::new(ProjectErrorCode::InvalidInput, detail)
    }

    pub fn not_found(detail: impl Into<String>) -> Self {
        Self::new(ProjectErrorCode::NotFound, detail)
    }
}

pub type ProjectResult<T> = Result<T, ProjectError>;

impl fmt::Display for ProjectError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{} ({})", self.detail, self.code.as_str())
    }
}

impl std::error::Error for ProjectError {}

impl From<std::io::Error> for ProjectError {
    fn from(error: std::io::Error) -> Self {
        Self::new(ProjectErrorCode::Io, error.to_string())
    }
}

impl From<rusqlite::Error> for ProjectError {
    fn from(error: rusqlite::Error) -> Self {
        Self::new(ProjectErrorCode::Db, error.to_string())
    }
}

impl From<StorageError> for ProjectError {
    fn from(error: StorageError) -> Self {
        match error {
            StorageError::Io(source) => Self::new(ProjectErrorCode::Io, source.to_string()),
            other => Self::new(ProjectErrorCode::Db, other.to_string()),
        }
    }
}
