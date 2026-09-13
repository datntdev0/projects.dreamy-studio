use serde::Serialize;
use std::fmt;
use std::fs;
use std::path::PathBuf;
use std::sync::Arc;
use std::sync::Mutex;
use std::sync::atomic::AtomicBool;

use crate::features::settings::home;
use crate::features::workspace::load::ErrorCode;
use crate::features::workspace::load::StepState;
use crate::features::workspace::load::storage_failure;
use crate::infra::backend::BackendError;
use crate::infra::backend::BackendHost;
use crate::infra::logging::Logger;
use crate::infra::storage::StorageResult;
use crate::infra::storage::database::Database;
use crate::infra::storage::migrator::Migrator;
use crate::infra::storage::migrator::app_scripts;

const LOG_TARGET: &str = "startup";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum StartupStep {
    Application,
    Backend,
}

impl StartupStep {
    pub fn as_str(self) -> &'static str {
        match self {
            StartupStep::Application => "application",
            StartupStep::Backend => "backend",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum StartupEvent {
    Step {
        id: StartupStep,
        state: StepState,
        #[serde(skip_serializing_if = "Option::is_none")]
        detail: Option<String>,
    },
}

pub trait StartupSink {
    fn emit(&self, event: StartupEvent);
}

impl<F: Fn(StartupEvent)> StartupSink for F {
    fn emit(&self, event: StartupEvent) {
        self(event)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct StartupError {
    pub step: StartupStep,
    pub code: ErrorCode,
    pub detail: String,
}

impl StartupError {
    pub fn new(step: StartupStep, code: ErrorCode, detail: impl Into<String>) -> Self {
        Self {
            step,
            code,
            detail: detail.into(),
        }
    }
}

impl fmt::Display for StartupError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "{} failed ({}): {}",
            self.step.as_str(),
            self.code.as_str(),
            self.detail
        )
    }
}

impl std::error::Error for StartupError {}

pub struct StartupService {
    root: PathBuf,
    database_path: PathBuf,
    logger: Logger,
    backend: Arc<dyn BackendHost>,
    gate: Mutex<()>,
}

impl StartupService {
    pub fn new(
        root: PathBuf,
        database_path: PathBuf,
        logger: Logger,
        backend: Arc<dyn BackendHost>,
    ) -> Self {
        Self {
            root,
            database_path,
            logger,
            backend,
            gate: Mutex::new(()),
        }
    }

    pub fn run(&self, sink: &dyn StartupSink) -> Result<(), StartupError> {
        let _guard = self.gate.lock().unwrap_or_else(|error| error.into_inner());
        self.step(sink, StartupStep::Application, Self::prepare_application)?;
        self.step(sink, StartupStep::Backend, Self::start_backend)
    }

    fn step(
        &self,
        sink: &dyn StartupSink,
        id: StartupStep,
        action: fn(&Self) -> Result<(), StartupError>,
    ) -> Result<(), StartupError> {
        sink.emit(StartupEvent::Step {
            id,
            state: StepState::Running,
            detail: None,
        });
        match action(self) {
            Ok(()) => {
                self.logger
                    .info(LOG_TARGET, &format!("step={} result=done", id.as_str()));
                sink.emit(StartupEvent::Step {
                    id,
                    state: StepState::Done,
                    detail: None,
                });
                Ok(())
            }
            Err(error) => {
                self.logger.error(LOG_TARGET, &error.to_string());
                sink.emit(StartupEvent::Step {
                    id,
                    state: StepState::Error,
                    detail: Some(error.detail.clone()),
                });
                Err(error)
            }
        }
    }

    fn prepare_application(&self) -> Result<(), StartupError> {
        self.prepare_database().map_err(|error| {
            let (code, detail) = storage_failure(&error);
            StartupError::new(StartupStep::Application, code, detail)
        })?;
        self.logger.prepare().map_err(|error| {
            StartupError::new(
                StartupStep::Application,
                ErrorCode::LogsFailed,
                error.to_string(),
            )
        })?;
        self.install_skills();
        Ok(())
    }

    fn install_skills(&self) {
        for error in home::install_present_skills(&self.root) {
            self.logger
                .error(LOG_TARGET, &format!("skills install failed detail={error}"));
        }
    }

    fn prepare_database(&self) -> StorageResult<()> {
        let scripts = app_scripts()?;
        fs::create_dir_all(&self.root)?;
        let mut database = if self.database_path.exists() {
            Database::open_existing(&self.database_path)?
        } else {
            Database::create(&self.database_path)?
        };
        Migrator::migrate(database.connection_mut(), &scripts, &AtomicBool::new(false))
    }

    fn start_backend(&self) -> Result<(), StartupError> {
        match self.backend.start(&AtomicBool::new(false)) {
            Ok(ready) => {
                self.logger.info(
                    LOG_TARGET,
                    &format!(
                        "backend ready port={} spawned={}",
                        ready.port, ready.spawned
                    ),
                );
                Ok(())
            }
            Err(error) => Err(backend_failure(error)),
        }
    }
}

fn backend_failure(error: BackendError) -> StartupError {
    let (code, detail) = match error {
        BackendError::Missing(detail) => (ErrorCode::BackendMissing, detail),
        BackendError::StartFailed(detail) => (ErrorCode::BackendStartFailed, detail),
        BackendError::Timeout(detail) => (ErrorCode::BackendTimeout, detail),
        BackendError::Cancelled => (
            ErrorCode::BackendStartFailed,
            BackendError::Cancelled.to_string(),
        ),
    };
    StartupError::new(StartupStep::Backend, code, detail)
}
