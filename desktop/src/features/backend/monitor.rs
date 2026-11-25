use std::sync::Arc;
use std::sync::Mutex;
use std::sync::MutexGuard;

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub enum MonitorState {
    Starting,
    Running(u16),
    #[default]
    Stopped,
    Error(String),
}

#[derive(Debug, Clone, Default)]
pub struct BackendMonitor {
    state: Arc<Mutex<MonitorState>>,
}

impl BackendMonitor {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn state(&self) -> MonitorState {
        self.lock().clone()
    }

    pub fn set(&self, state: MonitorState) {
        *self.lock() = state;
    }

    pub fn port(&self) -> Option<u16> {
        match *self.lock() {
            MonitorState::Running(port) => Some(port),
            _ => None,
        }
    }

    pub fn lose(&self, port: u16, message: String) {
        let mut state = self.lock();
        if *state == MonitorState::Running(port) {
            *state = MonitorState::Error(message);
        }
    }

    fn lock(&self) -> MutexGuard<'_, MonitorState> {
        self.state
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }
}
