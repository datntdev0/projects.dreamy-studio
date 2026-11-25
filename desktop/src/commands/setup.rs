use std::path::PathBuf;
use tauri::AppHandle;
use tauri::Manager;
use tauri::Runtime;
use tauri::async_runtime::spawn_blocking;
use tauri::ipc::Channel;
use tauri_plugin_dialog::DialogExt;

use crate::commands::workspace::picked_path;
use crate::features::workspace::load::ErrorCode;
use crate::infra::startup::launch::StartupError;
use crate::infra::startup::launch::StartupEvent;
use crate::infra::startup::launch::StartupService;
use crate::infra::startup::launch::StartupStep;
use crate::infra::startup::models::SetupError;
use crate::infra::startup::models::SetupErrorCode;
use crate::infra::startup::models::SetupEvent;
use crate::infra::startup::models::SetupOutcome;
use crate::infra::startup::setup::SetupService;

const PACKAGE_FILTER: &str = "Dreamy Studio offline package";
const PACKAGE_EXTENSIONS: [&str; 1] = ["zip"];

fn forward<T: Clone + serde::Serialize>(channel: &Channel<T>, event: T) {
    if let Err(error) = channel.send(event) {
        eprintln!("cannot forward setup event: {error}");
    }
}

fn run_setup<R: Runtime>(
    app: &AppHandle<R>,
    channel: &Channel<SetupEvent>,
) -> Result<SetupOutcome, SetupError> {
    let sink = |event: SetupEvent| forward(channel, event);
    app.state::<SetupService>().run(&sink)
}

fn run_startup<R: Runtime>(
    app: &AppHandle<R>,
    channel: &Channel<StartupEvent>,
) -> Result<(), StartupError> {
    let sink = |event: StartupEvent| forward(channel, event);
    app.state::<StartupService>().run(&sink)
}

fn pick_package<R: Runtime>(app: &AppHandle<R>) -> Option<String> {
    let dialog = app
        .dialog()
        .file()
        .add_filter(PACKAGE_FILTER, &PACKAGE_EXTENSIONS);
    picked_path(dialog.blocking_pick_file())
}

fn import_package<R: Runtime>(app: &AppHandle<R>, path: &str) -> Result<usize, SetupError> {
    app.state::<SetupService>().import(&PathBuf::from(path))
}

fn task_error(error: tauri::Error) -> SetupError {
    SetupError::new(SetupErrorCode::Io, error.to_string())
}

#[tauri::command]
pub async fn setup_run<R: Runtime>(
    app: AppHandle<R>,
    channel: Channel<SetupEvent>,
) -> Result<SetupOutcome, SetupError> {
    let task = spawn_blocking(move || run_setup(&app, &channel));
    task.await.map_err(task_error)?
}

#[tauri::command]
pub async fn setup_pause<R: Runtime>(app: AppHandle<R>) {
    app.state::<SetupService>().pause();
}

#[tauri::command]
pub async fn setup_package_pick<R: Runtime>(app: AppHandle<R>) -> Option<String> {
    let task = spawn_blocking(move || pick_package(&app));
    task.await.unwrap_or_default()
}

#[tauri::command]
pub async fn setup_package_import<R: Runtime>(
    app: AppHandle<R>,
    path: String,
) -> Result<usize, SetupError> {
    let task = spawn_blocking(move || import_package(&app, &path));
    task.await.map_err(task_error)?
}

#[tauri::command]
pub async fn startup_run<R: Runtime>(
    app: AppHandle<R>,
    channel: Channel<StartupEvent>,
) -> Result<(), StartupError> {
    let task = spawn_blocking(move || run_startup(&app, &channel));
    match task.await {
        Ok(result) => result,
        Err(error) => Err(StartupError::new(
            StartupStep::Application,
            ErrorCode::DbIo,
            error.to_string(),
        )),
    }
}
