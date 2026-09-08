use std::collections::BTreeMap;
use std::fs;
use std::fs::File;
use std::io;
use std::path::Path;
use std::path::PathBuf;
use std::sync::Arc;
use std::sync::Mutex;
use std::sync::atomic::AtomicBool;
use std::sync::atomic::Ordering;
use std::time::Duration;
use std::time::Instant;

use crate::features::settings::check::LlmChecker;
use crate::features::settings::check::LlmStatus;
use crate::features::settings::llm::CLI_SPECS;
use crate::features::settings::probe::CliProbe;
use crate::infra::logging::Logger;
use crate::infra::startup::download::Fetch;
use crate::infra::startup::download::FetchStop;
use crate::infra::startup::install::Installation;
use crate::infra::startup::install::is_installed;
use crate::infra::startup::manifest::ItemGroup;
use crate::infra::startup::manifest::ManifestItem;
use crate::infra::startup::manifest::SetupManifest;
use crate::infra::startup::models::ItemState;
use crate::infra::startup::models::SetupError;
use crate::infra::startup::models::SetupErrorCode;
use crate::infra::startup::models::SetupEvent;
use crate::infra::startup::models::SetupGroup;
use crate::infra::startup::models::SetupItemView;
use crate::infra::startup::models::SetupKind;
use crate::infra::startup::models::SetupOutcome;
use crate::infra::startup::models::SetupPhase;
use crate::infra::startup::models::SetupSink;
use crate::shared::config::AppConfig;

const LOG_TARGET: &str = "setup";
const PROGRESS_INTERVAL: Duration = Duration::from_millis(200);
const RUNTIME_LIBRARIES_ITEM: &str = "python";

pub struct SetupService {
    config: AppConfig,
    manifest: SetupManifest,
    llm: Arc<dyn LlmChecker>,
    status: LlmStatus,
    runtime_libraries: Option<PathBuf>,
    logger: Logger,
    cancel: AtomicBool,
    gate: Mutex<()>,
}

pub struct SetupDeps {
    pub config: AppConfig,
    pub manifest: SetupManifest,
    pub llm: Arc<dyn LlmChecker>,
    pub status: LlmStatus,
    pub runtime_libraries: Option<PathBuf>,
    pub logger: Logger,
}

impl SetupService {
    pub fn new(deps: SetupDeps) -> Self {
        Self {
            config: deps.config,
            manifest: deps.manifest,
            llm: deps.llm,
            status: deps.status,
            runtime_libraries: deps.runtime_libraries,
            logger: deps.logger,
            cancel: AtomicBool::new(false),
            gate: Mutex::new(()),
        }
    }

    pub fn pause(&self) {
        self.cancel.store(true, Ordering::SeqCst);
    }

    pub fn run(&self, sink: &dyn SetupSink) -> Result<SetupOutcome, SetupError> {
        let Ok(_guard) = self.gate.try_lock() else {
            return Err(SetupError::new(
                SetupErrorCode::Busy,
                "setup is already running",
            ));
        };
        self.cancel.store(false, Ordering::SeqCst);
        let mut items = self.snapshot();
        sink.emit(SetupEvent::Snapshot {
            status: SetupPhase::Checking,
            items: items.clone(),
        });
        if !self.llm.check(&self.cancel) {
            return Ok(SetupOutcome::Paused);
        }
        self.publish_tools(&mut items, sink);
        let pending: Vec<&ManifestItem> = self
            .manifest
            .items
            .iter()
            .filter(|item| !is_installed(item, &self.config))
            .collect();
        if pending.is_empty() {
            self.logger.info(LOG_TARGET, "all components are installed");
            return Ok(SetupOutcome::Ready);
        }
        sink.emit(SetupEvent::Phase {
            status: SetupPhase::Running,
        });
        for item in pending {
            if let Some(outcome) = self.provide(item, sink)? {
                return Ok(outcome);
            }
        }
        Ok(SetupOutcome::Ready)
    }

