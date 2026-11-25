use crate::features::translation::models::TranslationError;
use crate::features::translation::models::TranslationErrorCode;
use crate::infra::storage::StorageError;
use serde::Deserialize;
use serde::Serialize;
use std::fmt;

macro_rules! status_enum {
    ($name:ident) => {
        #[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
        #[serde(rename_all = "snake_case")]
        pub enum $name {
            Queued,
            Running,
            Completed,
            Failed,
            Cancelled,
        }

        impl $name {
            pub fn as_str(self) -> &'static str {
                match self {
                    Self::Queued => "queued",
                    Self::Running => "running",
                    Self::Completed => "completed",
                    Self::Failed => "failed",
                    Self::Cancelled => "cancelled",
                }
            }

            pub fn parse(value: &str) -> Option<Self> {
                match value {
                    "queued" => Some(Self::Queued),
                    "running" => Some(Self::Running),
                    "completed" => Some(Self::Completed),
                    "failed" => Some(Self::Failed),
                    "cancelled" => Some(Self::Cancelled),
                    _ => None,
                }
            }
        }
    };
}

status_enum!(PipelineStatus);
status_enum!(TaskStatus);

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskRequest {
    pub chapter_id: String,
    #[serde(default)]
    pub passage: Option<usize>,
    #[serde(default)]
    pub segment_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PipelineTask {
    pub id: i64,
    pub chapter_id: String,
    pub segment_id: Option<String>,
    pub passage: Option<usize>,
    pub status: TaskStatus,
    pub progress: u8,
    pub error: String,
    pub started_at: Option<String>,
    pub finished_at: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PipelineSnapshot {
    pub id: i64,
    pub novel_id: Option<i64>,
    pub project_id: Option<i64>,
    pub kind: String,
    pub target: String,
    pub status: PipelineStatus,
    pub total: i64,
    pub done: i64,
    pub failed: i64,
    pub created_at: String,
    pub started_at: Option<String>,
    pub finished_at: Option<String>,
    pub tasks: Vec<PipelineTask>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum PipelineEvent {
    Started {
        pipeline: PipelineSnapshot,
    },
    Updated {
        pipeline: PipelineSnapshot,
    },
    Task {
        pipeline_id: i64,
        task: PipelineTask,
    },
    Finished {
        pipeline: PipelineSnapshot,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum JobOwner {
    Novel(i64),
    Project(i64),
}

impl JobOwner {
    pub fn of(novel_id: Option<i64>, project_id: Option<i64>) -> PipelineResult<Self> {
        match (novel_id, project_id) {
            (Some(id), None) => Ok(Self::Novel(id)),
            (None, Some(id)) => Ok(Self::Project(id)),
            _ => Err(PipelineError::invalid(
                "exactly one of novelId or projectId is required",
            )),
        }
    }

    pub fn filter(novel_id: Option<i64>, project_id: Option<i64>) -> PipelineResult<Option<Self>> {
        match (novel_id, project_id) {
            (None, None) => Ok(None),
            _ => Self::of(novel_id, project_id).map(Some),
        }
    }

    pub fn novel_id(self) -> Option<i64> {
        match self {
            Self::Novel(id) => Some(id),
            Self::Project(_) => None,
        }
    }

    pub fn project_id(self) -> Option<i64> {
        match self {
            Self::Project(id) => Some(id),
            Self::Novel(_) => None,
        }
    }

    pub fn require_novel(self) -> PipelineResult<i64> {
        self.novel_id()
            .ok_or_else(|| PipelineError::invalid("novelId is required"))
    }

    pub fn require_project(self) -> PipelineResult<i64> {
        self.project_id()
            .ok_or_else(|| PipelineError::invalid("projectId is required"))
    }
}

impl fmt::Display for JobOwner {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Novel(id) => write!(f, "novel {id}"),
            Self::Project(id) => write!(f, "project {id}"),
        }
    }
}

pub trait PipelineTarget: Send + Sync {
    fn deliver(&self, event: PipelineEvent) -> Result<(), String>;
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum PipelineErrorCode {
    NoWorkspace,
    NotFound,
    InvalidInput,
    Io,
    Db,
    Task,
}

impl PipelineErrorCode {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::NoWorkspace => "no_workspace",
            Self::NotFound => "not_found",
            Self::InvalidInput => "invalid_input",
            Self::Io => "io",
            Self::Db => "db",
            Self::Task => "task",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct PipelineError {
    pub code: PipelineErrorCode,
    pub detail: String,
}

impl PipelineError {
    pub fn new(code: PipelineErrorCode, detail: impl Into<String>) -> Self {
        Self {
            code,
            detail: detail.into(),
        }
    }

    pub fn invalid(detail: impl Into<String>) -> Self {
        Self::new(PipelineErrorCode::InvalidInput, detail)
    }

    pub fn not_found(detail: impl Into<String>) -> Self {
        Self::new(PipelineErrorCode::NotFound, detail)
    }
}

pub type PipelineResult<T> = Result<T, PipelineError>;

impl fmt::Display for PipelineError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{} ({})", self.detail, self.code.as_str())
    }
}

impl std::error::Error for PipelineError {}

impl From<std::io::Error> for PipelineError {
    fn from(source: std::io::Error) -> Self {
        Self::new(PipelineErrorCode::Io, source.to_string())
    }
}

impl From<rusqlite::Error> for PipelineError {
    fn from(source: rusqlite::Error) -> Self {
        Self::new(PipelineErrorCode::Db, source.to_string())
    }
}

impl From<StorageError> for PipelineError {
    fn from(source: StorageError) -> Self {
        match source {
            StorageError::Io(error) => Self::new(PipelineErrorCode::Io, error.to_string()),
            other => Self::new(PipelineErrorCode::Db, other.to_string()),
        }
    }
}

impl From<TranslationError> for PipelineError {
    fn from(source: TranslationError) -> Self {
        let code = match source.code {
            TranslationErrorCode::NoWorkspace => PipelineErrorCode::NoWorkspace,
            TranslationErrorCode::NotFound => PipelineErrorCode::NotFound,
            TranslationErrorCode::InvalidInput | TranslationErrorCode::DictionaryDuplicate => {
                PipelineErrorCode::InvalidInput
            }
            TranslationErrorCode::Io => PipelineErrorCode::Io,
            TranslationErrorCode::Db => PipelineErrorCode::Db,
            TranslationErrorCode::Task => PipelineErrorCode::Task,
        };
        Self::new(code, source.detail)
    }
}
