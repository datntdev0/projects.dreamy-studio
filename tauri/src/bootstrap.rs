use tauri::App;
use tauri::Manager;

use crate::container::AppContainer;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(setup)
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn setup(app: &mut App) -> Result<(), Box<dyn std::error::Error>> {
    let container = AppContainer::new(app)?;
    log_startup(app, &container);
    app.manage(container);
    Ok(())
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
        format!("application database: {}", container.database_path.display()),
    ];
    for line in &lines {
        logger.info("app", line);
    }
}
