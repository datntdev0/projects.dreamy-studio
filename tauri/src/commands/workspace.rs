use crate::features::workspace::load::CancelOutcome;
use crate::features::workspace::load::EnterOutcome;
use crate::features::workspace::load::ErrorCode;
use crate::features::workspace::load::LoadError;
use crate::features::workspace::load::LoadEvent;
use crate::features::workspace::load::LoadEventSink;
use crate::features::workspace::load::LoadOutcome;
use crate::features::workspace::load::LoadRequest;
use crate::features::workspace::load::LoadStep;
use crate::features::workspace::loader::WorkspaceLoader;
use crate::features::workspace::service::RecentWorkspaceView;
use crate::features::workspace::service::WorkspaceService;
use crate::features::workspace::session::CurrentWorkspace;
use crate::features::workspace::session::WorkspaceSession;
use tauri::AppHandle;
use tauri::Manager;
use tauri::async_runtime::spawn_blocking;
use tauri::ipc::Channel;
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_dialog::FilePath;

pub const MAIN_WINDOW_LABEL: &str = "main";
const PRODUCT_NAME: &str = "Dreamy Studio";

pub trait EventTarget {
    fn deliver(&self, event: LoadEvent) -> Result<(), String>;
}

impl EventTarget for Channel<LoadEvent> {
    fn deliver(&self, event: LoadEvent) -> Result<(), String> {
        self.send(event).map_err(|error| error.to_string())
    }
}

pub struct ChannelSink<T: EventTarget> {
    target: T,
}

impl<T: EventTarget> ChannelSink<T> {
    pub fn new(target: T) -> Self {
        Self { target }
    }
}

impl<T: EventTarget> LoadEventSink for ChannelSink<T> {
    fn emit(&self, event: LoadEvent) {
        if let Err(error) = self.target.deliver(event) {
            eprintln!("cannot forward load event: {error}");
        }
    }
}

pub fn window_title(name: &str) -> String {
    format!("{name} \u{2014} {PRODUCT_NAME}")
}

pub fn entered_title(outcome: &EnterOutcome) -> Option<String> {
    match outcome {
        EnterOutcome::Entered { name, .. } => Some(window_title(name)),
        EnterOutcome::Cancelled => None,
    }
}

pub fn picked_path(picked: Option<FilePath>) -> Option<String> {
    let path = picked?.into_path().ok()?;
    Some(path.to_string_lossy().into_owned())
}

pub fn task_failure(step: LoadStep, error: tauri::Error) -> LoadError {
    LoadError::new(step, ErrorCode::DbIo, error.to_string())
}

pub fn perform_load(
    loader: &WorkspaceLoader,
    session: &WorkspaceSession,
    request: LoadRequest,
    sink: &dyn LoadEventSink,
) -> Result<LoadOutcome, LoadError> {
    loader.load(session, request, sink)
}

fn list_recent(app: &AppHandle) -> Vec<RecentWorkspaceView> {
    app.state::<WorkspaceService>().recent_list()
}

fn measure_folder(app: &AppHandle, path: &str) -> u64 {
    app.state::<WorkspaceService>().measure(path)
}

fn remove_recent_entry(app: &AppHandle, path: &str) -> Result<(), LoadError> {
    let result = app.state::<WorkspaceService>().remove_recent(path);
    result.map_err(|error| LoadError::from_storage(LoadStep::Application, &error))
}

fn pick_folder(app: &AppHandle) -> Option<String> {
    picked_path(app.dialog().file().blocking_pick_folder())
}

fn load_workspace_blocking(
    app: &AppHandle,
    request: LoadRequest,
    sink: &dyn LoadEventSink,
) -> Result<LoadOutcome, LoadError> {
    let loader = app.state::<WorkspaceLoader>();
    let session = app.state::<WorkspaceSession>();
    perform_load(&loader, &session, request, sink)
}

fn enter_workspace_blocking(app: &AppHandle) -> Result<EnterOutcome, LoadError> {
    let loader = app.state::<WorkspaceLoader>();
    let session = app.state::<WorkspaceSession>();
    loader.enter(&session)
}

