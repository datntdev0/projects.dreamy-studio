use crate::features::workspace::load::CancelOutcome;
use crate::features::workspace::load::EnterOutcome;
use crate::features::workspace::load::ErrorCode;
use crate::features::workspace::load::LoadError;
use crate::features::workspace::load::LoadEvent;
use crate::features::workspace::load::LoadEventSink;
use crate::features::workspace::load::LoadOutcome;
use crate::features::workspace::load::LoadRequest;
use crate::features::workspace::load::LoadStep;
use crate::features::workspace::loader::WorkspaceLoader;
use crate::features::workspace::service::RecentWorkspaceView;
use crate::features::workspace::service::WorkspaceService;
use crate::features::workspace::session::CurrentWorkspace;
use crate::features::workspace::session::WorkspaceSession;
use tauri::AppHandle;
use tauri::Manager;
use tauri::async_runtime::spawn_blocking;
use tauri::ipc::Channel;
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_dialog::FilePath;

pub const MAIN_WINDOW_LABEL: &str = "main";
const PRODUCT_NAME: &str = "Dreamy Studio";

pub trait EventTarget {
    fn deliver(&self, event: LoadEvent) -> Result<(), String>;
}

impl EventTarget for Channel<LoadEvent> {
    fn deliver(&self, event: LoadEvent) -> Result<(), String> {
        self.send(event).map_err(|error| error.to_string())
    }
}

pub struct ChannelSink<T: EventTarget> {
    target: T,
}

impl<T: EventTarget> ChannelSink<T> {
    pub fn new(target: T) -> Self {
        Self { target }
    }
}

impl<T: EventTarget> LoadEventSink for ChannelSink<T> {
    fn emit(&self, event: LoadEvent) {
        if let Err(error) = self.target.deliver(event) {
            eprintln!("cannot forward load event: {error}");
        }
    }
}

pub fn window_title(name: &str) -> String {
    format!("{name} \u{2014} {PRODUCT_NAME}")
}

pub fn entered_title(outcome: &EnterOutcome) -> Option<String> {
    match outcome {
        EnterOutcome::Entered { name, .. } => Some(window_title(name)),
        EnterOutcome::Cancelled => None,
    }
}

pub fn picked_path(picked: Option<FilePath>) -> Option<String> {
    let path = picked?.into_path().ok()?;
    Some(path.to_string_lossy().into_owned())
}

pub fn task_failure(step: LoadStep, error: tauri::Error) -> LoadError {
    LoadError::new(step, ErrorCode::DbIo, error.to_string())
}

pub fn perform_load(
    loader: &WorkspaceLoader,
    session: &WorkspaceSession,
    request: LoadRequest,
    sink: &dyn LoadEventSink,
) -> Result<LoadOutcome, LoadError> {
    loader.load(session, request, sink)
}

fn list_recent(app: &AppHandle) -> Vec<RecentWorkspaceView> {
    let current = app.state::<WorkspaceSession>().current();
    app.state::<WorkspaceService>()
        .recent_list_for(current.as_ref())
}

fn measure_folder(app: &AppHandle, path: &str) -> u64 {
    app.state::<WorkspaceService>().measure(path)
}

fn delete_workspace(app: &AppHandle, path: &str) -> Result<(), String> {
    if app.state::<WorkspaceSession>().is_current(path) {
        return Err("The active workspace cannot be deleted.".to_string());
    }
    app.state::<WorkspaceService>().delete_workspace(path)
}

fn pick_folder(app: &AppHandle) -> Option<String> {
    picked_path(app.dialog().file().blocking_pick_folder())
}

fn load_workspace_blocking(
    app: &AppHandle,
    request: LoadRequest,
    sink: &dyn LoadEventSink,
) -> Result<LoadOutcome, LoadError> {
    let loader = app.state::<WorkspaceLoader>();
    let session = app.state::<WorkspaceSession>();
    perform_load(&loader, &session, request, sink)
}

fn enter_workspace_blocking(app: &AppHandle) -> Result<EnterOutcome, LoadError> {
    let loader = app.state::<WorkspaceLoader>();
    let session = app.state::<WorkspaceSession>();
    loader.enter(&session)
}

fn apply_window_title(app: &AppHandle, title: &str) {
    let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) else {
        eprintln!("cannot set window title: window {MAIN_WINDOW_LABEL} not found");
        return;
    };
    if let Err(error) = window.set_title(title) {
        eprintln!("cannot set window title: {error}");
    }
}

#[tauri::command]
pub async fn recent_list(app: AppHandle) -> Vec<RecentWorkspaceView> {
    let task = spawn_blocking(move || list_recent(&app));
    task.await.unwrap_or_default()
}

#[tauri::command]
pub async fn workspace_measure(app: AppHandle, path: String) -> u64 {
    let task = spawn_blocking(move || measure_folder(&app, &path));
    task.await.unwrap_or_default()
}

#[tauri::command]
pub async fn workspace_delete(app: AppHandle, path: String) -> Result<(), String> {
    let task = spawn_blocking(move || delete_workspace(&app, &path));
    task.await.map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn folder_pick(app: AppHandle) -> Option<String> {
    let task = spawn_blocking(move || pick_folder(&app));
    task.await.unwrap_or_default()
}

#[tauri::command]
pub async fn workspace_load(
    app: AppHandle,
    path: String,
    relocate_from: Option<String>,
    channel: Channel<LoadEvent>,
) -> Result<LoadOutcome, LoadError> {
    let request = LoadRequest::new(path, relocate_from);
    let sink = ChannelSink::new(channel);
    let task = spawn_blocking(move || load_workspace_blocking(&app, request, &sink));
    match task.await {
        Ok(result) => result,
        Err(error) => Err(task_failure(LoadStep::Application, error)),
    }
}

#[tauri::command]
pub async fn workspace_cancel(app: AppHandle) -> CancelOutcome {
    app.state::<WorkspaceSession>().cancel()
}

#[tauri::command]
pub async fn workspace_enter(app: AppHandle) -> Result<EnterOutcome, LoadError> {
    let background = app.clone();
    let task = spawn_blocking(move || enter_workspace_blocking(&background));
    let outcome = match task.await {
        Ok(result) => result?,
        Err(error) => return Err(task_failure(LoadStep::Application, error)),
    };
    if let Some(title) = entered_title(&outcome) {
        apply_window_title(&app, &title);
    }
    Ok(outcome)
}

#[tauri::command]
pub async fn workspace_is_current(app: AppHandle, path: String) -> bool {
    app.state::<WorkspaceSession>().is_current(&path)
}

#[tauri::command]
pub async fn workspace_current(app: AppHandle) -> Option<CurrentWorkspace> {
    app.state::<WorkspaceSession>().current()
}

#[cfg(test)]
#[path = "../../test/commands/workspace.test.rs"]
mod tests;
