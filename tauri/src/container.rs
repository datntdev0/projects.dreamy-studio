use std::path::PathBuf;

use tauri::{App, Manager, Runtime};

pub struct AppDirectories {
    pub config: PathBuf,
    pub data: PathBuf,
    pub cache: PathBuf,
}

pub struct AppContainer {
    pub directories: AppDirectories,
}

impl AppContainer {
    pub fn new<R: Runtime>(app: &App<R>) -> tauri::Result<Self> {
        let path = app.path();

        Ok(Self {
            directories: AppDirectories {
                config: path.app_config_dir()?,
                data: path.app_data_dir()?,
                cache: path.app_cache_dir()?,
            },
        })
    }
}
