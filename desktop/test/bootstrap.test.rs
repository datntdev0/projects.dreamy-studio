use super::*;
use crate::commands::workspace::MAIN_WINDOW_LABEL;
use crate::testing::app::MockHost;
use serde_json::json;
use std::fs;

#[test]
fn install_manages_every_service_the_commands_need() {
    let host = MockHost::new();
    let app = host.handle();

    assert!(app.try_state::<AppContainer>().is_some());
    assert!(app.try_state::<SettingsService>().is_some());
    assert!(app.try_state::<WorkspaceSession>().is_some());
    assert!(app.try_state::<WorkspaceService>().is_some());
    assert!(app.try_state::<WorkspaceLoader>().is_some());
    assert!(app.try_state::<NovelService>().is_some());
    assert!(app.try_state::<PipelineExecutor>().is_some());
    assert!(app.try_state::<JobRegistry>().is_some());
    assert!(app.try_state::<AssistantService>().is_some());
    assert!(app.try_state::<McpGrants>().is_some());
    assert!(app.try_state::<McpServer>().is_some());
    assert!(app.try_state::<BackendService>().is_some());
}

#[test]
fn install_logs_the_startup_lines() {
    let host = MockHost::new();

    let logs: Vec<String> = fs::read_dir(host.dir.path().join("logs"))
        .unwrap()
        .map(|entry| fs::read_to_string(entry.unwrap().path()).unwrap())
        .collect();

    let text = logs.join("\n");
    assert!(text.contains("started"), "{text}");
    assert!(text.contains("data directory:"), "{text}");
    assert!(text.contains("settings file:"), "{text}");
}

#[test]
fn install_shows_the_main_window() {
    let host = MockHost::with_window(MAIN_WINDOW_LABEL);

    assert!(
        host.handle()
            .get_webview_window(MAIN_WINDOW_LABEL)
            .is_some()
    );
}

#[test]
fn the_registered_handlers_answer_commands() {
    let host = MockHost::new();

    let info = host.invoke("app_info", json!({})).unwrap();

    assert!(info["name"].is_string());
    assert!(info["version"].is_string());
}

#[test]
fn exiting_stops_the_executor_the_server_and_the_backend() {
    let host = MockHost::new();

    handle_run_event(&host.handle(), RunEvent::Exit);

    assert_eq!(host.backend.stopped(), 1);
    let log = fs::read_dir(host.dir.path().join("logs"))
        .unwrap()
        .map(|entry| fs::read_to_string(entry.unwrap().path()).unwrap())
        .collect::<String>();
    assert!(log.contains("backend stopped on exit"), "{log}");
}

#[test]
fn other_run_events_leave_the_backend_running() {
    let host = MockHost::new();

    handle_run_event(&host.handle(), RunEvent::Ready);

    assert_eq!(host.backend.stopped(), 0);
}

#[test]
fn unknown_commands_are_rejected() {
    let host = MockHost::new();

    let error = host.invoke("no_such_command", json!({})).unwrap_err();

    assert!(error.to_string().contains("no_such_command"), "{error}");
}

#[test]
fn stream_requests_are_answered_through_the_callback() {
    let host = MockHost::new();
    let request = Request::builder()
        .uri("dreamy-sound://localhost/1")
        .body(Vec::new())
        .unwrap();
    let mut status = None;

    serve_stream(&host.handle(), request, StreamKind::Sound, |response| {
        status = Some(response.status());
    });

    assert_eq!(status, Some(tauri::http::StatusCode::NOT_FOUND));
}

#[test]
fn startup_continues_when_the_log_directory_cannot_be_prepared() {
    let dir = tempfile::tempdir().unwrap();
    let blocker = dir.path().join("blocker");
    fs::write(&blocker, "not a directory").unwrap();
    let app = configure(tauri::test::mock_builder())
        .build(tauri::test::mock_context(tauri::test::noop_assets()))
        .unwrap();
    let backend = Arc::new(crate::testing::backend::StubBackend::new());

    install(
        &app,
        AppContainer::with_backend(blocker.join("data"), backend),
    );

    assert!(app.handle().try_state::<SettingsService>().is_some());
}
