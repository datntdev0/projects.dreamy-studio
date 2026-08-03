use tauri::Manager;

use crate::container::AppContainer;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| { app.manage(AppContainer::new(app)?); Ok(())})
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
