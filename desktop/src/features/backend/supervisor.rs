use crate::features::backend::monitor::BackendMonitor;
use crate::features::backend::monitor::MonitorState;
use crate::features::settings::backend::Device;
use crate::features::settings::repository::SettingsRepository;
use crate::infra::backend::BackendError;
use crate::infra::backend::BackendHost;
use crate::infra::backend::BackendReady;
use std::sync::Arc;
use std::sync::Mutex;
use std::sync::atomic::AtomicBool;
use std::sync::atomic::Ordering;

pub struct BackendSupervisor {
    inner: Arc<dyn BackendHost>,
    settings: SettingsRepository,
    monitor: BackendMonitor,
    restart_gate: Mutex<()>,
    restart_cancel: AtomicBool,
}

impl BackendSupervisor {
    pub fn new(inner: Arc<dyn BackendHost>, settings: SettingsRepository) -> Self {
        Self {
            inner,
            settings,
            monitor: BackendMonitor::new(),
            restart_gate: Mutex::new(()),
            restart_cancel: AtomicBool::new(false),
        }
    }

    pub fn monitor(&self) -> &BackendMonitor {
        &self.monitor
    }

    pub fn device(&self) -> Device {
        self.settings
            .load()
            .map(|settings| settings.backend.device())
            .unwrap_or_default()
    }

    pub fn restart(&self) -> Result<BackendReady, BackendError> {
        let _gate = self
            .restart_gate
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        self.monitor.set(MonitorState::Starting);
        self.restart_cancel.store(false, Ordering::SeqCst);
        self.inner.stop();
        self.start(&self.restart_cancel)
    }
}

impl BackendHost for BackendSupervisor {
    fn start(&self, cancel: &AtomicBool) -> Result<BackendReady, BackendError> {
        self.monitor.set(MonitorState::Starting);
        self.inner.set_device(self.device().as_str());
        let result = self.inner.start(cancel);
        self.monitor.set(state_after(&result));
        result
    }

    fn stop(&self) {
        self.restart_cancel.store(true, Ordering::SeqCst);
        self.inner.stop();
        self.monitor.set(MonitorState::Stopped);
    }

    fn set_device(&self, device: &str) {
        self.inner.set_device(device);
    }
}

pub fn state_after(result: &Result<BackendReady, BackendError>) -> MonitorState {
    match result {
        Ok(ready) => MonitorState::Running(ready.port),
        Err(BackendError::Cancelled) => MonitorState::Stopped,
        Err(error) => MonitorState::Error(error.to_string()),
    }
}

#[cfg(test)]
#[path = "../../../test/features/backend/supervisor.test.rs"]
mod tests;
