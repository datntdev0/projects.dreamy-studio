use tauri::App;
use tauri::AppHandle;
use tauri::Manager;
use tauri::RunEvent;

use crate::commands;
use crate::container::AppContainer;
use crate::features::novel::service::NovelService;
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
            commands::novel::novel_list,
            commands::novel::novel_create,
            commands::novel::novel_update,
            commands::novel::novel_delete,
            commands::novel::novel_cover_get,
            commands::novel::novel_cover_set,
            commands::novel::novel_cover_clear,
            commands::novel::novel_chapters,
            commands::novel::novel_chapter_read,
            commands::novel::novel_paragraph_update,
            commands::novel::novel_package_pick,
            commands::novel::novel_package_inspect,
            commands::novel::novel_package_import,
            commands::novel::novel_package_save_pick,
            commands::novel::novel_package_export,
            commands::project::project_list,
            commands::project::project_create,
            commands::project::project_update,
            commands::project::project_archive,
            commands::project::project_delete,
            commands::project::project_open,
            commands::project::project_dir_list,
            commands::project::project_cover_get,
            commands::project::project_cover_set,
            commands::project::project_cover_clear,
            commands::project::project_folder_open,
            commands::library::library_summary,
            commands::library::library_collection_list,
            commands::library::library_collection_create,
            commands::library::library_collection_update,
            commands::library::library_collection_delete,
            commands::library::library_tag_list,
            commands::library::library_tag_rename,
            commands::library::library_tag_merge,
            commands::library::library_tag_delete,
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
    app.manage(NovelService::new());
    app.manage(crate::features::project::service::ProjectService::new());
    app.manage(crate::features::library::service::LibraryService::new());
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
