use serde::Serialize;
use tauri::AppHandle;
use tauri::Runtime;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub name: String,
    pub version: String,
}

impl AppInfo {
    pub fn new(name: impl Into<String>, version: impl Into<String>) -> Self {
        Self {
            name: name.into(),
            version: version.into(),
        }
    }
}

#[tauri::command]
pub fn app_info<R: Runtime>(app: AppHandle<R>) -> AppInfo {
    let package = app.package_info();
    AppInfo::new(package.name.clone(), package.version.to_string())
}

#[tauri::command]
pub fn app_quit<R: Runtime>(app: AppHandle<R>) {
    app.exit(0);
}

#[cfg(test)]
#[path = "../../test/commands/app.test.rs"]
mod tests;
