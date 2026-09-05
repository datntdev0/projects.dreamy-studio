use super::*;
use crate::features::backend::models::DownloadState;
use crate::features::backend::models::ServerStatus;
use crate::features::settings::repository::SETTINGS_FILE;
use crate::infra::backend::BackendHost;
use crate::testing::backend::StubBackend;
use crate::testing::http::FakeHttp;
use crate::testing::http::api_error;
use serde_json::Value;
use serde_json::json;
use std::net::Ipv4Addr;
use std::net::TcpListener;
use std::sync::atomic::AtomicBool;
use tempfile::TempDir;

struct Fixture {
    dir: TempDir,
    stub: Arc<StubBackend>,
    supervisor: Arc<BackendSupervisor>,
    service: BackendService,
}

impl Fixture {
    fn start(&self) {
        self.supervisor.start(&AtomicBool::new(false)).unwrap();
    }

    fn settings(&self) -> Value {
        let text = fs::read_to_string(self.dir.path().join(SETTINGS_FILE)).unwrap();
        serde_json::from_str(&text).unwrap()
    }

    fn write_settings(&self, value: Value) {
        fs::write(self.dir.path().join(SETTINGS_FILE), value.to_string()).unwrap();
    }
}

fn fixture(port: u16) -> Fixture {
    let dir = TempDir::new().unwrap();
    let settings = SettingsRepository::new(dir.path().join(SETTINGS_FILE));
    let stub = Arc::new(StubBackend::on_port(port));
    let supervisor = Arc::new(BackendSupervisor::new(stub.clone(), settings.clone()));
    let service = BackendService::new(
        supervisor.clone(),
        settings,
        dir.path().to_path_buf(),
        dir.path().join("logs"),
    );
    Fixture {
        dir,
        stub,
        supervisor,
        service,
    }
}

fn running(fake: &FakeHttp) -> Fixture {
    let fixture = fixture(fake.port);
    fixture.start();
    fixture
}

fn unused_port() -> u16 {
    let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).unwrap();
    listener.local_addr().unwrap().port()
}

fn system(found: bool, cuda: &str) -> Value {
    json!({
        "gpu": { "found": found, "name": "RTX 4070", "vramMb": 12288, "driver": "560.94" },
        "cuda": { "state": cuda, "receivedBytes": 10, "totalBytes": 20, "error": "", "version": "12.4" }
    })
}

fn model(id: &str, state: &str) -> Value {
    json!({
        "id": id, "name": "OmniVoice", "source": "k2-fsa/OmniVoice", "languages": ["mul"],
        "cloning": true, "gpuRecommended": true, "state": state,
        "receivedBytes": 0, "totalBytes": 100, "error": ""
    })
}

#[test]
fn stopped_view_uses_empty_defaults() {
    let fixture = fixture(unused_port());

    let view = fixture.service.view();
    let value = serde_json::to_value(&view).unwrap();

    assert_eq!(view.server.status, ServerStatus::Stopped);
    assert_eq!(value["server"]["port"], Value::Null);
    assert_eq!(value["server"]["startedAt"], Value::Null);
    assert_eq!(value["server"]["latencyMs"], Value::Null);
    assert!(
        value["server"]["checkedAt"]
            .as_str()
            .unwrap()
            .ends_with('Z')
    );
    assert_eq!(value["gpu"]["found"], false);
    assert_eq!(value["cuda"]["state"], "none");
    assert_eq!(value["device"], "cpu");
    assert_eq!(
        value["modelsDir"],
        fixture.dir.path().join("models").to_string_lossy().as_ref()
    );
}

#[test]
fn running_view_reports_health_system_and_latency() {
    let fake = FakeHttp::healthy();
    fake.route("GET", "/system", 200, system(true, "installed"));
    let fixture = running(&fake);

    let value = serde_json::to_value(fixture.service.view()).unwrap();

    let server = &value["server"];
    assert_eq!(server["status"], "running");
    assert_eq!(server["port"], fake.port);
    assert_eq!(server["version"], "0.3.0");
    assert_eq!(server["pythonVersion"], "3.12.4");
    assert_eq!(server["startedAt"], "2026-11-22T08:00:00Z");
    assert!(server["latencyMs"].is_u64());
    assert_eq!(server["error"], "");
    assert_eq!(value["gpu"]["name"], "RTX 4070");
    assert_eq!(value["gpu"]["vramMb"], 12288);
    assert_eq!(value["cuda"]["state"], "installed");
    assert_eq!(value["cuda"]["version"], "12.4");
}

