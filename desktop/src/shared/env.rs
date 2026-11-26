use std::path::Path;
use std::path::PathBuf;

use crate::shared::config;

pub const STUDIO_DATA_DIR_VAR: &str = "DREAMY_STUDIO_DATA_DIR";
pub const BACKEND_DATA_DIR_VAR: &str = "DREAMY_BACKEND_DATA_DIR";
pub const WEBVIEW_DATA_VAR: &str = "WEBVIEW2_USER_DATA_FOLDER";

pub fn export_directories() {
    let config = config::current();
    export(STUDIO_DATA_DIR_VAR, &config.root_dir);
    export(BACKEND_DATA_DIR_VAR, &config.backend_data_dir);
    if std::env::var_os(WEBVIEW_DATA_VAR).is_some() {
        return;
    }
    if let Some(directory) = config.webview_dir() {
        export(WEBVIEW_DATA_VAR, &directory);
    }
}

pub fn directory(value: Option<String>) -> Option<PathBuf> {
    value
        .filter(|value| !value.trim().is_empty())
        .map(|value| absolute(PathBuf::from(value.trim())))
}

fn export(name: &str, value: &Path) {
    unsafe { std::env::set_var(name, value) };
}

fn absolute(path: PathBuf) -> PathBuf {
    std::path::absolute(&path).unwrap_or(path)
}