    pub fn import(&self, package: &Path) -> Result<usize, SetupError> {
        let Ok(_guard) = self.gate.try_lock() else {
            return Err(SetupError::new(
                SetupErrorCode::Busy,
                "setup is already running",
            ));
        };
        let file = File::open(package).map_err(|error| SetupError::io(&error))?;
        let mut zip = zip::ZipArchive::new(file)
            .map_err(|error| SetupError::new(SetupErrorCode::Extract, error.to_string()))?;
        let mut imported = 0;
        for item in &self.manifest.items {
            if is_installed(item, &self.config) {
                continue;
            }
            if stage_from_package(&mut zip, item, &item.downloads_dir(&self.config))? {
                imported += 1;
            }
        }
        self.logger.info(
            LOG_TARGET,
            &format!(
                "offline package {} staged {imported} components",
                package.display()
            ),
        );
        Ok(imported)
    }

    fn snapshot(&self) -> Vec<SetupItemView> {
        let downloads = self
            .manifest
            .items
            .iter()
            .map(|item| self.download_view(item));
        let tools = CLI_SPECS
            .iter()
            .map(|cli| detect_view(cli.id, None, ItemState::Checking));
        downloads.chain(tools).collect()
    }

    fn download_view(&self, item: &ManifestItem) -> SetupItemView {
        let installed = is_installed(item, &self.config);
        let directory = item.downloads_dir(&self.config);
        let fetch = Fetch {
            item,
            directory: &directory,
            cancel: &self.cancel,
        };
        SetupItemView {
            id: item.id.clone(),
            group: group_of(item),
            kind: SetupKind::Download,
            version: Some(item.version.clone()),
            state: if installed {
                ItemState::Ready
            } else {
                ItemState::Pending
            },
            received: if installed {
                item.size
            } else {
                fetch.received()
            },
            total: item.size,
        }
    }

    fn publish_tools(&self, items: &mut [SetupItemView], sink: &dyn SetupSink) {
        let probes = self.status.snapshot();
        for view in items
            .iter_mut()
            .filter(|view| view.kind == SetupKind::Detect)
        {
            *view = tool_view(&view.id, &probes);
            sink.emit(SetupEvent::Item { item: view.clone() });
        }
    }

    fn provide(
        &self,
        item: &ManifestItem,
        sink: &dyn SetupSink,
    ) -> Result<Option<SetupOutcome>, SetupError> {
        let directory = item.downloads_dir(&self.config);
        let fetch = Fetch {
            item,
            directory: &directory,
            cancel: &self.cancel,
        };
        let view = self.download_view(item);
        sink.emit(SetupEvent::Item {
            item: view.with_state(ItemState::Downloading),
        });
        let mut meter = ProgressMeter::new(&item.id, item.size, fetch.received(), sink);
        match fetch.download(&mut |received| meter.update(received)) {
            Ok(()) => {}
            Err(FetchStop::Cancelled) => return Ok(Some(SetupOutcome::Paused)),
            Err(FetchStop::Failed(error)) => return Err(self.fail(item, sink, error)),
        }
        let finished = SetupItemView {
            received: item.size,
            ..view.clone()
        };
        sink.emit(SetupEvent::Item {
            item: finished.with_state(ItemState::Verifying),
        });
        let archive = fetch
            .verify()
            .map_err(|error| self.fail(item, sink, error))?;
        sink.emit(SetupEvent::Item {
            item: finished.with_state(ItemState::Extracting),
        });
        self.installation(item)
            .install(&archive)
            .map_err(|error| self.fail(item, sink, error))?;
        self.logger.info(
            LOG_TARGET,
            &format!("{} {} installed", item.id, item.display_version()),
        );
        sink.emit(SetupEvent::Item {
            item: finished.with_state(ItemState::Ready),
        });
        Ok(None)
    }

