use crate::container::AppContainer;
use crate::features::pipeline::repository::PipelineRepository;
use crate::features::workspace::inspector::WORKSPACE_DB_FILE;
use crate::features::workspace::load::EnterOutcome;
use crate::features::workspace::load::ErrorCode;
use crate::features::workspace::load::LoadError;
use crate::features::workspace::load::LoadEvent;
use crate::features::workspace::load::LoadEventSink;
use crate::features::workspace::load::LoadMode;
use crate::features::workspace::load::LoadOutcome;
use crate::features::workspace::load::LoadRequest;
use crate::features::workspace::load::LoadStep;
use crate::features::workspace::load::StepState;
use crate::features::workspace::repository::format_timestamp;
use crate::features::workspace::service::WorkspaceService;
use crate::features::workspace::session::WorkspaceSession;
use crate::infra::logging::Logger;
use crate::infra::storage::StorageError;
use crate::infra::storage::StorageResult;
use crate::infra::storage::database::Database;
use crate::infra::storage::migrator::Migrator;
use crate::infra::storage::migrator::workspace_scripts;
use crate::shared::path::NormalizedPath;
use chrono::Utc;
use std::fs;
use std::fs::OpenOptions;
use std::io;
use std::io::ErrorKind;
use std::io::Write;
use std::path::Path;
use std::process;
use std::sync::Arc;
use std::sync::atomic::AtomicBool;
use std::sync::atomic::Ordering;
use std::time::SystemTime;
use std::time::UNIX_EPOCH;

const LOG_TARGET: &str = "workspace";
const TOTAL_STEPS: usize = LoadStep::ALL.len();

pub type WriteProbe = fn(&Path) -> io::Result<()>;

pub fn default_write_probe(folder: &Path) -> io::Result<()> {
    let nanos = match SystemTime::now().duration_since(UNIX_EPOCH) {
        Ok(elapsed) => elapsed.as_nanos(),
        Err(_) => 0,
    };
    let probe = folder.join(format!(".dreamy-write-probe-{}-{nanos}", process::id()));
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&probe)?;
    let written = file.write_all(b"probe");
    drop(file);
    let removed = fs::remove_file(&probe);
    written?;
    removed
}

#[derive(Clone)]
pub struct WorkspaceLoader {
    logger: Logger,
    service: WorkspaceService,
    probe: WriteProbe,
}

impl WorkspaceLoader {
    pub fn new(logger: Logger, service: WorkspaceService) -> Self {
        Self {
            logger,
            service,
            probe: default_write_probe,
        }
    }

    pub fn from_container(container: &AppContainer, service: WorkspaceService) -> Self {
        Self::new(container.logger.clone(), service)
    }

    pub fn load(
        &self,
        session: &WorkspaceSession,
        request: LoadRequest,
        sink: &dyn LoadEventSink,
    ) -> Result<LoadOutcome, LoadError> {
        let _gate = session.gate();
        let target = NormalizedPath::new(&request.path);
        let cancel = session.begin(&target.path, request.relocate_from);
        let mode = detect_mode(&target.path);
        let mut run = LoadRun {
            loader: self,
            session,
            sink,
            cancel,
            target,
            mode,
            finished: 0,
        };
        run.start();
        let result = run.execute();
        run.conclude(result)
    }

    pub fn enter(&self, session: &WorkspaceSession) -> Result<EnterOutcome, LoadError> {
        let result = session.enter(&self.service);
        match &result {
            Ok(EnterOutcome::Entered { path, .. }) => {
                self.logger
                    .info(LOG_TARGET, &format!("enter result=entered path={path}"));
            }
            Ok(EnterOutcome::Cancelled) => {
                self.logger.info(LOG_TARGET, "enter result=cancelled");
            }
            Err(error) => {
                self.logger
                    .error(LOG_TARGET, &format!("enter result=error {error}"));
            }
        }
        result
    }

    fn info(&self, message: &str) {
        self.logger.info(LOG_TARGET, message);
    }

    fn error(&self, message: &str) {
        self.logger.error(LOG_TARGET, message);
    }
}

enum Stop {
    Failed(LoadError),
    Cancelled,
}

struct LoadRun<'a> {
    loader: &'a WorkspaceLoader,
    session: &'a WorkspaceSession,
    sink: &'a dyn LoadEventSink,
    cancel: Arc<AtomicBool>,
    target: NormalizedPath,
    mode: LoadMode,
    finished: u8,
}

