use crate::testing::app::MockHost;
use serde_json::Value;
use serde_json::json;

#[test]
fn status_reports_a_stopped_backend_before_any_workspace() {
    let host = MockHost::new();

    let view = host.invoke("backend_status", json!({})).unwrap();

    assert_eq!(view["server"]["status"], "stopped");
    assert_eq!(view["device"], "cpu");
    assert_eq!(view["gpu"]["found"], false);
    assert_eq!(view["cuda"]["state"], "none");
    assert!(view["modelsDir"].as_str().unwrap().ends_with("models"));
}

#[test]
fn model_list_is_empty_while_the_backend_is_stopped() {
    let host = MockHost::new();

    let models = host.invoke("backend_model_list", json!({})).unwrap();

    assert_eq!(models, json!([]));
}

#[test]
fn proxy_commands_fail_while_the_backend_is_stopped() {
    let host = MockHost::new();
    let calls = [
        ("backend_gpu_scan", json!({})),
        ("backend_cuda_download", json!({})),
        ("backend_cuda_cancel", json!({})),
        ("backend_cuda_remove", json!({})),
        ("backend_model_download", json!({ "id": "omnivoice" })),
        ("backend_model_cancel", json!({ "id": "omnivoice" })),
        ("backend_model_remove", json!({ "id": "omnivoice" })),
        ("backend_device_set", json!({ "device": "cuda" })),
    ];

    for (cmd, payload) in calls {
        let error = host.invoke(cmd, payload).unwrap_err();
        assert_eq!(
            error,
            Value::from("The local backend is not running."),
            "{cmd}"
        );
    }
}

#[test]
fn device_set_validates_and_saves_the_device() {
    let host = MockHost::new();

    let error = host
        .invoke("backend_device_set", json!({ "device": "tpu" }))
        .unwrap_err();
    host.invoke("backend_device_set", json!({ "device": "cpu" }))
        .unwrap();

    assert!(error.as_str().unwrap().contains("tpu"));
    let text = std::fs::read_to_string(host.dir.path().join("settings.json")).unwrap();
    assert!(text.contains("\"device\": \"cpu\""), "{text}");
    assert_eq!(host.backend.started(), 0);
}

#[test]
fn restart_returns_at_once_and_starts_the_backend() {
    let host = MockHost::new();

    host.invoke("backend_restart", json!({})).unwrap();

    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(5);
    while host.backend.started() == 0 {
        assert!(std::time::Instant::now() < deadline, "restart did not run");
        std::thread::sleep(std::time::Duration::from_millis(10));
    }
}

#[test]
fn workspace_load_marks_the_backend_running() {
    let host = MockHost::new();
    host.open_workspace();

    let view = host.invoke("backend_status", json!({})).unwrap();

    assert_ne!(view["server"]["status"], "stopped");
    assert_ne!(view["server"]["status"], "starting");
}
