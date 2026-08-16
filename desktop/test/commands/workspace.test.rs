use super::*;
use crate::container::AppContainer;
use crate::features::workspace::load::LoadMode;
use crate::features::workspace::load::StepState;
use crate::features::workspace::repository::WorkspaceRepository;
use crate::testing::backend::StubBackend;
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