fn apply_window_title(app: &AppHandle, title: &str) {
    let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) else {
        eprintln!("cannot set window title: window {MAIN_WINDOW_LABEL} not found");
        return;
    };
    if let Err(error) = window.set_title(title) {
        eprintln!("cannot set window title: {error}");
    }
}

#[tauri::command]
pub async fn recent_list(app: AppHandle) -> Vec<RecentWorkspaceView> {
    let task = spawn_blocking(move || list_recent(&app));
    task.await.unwrap_or_default()
}

#[tauri::command]
pub async fn workspace_measure(app: AppHandle, path: String) -> u64 {
    let task = spawn_blocking(move || measure_folder(&app, &path));
    task.await.unwrap_or_default()
}

#[tauri::command]
pub async fn recent_remove(app: AppHandle, path: String) -> Result<(), LoadError> {
    let task = spawn_blocking(move || remove_recent_entry(&app, &path));
    match task.await {
        Ok(result) => result,
        Err(error) => Err(task_failure(LoadStep::Application, error)),
    }
}

#[tauri::command]
pub async fn folder_pick(app: AppHandle) -> Option<String> {
    let task = spawn_blocking(move || pick_folder(&app));
    task.await.unwrap_or_default()
}

#[tauri::command]
pub async fn workspace_load(
    app: AppHandle,
    path: String,
    relocate_from: Option<String>,
    channel: Channel<LoadEvent>,
) -> Result<LoadOutcome, LoadError> {
    let request = LoadRequest::new(path, relocate_from);
    let sink = ChannelSink::new(channel);
    let task = spawn_blocking(move || load_workspace_blocking(&app, request, &sink));
    match task.await {
        Ok(result) => result,
        Err(error) => Err(task_failure(LoadStep::Application, error)),
    }
}

#[tauri::command]
pub async fn workspace_cancel(app: AppHandle) -> CancelOutcome {
    app.state::<WorkspaceSession>().cancel()
}

#[tauri::command]
pub async fn workspace_enter(app: AppHandle) -> Result<EnterOutcome, LoadError> {
    let background = app.clone();
    let task = spawn_blocking(move || enter_workspace_blocking(&background));
    let outcome = match task.await {
        Ok(result) => result?,
        Err(error) => return Err(task_failure(LoadStep::Application, error)),
    };
    if let Some(title) = entered_title(&outcome) {
        apply_window_title(&app, &title);
    }
    Ok(outcome)
}