impl LoadRun<'_> {
    fn start(&mut self) {
        self.loader.info(&format!(
            "load started mode={} path={}",
            mode_text(self.mode),
            self.target.path
        ));
        self.sink.emit(LoadEvent::Started {
            mode: self.mode,
            name: self.target.name.clone(),
            path: self.target.path.clone(),
        });
    }

    fn execute(&mut self) -> Result<(), Stop> {
        for step in LoadStep::ALL {
            self.ensure_active()?;
            self.run_step(step)?;
        }
        self.ensure_active()
    }

    fn conclude(self, result: Result<(), Stop>) -> Result<LoadOutcome, LoadError> {
        match result {
            Ok(()) if self.session.complete() => {
                self.loader
                    .info(&format!("load result=ready path={}", self.target.path));
                Ok(LoadOutcome::Ready {
                    name: self.target.name.clone(),
                    path: self.target.path.clone(),
                    mode: self.mode,
                })
            }
            Ok(()) | Err(Stop::Cancelled) => {
                self.session.abandon();
                self.loader
                    .info(&format!("load result=cancelled path={}", self.target.path));
                Ok(LoadOutcome::Cancelled)
            }
            Err(Stop::Failed(error)) => {
                self.session.abandon();
                Err(error)
            }
        }
    }

    fn ensure_active(&self) -> Result<(), Stop> {
        if self.cancel.load(Ordering::SeqCst) {
            Err(Stop::Cancelled)
        } else {
            Ok(())
        }
    }

    fn run_step(&mut self, step: LoadStep) -> Result<(), Stop> {
        self.emit_step(step, StepState::Running, None);
        match self.perform(step) {
            Ok(()) => {
                self.finished += 1;
                self.loader.info(&format!(
                    "load step={step} result=done path={}",
                    self.target.path
                ));
                self.emit_step(step, StepState::Done, None);
                self.sink.emit(LoadEvent::Progress {
                    percent: percent_done(self.finished),
                });
                Ok(())
            }
            Err(Stop::Failed(error)) => {
                self.loader.error(&format!(
                    "load step={step} result=error code={} detail={}",
                    error.code.as_str(),
                    error.detail
                ));
                self.emit_step(step, StepState::Error, Some(error.detail.clone()));
                Err(Stop::Failed(error))
            }
            Err(Stop::Cancelled) => Err(Stop::Cancelled),
        }
    }

    fn emit_step(&self, id: LoadStep, state: StepState, detail: Option<String>) {
        self.sink.emit(LoadEvent::Step { id, state, detail });
    }

    fn perform(&mut self, step: LoadStep) -> Result<(), Stop> {
        match step {
            LoadStep::Folder => self.check_folder().map_err(Stop::Failed),
            LoadStep::Database => {
                let workspace_db = self.prepare_workspace_db();
                storage_stop(LoadStep::Database, workspace_db)
            }
        }
    }

    fn check_folder(&self) -> Result<(), LoadError> {
        let folder = Path::new(&self.target.path);
        let metadata = match fs::metadata(folder) {
            Ok(metadata) => metadata,
            Err(error) => return Err(folder_access_error(&error)),
        };
        if !metadata.is_dir() {
            return Err(LoadError::new(
                LoadStep::Folder,
                ErrorCode::FolderNotDirectory,
                format!("{} is not a folder", self.target.path),
            ));
        }
        if let Err(error) = fs::read_dir(folder) {
            return Err(LoadError::new(
                LoadStep::Folder,
                ErrorCode::FolderNotReadable,
                error.to_string(),
            ));
        }
        if let Err(error) = (self.loader.probe)(folder) {
            return Err(LoadError::new(
                LoadStep::Folder,
                ErrorCode::FolderNotWritable,
                error.to_string(),
            ));
        }
        Ok(())
    }

    fn prepare_workspace_db(&mut self) -> StorageResult<()> {
        let db_path = Path::new(&self.target.path).join(WORKSPACE_DB_FILE);
        let scripts = workspace_scripts()?;
        let mut database = if db_path.exists() {
            Database::open_existing(&db_path)?
        } else {
            self.session.mark_created();
            Database::create(&db_path)?
        };
        self.session
            .set_interrupt(Some(database.interrupt_handle()));
        let migrated = Migrator::migrate(database.connection_mut(), &scripts, &self.cancel);
        self.session.set_interrupt(None);
        migrated?;
        PipelineRepository::new(database.connection())
            .cancel_orphans(&format_timestamp(Utc::now()))?;
        Ok(())
    }
}

fn percent_done(finished: u8) -> u8 {
    let percent = usize::from(finished) * 100 / TOTAL_STEPS;
    u8::try_from(percent).unwrap_or(100)
}

fn storage_stop(step: LoadStep, result: StorageResult<()>) -> Result<(), Stop> {
    match result {
        Ok(()) => Ok(()),
        Err(StorageError::Cancelled) => Err(Stop::Cancelled),
        Err(error) => Err(Stop::Failed(LoadError::from_storage(step, &error))),
    }
}

fn folder_access_error(error: &io::Error) -> LoadError {
    let code = if error.kind() == ErrorKind::NotFound {
        ErrorCode::FolderMissing
    } else {
        ErrorCode::FolderNotReadable
    };
    LoadError::new(LoadStep::Folder, code, error.to_string())
}

fn detect_mode(folder: &str) -> LoadMode {
    if Path::new(folder).join(WORKSPACE_DB_FILE).exists() {
        LoadMode::Open
    } else {
        LoadMode::Create
    }
}

fn mode_text(mode: LoadMode) -> &'static str {
    match mode {
        LoadMode::Create => "create",
        LoadMode::Open => "open",
    }
}
