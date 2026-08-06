use crate::infra::storage::StorageError;
use serde::Serialize;
use std::fmt;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum LoadMode {
    Create,
    Open,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum LoadStep {
    Application,
    Backend,
    Workspace,
}

impl LoadStep {
    pub const ALL: [LoadStep; 3] = [
        LoadStep::Application,
        LoadStep::Backend,
        LoadStep::Workspace,
    ];

    pub fn as_str(self) -> &'static str {
        match self {
            LoadStep::Application => "application",
            LoadStep::Backend => "backend",
            LoadStep::Workspace => "workspace",
        }
    }
}

impl fmt::Display for LoadStep {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum StepState {
    Running,
    Done,
    Error,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum LoadEvent {
    Started {
        mode: LoadMode,
        name: String,
        path: String,
    },
    Step {
        id: LoadStep,
        state: StepState,
        #[serde(skip_serializing_if = "Option::is_none")]
        detail: Option<String>,
    },
    Progress {
        percent: u8,
    },
}

pub trait LoadEventSink {
    fn emit(&self, event: LoadEvent);
}

impl<F: Fn(LoadEvent)> LoadEventSink for F {
    fn emit(&self, event: LoadEvent) {
        self(event)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ErrorCode {
    FolderMissing,
    FolderNotDirectory,
    FolderNotReadable,
    FolderNotWritable,
    DbCorrupt,
    DbNewerVersion,
    DbMigrationFailed,
    DbIo,
    LogsFailed,
    BackendMissing,
    BackendStartFailed,
    BackendTimeout,
}

impl ErrorCode {
    pub fn as_str(self) -> &'static str {
        match self {
            ErrorCode::FolderMissing => "folder_missing",
            ErrorCode::FolderNotDirectory => "folder_not_directory",
            ErrorCode::FolderNotReadable => "folder_not_readable",
            ErrorCode::FolderNotWritable => "folder_not_writable",
            ErrorCode::DbCorrupt => "db_corrupt",
            ErrorCode::DbNewerVersion => "db_newer_version",
            ErrorCode::DbMigrationFailed => "db_migration_failed",
            ErrorCode::DbIo => "db_io",
            ErrorCode::LogsFailed => "logs_failed",
            ErrorCode::BackendMissing => "backend_missing",
            ErrorCode::BackendStartFailed => "backend_start_failed",
            ErrorCode::BackendTimeout => "backend_timeout",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct LoadError {
    pub step: LoadStep,
    pub code: ErrorCode,
    pub detail: String,
}

impl LoadError {
    pub fn new(step: LoadStep, code: ErrorCode, detail: impl Into<String>) -> Self {
        Self {
            step,
            code,
            detail: detail.into(),
        }
    }

    pub fn from_storage(step: LoadStep, error: &StorageError) -> Self {
        match error {
            StorageError::Corrupt(detail) => Self::new(step, ErrorCode::DbCorrupt, detail.clone()),
            StorageError::NewerVersion => {
                Self::new(step, ErrorCode::DbNewerVersion, error.to_string())
            }
            StorageError::Migration { .. } | StorageError::InvalidScript(_) => {
                Self::new(step, ErrorCode::DbMigrationFailed, error.to_string())
            }
            StorageError::Io(source) => Self::new(step, ErrorCode::DbIo, source.to_string()),
            StorageError::Db(source) => Self::new(step, ErrorCode::DbIo, source.to_string()),
            StorageError::Cancelled => Self::new(step, ErrorCode::DbIo, error.to_string()),
        }
    }
}

impl fmt::Display for LoadError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "{} failed ({}): {}",
            self.step,
            self.code.as_str(),
            self.detail
        )
    }
}

impl std::error::Error for LoadError {}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LoadRequest {
    pub path: String,
    pub relocate_from: Option<String>,
}

impl LoadRequest {
    pub fn new(path: impl Into<String>, relocate_from: Option<String>) -> Self {
        Self {
            path: path.into(),
            relocate_from,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "result", rename_all = "snake_case")]
pub enum LoadOutcome {
    Ready {
        name: String,
        path: String,
        mode: LoadMode,
    },
    Cancelled,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(tag = "result", rename_all = "snake_case")]
pub enum CancelOutcome {
    Cancelled,
    AlreadyEntered,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "result", rename_all = "snake_case")]
pub enum EnterOutcome {
    Entered { name: String, path: String },
    Cancelled,
}
