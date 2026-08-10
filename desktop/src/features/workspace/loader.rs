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
mod tests {
    use super::*;
    use crate::features::workspace::inspector::StatusKind;
    use crate::features::workspace::load::CancelOutcome;
    use crate::features::workspace::repository::WorkspaceRepository;
    use crate::features::workspace::service::RecentWorkspaceView;
    use crate::features::workspace::session::CurrentWorkspace;
    use crate::infra::backend::StubBackend;
    use rusqlite::Connection;
    use serde_json::Value;
    use serde_json::json;
    use std::collections::BTreeMap;
    use std::sync::Mutex;
    use tempfile::TempDir;

    struct Fixture {
        dir: TempDir,
        folder: PathBuf,
        container: AppContainer,
        session: WorkspaceSession,
        service: WorkspaceService,
        loader: WorkspaceLoader,
        backend: Arc<StubBackend>,
    }

    struct Recorder<'a> {
        events: Mutex<Vec<LoadEvent>>,
        session: &'a WorkspaceSession,
        trigger: Option<LoadEvent>,
    }

    impl LoadEventSink for Recorder<'_> {
        fn emit(&self, event: LoadEvent) {
            let hit = self.trigger.as_ref() == Some(&event);
            self.events.lock().unwrap().push(event);
            if hit {
                self.session.cancel();
            }
        }
    }

    type Loaded = (Result<LoadOutcome, LoadError>, Vec<LoadEvent>);

    fn fixture() -> Fixture {
        fixture_with(StubBackend::new())
    }

    fn fixture_with(backend: StubBackend) -> Fixture {
        let dir = TempDir::new().unwrap();
        let folder = dir.path().join("Novel");
        fs::create_dir(&folder).unwrap();
        let backend = Arc::new(backend);
        let container = AppContainer::with_backend(
            dir.path().join("app").join("DreamyStudio"),
            backend.clone(),
        );
        let repository = WorkspaceRepository::new(container.database_path.clone());
        let service = WorkspaceService::new(repository);
        let loader = WorkspaceLoader::from_container(&container, service.clone());
        Fixture {
            dir,
            folder,
            container,
            session: WorkspaceSession::new(),
            service,
            loader,
            backend,
        }
    }

    fn deny_write(_folder: &Path) -> io::Result<()> {
        Err(io::Error::new(
            ErrorKind::PermissionDenied,
            "access is denied",
        ))
    }

    fn running(step: LoadStep) -> LoadEvent {
        LoadEvent::Step {
            id: step,
            state: StepState::Running,
            detail: None,
        }
    }

    fn done(step: LoadStep) -> LoadEvent {
        LoadEvent::Step {
            id: step,
            state: StepState::Done,
            detail: None,
        }
    }

    fn progress(percent: u8) -> LoadEvent {
        LoadEvent::Progress { percent }
    }

    fn text(path: &Path) -> &str {
        path.to_str().unwrap()
    }

    fn run_load(fixture: &Fixture, trigger: Option<LoadEvent>) -> Loaded {
        run_load_at(fixture, &fixture.folder, trigger)
    }

    fn run_load_at(fixture: &Fixture, folder: &Path, trigger: Option<LoadEvent>) -> Loaded {
        run_request(fixture, LoadRequest::new(text(folder), None), trigger)
    }

    fn run_request(fixture: &Fixture, request: LoadRequest, trigger: Option<LoadEvent>) -> Loaded {
        run_request_on(&fixture.loader, fixture, request, trigger)
    }

    fn run_request_on(
        loader: &WorkspaceLoader,
        fixture: &Fixture,
        request: LoadRequest,
        trigger: Option<LoadEvent>,
    ) -> Loaded {
        let recorder = Recorder {
            events: Mutex::new(Vec::new()),
            session: &fixture.session,
            trigger,
        };
        let result = loader.load(&fixture.session, request, &recorder);
        let events = recorder.events.into_inner().unwrap();
        (result, events)
    }

    fn load_and_enter(fixture: &Fixture) {
        let (result, _) = run_load(fixture, None);
        assert!(matches!(result, Ok(LoadOutcome::Ready { .. })));
        let entered = fixture.loader.enter(&fixture.session).unwrap();
        assert!(matches!(entered, EnterOutcome::Entered { .. }));
    }

    fn collect_files(base: &Path, dir: &Path, out: &mut BTreeMap<String, Vec<u8>>) {
        for entry in fs::read_dir(dir).unwrap() {
            let path = entry.unwrap().path();
            let name = path
                .strip_prefix(base)
                .unwrap()
                .to_string_lossy()
                .to_string();
            if path.is_dir() {
                out.insert(name, Vec::new());
                collect_files(base, &path, out);
            } else {
                out.insert(name, fs::read(&path).unwrap());
            }
        }
    }

    fn snapshot(folder: &Path) -> BTreeMap<String, Vec<u8>> {
        let mut out = BTreeMap::new();
        collect_files(folder, folder, &mut out);
        out
    }

    fn populate(folder: &Path) {
        fs::write(folder.join("notes.txt"), b"keep me").unwrap();
        fs::create_dir(folder.join("chapters")).unwrap();
        fs::write(folder.join("chapters").join("one.md"), b"# one").unwrap();
    }

    fn db_file(fixture: &Fixture) -> PathBuf {
        fixture.folder.join(WORKSPACE_DB_FILE)
    }

    fn history_rows(path: &Path) -> i64 {
        let conn = Connection::open(path).unwrap();
        conn.query_row("SELECT COUNT(*) FROM sys_migration_history", [], |row| {
            row.get(0)
        })
        .unwrap()
    }

    fn read_logs(fixture: &Fixture) -> String {
        let mut content = String::new();
        for entry in fs::read_dir(&fixture.container.directories.logs).unwrap() {
            content.push_str(&fs::read_to_string(entry.unwrap().path()).unwrap());
        }
        content
    }

    fn step_errors(events: &[LoadEvent]) -> Vec<LoadStep> {
        let mut steps = Vec::new();
        for event in events {
            if let LoadEvent::Step {
                id,
                state: StepState::Error,
                ..
            } = event
            {
                steps.push(*id);
            }
        }
        steps
    }

    fn assert_nothing_recorded(fixture: &Fixture) {
        assert!(fixture.service.recent_list().is_empty());
        assert_eq!(fixture.session.current(), None);
        assert_eq!(fixture.session.cancel(), CancelOutcome::Cancelled);
    }

    fn cancel_triggers() -> Vec<LoadEvent> {
        vec![
            running(LoadStep::Application),
            done(LoadStep::Application),
            running(LoadStep::Backend),
            done(LoadStep::Backend),
            running(LoadStep::Workspace),
            done(LoadStep::Workspace),
            progress(100),
        ]
    }

    fn drop_recent_table(fixture: &Fixture) {
        let conn = Connection::open(&fixture.container.database_path).unwrap();
        conn.execute_batch("DROP TABLE app_workspaces;").unwrap();
    }

    fn make_newer_workspace_db(path: &Path) {
        let mut database = Database::create(path).unwrap();
        let cancel = AtomicBool::new(false);
        Migrator::migrate(
            database.connection_mut(),
            &workspace_scripts().unwrap(),
            &cancel,
        )
        .unwrap();
        database
            .connection()
            .execute(
                "INSERT INTO sys_migration_history (version, seq, name, applied_at) \
                 VALUES ('9.9.9', 0, 'future', '2030-01-01T00:00:00Z')",
                [],
            )
            .unwrap();
    }

    fn assert_send_sync<T: Send + Sync>() {}

    #[test]
    fn session_and_loader_are_thread_safe() {
        assert_send_sync::<WorkspaceSession>();
        assert_send_sync::<WorkspaceLoader>();
    }

    #[test]
    fn create_in_folder_with_files_only_adds_workspace_db() {
        let fixture = fixture();
        populate(&fixture.folder);
        let before = snapshot(&fixture.folder);
        let (result, _) = run_load(&fixture, None);
        assert_eq!(
            result.unwrap(),
            LoadOutcome::Ready {
                name: "Novel".to_string(),
                path: text(&fixture.folder).to_string(),
                mode: LoadMode::Create,
            }
        );
        let mut after = snapshot(&fixture.folder);
        let created = after.remove(WORKSPACE_DB_FILE);
        assert!(created.is_some());
        assert_eq!(before, after);
        assert!(fixture.container.database_path.is_file());
        assert!(fixture.service.recent_list().is_empty());
    }

    #[test]
    fn enter_records_recent_and_sets_current() {
        let fixture = fixture();
        load_and_enter(&fixture);
        let views = fixture.service.recent_list();
        assert_eq!(views.len(), 1);
        assert_eq!(views[0].name, "Novel");
        assert_eq!(views[0].status, StatusKind::Ok);
        let current = fixture.session.current().unwrap();
        assert_eq!(current.name, "Novel");
        assert_eq!(current.path, text(&fixture.folder));
        assert_eq!(fixture.session.cancel(), CancelOutcome::AlreadyEntered);
        assert!(db_file(&fixture).is_file());
    }

    #[test]
    fn reopen_existing_workspace_uses_open_mode() {
        let fixture = fixture();
        load_and_enter(&fixture);
        let (result, events) = run_load(&fixture, None);
        assert_eq!(
            result.unwrap(),
            LoadOutcome::Ready {
                name: "Novel".to_string(),
                path: text(&fixture.folder).to_string(),
                mode: LoadMode::Open,
            }
        );
        assert!(matches!(
            events.first(),
            Some(LoadEvent::Started {
                mode: LoadMode::Open,
                ..
            })
        ));
        fixture.loader.enter(&fixture.session).unwrap();
        assert_eq!(fixture.service.recent_list().len(), 1);
        assert_eq!(history_rows(&db_file(&fixture)), 6);
    }

    #[test]
    fn events_follow_the_three_step_order_with_thirds_progress() {
        let fixture = fixture();
        let (result, events) = run_load(&fixture, None);
        assert!(result.is_ok());
        let expected = vec![
            LoadEvent::Started {
                mode: LoadMode::Create,
                name: "Novel".to_string(),
                path: text(&fixture.folder).to_string(),
            },
            running(LoadStep::Application),
            done(LoadStep::Application),
            progress(33),
            running(LoadStep::Backend),
            done(LoadStep::Backend),
            progress(66),
            running(LoadStep::Workspace),
            done(LoadStep::Workspace),
            progress(100),
        ];
        assert_eq!(events, expected);
    }

    #[test]
    fn events_serialize_to_contract_shape() {
        let started = LoadEvent::Started {
            mode: LoadMode::Create,
            name: "Novel".to_string(),
            path: "D:\\Novel".to_string(),
        };
        assert_eq!(
            serde_json::to_value(started).unwrap(),
            json!({"kind": "started", "mode": "create", "name": "Novel", "path": "D:\\Novel"})
        );
        assert_eq!(
            serde_json::to_value(running(LoadStep::Workspace)).unwrap(),
            json!({"kind": "step", "id": "workspace", "state": "running"})
        );
        let failed = LoadEvent::Step {
            id: LoadStep::Application,
            state: StepState::Error,
            detail: Some("boom".to_string()),
        };
        assert_eq!(
            serde_json::to_value(failed).unwrap(),
            json!({"kind": "step", "id": "application", "state": "error", "detail": "boom"})
        );
        assert_eq!(
            serde_json::to_value(progress(75)).unwrap(),
            json!({"kind": "progress", "percent": 75})
        );
        let error = LoadError::new(LoadStep::Workspace, ErrorCode::FolderNotWritable, "denied");
        assert_eq!(
            serde_json::to_value(error).unwrap(),
            json!({"step": "workspace", "code": "folder_not_writable", "detail": "denied"})
        );
        let ready = LoadOutcome::Ready {
            name: "N".to_string(),
            path: "P".to_string(),
            mode: LoadMode::Open,
        };
        assert_eq!(
            serde_json::to_value(ready).unwrap(),
            json!({"result": "ready", "name": "N", "path": "P", "mode": "open"})
        );
        assert_eq!(
            serde_json::to_value(LoadOutcome::Cancelled).unwrap(),
            json!({"result": "cancelled"})
        );
        assert_eq!(
            serde_json::to_value(CancelOutcome::AlreadyEntered).unwrap(),
            json!({"result": "already_entered"})
        );
        let entered = EnterOutcome::Entered {
            name: "N".to_string(),
            path: "P".to_string(),
        };
        let value: Value = serde_json::to_value(entered).unwrap();
        assert_eq!(
            value,
            json!({"result": "entered", "name": "N", "path": "P"})
        );
    }

    #[test]
    fn default_probe_leaves_no_file_behind() {
        let fixture = fixture();
        default_write_probe(&fixture.folder).unwrap();
        assert_eq!(fs::read_dir(&fixture.folder).unwrap().count(), 0);
    }

    #[test]
    fn folder_not_writable_stops_the_workspace_step_and_stops_the_backend() {
        let mut fixture = fixture();
        populate(&fixture.folder);
        fixture.loader = fixture.loader.clone().with_write_probe(deny_write);
        let before = snapshot(&fixture.folder);
        let (result, events) = run_load(&fixture, None);
        let error = result.unwrap_err();
        assert_eq!(error.step, LoadStep::Workspace);
        assert_eq!(error.code, ErrorCode::FolderNotWritable);
        assert!(error.detail.contains("access is denied"));
        assert_eq!(step_errors(&events), vec![LoadStep::Workspace]);
        assert_eq!(
            events[7..],
            [
                running(LoadStep::Workspace),
                LoadEvent::Step {
                    id: LoadStep::Workspace,
                    state: StepState::Error,
                    detail: Some(error.detail.clone()),
                },
            ]
        );
        assert_eq!(snapshot(&fixture.folder), before);
        assert!(fixture.container.database_path.is_file());
        assert_eq!(fixture.backend.stopped(), 1);
        assert_nothing_recorded(&fixture);
        let logs = read_logs(&fixture);
        assert!(logs.contains("step=workspace result=error code=folder_not_writable"));
    }

    #[test]
    fn missing_folder_reports_folder_missing() {
        let fixture = fixture();
        let missing = fixture.dir.path().join("gone");
        let (result, _) = run_load_at(&fixture, &missing, None);
        let error = result.unwrap_err();
        assert_eq!(error.step, LoadStep::Workspace);
        assert_eq!(error.code, ErrorCode::FolderMissing);
        assert!(!missing.exists());
        assert_nothing_recorded(&fixture);
    }

    #[test]
    fn path_to_file_reports_not_directory() {
        let fixture = fixture();
        let file = fixture.dir.path().join("file.txt");
        fs::write(&file, b"data").unwrap();
        let (result, _) = run_load_at(&fixture, &file, None);
        let error = result.unwrap_err();
        assert_eq!(error.code, ErrorCode::FolderNotDirectory);
        assert_eq!(fs::read(&file).unwrap(), b"data");
        assert_nothing_recorded(&fixture);
    }

    #[test]
    fn newer_workspace_db_is_reported_and_untouched() {
        let fixture = fixture();
        make_newer_workspace_db(&db_file(&fixture));
        let before = fs::read(db_file(&fixture)).unwrap();
        let (result, events) = run_load(&fixture, None);
        let error = result.unwrap_err();
        assert_eq!(error.step, LoadStep::Workspace);
        assert_eq!(error.code, ErrorCode::DbNewerVersion);
        assert_eq!(step_errors(&events), vec![LoadStep::Workspace]);
        assert_eq!(fs::read(db_file(&fixture)).unwrap(), before);
        assert_eq!(fs::read_dir(&fixture.folder).unwrap().count(), 1);
        assert_nothing_recorded(&fixture);
    }

    #[test]
    fn corrupt_workspace_db_is_reported_and_kept() {
        let fixture = fixture();
        let garbage: Vec<u8> = (0..8192u32)
            .map(|i| ((i.wrapping_mul(2654435761) >> 13) as u8) | 0x80)
            .collect();
        fs::write(db_file(&fixture), &garbage).unwrap();
        let (result, events) = run_load(&fixture, None);
        let error = result.unwrap_err();
        assert_eq!(error.step, LoadStep::Workspace);
        assert_eq!(error.code, ErrorCode::DbCorrupt);
        assert_eq!(step_errors(&events), vec![LoadStep::Workspace]);
        assert_eq!(fs::read(db_file(&fixture)).unwrap(), garbage);
        assert!(fixture.container.database_path.is_file());
        assert_nothing_recorded(&fixture);
    }

    #[test]
    fn cancel_at_each_step_removes_created_workspace_db() {
        for trigger in cancel_triggers() {
            let fixture = fixture();
            populate(&fixture.folder);
            let before = snapshot(&fixture.folder);
            let (result, _) = run_load(&fixture, Some(trigger.clone()));
            assert_eq!(result.unwrap(), LoadOutcome::Cancelled, "{trigger:?}");
            assert_eq!(snapshot(&fixture.folder), before, "{trigger:?}");
            assert_nothing_recorded(&fixture);
        }
    }

    #[test]
    fn cancel_keeps_application_db_once_it_exists() {
        let late = [
            done(LoadStep::Application),
            running(LoadStep::Backend),
            done(LoadStep::Backend),
            running(LoadStep::Workspace),
            done(LoadStep::Workspace),
            progress(100),
        ];
        for trigger in late {
            let fixture = fixture();
            let (result, _) = run_load(&fixture, Some(trigger.clone()));
            assert_eq!(result.unwrap(), LoadOutcome::Cancelled);
            assert!(fixture.container.database_path.is_file(), "{trigger:?}");
            assert_eq!(history_rows(&fixture.container.database_path), 2);
        }
    }

    #[test]
    fn cancel_keeps_existing_workspace_and_recent_entry() {
        for trigger in cancel_triggers() {
            let fixture = fixture();
            load_and_enter(&fixture);
            let recent_before = fixture.service.recent_list();
            let (result, _) = run_load(&fixture, Some(trigger.clone()));
            assert_eq!(result.unwrap(), LoadOutcome::Cancelled, "{trigger:?}");
            assert!(db_file(&fixture).is_file(), "{trigger:?}");
            assert_eq!(history_rows(&db_file(&fixture)), 6, "{trigger:?}");
            assert!(fixture.container.database_path.is_file());
            assert_eq!(fixture.service.recent_list(), recent_before, "{trigger:?}");
        }
    }

    #[test]
    fn cancel_after_last_step_before_enter_cleans_up() {
        let fixture = fixture();
        let (result, _) = run_load(&fixture, None);
        assert!(matches!(result, Ok(LoadOutcome::Ready { .. })));
        assert!(db_file(&fixture).is_file());
        assert_eq!(fixture.session.cancel(), CancelOutcome::Cancelled);
        assert!(!db_file(&fixture).exists());
        assert!(fixture.container.database_path.is_file());
        assert_eq!(
            fixture.loader.enter(&fixture.session).unwrap(),
            EnterOutcome::Cancelled
        );
        assert_nothing_recorded(&fixture);
    }

    #[test]
    fn cancel_after_ready_keeps_existing_workspace_db() {
        let fixture = fixture();
        load_and_enter(&fixture);
        let (result, _) = run_load(&fixture, None);
        assert!(matches!(result, Ok(LoadOutcome::Ready { .. })));
        assert_eq!(fixture.session.cancel(), CancelOutcome::Cancelled);
        assert!(db_file(&fixture).is_file());
        assert_eq!(history_rows(&db_file(&fixture)), 6);
    }

    #[test]
    fn reopen_after_cancel_works() {
        let fixture = fixture();
        let (cancelled, _) = run_load(&fixture, Some(done(LoadStep::Workspace)));
        assert_eq!(cancelled.unwrap(), LoadOutcome::Cancelled);
        assert!(!db_file(&fixture).exists());
        load_and_enter(&fixture);
        assert!(db_file(&fixture).is_file());
        assert_eq!(fixture.service.recent_list().len(), 1);
    }

    #[test]
    fn new_load_supersedes_a_ready_one() {
        let fixture = fixture();
        let other = fixture.dir.path().join("Other");
        fs::create_dir(&other).unwrap();
        let (first, _) = run_load(&fixture, None);
        assert!(first.is_ok());
        let (second, _) = run_load_at(&fixture, &other, None);
        assert!(second.is_ok());
        assert!(!db_file(&fixture).exists());
        let entered = fixture.loader.enter(&fixture.session).unwrap();
        assert_eq!(
            entered,
            EnterOutcome::Entered {
                name: "Other".to_string(),
                path: text(&other).to_string(),
            }
        );
    }

    #[test]
    fn cancel_then_enter_cancelled_wins() {
        let fixture = fixture();
        run_load(&fixture, None).0.unwrap();
        assert_eq!(fixture.session.cancel(), CancelOutcome::Cancelled);
        assert_eq!(
            fixture.loader.enter(&fixture.session).unwrap(),
            EnterOutcome::Cancelled
        );
        assert!(fixture.service.recent_list().is_empty());
    }

    #[test]
    fn enter_then_cancel_already_entered_wins() {
        let fixture = fixture();
        load_and_enter(&fixture);
        assert_eq!(fixture.session.cancel(), CancelOutcome::AlreadyEntered);
        assert!(db_file(&fixture).is_file());
        assert_eq!(fixture.service.recent_list().len(), 1);
    }

    #[test]
    fn concurrent_enter_and_cancel_have_exactly_one_winner() {
        for _ in 0..10 {
            let fixture = fixture();
            run_load(&fixture, None).0.unwrap();
            let (entered, cancelled) = std::thread::scope(|scope| {
                let enter = scope.spawn(|| fixture.loader.enter(&fixture.session));
                let cancel = scope.spawn(|| fixture.session.cancel());
                (enter.join().unwrap().unwrap(), cancel.join().unwrap())
            });
            match (entered, cancelled) {
                (EnterOutcome::Entered { .. }, CancelOutcome::AlreadyEntered) => {
                    assert!(db_file(&fixture).is_file());
                    assert_eq!(fixture.service.recent_list().len(), 1);
                    assert!(fixture.session.current().is_some());
                }
                (EnterOutcome::Cancelled, CancelOutcome::Cancelled) => {
                    assert!(!db_file(&fixture).exists());
                    assert!(fixture.service.recent_list().is_empty());
                    assert!(fixture.session.current().is_none());
                }
                other => panic!("both sides won or lost: {other:?}"),
            }
        }
    }

    #[test]
    fn enter_failure_cleans_up_created_workspace() {
        let fixture = fixture();
        run_load(&fixture, None).0.unwrap();
        drop_recent_table(&fixture);
        let error = fixture.loader.enter(&fixture.session).unwrap_err();
        assert_eq!(error.step, LoadStep::Application);
        assert!(!db_file(&fixture).exists());
        assert!(fixture.container.database_path.is_file());
        assert_eq!(fixture.session.current(), None);
        assert_eq!(
            fixture.loader.enter(&fixture.session).unwrap(),
            EnterOutcome::Cancelled
        );
        assert!(read_logs(&fixture).contains("enter result=error"));
    }

    #[test]
    fn enter_failure_keeps_existing_workspace() {
        let fixture = fixture();
        load_and_enter(&fixture);
        run_load(&fixture, None).0.unwrap();
        drop_recent_table(&fixture);
        assert!(fixture.loader.enter(&fixture.session).is_err());
        assert!(db_file(&fixture).is_file());
        assert_eq!(history_rows(&db_file(&fixture)), 6);
    }

    #[test]
    fn relocate_replaces_the_old_recent_entry() {
        let fixture = fixture();
        let old = fixture.dir.path().join("Old");
        load_and_enter(&fixture);
        fixture
            .service
            .record_opened(text(&old), chrono::Utc::now())
            .unwrap();
        let moved = fixture.dir.path().join("Moved");
        fs::create_dir(&moved).unwrap();
        let request = LoadRequest::new(text(&moved), Some(text(&old).to_string()));
        let (result, _) = run_request(&fixture, request, None);
        assert!(result.is_ok());
        fixture.loader.enter(&fixture.session).unwrap();
        let names: Vec<String> = fixture
            .service
            .recent_list()
            .into_iter()
            .map(|view| view.name)
            .collect();
        assert_eq!(names.len(), 2);
        assert!(names.contains(&"Moved".to_string()));
        assert!(!names.contains(&"Old".to_string()));
    }

    #[test]
    fn logs_failure_stops_the_application_step_before_backend_and_workspace() {
        let fixture = fixture();
        fs::create_dir_all(&fixture.container.directories.root).unwrap();
        fs::write(&fixture.container.directories.logs, b"occupied").unwrap();
        let (result, events) = run_load(&fixture, None);
        let error = result.unwrap_err();
        assert_eq!(error.step, LoadStep::Application);
        assert_eq!(error.code, ErrorCode::LogsFailed);
        assert_eq!(step_errors(&events), vec![LoadStep::Application]);
        assert!(!db_file(&fixture).exists());
        assert!(fixture.container.database_path.is_file());
        assert_eq!(fixture.backend.started(), 0);
        assert_nothing_recorded(&fixture);
    }

    #[test]
    fn backend_failure_reports_the_step_and_cleans_up() {
        let cases = [
            (
                BackendError::Missing("absent".to_string()),
                ErrorCode::BackendMissing,
            ),
            (
                BackendError::StartFailed("exited".to_string()),
                ErrorCode::BackendStartFailed,
            ),
            (
                BackendError::Timeout("slow".to_string()),
                ErrorCode::BackendTimeout,
            ),
        ];
        for (failure, code) in cases {
            let detail = failure.to_string();
            let fixture = fixture_with(StubBackend::failing(failure));
            let (result, events) = run_load(&fixture, None);
            let error = result.unwrap_err();
            assert_eq!(error.step, LoadStep::Backend, "{detail}");
            assert_eq!(error.code, code, "{detail}");
            assert_eq!(step_errors(&events), vec![LoadStep::Backend]);
            assert!(!db_file(&fixture).exists());
            assert!(fixture.container.database_path.is_file());
            assert_eq!(fixture.backend.started(), 0);
            assert_nothing_recorded(&fixture);
        }
    }

    #[test]
    fn backend_start_is_logged_with_its_port() {
        let fixture = fixture();
        run_load(&fixture, None).0.unwrap();
        assert_eq!(fixture.backend.started(), 1);
        assert_eq!(fixture.backend.stopped(), 0);
        assert!(read_logs(&fixture).contains("backend ready port=4321 spawned=true"));
    }

    #[test]
    fn cancel_after_backend_started_stops_it() {
        let fixture = fixture();
        let (result, _) = run_load(&fixture, Some(done(LoadStep::Backend)));
        assert_eq!(result.unwrap(), LoadOutcome::Cancelled);
        assert_eq!(fixture.backend.started(), 1);
        assert_eq!(fixture.backend.stopped(), 1);
        assert_nothing_recorded(&fixture);
    }

    #[test]
    fn cancel_while_starting_backend_does_not_start_it() {
        let fixture = fixture();
        let (result, _) = run_load(&fixture, Some(running(LoadStep::Backend)));
        assert_eq!(result.unwrap(), LoadOutcome::Cancelled);
        assert_eq!(fixture.backend.started(), 0);
        assert!(!db_file(&fixture).exists());
        assert_nothing_recorded(&fixture);
    }

    #[test]
    fn log_file_records_each_step_result() {
        let fixture = fixture();
        run_load(&fixture, None).0.unwrap();
        let logs = read_logs(&fixture);
        for step in LoadStep::ALL {
            let expected = format!("load step={step} result=done");
            assert!(logs.contains(&expected), "{expected}");
        }
        for check in ["app_db", "logs", "folder", "workspace_db"] {
            let expected = format!("load check={check} result=done");
            assert!(logs.contains(&expected), "{expected}");
        }
        assert!(logs.contains("load started mode=create"));
        assert!(logs.contains("load result=ready"));
        assert!(logs.contains(" INFO workspace "));
    }

    #[test]
    fn log_file_records_cancellation() {
        let fixture = fixture();
        run_load(&fixture, Some(done(LoadStep::Application)))
            .0
            .unwrap();
        let logs = read_logs(&fixture);
        assert!(logs.contains("load step=application result=done"));
        assert!(logs.contains("load result=cancelled"));
    }

    struct Baseline {
        current: Option<CurrentWorkspace>,
        list: Vec<RecentWorkspaceView>,
        files: BTreeMap<String, Vec<u8>>,
    }

    fn make_target(fixture: &Fixture, name: &str) -> PathBuf {
        let folder = fixture.dir.path().join(name);
        fs::create_dir(&folder).unwrap();
        folder
    }

    fn target_db(folder: &Path) -> PathBuf {
        folder.join(WORKSPACE_DB_FILE)
    }

    fn garbage_bytes() -> Vec<u8> {
        (0..8192u32)
            .map(|i| ((i.wrapping_mul(2654435761) >> 13) as u8) | 0x80)
            .collect()
    }

    fn open_first(fixture: &Fixture) -> Baseline {
        populate(&fixture.folder);
        load_and_enter(fixture);
        baseline(fixture)
    }

    fn baseline(fixture: &Fixture) -> Baseline {
        let current = fixture.session.current();
        Baseline {
            list: fixture.service.recent_list_for(current.as_ref()),
            files: snapshot(&fixture.folder),
            current,
        }
    }

    fn assert_first_kept(fixture: &Fixture, base: &Baseline, label: &str) {
        assert_eq!(fixture.session.current(), base.current, "{label}");
        let list = fixture.service.recent_list_for(base.current.as_ref());
        assert_eq!(list, base.list, "{label}");
        assert_eq!(snapshot(&fixture.folder), base.files, "{label}");
        assert_eq!(history_rows(&db_file(fixture)), 6, "{label}");
        assert!(fixture.container.database_path.is_file(), "{label}");
        assert_eq!(fixture.backend.stopped(), 0, "{label}");
    }

    fn listed(fixture: &Fixture) -> Vec<(String, bool)> {
        let current = fixture.session.current();
        let views = fixture.service.recent_list_for(current.as_ref());
        views
            .into_iter()
            .map(|view| (view.name, view.is_current))
            .collect()
    }

    fn recent_names(fixture: &Fixture) -> Vec<String> {
        fixture
            .service
            .recent_list()
            .into_iter()
            .map(|view| view.name)
            .collect()
    }

    fn record_old_entry(fixture: &Fixture) -> PathBuf {
        let old = fixture.dir.path().join("Old");
        fixture
            .service
            .record_opened(text(&old), chrono::Utc::now())
            .unwrap();
        old
    }

    #[test]
    fn switch_enters_the_target_and_lists_it_first() {
        let fixture = fixture_with(StubBackend::reusing());
        let base = open_first(&fixture);
        let second = make_target(&fixture, "Second");
        let (result, _) = run_load_at(&fixture, &second, None);
        assert!(matches!(result, Ok(LoadOutcome::Ready { .. })));
        assert_eq!(fixture.session.current(), base.current);
        let entered = fixture.loader.enter(&fixture.session).unwrap();
        assert_eq!(
            entered,
            EnterOutcome::Entered {
                name: "Second".to_string(),
                path: text(&second).to_string(),
            }
        );
        let current = fixture.session.current().unwrap();
        assert_eq!(current.name, "Second");
        assert_eq!(current.path, text(&second));
        let shouted = format!("{}\\", text(&second).to_uppercase());
        assert!(fixture.session.is_current(&shouted));
        assert!(!fixture.session.is_current(text(&fixture.folder)));
        assert_eq!(
            listed(&fixture),
            vec![("Second".to_string(), true), ("Novel".to_string(), false)]
        );
        assert!(target_db(&second).is_file());
        assert!(db_file(&fixture).is_file());
        assert_eq!(fixture.backend.stopped(), 0);
    }

    #[test]
    fn switch_fails_on_unwritable_folder_and_keeps_the_open_workspace() {
        let mut fixture = fixture_with(StubBackend::reusing());
        let base = open_first(&fixture);
        let second = make_target(&fixture, "Second");
        fixture.loader = fixture.loader.clone().with_write_probe(deny_write);
        let (result, events) = run_load_at(&fixture, &second, None);
        let error = result.unwrap_err();
        assert_eq!(error.step, LoadStep::Workspace);
        assert_eq!(error.code, ErrorCode::FolderNotWritable);
        assert_eq!(step_errors(&events), vec![LoadStep::Workspace]);
        assert!(!target_db(&second).exists());
        assert_first_kept(&fixture, &base, "unwritable");
    }

    #[test]
    fn switch_fails_on_newer_database_and_keeps_the_open_workspace() {
        let fixture = fixture_with(StubBackend::reusing());
        let base = open_first(&fixture);
        let second = make_target(&fixture, "Second");
        make_newer_workspace_db(&target_db(&second));
        let before = fs::read(target_db(&second)).unwrap();
        let (result, _) = run_load_at(&fixture, &second, None);
        assert_eq!(result.unwrap_err().code, ErrorCode::DbNewerVersion);
        assert_eq!(fs::read(target_db(&second)).unwrap(), before);
        assert_first_kept(&fixture, &base, "newer");
    }

    #[test]
    fn switch_fails_on_corrupt_database_and_keeps_the_open_workspace() {
        let fixture = fixture_with(StubBackend::reusing());
        let base = open_first(&fixture);
        let second = make_target(&fixture, "Second");
        let garbage = garbage_bytes();
        fs::write(target_db(&second), &garbage).unwrap();
        let (result, _) = run_load_at(&fixture, &second, None);
        assert_eq!(result.unwrap_err().code, ErrorCode::DbCorrupt);
        assert_eq!(fs::read(target_db(&second)).unwrap(), garbage);
        assert_first_kept(&fixture, &base, "corrupt");
    }

    #[test]
    fn switch_fails_on_backend_error_and_keeps_the_open_workspace() {
        let fixture = fixture_with(StubBackend::reusing());
        let base = open_first(&fixture);
        let second = make_target(&fixture, "Second");
        let failing = Arc::new(StubBackend::failing(BackendError::StartFailed(
            "exited".to_string(),
        )));
        let loader = WorkspaceLoader::new(
            fixture.container.directories.root.clone(),
            fixture.container.database_path.clone(),
            fixture.container.logger.clone(),
            fixture.service.clone(),
            failing.clone(),
        );
        let request = LoadRequest::new(text(&second), None);
        let (result, events) = run_request_on(&loader, &fixture, request, None);
        assert_eq!(result.unwrap_err().code, ErrorCode::BackendStartFailed);
        assert_eq!(step_errors(&events), vec![LoadStep::Backend]);
        assert_eq!(failing.stopped(), 0);
        assert!(!target_db(&second).exists());
        assert_first_kept(&fixture, &base, "backend");
    }

    #[test]
    fn switch_enter_failure_removes_created_database_and_keeps_the_open_workspace() {
        let fixture = fixture_with(StubBackend::reusing());
        let base = open_first(&fixture);
        let second = make_target(&fixture, "Second");
        let (result, _) = run_load_at(&fixture, &second, None);
        assert!(matches!(result, Ok(LoadOutcome::Ready { .. })));
        assert!(target_db(&second).is_file());
        drop_recent_table(&fixture);
        let error = fixture.loader.enter(&fixture.session).unwrap_err();
        assert_eq!(error.step, LoadStep::Application);
        assert!(!target_db(&second).exists());
        assert_eq!(fixture.session.current(), base.current);
        assert_eq!(snapshot(&fixture.folder), base.files);
        assert_eq!(fixture.backend.stopped(), 0);
    }

    #[test]
    fn switch_cancel_at_each_step_keeps_the_open_workspace() {
        for trigger in cancel_triggers() {
            let fixture = fixture_with(StubBackend::reusing());
            let base = open_first(&fixture);
            let second = make_target(&fixture, "Second");
            let (result, _) = run_load_at(&fixture, &second, Some(trigger.clone()));
            assert_eq!(result.unwrap(), LoadOutcome::Cancelled, "{trigger:?}");
            assert!(!target_db(&second).exists(), "{trigger:?}");
            assert_first_kept(&fixture, &base, &format!("{trigger:?}"));
        }
    }

    #[test]
    fn switch_cancel_after_last_step_before_enter_keeps_the_open_workspace() {
        let fixture = fixture_with(StubBackend::reusing());
        let base = open_first(&fixture);
        let second = make_target(&fixture, "Second");
        let (result, _) = run_load_at(&fixture, &second, None);
        assert!(matches!(result, Ok(LoadOutcome::Ready { .. })));
        assert!(target_db(&second).is_file());
        assert_eq!(fixture.session.cancel(), CancelOutcome::Cancelled);
        assert!(!target_db(&second).exists());
        assert_eq!(
            fixture.loader.enter(&fixture.session).unwrap(),
            EnterOutcome::Cancelled
        );
        assert_first_kept(&fixture, &base, "cancel before enter");
    }

    #[test]
    fn relocate_failure_keeps_the_not_found_entry() {
        let mut fixture = fixture_with(StubBackend::reusing());
        open_first(&fixture);
        let old = record_old_entry(&fixture);
        let base = baseline(&fixture);
        let moved = make_target(&fixture, "Moved");
        fixture.loader = fixture.loader.clone().with_write_probe(deny_write);
        let request = LoadRequest::new(text(&moved), Some(text(&old).to_string()));
        let (result, _) = run_request(&fixture, request, None);
        assert!(result.is_err());
        assert_first_kept(&fixture, &base, "relocate failure");
        let names = recent_names(&fixture);
        assert!(names.contains(&"Old".to_string()));
        assert!(!names.contains(&"Moved".to_string()));
        let old_row = fixture
            .service
            .recent_list()
            .into_iter()
            .find(is_old_row)
            .unwrap();
        assert_eq!(old_row.status, StatusKind::NotFound);
    }

    fn is_old_row(view: &RecentWorkspaceView) -> bool {
        view.name == "Old"
    }

    #[test]
    fn relocate_cancel_keeps_the_not_found_entry() {
        for trigger in cancel_triggers() {
            let fixture = fixture_with(StubBackend::reusing());
            open_first(&fixture);
            let old = record_old_entry(&fixture);
            let base = baseline(&fixture);
            let moved = make_target(&fixture, "Moved");
            let request = LoadRequest::new(text(&moved), Some(text(&old).to_string()));
            let (result, _) = run_request(&fixture, request, Some(trigger.clone()));
            assert_eq!(result.unwrap(), LoadOutcome::Cancelled, "{trigger:?}");
            assert_first_kept(&fixture, &base, &format!("{trigger:?}"));
            let names = recent_names(&fixture);
            assert!(names.contains(&"Old".to_string()), "{trigger:?}");
            assert!(!names.contains(&"Moved".to_string()), "{trigger:?}");
        }
    }

    #[test]
    fn relocate_onto_another_entry_removes_the_old_entry() {
        let fixture = fixture_with(StubBackend::reusing());
        open_first(&fixture);
        let existing = make_target(&fixture, "Existing");
        fixture
            .service
            .record_opened(text(&existing), chrono::Utc::now())
            .unwrap();
        let old = record_old_entry(&fixture);
        let request = LoadRequest::new(text(&existing), Some(text(&old).to_string()));
        let (result, _) = run_request(&fixture, request, None);
        assert!(matches!(result, Ok(LoadOutcome::Ready { .. })));
        fixture.loader.enter(&fixture.session).unwrap();
        assert_eq!(
            listed(&fixture),
            vec![("Existing".to_string(), true), ("Novel".to_string(), false)]
        );
        assert_eq!(fixture.session.current().unwrap().name, "Existing");
    }

    #[test]
    fn cancel_after_a_cancelled_switch_reports_already_entered() {
        let fixture = fixture_with(StubBackend::reusing());
        let base = open_first(&fixture);
        let second = make_target(&fixture, "Second");
        let trigger = Some(done(LoadStep::Workspace));
        let (result, _) = run_load_at(&fixture, &second, trigger);
        assert_eq!(result.unwrap(), LoadOutcome::Cancelled);
        assert_eq!(fixture.session.cancel(), CancelOutcome::AlreadyEntered);
        assert_first_kept(&fixture, &base, "late cancel");
    }

    #[test]
    fn too_early_cancel_is_ignored_and_a_later_cancel_discards_the_load() {
        let fixture = fixture_with(StubBackend::reusing());
        let base = open_first(&fixture);
        let second = make_target(&fixture, "Second");
        assert_eq!(fixture.session.cancel(), CancelOutcome::AlreadyEntered);
        let (result, _) = run_load_at(&fixture, &second, None);
        assert!(matches!(result, Ok(LoadOutcome::Ready { .. })));
        assert!(target_db(&second).is_file());
        assert_eq!(fixture.session.cancel(), CancelOutcome::Cancelled);
        assert!(!target_db(&second).exists());
        assert_first_kept(&fixture, &base, "too early cancel");
    }
}
