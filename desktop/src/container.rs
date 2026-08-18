use std::path::PathBuf;
use std::sync::Arc;

use tauri::App;
use tauri::Manager;
use tauri::Runtime;

use crate::features::settings::check::LlmCheck;
use crate::features::settings::check::LlmChecker;
use crate::features::settings::check::LlmStatus;
use crate::features::settings::check::NoLlmCheck;
use crate::features::settings::repository::SETTINGS_FILE;
use crate::features::settings::repository::SettingsRepository;
use crate::infra::backend::BackendHost;
use crate::infra::backend::BackendLaunch;
use crate::infra::backend::BackendProcess;
use crate::infra::logging::Logger;
use crate::shared::env;

pub struct AppDirectories {
    pub root: PathBuf,
    pub logs: PathBuf,
}

impl AppDirectories {
    pub fn new(root: PathBuf) -> Self {
        let logs = root.join("logs");
        Self { root, logs }
    }

    pub fn database_path(&self) -> PathBuf {
        self.root.join("application.dreamydb")
    }

    pub fn settings_path(&self) -> PathBuf {
        self.root.join(SETTINGS_FILE)
    }
}

pub struct AppContainer {
    pub directories: AppDirectories,
    pub database_path: PathBuf,
    pub settings_path: PathBuf,
    pub logger: Logger,
    pub backend: Arc<dyn BackendHost>,
    pub llm_status: LlmStatus,
    pub llm: Arc<dyn LlmChecker>,
}

impl AppContainer {
    pub fn new<R: Runtime>(app: &App<R>) -> tauri::Result<Self> {
        let root = match env::data_dir().or_else(env::portable_data_dir) {
            Some(root) => root,
            None => app.path().local_data_dir()?.join("DreamyStudio"),
        };
        Ok(Self::from_root(root))
    }

    pub fn from_root(root: PathBuf) -> Self {
        let logs = root.join("logs");
        let backend = BackendProcess::new(BackendLaunch::resolve(logs));
        let mut container = Self::with_backend(root, Arc::new(backend));
        let repository = SettingsRepository::new(container.settings_path.clone());
        let data_dir = container.directories.root.clone();
        container.llm = Arc::new(LlmCheck::new(
            repository,
            data_dir,
            container.llm_status.clone(),
        ));
        container
    }

    pub fn with_backend(root: PathBuf, backend: Arc<dyn BackendHost>) -> Self {
        let directories = AppDirectories::new(root);
        let database_path = directories.database_path();
        let settings_path = directories.settings_path();
        let logger = Logger::new(directories.logs.clone());

        Self {
            directories,
            database_path,
            settings_path,
            logger,
            backend,
            llm_status: LlmStatus::default(),
            llm: Arc::new(NoLlmCheck),
        }
    }
}

#[cfg(test)]
#[path = "../test/container.test.rs"]
mod tests;
