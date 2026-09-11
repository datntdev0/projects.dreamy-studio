use std::path::PathBuf;
use std::sync::Arc;

use crate::features::backend::supervisor::BackendSupervisor;
use crate::features::settings::check::LlmCheck;
use crate::features::settings::check::LlmChecker;
use crate::features::settings::check::LlmStatus;
use crate::features::settings::check::NoLlmCheck;
use crate::features::settings::repository::SETTINGS_FILE;
use crate::infra::backend::BackendHost;
use crate::infra::backend::BackendLaunch;
use crate::infra::backend::BackendProcess;
use crate::infra::logging::Logger;
use crate::infra::startup::manifest::executable_of;
use crate::shared::config;
use crate::shared::config::AppConfig;

const RUNTIME_LIBRARIES_DIR: &str = "vcruntime";
const DEV_BUILD_DIR: &str = "_output/desktop/build";

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
    pub config: AppConfig,
    pub directories: AppDirectories,
    pub database_path: PathBuf,
    pub settings_path: PathBuf,
    pub logger: Logger,
    pub backend: Arc<dyn BackendHost>,
    pub supervisor: Arc<BackendSupervisor>,
    pub llm_status: LlmStatus,
    pub llm: Arc<dyn LlmChecker>,
}

impl AppContainer {
    pub fn new() -> Self {
        Self::from_config(config::current().clone())
    }

    pub fn from_config(config: AppConfig) -> Self {
        let data_dir = config.backend_data_dir.clone();
        let logs = config.backend_logs_dir();
        let python = executable_of(&config, "python").unwrap_or_default();
        let backend = BackendProcess::new(BackendLaunch::resolve(data_dir, logs, python));
        let mut container = Self::assemble(config, Arc::new(backend));
        let data_dir = container.directories.root.clone();
        container.llm = Arc::new(LlmCheck::new(data_dir, container.llm_status.clone()));
        container
    }

    pub fn runtime_libraries_dir() -> PathBuf {
        let base = if cfg!(debug_assertions) {
            PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .join("..")
                .join(DEV_BUILD_DIR)
        } else {
            config::install_dir()
        };
        base.join(RUNTIME_LIBRARIES_DIR)
    }

    fn assemble(config: AppConfig, backend: Arc<dyn BackendHost>) -> Self {
        let directories = AppDirectories::new(config.app_data_dir.clone());
        let database_path = directories.database_path();
        let settings_path = directories.settings_path();
        let logger = Logger::new(directories.logs.clone());
        let supervisor = Arc::new(BackendSupervisor::new(backend));

        Self {
            config,
            directories,
            database_path,
            settings_path,
            logger,
            backend: supervisor.clone(),
            supervisor,
            llm_status: LlmStatus::default(),
            llm: Arc::new(NoLlmCheck),
        }
    }
}
