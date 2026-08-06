use crate::features::workspace::inspector::WORKSPACE_DB_FILE;
use crate::features::workspace::load::CancelOutcome;
use crate::features::workspace::load::EnterOutcome;
use crate::features::workspace::load::LoadError;
use crate::features::workspace::load::LoadStep;
use crate::features::workspace::service::WorkspaceService;
use crate::shared::path::NormalizedPath;
use chrono::Utc;
use rusqlite::InterruptHandle;
use serde::Serialize;
use std::fs;
use std::path::Path;
use std::sync::Arc;
use std::sync::Mutex;
use std::sync::MutexGuard;
use std::sync::atomic::AtomicBool;
use std::sync::atomic::Ordering;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LoadPhase {
    Running,
    Ready,
}

pub struct ActiveLoad {
    pub path: String,
    pub relocate_from: Option<String>,
    pub created_by_run: bool,
    pub phase: LoadPhase,
    pub cancel: Arc<AtomicBool>,
    pub interrupt: Option<InterruptHandle>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CurrentWorkspace {
    pub name: String,
    pub path: String,
}

#[derive(Default)]
pub struct WorkspaceSession {
    gate: Mutex<()>,
    active: Mutex<Option<ActiveLoad>>,
    current: Mutex<Option<CurrentWorkspace>>,
}

impl WorkspaceSession {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn current(&self) -> Option<CurrentWorkspace> {
        lock(&self.current).clone()
    }

    pub fn is_current(&self, path: &str) -> bool {
        let key = NormalizedPath::new(path).key;
        match lock(&self.current).as_ref() {
            Some(current) => NormalizedPath::new(&current.path).key == key,
            None => false,
        }
    }

    pub fn cancel(&self) -> CancelOutcome {
        let mut active = lock(&self.active);
        let phase = match active.as_ref() {
            Some(load) => load.phase,
            None => return self.cancel_without_load(),
        };
        if let Some(load) = active.as_ref() {
            load.cancel.store(true, Ordering::SeqCst);
            if let Some(handle) = &load.interrupt {
                handle.interrupt();
            }
        }
        if phase == LoadPhase::Ready
            && let Some(load) = active.take()
        {
            discard_created(&load);
        }
        CancelOutcome::Cancelled
    }

    pub fn enter(&self, service: &WorkspaceService) -> Result<EnterOutcome, LoadError> {
        let mut active = lock(&self.active);
        let enterable = match active.as_ref() {
            Some(load) => load.phase == LoadPhase::Ready && !load.cancel.load(Ordering::SeqCst),
            None => false,
        };
        if !enterable {
            return Ok(EnterOutcome::Cancelled);
        }
        let load = match active.take() {
            Some(load) => load,
            None => return Ok(EnterOutcome::Cancelled),
        };
        let now = Utc::now();
        let recorded = match &load.relocate_from {
            Some(old) => service.relocate_recent(old, &load.path, now),
            None => service.record_opened(&load.path, now),
        };
        match recorded {
            Ok(()) => {
                let name = NormalizedPath::new(&load.path).name;
                let current = CurrentWorkspace {
                    name: name.clone(),
                    path: load.path.clone(),
                };
                *lock(&self.current) = Some(current);
                Ok(EnterOutcome::Entered {
                    name,
                    path: load.path,
                })
            }
            Err(error) => {
                discard_created(&load);
                Err(LoadError::from_storage(LoadStep::Application, &error))
            }
        }
    }

    pub(crate) fn gate(&self) -> MutexGuard<'_, ()> {
        lock(&self.gate)
    }

    pub(crate) fn begin(&self, path: &str, relocate_from: Option<String>) -> Arc<AtomicBool> {
        let mut active = lock(&self.active);
        if let Some(previous) = active.take() {
            previous.cancel.store(true, Ordering::SeqCst);
            discard_created(&previous);
        }
        let cancel = Arc::new(AtomicBool::new(false));
        *active = Some(ActiveLoad {
            path: path.to_string(),
            relocate_from,
            created_by_run: false,
            phase: LoadPhase::Running,
            cancel: cancel.clone(),
            interrupt: None,
        });
        cancel
    }

    pub(crate) fn mark_created(&self) {
        if let Some(load) = lock(&self.active).as_mut() {
            load.created_by_run = true;
        }
    }

    pub(crate) fn set_interrupt(&self, handle: Option<InterruptHandle>) {
        if let Some(load) = lock(&self.active).as_mut() {
            load.interrupt = handle;
        }
    }

    pub(crate) fn complete(&self) -> bool {
        let mut active = lock(&self.active);
        match active.as_mut() {
            Some(load) if !load.cancel.load(Ordering::SeqCst) => {
                load.phase = LoadPhase::Ready;
                load.interrupt = None;
                true
            }
            _ => false,
        }
    }

    pub(crate) fn abandon(&self) {
        let mut active = lock(&self.active);
        if let Some(load) = active.take() {
            discard_created(&load);
        }
    }

    fn cancel_without_load(&self) -> CancelOutcome {
        if lock(&self.current).is_some() {
            CancelOutcome::AlreadyEntered
        } else {
            CancelOutcome::Cancelled
        }
    }
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    match mutex.lock() {
        Ok(guard) => guard,
        Err(poisoned) => poisoned.into_inner(),
    }
}

fn discard_created(load: &ActiveLoad) {
    if !load.created_by_run {
        return;
    }
    let folder = Path::new(&load.path);
    remove_quietly(&folder.join(WORKSPACE_DB_FILE));
    remove_quietly(&folder.join(format!("{WORKSPACE_DB_FILE}-journal")));
}

fn remove_quietly(path: &Path) {
    let _ = fs::remove_file(path);
}
