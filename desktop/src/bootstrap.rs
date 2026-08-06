use tauri::App;
use tauri::AppHandle;
use tauri::Manager;
use tauri::RunEvent;

use crate::commands;
use crate::container::AppContainer;
use crate::features::workspace::loader::WorkspaceLoader;
use crate::features::workspace::repository::WorkspaceRepository;
use crate::features::workspace::service::WorkspaceService;
use crate::features::workspace::session::WorkspaceSession;

pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            commands::app::app_info,
            commands::workspace::recent_list,
            commands::workspace::workspace_measure,
            commands::workspace::recent_remove,
            commands::workspace::folder_pick,
            commands::workspace::workspace_load,
            commands::workspace::workspace_cancel,
            commands::workspace::workspace_enter,
            commands::workspace::workspace_current,
            commands::workspace::workspace_is_current,
        ])
        .setup(setup)
        .build(tauri::generate_context!())
        .expect("error while building tauri application");
    app.run(handle_run_event);
}

fn handle_run_event(app: &AppHandle, event: RunEvent) {
    if let RunEvent::Exit = event
        && let Some(container) = app.try_state::<AppContainer>()
    {
        container.backend.stop();
        container.logger.info("app", "backend stopped on exit");
    }
}

fn setup(app: &mut App) -> Result<(), Box<dyn std::error::Error>> {
    let container = AppContainer::new(app)?;
    log_startup(app, &container);
    manage_workspace(app, &container);
    app.manage(container);
    Ok(())
}

fn manage_workspace(app: &App, container: &AppContainer) {
    let repository = WorkspaceRepository::new(container.database_path.clone());
    let service = WorkspaceService::new(repository);
    let loader = WorkspaceLoader::from_container(container, service.clone());
    app.manage(WorkspaceSession::new());
    app.manage(service);
    app.manage(loader);
}

fn log_startup(app: &App, container: &AppContainer) {
    let logger = &container.logger;
    if let Err(error) = logger.prepare() {
        eprintln!("cannot prepare log directory: {error}");
        return;
    }
    let package = app.package_info();
    let lines = [
        format!("{} {} started", package.name, package.version),
        format!("data directory: {}", container.directories.root.display()),
        format!("log directory: {}", container.directories.logs.display()),
        format!(
            "application database: {}",
            container.database_path.display()
        ),
    ];
    for line in &lines {
        logger.info("app", line);
    }
}