    fn installation<'a>(&'a self, item: &'a ManifestItem) -> Installation<'a> {
        let extra_files = (item.id == RUNTIME_LIBRARIES_ITEM)
            .then_some(self.runtime_libraries.as_deref())
            .flatten();
        Installation {
            item,
            config: &self.config,
            extra_files,
        }
    }

    fn fail(&self, item: &ManifestItem, sink: &dyn SetupSink, error: SetupError) -> SetupError {
        self.logger.error(
            LOG_TARGET,
            &format!(
                "{} failed code={:?} detail={}",
                item.id, error.code, error.detail
            ),
        );
        let view = self.download_view(item);
        sink.emit(SetupEvent::Item {
            item: view.with_state(ItemState::Error),
        });
        error
    }
}

struct ProgressMeter<'a> {
    id: &'a str,
    total: u64,
    sink: &'a dyn SetupSink,
    last_at: Instant,
    last_received: u64,
}

impl<'a> ProgressMeter<'a> {
    fn new(id: &'a str, total: u64, received: u64, sink: &'a dyn SetupSink) -> Self {
        Self {
            id,
            total,
            sink,
            last_at: Instant::now(),
            last_received: received,
        }
    }

    fn update(&mut self, received: u64) {
        let elapsed = self.last_at.elapsed();
        if elapsed < PROGRESS_INTERVAL && received < self.total {
            return;
        }
        let gained = received.saturating_sub(self.last_received);
        let speed = (gained as f64 / elapsed.as_secs_f64().max(0.001)) as u64;
        self.sink.emit(SetupEvent::Progress {
            id: self.id.to_string(),
            received,
            total: self.total,
            speed,
        });
        self.last_at = Instant::now();
        self.last_received = received;
    }
}

fn group_of(item: &ManifestItem) -> SetupGroup {
    match item.group {
        ItemGroup::Runtime => SetupGroup::Runtime,
        ItemGroup::Toolbox => SetupGroup::Toolbox,
    }
}

fn detect_view(id: &str, version: Option<String>, state: ItemState) -> SetupItemView {
    SetupItemView {
        id: id.to_string(),
        group: SetupGroup::Toolbox,
        kind: SetupKind::Detect,
        version,
        state,
        received: 0,
        total: 0,
    }
}

fn tool_view(id: &str, probes: &BTreeMap<String, CliProbe>) -> SetupItemView {
    match probes.get(id) {
        Some(probe) if probe.found => {
            let version = Some(probe.version.clone()).filter(|value| !value.is_empty());
            detect_view(id, version, ItemState::Ready)
        }
        _ => detect_view(id, None, ItemState::Missing),
    }
}

fn stage_from_package<R: io::Read + io::Seek>(
    zip: &mut zip::ZipArchive<R>,
    item: &ManifestItem,
    directory: &Path,
) -> Result<bool, SetupError> {
    let Some(index) = (0..zip.len()).find(|index| entry_matches(zip, *index, &item.file)) else {
        return Ok(false);
    };
    fs::create_dir_all(directory).map_err(|error| SetupError::io(&error))?;
    let mut entry = zip
        .by_index(index)
        .map_err(|error| SetupError::new(SetupErrorCode::Extract, error.to_string()))?;
    let target = directory.join(&item.file);
    let mut output = File::create(&target).map_err(|error| SetupError::io(&error))?;
    io::copy(&mut entry, &mut output).map_err(|error| SetupError::io(&error))?;
    Ok(true)
}

fn entry_matches<R: io::Read + io::Seek>(
    zip: &mut zip::ZipArchive<R>,
    index: usize,
    file: &str,
) -> bool {
    let Ok(entry) = zip.by_index(index) else {
        return false;
    };
    entry
        .enclosed_name()
        .and_then(|name| {
            name.file_name()
                .map(|value| value.to_string_lossy().into_owned())
        })
        .is_some_and(|name| name == file)
}
