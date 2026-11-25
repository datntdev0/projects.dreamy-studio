use super::*;
use crate::features::settings::repository::SETTINGS_FILE;
use crate::testing::http::FakeHttp;
use crate::testing::http::Recorded;
use crate::testing::http::api_error;
use crate::testing::http::health_body;
use serde_json::Value;
use serde_json::json;
use tempfile::TempDir;

const KEY: &str = "secret-key-9f2c";

struct Fixture {
    dir: TempDir,
    remote: RemoteBackendService,
}

impl Fixture {
    fn settings(&self) -> Value {
        let text = fs::read_to_string(self.dir.path().join(SETTINGS_FILE)).unwrap();
        serde_json::from_str(&text).unwrap()
    }
}

fn fixture() -> Fixture {
    let dir = TempDir::new().unwrap();
    let remote = RemoteBackendService::new(SettingsRepository::new(dir.path().join(SETTINGS_FILE)));
    Fixture { dir, remote }
}

fn url(fake: &FakeHttp) -> String {
    format!("http://127.0.0.1:{}", fake.port)
}

fn system() -> Value {
    json!({
        "gpu": { "found": true, "name": "Tesla T4", "vramMb": 15360, "driver": "580.82.07" },
        "cuda": { "state": "installed", "receivedBytes": 0, "totalBytes": 0, "error": "", "version": "12.8" },
        "modelsDir": "/content/data/models"
    })
}

fn remote_server() -> FakeHttp {
    let fake = FakeHttp::healthy();
    fake.route("GET", "/system", 200, system());
    fake
}

fn connected(fake: &FakeHttp) -> Fixture {
    let fixture = fixture();
    fixture.remote.connect(&url(fake), KEY).unwrap();
    fixture
}

fn last(fake: &FakeHttp) -> Recorded {
    fake.recorded().pop().unwrap()
}

#[test]
fn urls_must_use_http_or_https() {
    assert_eq!(
        valid_url(" https://quiet-river.trycloudflare.com/ "),
        Ok("https://quiet-river.trycloudflare.com".to_string())
    );
    assert_eq!(
        valid_url("http://192.168.1.20:8765"),
        Ok("http://192.168.1.20:8765".to_string())
    );
    for invalid in [
        "",
        "quiet-river.trycloudflare.com",
        "ftp://host",
        "https://",
        "http:// x",
    ] {
        assert!(valid_url(invalid).is_err(), "{invalid}");
    }
}

#[test]
fn key_hints_show_only_the_last_characters() {
    assert_eq!(key_hint(KEY), "••••9f2c");
    assert_eq!(key_hint("ab"), "••••ab");
    assert_eq!(key_hint(""), "");
}

#[test]
fn without_a_connection_the_remote_is_stopped() {
    let fixture = fixture();
    let view = fixture.remote.view();
    assert_eq!(view.backend.server.status, ServerStatus::Stopped);
    assert_eq!(view.url, "");
    assert!(!fixture.remote.active());
    assert_eq!(fixture.remote.models(), Ok(Vec::new()));
    assert_eq!(fixture.remote.scan_gpu(), Err(NOT_CONNECTED.to_string()));
    assert_eq!(
        fixture.remote.set_active(true),
        Err(NOT_CONNECTED.to_string())
    );
}

#[test]
fn connecting_checks_health_and_saves_the_server() {
    let fake = remote_server();
    let fixture = connected(&fake);

    assert_eq!(
        fixture.settings()["backend"]["remote"],
        json!({ "url": url(&fake), "apiKey": KEY, "active": false })
    );
    let view = fixture.remote.view();
    assert_eq!(view.backend.server.status, ServerStatus::Running);
    assert_eq!(view.backend.server.port, None);
    assert_eq!(view.backend.server.version, "0.3.0");
    assert!(view.backend.server.latency_ms.is_some());
    assert_eq!(view.backend.gpu.name, "Tesla T4");
    assert!(view.backend.cuda.installed());
    assert_eq!(view.backend.device, Device::Cpu);
    assert_eq!(view.backend.models_dir, "/content/data/models");
    assert_eq!(view.key_hint, "••••9f2c");
    assert!(
        fake.recorded()
            .iter()
            .all(|request| request.api_key.as_deref() == Some(KEY))
    );
}

#[test]
fn a_rejected_connection_is_not_saved() {
    let fake = FakeHttp::start();
    fake.route(
        "GET",
        "/health",
        401,
        api_error("UNAUTHORIZED", "Missing or invalid API key"),
    );
    let fixture = fixture();

    let error = fixture.remote.connect(&url(&fake), "wrong").unwrap_err();
    assert_eq!(error, "Missing or invalid API key");
    assert!(fixture.remote.config().is_none());
    assert_eq!(
        fixture.remote.connect("not a url", KEY),
        Err(INVALID_URL.to_string())
    );
}

#[test]
fn an_unreachable_server_is_reported_as_an_error() {
    let fake = remote_server();
    let fixture = connected(&fake);
    drop(fake);

    let view = fixture.remote.view();
    assert_eq!(view.backend.server.status, ServerStatus::Error);
    assert!(
        view.backend
            .server
            .error
            .starts_with("The remote backend is not reachable")
    );
    assert!(!view.url.is_empty());
}

#[test]
fn speech_can_be_routed_to_a_connected_server_and_disconnected() {
    let fake = remote_server();
    let fixture = connected(&fake);

    fixture.remote.set_active(true).unwrap();
    assert!(fixture.remote.active());
    fixture.remote.connect(&url(&fake), KEY).unwrap();
    assert!(fixture.remote.active());

    fixture.remote.disconnect().unwrap();
    assert!(!fixture.remote.active());
    assert!(fixture.settings()["backend"].get("remote").is_none());
}

