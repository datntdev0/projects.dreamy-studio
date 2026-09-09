use crate::infra::logging::Logger;
use crate::infra::startup::download::Fetch;
use crate::infra::startup::download::FetchStop;
use crate::infra::startup::install::Installation;
use crate::infra::startup::install::is_installed;
use crate::infra::startup::manifest::ManifestItem;
use crate::infra::startup::manifest::SetupManifest;
use crate::shared::config::AppConfig;
use serde::Serialize;
use std::collections::HashMap;
use std::sync::Arc;
use std::sync::Mutex;
use std::sync::MutexGuard;
use std::sync::atomic::AtomicBool;
use std::sync::atomic::Ordering;
use std::time::Duration;
use std::time::Instant;

const LOG_TARGET: &str = "llm-install";
const PROGRESS_INTERVAL: Duration = Duration::from_millis(200);

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum InstallState {
    None,
    Downloading,
    Installed,
    Error,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallView {
    pub state: InstallState,
    pub version: String,
    pub received_bytes: u64,
    pub total_bytes: u64,
    pub error: String,
}

impl InstallView {
    pub fn unavailable() -> Self {
        Self {
            state: InstallState::Error,
            version: String::new(),
            received_bytes: 0,
            total_bytes: 0,
            error: "This CLI has no download for this platform.".to_string(),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallProgress {
    pub received_bytes: u64,
    pub total_bytes: u64,
}

pub struct CliInstaller {
    config: AppConfig,
    manifest: SetupManifest,
    logger: Logger,
    running: Mutex<HashMap<String, Arc<AtomicBool>>>,
}

impl CliInstaller {
    pub fn new(config: AppConfig, manifest: SetupManifest, logger: Logger) -> Self {
        Self {
            config,
            manifest,
            logger,
            running: Mutex::new(HashMap::new()),
        }
    }

    pub fn view(&self, id: &str) -> InstallView {
        let Some(item) = self.item(id) else {
            return InstallView::unavailable();
        };
        let installed = is_installed(item, &self.config);
        let state = if installed {
            InstallState::Installed
        } else if self.running().contains_key(id) {
            InstallState::Downloading
        } else {
            InstallState::None
        };
        InstallView {
            state,
            version: item.version.clone(),
            received_bytes: if installed {
                item.size
            } else {
                self.received(item)
            },
            total_bytes: item.size,
            error: String::new(),
        }
    }

    pub fn install(
        &self,
        id: &str,
        progress: &dyn Fn(InstallProgress),
    ) -> Result<InstallView, String> {
        let item = self
            .item(id)
            .ok_or_else(|| InstallView::unavailable().error)?;
        if is_installed(item, &self.config) {
            return Ok(self.view(id));
        }
        let cancel = self.begin(id)?;
        let result = self.provide(item, &cancel, progress);
        self.running().remove(id);
        match result {
            Ok(()) => {
                self.logger.info(
                    LOG_TARGET,
                    &format!("{} {} installed", item.id, item.display_version()),
                );
                Ok(self.view(id))
            }
            Err(FetchStop::Cancelled) => Ok(self.view(id)),
            Err(FetchStop::Failed(error)) => {
                self.logger.error(
                    LOG_TARGET,
                    &format!(
                        "{} failed code={:?} detail={}",
                        item.id, error.code, error.detail
                    ),
                );
                Err(error.detail)
            }
        }
    }

    pub fn cancel(&self, id: &str) {
        if let Some(cancel) = self.running().get(id) {
            cancel.store(true, Ordering::SeqCst);
        }
    }

    fn provide(
        &self,
        item: &ManifestItem,
        cancel: &AtomicBool,
        progress: &dyn Fn(InstallProgress),
    ) -> Result<(), FetchStop> {
        let directory = item.downloads_dir(&self.config);
        let fetch = Fetch {
            item,
            directory: &directory,
            cancel,
        };
        let mut meter = ProgressMeter::new(item.size, progress);
        fetch.download(&mut |received| meter.update(received))?;
        let archive = fetch.verify().map_err(FetchStop::Failed)?;
        Installation {
            item,
            config: &self.config,
            extra_files: None,
        }
        .install(&archive)
        .map_err(FetchStop::Failed)
    }

    fn begin(&self, id: &str) -> Result<Arc<AtomicBool>, String> {
        let mut running = self.running();
        if running.contains_key(id) {
            return Err(format!("{id} is already downloading."));
        }
        let cancel = Arc::new(AtomicBool::new(false));
        running.insert(id.to_string(), cancel.clone());
        Ok(cancel)
    }

    fn received(&self, item: &ManifestItem) -> u64 {
        let directory = item.downloads_dir(&self.config);
        let idle = AtomicBool::new(false);
        Fetch {
            item,
            directory: &directory,
            cancel: &idle,
        }
        .received()
    }

    fn item(&self, id: &str) -> Option<&ManifestItem> {
        self.manifest.item(id).filter(|item| item.on_demand)
    }

    fn running(&self) -> MutexGuard<'_, HashMap<String, Arc<AtomicBool>>> {
        self.running
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }
}

struct ProgressMeter<'a> {
    total: u64,
    sink: &'a dyn Fn(InstallProgress),
    last_at: Option<Instant>,
}

impl<'a> ProgressMeter<'a> {
    fn new(total: u64, sink: &'a dyn Fn(InstallProgress)) -> Self {
        Self {
            total,
            sink,
            last_at: None,
        }
    }

    fn update(&mut self, received: u64) {
        let due = self
            .last_at
            .is_none_or(|last| last.elapsed() >= PROGRESS_INTERVAL);
        if !due && received < self.total {
            return;
        }
        (self.sink)(InstallProgress {
            received_bytes: received,
            total_bytes: self.total,
        });
        self.last_at = Some(Instant::now());
    }
}

#[cfg(test)]
#[path = "../../../test/features/settings/install.test.rs"]
mod tests;