#[test]
fn running_view_keeps_defaults_when_system_fails() {
    let fake = FakeHttp::healthy();
    let fixture = running(&fake);

    let view = fixture.service.view();

    assert_eq!(view.server.status, ServerStatus::Running);
    assert!(!view.gpu.found);
    assert_eq!(view.cuda.download.state, DownloadState::None);
}

#[test]
fn an_unresponsive_backend_becomes_an_error() {
    let fixture = fixture(unused_port());
    fixture.start();

    let view = fixture.service.view();

    assert_eq!(view.server.status, ServerStatus::Error);
    assert_eq!(view.server.port, None);
    assert!(
        view.server.error.contains("stopped responding"),
        "{}",
        view.server.error
    );
    assert!(matches!(
        fixture.supervisor.monitor().state(),
        MonitorState::Error(_)
    ));
}

#[test]
fn starting_and_failed_states_are_reported() {
    let fixture = fixture(unused_port());
    fixture.supervisor.monitor().set(MonitorState::Starting);
    assert_eq!(fixture.service.view().server.status, ServerStatus::Starting);

    fixture
        .supervisor
        .monitor()
        .set(MonitorState::Error("backend not found".to_string()));
    let server = fixture.service.view().server;
    assert_eq!(server.status, ServerStatus::Error);
    assert_eq!(server.error, "backend not found");
}

#[test]
fn model_list_is_empty_when_the_backend_is_stopped_or_unreachable() {
    let stopped = fixture(unused_port());
    assert_eq!(stopped.service.models(), Ok(Vec::new()));

    let unreachable = fixture(unused_port());
    unreachable.start();
    assert_eq!(unreachable.service.models(), Ok(Vec::new()));
}

#[test]
fn model_list_is_proxied() {
    let fake = FakeHttp::healthy();
    fake.route(
        "GET",
        "/models",
        200,
        json!([model("omnivoice", "downloading")]),
    );
    let fixture = running(&fake);

    let models = fixture.service.models().unwrap();

    assert_eq!(models.len(), 1);
    assert_eq!(models[0].id, "omnivoice");
    assert_eq!(models[0].languages, vec!["mul"]);
    assert!(models[0].gpu_recommended);
    assert_eq!(models[0].download.state, DownloadState::Downloading);
    assert_eq!(models[0].download.total_bytes, 100);
    let value = serde_json::to_value(&models[0]).unwrap();
    assert_eq!(value["state"], "downloading");
    assert_eq!(value["gpuRecommended"], true);
}

#[test]
fn model_list_api_errors_are_returned() {
    let fake = FakeHttp::healthy();
    fake.route(
        "GET",
        "/models",
        500,
        api_error("BACKEND_UNEXPECTED", "Broken catalog"),
    );
    let fixture = running(&fake);

    assert_eq!(fixture.service.models(), Err("Broken catalog".to_string()));
}

#[test]
fn model_commands_proxy_to_their_endpoints() {
    let fake = FakeHttp::healthy();
    fake.route(
        "POST",
        "/models/omnivoice/download",
        202,
        model("omnivoice", "downloading"),
    )
    .route(
        "POST",
        "/models/omnivoice/cancel",
        200,
        model("omnivoice", "none"),
    )
    .route(
        "DELETE",
        "/models/omnivoice",
        200,
        model("omnivoice", "none"),
    );
    let fixture = running(&fake);

    fixture.service.download_model("omnivoice").unwrap();
    fixture.service.cancel_model("omnivoice").unwrap();
    fixture.service.remove_model("omnivoice").unwrap();

    assert_eq!(
        fake.requests(),
        vec![
            "POST /models/omnivoice/download",
            "POST /models/omnivoice/cancel",
            "DELETE /models/omnivoice"
        ]
    );
}

#[test]
fn proxy_errors_use_the_python_message() {
    let fake = FakeHttp::healthy();
    fake.route(
        "DELETE",
        "/models/vieneu-turbo",
        409,
        api_error("MODEL_BUSY", "Model is downloading"),
    )
    .route(
        "POST",
        "/models/ghost/download",
        404,
        api_error("MODEL_NOT_FOUND", "Unknown model ghost"),
    );
    let fixture = running(&fake);

    assert_eq!(
        fixture.service.remove_model("vieneu-turbo"),
        Err("Model is downloading".to_string())
    );
    assert_eq!(
        fixture.service.download_model("ghost"),
        Err("Unknown model ghost".to_string())
    );
}

