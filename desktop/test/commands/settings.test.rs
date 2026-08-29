use super::*;
use crate::features::settings::repository::SETTINGS_FILE;
use crate::features::settings::repository::SettingsRepository;
use crate::testing::app::MockHost;
use crate::testing::app::wait;
use serde_json::json;
use tempfile::TempDir;

fn service(dir: &TempDir) -> SettingsService {
    SettingsService::new(SettingsRepository::new(dir.path().join(SETTINGS_FILE)))
}

#[test]
fn app_data_target_is_the_settings_directory() {
    let dir = TempDir::new().unwrap();
    let path = folder_path(
        &service(&dir),
        &WorkspaceSession::new(),
        FolderTarget::AppData,
    );
    assert_eq!(path, Ok(dir.path().to_path_buf()));
}

#[test]
fn workspace_target_needs_an_open_workspace() {
    let dir = TempDir::new().unwrap();
    let path = folder_path(
        &service(&dir),
        &WorkspaceSession::new(),
        FolderTarget::Workspace,
    );
    assert!(path.is_err());
}

#[test]
fn folder_targets_use_camel_case_names() {
    let target: FolderTarget = serde_json::from_value(json!("appData")).unwrap();
    assert_eq!(target, FolderTarget::AppData);
    let target: FolderTarget = serde_json::from_value(json!("workspace")).unwrap();
    assert_eq!(target, FolderTarget::Workspace);
}

#[test]
fn view_serializes_in_camel_case() {
    let dir = TempDir::new().unwrap();
    let value = serde_json::to_value(service(&dir).view()).unwrap();
    assert_eq!(value["general"], json!({}));
    assert!(value["dataDir"].is_string());
    assert!(value["file"].is_string());
}

fn host() -> MockHost {
    MockHost::with_window(MAIN_WINDOW_LABEL)
}

#[test]
fn settings_round_trip_through_the_commands() {
    let host = host();
    let general = GeneralSettings {
        theme: Some(Theme::Light),
        ..GeneralSettings::default()
    };
    let layout = LayoutSettings {
        explorer_open: Some(true),
        ..LayoutSettings::default()
    };

    let saved_general = wait(settings_general_save(host.handle(), general.clone())).unwrap();
    let saved_layout = wait(settings_layout_save(host.handle(), layout.clone())).unwrap();

    assert_eq!(saved_general, general);
    assert_eq!(saved_layout, layout);
    let view = wait(settings_get(host.handle())).unwrap();
    assert_eq!(view.general, general);
    assert_eq!(view.layout, layout);
}

#[test]
fn llm_settings_are_saved_per_provider_and_feature() {
    let host = host();
    let provider = CliSettings {
        path: Some("claude-custom".to_string()),
    };
    let feature = FeatureSettings {
        provider: Some("claude".to_string()),
        ..FeatureSettings::default()
    };

    wait(llm_provider_save(
        host.handle(),
        "claude".to_string(),
        provider,
    ))
    .unwrap();
    let view = wait(llm_feature_save(
        host.handle(),
        "translation".to_string(),
        feature,
    ))
    .unwrap();

    let value = serde_json::to_value(view).unwrap();
    let loaded = serde_json::to_value(wait(llm_get(host.handle())).unwrap()).unwrap();
    assert_eq!(loaded, value);
    assert!(value["providers"].is_array());
    assert!(value["features"].is_array());
}

#[test]
fn llm_commands_reject_unknown_providers_and_features() {
    let host = host();

    let provider = wait(llm_provider_save(
        host.handle(),
        "nope".to_string(),
        CliSettings::default(),
    ));
    let feature = wait(llm_feature_save(
        host.handle(),
        "nope".to_string(),
        FeatureSettings::default(),
    ));
    let probe = wait(llm_probe(host.handle(), "nope".to_string()));
    let login = wait(llm_login(host.handle(), "nope".to_string()));
    let logout = wait(llm_logout(host.handle(), "nope".to_string()));
    let profile = wait(llm_profile_open(host.handle(), "nope".to_string()));

    assert_eq!(provider.unwrap_err(), "Unknown LLM provider: nope");
    assert_eq!(feature.unwrap_err(), "Unknown LLM feature: nope");
    assert_eq!(probe.unwrap_err(), "Unknown LLM provider: nope");
    assert_eq!(login.unwrap_err(), "Unknown LLM provider: nope");
    assert_eq!(logout.unwrap_err(), "Unknown LLM provider: nope");
    assert_eq!(profile.unwrap_err(), "Unknown LLM provider: nope");
}

#[test]
fn folder_open_needs_an_open_workspace() {
    let host = host();

    let error = wait(settings_folder_open(host.handle(), FolderTarget::Workspace));

    assert_eq!(error.unwrap_err(), "No workspace is open.");
}

#[test]
fn window_background_is_applied_only_when_the_main_window_exists() {
    let with_window = host();
    let without_window = MockHost::new();

    wait(window_background_set(with_window.handle(), Theme::Light));
    wait(window_background_set(without_window.handle(), Theme::Dark));
}
