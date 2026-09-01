use crate::infra::backend::BackendError;
use crate::infra::backend::BackendHost;
use crate::infra::backend::BackendReady;
use std::sync::Mutex;
use std::sync::atomic::AtomicBool;
use std::sync::atomic::AtomicUsize;
use std::sync::atomic::Ordering;

pub struct StubBackend {
    failure: Mutex<Option<BackendError>>,
    devices: Mutex<Vec<String>>,
    port: u16,
    spawned: bool,
    started: AtomicUsize,
    stopped: AtomicUsize,
}

impl StubBackend {
    pub fn new() -> Self {
        Self {
            failure: Mutex::new(None),
            devices: Mutex::new(Vec::new()),
            port: 4321,
            spawned: true,
            started: AtomicUsize::new(0),
            stopped: AtomicUsize::new(0),
        }
    }

    pub fn reusing() -> Self {
        let mut stub = Self::new();
        stub.spawned = false;
        stub
    }

    pub fn failing(error: BackendError) -> Self {
        let stub = Self::new();
        stub.fail_with(Some(error));
        stub
    }

    pub fn on_port(port: u16) -> Self {
        let mut stub = Self::new();
        stub.port = port;
        stub
    }

    pub fn fail_with(&self, error: Option<BackendError>) {
        *self
            .failure
            .lock()
            .unwrap_or_else(|error| error.into_inner()) = error;
    }

    pub fn devices(&self) -> Vec<String> {
        self.devices
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .clone()
    }

    pub fn started(&self) -> usize {
        self.started.load(Ordering::SeqCst)
    }

    pub fn stopped(&self) -> usize {
        self.stopped.load(Ordering::SeqCst)
    }
}

impl BackendHost for StubBackend {
    fn start(&self, cancel: &AtomicBool) -> Result<BackendReady, BackendError> {
        if cancel.load(Ordering::SeqCst) {
            return Err(BackendError::Cancelled);
        }
        if let Some(error) = self
            .failure
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .clone()
        {
            return Err(error);
        }
        self.started.fetch_add(1, Ordering::SeqCst);
        Ok(BackendReady {
            port: self.port,
            spawned: self.spawned,
        })
    }

    fn stop(&self) {
        self.stopped.fetch_add(1, Ordering::SeqCst);
    }

    fn set_device(&self, device: &str) {
        self.devices
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .push(device.to_string());
    }
}