#[test]
fn unsafe_model_ids_are_rejected_before_any_request() {
    let fake = FakeHttp::healthy();
    let fixture = running(&fake);

    for id in ["", "../cuda", "a/b", "a b"] {
        assert!(fixture.service.download_model(id).is_err(), "{id}");
    }
    assert!(fake.requests().is_empty());
}

#[test]
fn commands_fail_when_the_backend_is_not_running() {
    let fixture = fixture(unused_port());
    let expected = Err(NOT_RUNNING.to_string());

    assert_eq!(fixture.service.scan_gpu(), expected);
    assert_eq!(fixture.service.download_cuda(), expected);
    assert_eq!(fixture.service.cancel_cuda(), expected);
    assert_eq!(fixture.service.remove_cuda(), expected);
    assert_eq!(fixture.service.download_model("omnivoice"), expected);
}

#[test]
fn gpu_scan_and_cuda_commands_are_proxied() {
    let fake = FakeHttp::healthy();
    fake.route("POST", "/system/gpu/scan", 200, system(true, "none"))
        .route(
            "POST",
            "/cuda/download",
            202,
            system(true, "downloading")["cuda"].clone(),
        )
        .route(
            "POST",
            "/cuda/cancel",
            200,
            system(true, "none")["cuda"].clone(),
        );
    let fixture = running(&fake);

    fixture.service.scan_gpu().unwrap();
    fixture.service.download_cuda().unwrap();
    fixture.service.cancel_cuda().unwrap();

    assert_eq!(
        fake.requests(),
        vec![
            "POST /system/gpu/scan",
            "POST /cuda/download",
            "POST /cuda/cancel"
        ]
    );
}

#[test]
fn cuda_download_errors_use_the_python_message() {
    let fake = FakeHttp::healthy();
    fake.route(
        "POST",
        "/cuda/download",
        409,
        api_error("CUDA_NO_GPU", "No NVIDIA GPU found"),
    );
    let fixture = running(&fake);

    assert_eq!(
        fixture.service.download_cuda(),
        Err("No NVIDIA GPU found".to_string())
    );
}

#[test]
fn unknown_devices_are_rejected() {
    let fixture = fixture(unused_port());

    let error = fixture.service.set_device("tpu").unwrap_err();

    assert!(error.contains("tpu"), "{error}");
    assert!(!fixture.dir.path().join(SETTINGS_FILE).exists());
}

#[test]
fn cuda_is_rejected_without_a_gpu_or_installed_runtime() {
    for (found, cuda) in [(false, "installed"), (true, "none"), (true, "downloading")] {
        let fake = FakeHttp::healthy();
        fake.route("GET", "/system", 200, system(found, cuda));
        let fixture = running(&fake);

        assert_eq!(
            fixture.service.set_device("cuda"),
            Err(CUDA_NOT_READY.to_string()),
            "{found} {cuda}"
        );
        assert_eq!(fixture.supervisor.device(), Device::Cpu);
    }
}

#[test]
fn cuda_needs_a_running_backend() {
    let fixture = fixture(unused_port());

    assert_eq!(
        fixture.service.set_device("cuda"),
        Err(NOT_RUNNING.to_string())
    );
}

#[test]
fn cuda_is_saved_and_the_backend_restarts_with_it() {
    let fake = FakeHttp::healthy();
    fake.route("GET", "/system", 200, system(true, "installed"));
    let fixture = running(&fake);
    fixture.write_settings(json!({ "general": { "theme": "dark" }, "extra": { "keep": 1 } }));

    fixture.service.set_device("cuda").unwrap();

    let settings = fixture.settings();
    assert_eq!(settings["backend"]["device"], "cuda");
    assert_eq!(settings["general"]["theme"], "dark");
    assert_eq!(settings["extra"]["keep"], 1);
    assert_eq!(fixture.stub.started(), 2);
    assert_eq!(fixture.stub.devices(), vec!["cpu", "cuda"]);
    assert_eq!(
        fixture.supervisor.monitor().state(),
        MonitorState::Running(fake.port)
    );
}

