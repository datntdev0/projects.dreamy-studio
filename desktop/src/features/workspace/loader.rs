use crate::container::AppContainer;
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
use crate::features::workspace::service::WorkspaceService;
use crate::features::workspace::session::WorkspaceSession;
use crate::infra::backend::BackendError;
use crate::infra::backend::BackendHost;
use crate::infra::logging::Logger;
use crate::infra::storage::StorageError;
use crate::infra::storage::StorageResult;
use crate::infra::storage::database::Database;
use crate::infra::storage::migrator::Migrator;
use crate::infra::storage::migrator::Script;
use crate::infra::storage::migrator::app_scripts;
use crate::infra::storage::migrator::workspace_scripts;
use crate::shared::path::NormalizedPath;
use std::fs;
use std::fs::OpenOptions;
use std::io;
use std::io::ErrorKind;
use std::io::Write;
use std::path::Path;
use std::path::PathBuf;
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
    root: PathBuf,
    database_path: PathBuf,
    logger: Logger,
    service: WorkspaceService,
    backend: Arc<dyn BackendHost>,
    probe: WriteProbe,
}

impl WorkspaceLoader {
    pub fn new(
        root: PathBuf,
        database_path: PathBuf,
        logger: Logger,
        service: WorkspaceService,
        backend: Arc<dyn BackendHost>,
    ) -> Self {
        Self {
            root,
            database_path,
            logger,
            service,
            backend,
            probe: default_write_probe,
        }
    }

    pub fn from_container(container: &AppContainer, service: WorkspaceService) -> Self {
        Self::new(
            container.directories.root.clone(),
            container.database_path.clone(),
            container.logger.clone(),
            service,
            container.backend.clone(),
        )
    }

    #[cfg(test)]
    pub fn with_write_probe(mut self, probe: WriteProbe) -> Self {
        self.probe = probe;
        self
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
            log: RunLog::new(&self.logger),
            target,
            mode,
            finished: 0,
            backend_spawned: false,
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
}

enum Stop {
    Failed(LoadError),
    Cancelled,
}

struct PendingLine {
    error: bool,
    message: String,
}

struct RunLog<'a> {
    logger: &'a Logger,
    pending: Vec<PendingLine>,
    ready: bool,
}

impl<'a> RunLog<'a> {
    fn new(logger: &'a Logger) -> Self {
        Self {
            logger,
            pending: Vec::new(),
            ready: false,
        }
    }

    fn info(&mut self, message: String) {
        self.push(false, message);
    }

    fn error(&mut self, message: String) {
        self.push(true, message);
    }

    fn mark_ready(&mut self) {
        self.ready = true;
        self.flush();
    }

    fn finish(&mut self) {
        if !self.ready {
            let _ = self.logger.prepare();
            self.flush();
        }
    }

    fn push(&mut self, error: bool, message: String) {
        if self.ready {
            self.write(error, &message);
        } else {
            self.pending.push(PendingLine { error, message });
        }
    }

    fn flush(&mut self) {
        let pending = std::mem::take(&mut self.pending);
        for line in &pending {
            self.write(line.error, &line.message);
        }
    }

    fn write(&self, error: bool, message: &str) {
        if error {
            self.logger.error(LOG_TARGET, message);
        } else {
            self.logger.info(LOG_TARGET, message);
        }
    }
}

struct LoadRun<'a> {
    loader: &'a WorkspaceLoader,
    session: &'a WorkspaceSession,
    sink: &'a dyn LoadEventSink,
    cancel: Arc<AtomicBool>,
    log: RunLog<'a>,
    target: NormalizedPath,
    mode: LoadMode,
    finished: u8,
    backend_spawned: bool,
}

