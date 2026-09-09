use serde::Serialize;
use std::fmt;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum SetupGroup {
    Runtime,
    Toolbox,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ItemState {
    Pending,
    Downloading,
    Verifying,
    Extracting,
    Ready,
    Error,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum SetupPhase {
    Checking,
    Running,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SetupItemView {
    pub id: String,
    pub group: SetupGroup,
    pub version: Option<String>,
    pub state: ItemState,
    pub received: u64,
    pub total: u64,
}

impl SetupItemView {
    pub fn with_state(&self, state: ItemState) -> Self {
        Self {
            state,
            ..self.clone()
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum SetupEvent {
    Snapshot {
        status: SetupPhase,
        items: Vec<SetupItemView>,
    },
    Phase {
        status: SetupPhase,
    },
    Item {
        item: SetupItemView,
    },
    Progress {
        id: String,
        received: u64,
        total: u64,
        speed: u64,
    },
}

pub trait SetupSink {
    fn emit(&self, event: SetupEvent);
}

impl<F: Fn(SetupEvent)> SetupSink for F {
    fn emit(&self, event: SetupEvent) {
        self(event)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(tag = "result", rename_all = "snake_case")]
pub enum SetupOutcome {
    Ready,
    Paused,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum SetupErrorCode {
    Offline,
    Network,
    Checksum,
    DiskFull,
    Extract,
    Busy,
    Io,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct SetupError {
    pub code: SetupErrorCode,
    pub detail: String,
}

impl SetupError {
    pub fn new(code: SetupErrorCode, detail: impl Into<String>) -> Self {
        Self {
            code,
            detail: detail.into(),
        }
    }

    pub fn io(error: &std::io::Error) -> Self {
        if is_disk_full(error) {
            Self::new(SetupErrorCode::DiskFull, error.to_string())
        } else {
            Self::new(SetupErrorCode::Io, error.to_string())
        }
    }
}

impl fmt::Display for SetupError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "setup failed ({:?}): {}", self.code, self.detail)
    }
}

impl std::error::Error for SetupError {}

const ERROR_HANDLE_DISK_FULL: i32 = 39;
const ERROR_DISK_FULL: i32 = 112;

pub fn is_disk_full(error: &std::io::Error) -> bool {
    error.kind() == std::io::ErrorKind::StorageFull
        || matches!(
            error.raw_os_error(),
            Some(ERROR_HANDLE_DISK_FULL | ERROR_DISK_FULL)
        )
}