#[test]
fn cpu_is_saved_without_starting_a_stopped_backend() {
    let fixture = fixture(unused_port());

    fixture.service.set_device("cpu").unwrap();

    assert_eq!(fixture.settings()["backend"]["device"], "cpu");
    assert_eq!(fixture.stub.started(), 0);
    assert_eq!(fixture.service.view().device, Device::Cpu);
}

#[test]
fn a_failed_restart_is_reported() {
    let fake = FakeHttp::healthy();
    let fixture = running(&fake);
    fixture
        .stub
        .fail_with(Some(crate::infra::backend::BackendError::StartFailed(
            "exit 1".to_string(),
        )));

    let error = fixture.service.set_device("cpu").unwrap_err();

    assert_eq!(error, "backend failed to start: exit 1");
    assert!(matches!(
        fixture.supervisor.monitor().state(),
        MonitorState::Error(_)
    ));
}

#[test]
fn removing_cuda_falls_back_to_cpu_and_restarts() {
    let fake = FakeHttp::healthy();
    fake.route("DELETE", "/cuda", 200, system(true, "none")["cuda"].clone());
    let fixture = running(&fake);
    fixture.write_settings(json!({ "backend": { "device": "cuda" } }));

    fixture.service.remove_cuda().unwrap();

    assert_eq!(fixture.settings()["backend"]["device"], "cpu");
    assert_eq!(fixture.stub.started(), 2);
    assert_eq!(
        fixture.stub.devices().last().map(String::as_str),
        Some("cpu")
    );
}

#[test]
fn removing_cuda_on_cpu_keeps_the_backend_running() {
    let fake = FakeHttp::healthy();
    fake.route("DELETE", "/cuda", 200, system(true, "none")["cuda"].clone());
    let fixture = running(&fake);

    fixture.service.remove_cuda().unwrap();

    assert_eq!(fixture.stub.started(), 1);
    assert!(!fixture.dir.path().join(SETTINGS_FILE).exists());
}

#[test]
fn removing_cuda_while_busy_keeps_the_device() {
    let fake = FakeHttp::healthy();
    fake.route(
        "DELETE",
        "/cuda",
        409,
        api_error("CUDA_BUSY", "CUDA is downloading"),
    );
    let fixture = running(&fake);
    fixture.write_settings(json!({ "backend": { "device": "cuda" } }));

    assert_eq!(
        fixture.service.remove_cuda(),
        Err("CUDA is downloading".to_string())
    );
    assert_eq!(fixture.settings()["backend"]["device"], "cuda");
}

#[test]
fn restart_returns_immediately_and_runs_in_the_background() {
    let fixture = fixture(4567);

    fixture.service.restart();

    let state = fixture.supervisor.monitor().state();
    assert!(
        matches!(state, MonitorState::Starting | MonitorState::Running(4567)),
        "{state:?}"
    );
    let deadline = Instant::now() + Duration::from_secs(5);
    while fixture.supervisor.monitor().state() != MonitorState::Running(4567) {
        assert!(Instant::now() < deadline, "restart did not finish");
        thread::sleep(Duration::from_millis(10));
    }
    assert_eq!(fixture.stub.started(), 1);
}

#[test]
fn folders_are_created_on_demand() {
    let fixture = fixture(unused_port());

    let logs = fixture.service.logs_dir().unwrap();
    let models = fixture.service.models_dir().unwrap();

    assert!(logs.is_dir());
    assert!(models.is_dir());
    assert_eq!(models, fixture.dir.path().join("models"));
}

#[test]
fn subtitles_header_is_decoded_from_base64() {
    let srt = "1\n00:00:00,000 --> 00:00:01,000\nXin chào\n";
    let encoded = STANDARD.encode(srt);

    assert_eq!(decode_subtitles(&encoded).as_deref(), Some(srt));
    assert_eq!(decode_subtitles(" not base64 ! "), None);
    assert_eq!(decode_subtitles(&STANDARD.encode([0xff, 0xfe])), None);
}

#[test]
fn synthesis_requests_send_the_sentence_pause() {
    let request = SynthesisRequest {
        sentence_pause_ms: 250,
        ..SynthesisRequest::default()
    };

    assert_eq!(
        serde_json::to_value(&request).unwrap()["sentencePauseMs"],
        250
    );
}
