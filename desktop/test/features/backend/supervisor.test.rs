use super::*;
use crate::features::settings::models::AppSettings;
use crate::features::settings::repository::SETTINGS_FILE;
use crate::testing::backend::StubBackend;
use tempfile::TempDir;

struct Fixture {
    _dir: TempDir,
    settings: SettingsRepository,
    stub: Arc<StubBackend>,
    supervisor: BackendSupervisor,
}

fn fixture(stub: StubBackend) -> Fixture {
    let dir = TempDir::new().unwrap();
    let settings = SettingsRepository::new(dir.path().join(SETTINGS_FILE));
    let stub = Arc::new(stub);
    let supervisor = BackendSupervisor::new(stub.clone(), settings.clone());
    Fixture {
        _dir: dir,
        settings,
        stub,
        supervisor,
    }
}

fn save_device(settings: &SettingsRepository, device: Device) {
    let mut saved = AppSettings::default();
    saved.backend.device = Some(device);
    settings.save(&saved).unwrap();
}

#[test]
fn start_reports_running_with_the_port() {
    let fixture = fixture(StubBackend::on_port(5050));

    let ready = fixture.supervisor.start(&AtomicBool::new(false)).unwrap();

    assert_eq!(ready.port, 5050);
    assert_eq!(
        fixture.supervisor.monitor().state(),
        MonitorState::Running(5050)
    );
}

#[test]
fn start_passes_the_saved_device_to_the_host() {
    let fixture = fixture(StubBackend::new());
    fixture.supervisor.start(&AtomicBool::new(false)).unwrap();
    save_device(&fixture.settings, Device::Cuda);

    fixture.supervisor.start(&AtomicBool::new(false)).unwrap();

    assert_eq!(fixture.stub.devices(), vec!["cpu", "cuda"]);
}

#[test]
fn start_failures_become_error_states() {
    let fixture = fixture(StubBackend::failing(BackendError::Timeout(
        "no health".to_string(),
    )));

    fixture
        .supervisor
        .start(&AtomicBool::new(false))
        .unwrap_err();

    assert_eq!(
        fixture.supervisor.monitor().state(),
        MonitorState::Error("backend start timed out: no health".to_string())
    );
}

#[test]
fn cancelled_starts_leave_the_backend_stopped() {
    let fixture = fixture(StubBackend::new());

    let error = fixture
        .supervisor
        .start(&AtomicBool::new(true))
        .unwrap_err();

    assert_eq!(error, BackendError::Cancelled);
    assert_eq!(fixture.supervisor.monitor().state(), MonitorState::Stopped);
}

#[test]
fn stop_stops_the_host_and_reports_stopped() {
    let fixture = fixture(StubBackend::new());
    fixture.supervisor.start(&AtomicBool::new(false)).unwrap();

    fixture.supervisor.stop();

    assert_eq!(fixture.stub.stopped(), 1);
    assert_eq!(fixture.supervisor.monitor().state(), MonitorState::Stopped);
}

#[test]
fn restart_stops_then_starts_again_after_a_stop() {
    let fixture = fixture(StubBackend::on_port(7000));
    fixture.supervisor.stop();

    fixture.supervisor.restart().unwrap();

    assert_eq!(fixture.stub.stopped(), 2);
    assert_eq!(fixture.stub.started(), 1);
    assert_eq!(
        fixture.supervisor.monitor().state(),
        MonitorState::Running(7000)
    );
}

#[test]
fn set_device_is_forwarded_to_the_host() {
    let fixture = fixture(StubBackend::new());

    fixture.supervisor.set_device("cuda");

    assert_eq!(fixture.stub.devices(), vec!["cuda"]);
}

#[test]
fn state_after_maps_every_result() {
    let ready = BackendReady {
        port: 1,
        spawned: true,
    };
    assert_eq!(state_after(&Ok(ready)), MonitorState::Running(1));
    assert_eq!(
        state_after(&Err(BackendError::Cancelled)),
        MonitorState::Stopped
    );
    assert_eq!(
        state_after(&Err(BackendError::Missing("python".to_string()))),
        MonitorState::Error("backend not found: python".to_string())
    );
}
