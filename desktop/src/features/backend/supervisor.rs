use crate::features::backend::monitor::BackendMonitor;
use crate::features::backend::monitor::MonitorState;
use crate::infra::backend::BackendError;
use crate::infra::backend::BackendHost;
use crate::infra::backend::BackendReady;
use std::sync::Arc;
use std::sync::Mutex;
use std::sync::atomic::AtomicBool;
use std::sync::atomic::Ordering;

pub struct BackendSupervisor {
    inner: Arc<dyn BackendHost>,
    monitor: BackendMonitor,
    restart_gate: Mutex<()>,
    restart_cancel: AtomicBool,
}

impl BackendSupervisor {
    pub fn new(inner: Arc<dyn BackendHost>) -> Self {
        Self {
            inner,
            monitor: BackendMonitor::new(),
            restart_gate: Mutex::new(()),
            restart_cancel: AtomicBool::new(false),
        }
    }

    pub fn monitor(&self) -> &BackendMonitor {
        &self.monitor
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
        let result = self.inner.start(cancel);
        self.monitor.set(state_after(&result));
        result
    }

    fn stop(&self) {
        self.restart_cancel.store(true, Ordering::SeqCst);
        self.inner.stop();
        self.monitor.set(MonitorState::Stopped);
    }
}

pub fn state_after(result: &Result<BackendReady, BackendError>) -> MonitorState {
    match result {
        Ok(ready) => MonitorState::Running(ready.port),
        Err(BackendError::Cancelled) => MonitorState::Stopped,
        Err(error) => MonitorState::Error(error.to_string()),
    }
}
