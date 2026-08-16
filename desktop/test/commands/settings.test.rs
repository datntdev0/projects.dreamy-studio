use super::*;
use crate::features::settings::repository::SETTINGS_FILE;
use crate::features::settings::repository::SettingsRepository;
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