impl LoadRun<'_> {
    fn start(&mut self) {
        self.log.info(format!(
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

    fn conclude(mut self, result: Result<(), Stop>) -> Result<LoadOutcome, LoadError> {
        match result {
            Ok(()) if self.session.complete() => {
                self.log
                    .info(format!("load result=ready path={}", self.target.path));
                self.log.finish();
                Ok(LoadOutcome::Ready {
                    name: self.target.name.clone(),
                    path: self.target.path.clone(),
                    mode: self.mode,
                })
            }
            Ok(()) | Err(Stop::Cancelled) => {
                self.session.abandon();
                self.release_backend();
                self.log
                    .info(format!("load result=cancelled path={}", self.target.path));
                self.log.finish();
                Ok(LoadOutcome::Cancelled)
            }
            Err(Stop::Failed(error)) => {
                self.session.abandon();
                self.release_backend();
                self.log.finish();
                Err(error)
            }
        }
    }

    fn release_backend(&self) {
        if self.backend_spawned {
            self.loader.backend.stop();
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
                self.log.info(format!(
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
                self.log.error(format!(
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
            LoadStep::Application => self.start_application(),
            LoadStep::Backend => self.start_backend(),
            LoadStep::Workspace => self.start_workspace(),
        }
    }

    fn start_application(&mut self) -> Result<(), Stop> {
        let app_db = self.prepare_app_db();
        storage_stop(LoadStep::Application, app_db)?;
        self.checked("app_db");
        self.ensure_active()?;
        self.prepare_logs().map_err(Stop::Failed)?;
        self.checked("logs");
        Ok(())
    }

    fn start_workspace(&mut self) -> Result<(), Stop> {
        self.check_folder().map_err(Stop::Failed)?;
        self.checked("folder");
        self.ensure_active()?;
        let workspace_db = self.prepare_workspace_db();
        storage_stop(LoadStep::Workspace, workspace_db)?;
        self.checked("workspace_db");
        Ok(())
    }

    fn checked(&mut self, name: &str) {
        self.log.info(format!(
            "load check={name} result=done path={}",
            self.target.path
        ));
    }

    fn check_folder(&self) -> Result<(), LoadError> {
        let folder = Path::new(&self.target.path);
        let metadata = match fs::metadata(folder) {
            Ok(metadata) => metadata,
            Err(error) => return Err(folder_access_error(&error)),
        };
        if !metadata.is_dir() {
            return Err(LoadError::new(
                LoadStep::Workspace,
                ErrorCode::FolderNotDirectory,
                format!("{} is not a folder", self.target.path),
            ));
        }
        if let Err(error) = fs::read_dir(folder) {
            return Err(LoadError::new(
                LoadStep::Workspace,
                ErrorCode::FolderNotReadable,
                error.to_string(),
            ));
        }
        if let Err(error) = (self.loader.probe)(folder) {
            return Err(LoadError::new(
                LoadStep::Workspace,
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
        self.migrate(&mut database, &scripts)
    }

    fn prepare_app_db(&mut self) -> StorageResult<()> {
        let scripts = app_scripts()?;
        fs::create_dir_all(&self.loader.root)?;
        let db_path = &self.loader.database_path;
        let mut database = if db_path.exists() {
            Database::open_existing(db_path)?
        } else {
            Database::create(db_path)?
        };
        self.migrate(&mut database, &scripts)
    }

    fn migrate(&self, database: &mut Database, scripts: &[Script]) -> StorageResult<()> {
        self.session
            .set_interrupt(Some(database.interrupt_handle()));
        let result = Migrator::migrate(database.connection_mut(), scripts, &self.cancel);
        self.session.set_interrupt(None);
        result
    }

    fn prepare_logs(&mut self) -> Result<(), LoadError> {
        match self.loader.logger.prepare() {
            Ok(()) => {
                self.log.mark_ready();
                Ok(())
            }
            Err(error) => Err(LoadError::new(
                LoadStep::Application,
                ErrorCode::LogsFailed,
                error.to_string(),
            )),
        }
    }

    fn start_backend(&mut self) -> Result<(), Stop> {
        match self.loader.backend.start(&self.cancel) {
            Ok(ready) => {
                self.backend_spawned = ready.spawned;
                self.log.info(format!(
                    "backend ready port={} spawned={}",
                    ready.port, ready.spawned
                ));
                Ok(())
            }
            Err(error) => Err(backend_stop(error)),
        }
    }
}

fn percent_done(finished: u8) -> u8 {
    let percent = usize::from(finished) * 100 / TOTAL_STEPS;
    u8::try_from(percent).unwrap_or(100)
}

fn backend_stop(error: BackendError) -> Stop {
    let (code, detail) = match error {
        BackendError::Cancelled => return Stop::Cancelled,
        BackendError::Missing(detail) => (ErrorCode::BackendMissing, detail),
        BackendError::StartFailed(detail) => (ErrorCode::BackendStartFailed, detail),
        BackendError::Timeout(detail) => (ErrorCode::BackendTimeout, detail),
    };
    Stop::Failed(LoadError::new(LoadStep::Backend, code, detail))
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
    LoadError::new(LoadStep::Workspace, code, error.to_string())
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

#[cfg(test)]
#[path = "../../../test/features/workspace/loader.test.rs"]
mod tests;
