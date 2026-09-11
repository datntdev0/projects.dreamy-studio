use crate::commands::blocking::run_blocking_with;
use crate::features::backend::models::BackendView;
use crate::features::backend::models::RemoteView;
use crate::features::backend::models::TtsModel;
use crate::features::backend::remote::RemoteBackendService;
use crate::features::backend::service::BackendService;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::AppHandle;
use tauri::Manager;
use tauri::Runtime;
use tauri_plugin_opener::OpenerExt;

fn task_failure(error: tauri::Error) -> String {
    error.to_string()
}

async fn run_blocking<R: Runtime, T, F>(app: AppHandle<R>, job: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce(&BackendService) -> Result<T, String> + Send + 'static,
{
    run_blocking_with(app, task_failure, move |app| {
        job(&app.state::<BackendService>())
    })
    .await
}

async fn run_remote<R: Runtime, T, F>(app: AppHandle<R>, job: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce(&RemoteBackendService) -> Result<T, String> + Send + 'static,
{
    run_blocking_with(app, task_failure, move |app| {
        job(&app.state::<Arc<RemoteBackendService>>())
    })
    .await
}

fn open_folder<R: Runtime>(app: &AppHandle<R>, path: PathBuf) -> Result<(), String> {
    app.opener()
        .open_path(path.to_string_lossy().into_owned(), None::<&str>)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn backend_status<R: Runtime>(app: AppHandle<R>) -> Result<BackendView, String> {
    run_blocking(app, |service| Ok(service.view())).await
}

#[tauri::command]
pub async fn backend_restart<R: Runtime>(app: AppHandle<R>) {
    app.state::<BackendService>().restart();
}

#[tauri::command]
pub async fn backend_logs_open<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    let path = app.state::<BackendService>().logs_dir()?;
    open_folder(&app, path)
}

#[tauri::command]
pub async fn backend_models_open<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    let path = app.state::<BackendService>().models_dir()?;
    open_folder(&app, path)
}

#[tauri::command]
pub async fn backend_model_list<R: Runtime>(app: AppHandle<R>) -> Result<Vec<TtsModel>, String> {
    run_blocking(app, BackendService::models).await
}

#[tauri::command]
pub async fn backend_model_download<R: Runtime>(
    app: AppHandle<R>,
    id: String,
) -> Result<(), String> {
    run_blocking(app, move |service| service.download_model(&id)).await
}

#[tauri::command]
pub async fn backend_model_cancel<R: Runtime>(app: AppHandle<R>, id: String) -> Result<(), String> {
    run_blocking(app, move |service| service.cancel_model(&id)).await
}

#[tauri::command]
pub async fn backend_model_remove<R: Runtime>(app: AppHandle<R>, id: String) -> Result<(), String> {
    run_blocking(app, move |service| service.remove_model(&id)).await
}

#[tauri::command]
pub async fn backend_remote_status<R: Runtime>(app: AppHandle<R>) -> Result<RemoteView, String> {
    run_remote(app, |remote| Ok(remote.view())).await
}

#[tauri::command]
pub async fn backend_remote_connect<R: Runtime>(
    app: AppHandle<R>,
    url: String,
    api_key: String,
) -> Result<RemoteView, String> {
    run_remote(app, move |remote| remote.connect(&url, &api_key)).await
}

#[tauri::command]
pub async fn backend_remote_disconnect<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    run_remote(app, RemoteBackendService::disconnect).await
}

#[tauri::command]
pub async fn backend_remote_active_set<R: Runtime>(
    app: AppHandle<R>,
    active: bool,
) -> Result<(), String> {
    run_remote(app, move |remote| remote.set_active(active)).await
}

#[tauri::command]
pub async fn backend_remote_model_list<R: Runtime>(
    app: AppHandle<R>,
) -> Result<Vec<TtsModel>, String> {
    run_remote(app, RemoteBackendService::models).await
}

#[tauri::command]
pub async fn backend_remote_model_download<R: Runtime>(
    app: AppHandle<R>,
    id: String,
) -> Result<(), String> {
    run_remote(app, move |remote| remote.download_model(&id)).await
}

#[tauri::command]
pub async fn backend_remote_model_cancel<R: Runtime>(
    app: AppHandle<R>,
    id: String,
) -> Result<(), String> {
    run_remote(app, move |remote| remote.cancel_model(&id)).await
}

#[tauri::command]
pub async fn backend_remote_model_remove<R: Runtime>(
    app: AppHandle<R>,
    id: String,
) -> Result<(), String> {
    run_remote(app, move |remote| remote.remove_model(&id)).await
}
