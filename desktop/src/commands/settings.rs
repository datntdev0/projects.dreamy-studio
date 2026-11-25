use crate::commands::workspace::MAIN_WINDOW_LABEL;
use crate::features::settings::install::CliInstaller;
use crate::features::settings::install::InstallProgress;
use crate::features::settings::install::InstallView;
use crate::features::settings::llm::FeatureSettings;
use crate::features::settings::llm::LlmView;
use crate::features::settings::models::GeneralSettings;
use crate::features::settings::models::LayoutSettings;
use crate::features::settings::models::SettingsView;
use crate::features::settings::models::Theme;
use crate::features::settings::probe::CliProbe;
use crate::features::settings::service::SettingsService;
use crate::features::settings::usage::LlmUsage;
use crate::features::workspace::session::WorkspaceSession;
use crate::infra::window_state;
use serde::Deserialize;
use std::path::PathBuf;
use tauri::AppHandle;
use tauri::Manager;
use tauri::Runtime;
use tauri::State;
use tauri::async_runtime::spawn_blocking;
use tauri::ipc::Channel;
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
pub async fn settings_get<R: Runtime>(app: AppHandle<R>) -> Result<SettingsView, String> {
    let task = spawn_blocking(move || app.state::<SettingsService>().view());
    task.await.map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn settings_general_save<R: Runtime>(
    app: AppHandle<R>,
    general: GeneralSettings,
) -> Result<GeneralSettings, String> {
    let task = spawn_blocking(move || app.state::<SettingsService>().save_general(general));
    task.await.map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn settings_layout_save<R: Runtime>(
    app: AppHandle<R>,
    layout: LayoutSettings,
) -> Result<LayoutSettings, String> {
    let task = spawn_blocking(move || app.state::<SettingsService>().save_layout(layout));
    task.await.map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn llm_get<R: Runtime>(app: AppHandle<R>) -> Result<LlmView, String> {
    let task = spawn_blocking(move || {
        with_installs(app.state::<SettingsService>().llm_view(), &app.state())
    });
    task.await.map_err(|error| error.to_string())
}

pub fn with_installs(mut view: LlmView, installer: &State<'_, CliInstaller>) -> LlmView {
    for provider in &mut view.providers {
        provider.install = installer.view(provider.id);
    }
    view
}

#[tauri::command]
pub async fn llm_feature_save<R: Runtime>(
    app: AppHandle<R>,
    feature: String,
    config: FeatureSettings,
) -> Result<LlmView, String> {
    let task = spawn_blocking(move || {
        app.state::<SettingsService>()
            .save_llm_feature(&feature, config)
            .map(|view| with_installs(view, &app.state()))
    });
    task.await.map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn llm_probe<R: Runtime>(app: AppHandle<R>, id: String) -> Result<CliProbe, String> {
    let task = spawn_blocking(move || app.state::<SettingsService>().probe_llm(&id));
    task.await.map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn llm_usage<R: Runtime>(
    app: AppHandle<R>,
    id: String,
) -> Result<Option<LlmUsage>, String> {
    let task = spawn_blocking(move || app.state::<SettingsService>().llm_usage(&id));
    task.await.map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn llm_login<R: Runtime>(app: AppHandle<R>, id: String) -> Result<(), String> {
    let task = spawn_blocking(move || app.state::<SettingsService>().login_llm(&id));
    task.await.map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn llm_logout<R: Runtime>(app: AppHandle<R>, id: String) -> Result<(), String> {
    let task = spawn_blocking(move || app.state::<SettingsService>().logout_llm(&id));
    task.await.map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn llm_install<R: Runtime>(
    app: AppHandle<R>,
    id: String,
    channel: Channel<InstallProgress>,
) -> Result<InstallView, String> {
    let task = spawn_blocking(move || {
        app.state::<CliInstaller>().install(&id, &|progress| {
            let _ = channel.send(progress);
        })
    });
    task.await.map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn llm_install_cancel<R: Runtime>(app: AppHandle<R>, id: String) {
    app.state::<CliInstaller>().cancel(&id);
}

#[tauri::command]
pub async fn llm_profile_open<R: Runtime>(app: AppHandle<R>, id: String) -> Result<(), String> {
    let path = app.state::<SettingsService>().llm_profile_dir(&id)?;
    app.opener()
        .open_path(path.to_string_lossy().into_owned(), None::<&str>)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn window_background_set<R: Runtime>(app: AppHandle<R>, theme: Theme) {
    if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        window_state::apply_background(&window, theme);
    }
}

#[tauri::command]
pub async fn settings_folder_open<R: Runtime>(
    app: AppHandle<R>,
    target: FolderTarget,
) -> Result<(), String> {
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