#[tauri::command]
pub async fn workspace_current(app: AppHandle) -> Option<CurrentWorkspace> {
    app.state::<WorkspaceSession>().current()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::container::AppContainer;
    use crate::features::workspace::load::LoadMode;
    use crate::features::workspace::load::StepState;
    use crate::features::workspace::repository::WorkspaceRepository;
    use crate::infra::backend::StubBackend;
    use std::path::PathBuf;
    use std::sync::Arc;
    use std::sync::Mutex;
    use tempfile::TempDir;
    use tempfile::tempdir;

    #[derive(Default)]
    struct RecordingTarget {
        events: Mutex<Vec<LoadEvent>>,
    }

    impl EventTarget for &RecordingTarget {
        fn deliver(&self, event: LoadEvent) -> Result<(), String> {
            self.events.lock().unwrap().push(event);
            Ok(())
        }
    }

    struct ClosedTarget {
        attempts: Mutex<u32>,
    }

    impl EventTarget for &ClosedTarget {
        fn deliver(&self, _event: LoadEvent) -> Result<(), String> {
            *self.attempts.lock().unwrap() += 1;
            Err("channel closed".to_string())
        }
    }

    struct Fixture {
        _dir: TempDir,
        workspace: PathBuf,
        loader: WorkspaceLoader,
        session: WorkspaceSession,
    }

    fn fixture() -> Fixture {
        let dir = tempdir().unwrap();
        let workspace = dir.path().join("studio");
        std::fs::create_dir(&workspace).unwrap();
        let backend = Arc::new(StubBackend::new());
        let container = AppContainer::with_backend(dir.path().join("DreamyStudio"), backend);
        let repository = WorkspaceRepository::new(container.database_path.clone());
        let service = WorkspaceService::new(repository);
        let loader = WorkspaceLoader::from_container(&container, service);
        Fixture {
            _dir: dir,
            workspace,
            loader,
            session: WorkspaceSession::new(),
        }
    }

    fn request(fixture: &Fixture) -> LoadRequest {
        LoadRequest::new(fixture.workspace.to_str().unwrap(), None)
    }

    fn is_done_step(event: &&LoadEvent) -> bool {
        matches!(
            event,
            LoadEvent::Step {
                state: StepState::Done,
                ..
            }
        )
    }

    #[test]
    fn forwards_every_event_to_the_target_in_order() {
        let target = RecordingTarget::default();
        let sink = ChannelSink::new(&target);

        sink.emit(LoadEvent::Progress { percent: 25 });
        sink.emit(LoadEvent::Progress { percent: 50 });

        let events = target.events.lock().unwrap();
        assert_eq!(
            *events,
            vec![
                LoadEvent::Progress { percent: 25 },
                LoadEvent::Progress { percent: 50 },
            ]
        );
    }

    #[test]
    fn failed_delivery_does_not_panic_and_keeps_going() {
        let target = ClosedTarget {
            attempts: Mutex::new(0),
        };
        let sink = ChannelSink::new(&target);

        sink.emit(LoadEvent::Progress { percent: 25 });
        sink.emit(LoadEvent::Progress { percent: 50 });

        assert_eq!(*target.attempts.lock().unwrap(), 2);
    }

    #[test]
    fn load_pipeline_streams_events_through_the_sink() {
        let fixture = fixture();
        let target = RecordingTarget::default();
        let sink = ChannelSink::new(&target);

        let outcome = perform_load(&fixture.loader, &fixture.session, request(&fixture), &sink);

        let events = target.events.lock().unwrap();
        assert!(matches!(
            events.first(),
            Some(LoadEvent::Started {
                mode: LoadMode::Create,
                ..
            })
        ));
        assert_eq!(events.last(), Some(&LoadEvent::Progress { percent: 100 }));
        assert_eq!(events.iter().filter(is_done_step).count(), 3);
        assert!(matches!(outcome, Ok(LoadOutcome::Ready { .. })));
    }

    #[test]
    fn load_failure_is_returned_as_a_serializable_error() {
        let fixture = fixture();
        let missing = fixture.workspace.join("missing");
        let target = RecordingTarget::default();
        let sink = ChannelSink::new(&target);

        let outcome = perform_load(
            &fixture.loader,
            &fixture.session,
            LoadRequest::new(missing.to_str().unwrap(), None),
            &sink,
        );

        let value = serde_json::to_value(outcome.unwrap_err()).unwrap();
        assert_eq!(value["step"], "workspace");
        assert_eq!(value["code"], "folder_missing");
        assert!(value["detail"].is_string());
    }

    #[test]
    fn enter_after_load_yields_a_window_title() {
        let fixture = fixture();
        let target = RecordingTarget::default();
        let sink = ChannelSink::new(&target);
        perform_load(&fixture.loader, &fixture.session, request(&fixture), &sink).unwrap();

        let outcome = fixture.loader.enter(&fixture.session).unwrap();

        assert_eq!(
            entered_title(&outcome),
            Some("studio \u{2014} Dreamy Studio".to_string())
        );
        assert!(fixture.session.current().is_some());
    }

    #[test]
    fn cancelled_enter_has_no_window_title() {
        assert_eq!(entered_title(&EnterOutcome::Cancelled), None);
    }

    #[test]
    fn window_title_appends_the_product_name() {
        assert_eq!(window_title("alpha"), "alpha \u{2014} Dreamy Studio");
    }

    #[test]
    fn picked_path_converts_a_chosen_folder_and_maps_close_to_none() {
        let chosen = FilePath::Path(PathBuf::from("alpha"));

        assert_eq!(picked_path(Some(chosen)), Some("alpha".to_string()));
        assert_eq!(picked_path(None), None);
    }

    #[test]
    fn task_failure_maps_to_a_load_error_for_the_given_step() {
        let cause = std::io::Error::other("boom");

        let error = task_failure(LoadStep::Application, tauri::Error::InvalidIcon(cause));

        assert_eq!(error.step, LoadStep::Application);
        assert_eq!(error.code, ErrorCode::DbIo);
        assert!(!error.detail.is_empty());
    }
}
