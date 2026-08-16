use crate::commands::workspace::MAIN_WINDOW_LABEL;
use crate::features::settings::models::GeneralSettings;
use crate::features::settings::models::LayoutSettings;
use crate::features::settings::models::SettingsView;
use crate::features::settings::models::Theme;
use crate::features::settings::service::SettingsService;
use crate::features::workspace::session::WorkspaceSession;
use crate::infra::window_state;
use serde::Deserialize;
use std::path::PathBuf;
use tauri::AppHandle;
use tauri::Manager;
use tauri::async_runtime::spawn_blocking;
use tauri_plugin_opener::OpenerExt;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum FolderTarget {
    Workspace,
    AppData,
}

pub fn folder_path(
    service: &SettingsService,
    session: &WorkspaceSession,
    target: FolderTarget,
) -> Result<PathBuf, String> {
    match target {
        FolderTarget::AppData => Ok(service.data_dir()),
        FolderTarget::Workspace => match session.current() {
            Some(current) => Ok(PathBuf::from(current.path)),
            None => Err("No workspace is open.".to_string()),
        },
    }
}

#[tauri::command]
pub async fn settings_get(app: AppHandle) -> Result<SettingsView, String> {
    let task = spawn_blocking(move || app.state::<SettingsService>().view());
    task.await.map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn settings_general_save(
    app: AppHandle,
    general: GeneralSettings,
) -> Result<GeneralSettings, String> {
    let task = spawn_blocking(move || app.state::<SettingsService>().save_general(general));
    task.await.map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn settings_layout_save(
    app: AppHandle,
    layout: LayoutSettings,
) -> Result<LayoutSettings, String> {
    let task = spawn_blocking(move || app.state::<SettingsService>().save_layout(layout));
    task.await.map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn window_background_set(app: AppHandle, theme: Theme) {
    if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        window_state::apply_background(&window, theme);
    }
}

#[tauri::command]
pub async fn settings_folder_open(app: AppHandle, target: FolderTarget) -> Result<(), String> {
    let path = folder_path(
        &app.state::<SettingsService>(),
        &app.state::<WorkspaceSession>(),
        target,
    )?;
    app.opener()
        .open_path(path.to_string_lossy().into_owned(), None::<&str>)
        .map_err(|error| error.to_string())
}

#[cfg(test)]
#[path = "../../test/commands/settings.test.rs"]
mod tests;
