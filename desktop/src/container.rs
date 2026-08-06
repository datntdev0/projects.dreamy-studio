use std::path::PathBuf;
use std::sync::Arc;

use tauri::App;
use tauri::Manager;
use tauri::Runtime;

use crate::infra::backend::BackendHost;
use crate::infra::backend::BackendLaunch;
use crate::infra::backend::BackendProcess;
use crate::infra::logging::Logger;

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
}

pub struct AppContainer {
    pub directories: AppDirectories,
    pub database_path: PathBuf,
    pub logger: Logger,
    pub backend: Arc<dyn BackendHost>,
}

impl AppContainer {
    pub fn new<R: Runtime>(app: &App<R>) -> tauri::Result<Self> {
        let root = app.path().local_data_dir()?.join("DreamyStudio");
        Ok(Self::from_root(root))
    }

    pub fn from_root(root: PathBuf) -> Self {
        let logs = root.join("logs");
        let backend = BackendProcess::new(BackendLaunch::resolve(logs));
        Self::with_backend(root, Arc::new(backend))
    }

    pub fn with_backend(root: PathBuf, backend: Arc<dyn BackendHost>) -> Self {
        let directories = AppDirectories::new(root);
        let database_path = directories.database_path();
        let logger = Logger::new(directories.logs.clone());

        Self {
            directories,
            database_path,
            logger,
            backend,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::AppContainer;
    use tempfile::tempdir;

    #[test]
    fn derives_paths_from_root_without_creating_them() {
        let dir = tempdir().unwrap();
        let root = dir.path().join("DreamyStudio");

        let container = AppContainer::from_root(root.clone());

        assert_eq!(container.directories.root, root);
        assert_eq!(container.directories.logs, root.join("logs"));
        assert_eq!(container.database_path, root.join("application.dreamydb"));
        assert!(!root.exists());
    }
}