#[test]
fn hardware_and_model_actions_are_sent_with_the_api_key() {
    let fake = remote_server();
    for (method, path) in [
        ("POST", "/system/gpu/scan"),
        ("POST", "/cuda/download"),
        ("POST", "/cuda/cancel"),
        ("DELETE", "/cuda"),
        ("PUT", "/system/device"),
        ("POST", "/models/omnivoice/download"),
        ("POST", "/models/omnivoice/cancel"),
        ("DELETE", "/models/omnivoice"),
    ] {
        fake.route(method, path, 200, json!({}));
    }
    fake.route(
        "GET",
        "/models",
        200,
        json!([{ "id": "omnivoice", "state": "installed" }]),
    );
    let fixture = connected(&fake);
    let remote = &fixture.remote;

    remote.scan_gpu().unwrap();
    remote.download_cuda().unwrap();
    remote.cancel_cuda().unwrap();
    remote.set_device("cuda").unwrap();
    assert_eq!(last(&fake).body, json!({ "device": "cuda" }).to_string());
    remote.remove_cuda().unwrap();
    remote.download_model("omnivoice").unwrap();
    remote.cancel_model("omnivoice").unwrap();
    remote.remove_model("omnivoice").unwrap();
    assert_eq!(remote.models().unwrap()[0].id, "omnivoice");
    assert!(remote.download_model("../etc").is_err());
    assert!(remote.set_device("tpu").is_err());

    let sent: Vec<Recorded> = fake.recorded().into_iter().skip(3).collect();
    assert_eq!(
        sent.iter()
            .map(|request| request.name.as_str())
            .collect::<Vec<_>>(),
        [
            "POST /system/gpu/scan",
            "POST /cuda/download",
            "POST /cuda/cancel",
            "PUT /system/device",
            "PUT /system/device",
            "DELETE /cuda",
            "POST /models/omnivoice/download",
            "POST /models/omnivoice/cancel",
            "DELETE /models/omnivoice",
            "GET /models",
        ]
    );
    assert_eq!(sent[4].body, json!({ "device": "cpu" }).to_string());
    assert!(
        sent.iter()
            .all(|request| request.api_key.as_deref() == Some(KEY))
    );
}

#[test]
fn api_errors_from_the_server_are_shown() {
    let fake = remote_server();
    fake.route(
        "PUT",
        "/system/device",
        409,
        api_error("CUDA_NOT_INSTALLED", "Install the CUDA runtime first"),
    );
    fake.route("POST", "/cuda/download", 502, json!("Bad gateway"));
    let fixture = connected(&fake);

    assert_eq!(
        fixture.remote.set_device("cuda"),
        Err("Install the CUDA runtime first".to_string())
    );
    assert_eq!(
        fixture.remote.download_cuda(),
        Err("The remote backend answered with status 502.".to_string())
    );
}

#[test]
fn clone_references_are_uploaded_instead_of_local_paths() {
    let fake = remote_server();
    fake.route("POST", "/tts/synthesize", 200, json!("audio"));
    let fixture = connected(&fake);
    let reference = fixture.dir.path().join("Mai.mp3");
    fs::write(&reference, b"take one").unwrap();
    let request = SynthesisRequest {
        model: "omnivoice".to_string(),
        text: "Xin chào".to_string(),
        source: "clone".to_string(),
        reference_path: reference.to_string_lossy().into_owned(),
        ..SynthesisRequest::default()
    };

    fixture.remote.synthesize(&request).unwrap();

    let sent: Value = serde_json::from_str(&last(&fake).body).unwrap();
    assert_eq!(sent["referencePath"], "");
    assert_eq!(sent["referenceAudio"], STANDARD.encode(b"take one"));
    assert_eq!(sent["referenceName"], "Mai.mp3");

    let missing = SynthesisRequest {
        reference_path: fixture
            .dir
            .path()
            .join("gone.wav")
            .to_string_lossy()
            .into_owned(),
        ..request
    };
    assert!(matches!(
        fixture.remote.synthesize(&missing),
        Err(ClientError::Invalid(_))
    ));
}

#[test]
fn tunnel_timeouts_are_retried_until_the_audio_is_ready() {
    let fake = remote_server();
    fake.queue("POST", "/tts/synthesize", 524, json!("timeout"));
    fake.queue("POST", "/tts/synthesize", 524, json!("timeout"));
    fake.route("POST", "/tts/synthesize", 200, json!("audio"));
    let fixture = connected(&fake);

    let audio = fixture
        .remote
        .synthesize(&SynthesisRequest::default())
        .unwrap();
    assert_eq!(audio.bytes, json!("audio").to_string().into_bytes());
    let attempts = fake
        .requests()
        .into_iter()
        .filter(|name| name == "POST /tts/synthesize")
        .count();
    assert_eq!(attempts, 3);
}

#[test]
fn repeated_timeouts_eventually_fail() {
    let fake = remote_server();
    fake.route("POST", "/tts/synthesize", 524, json!("timeout"));
    let fixture = connected(&fake);

    let result = fixture.remote.synthesize(&SynthesisRequest::default());
    assert!(matches!(result, Err(ClientError::Api { status: 524, .. })));
    let attempts = fake
        .requests()
        .into_iter()
        .filter(|name| name == "POST /tts/synthesize")
        .count();
    assert_eq!(attempts, SYNTHESIS_ATTEMPTS);
}

#[test]
fn the_health_device_is_reported() {
    let fake = FakeHttp::start();
    let mut health = health_body();
    health["device"] = json!("cuda");
    fake.route("GET", "/health", 200, health);
    fake.route("GET", "/system", 200, system());
    let fixture = connected(&fake);
    assert_eq!(fixture.remote.view().backend.device, Device::Cuda);
}
