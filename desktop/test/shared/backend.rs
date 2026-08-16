use crate::infra::backend::BackendError;
use crate::infra::backend::BackendHost;
use crate::infra::backend::BackendReady;
use std::sync::Mutex;
use std::sync::atomic::AtomicBool;
use std::sync::atomic::AtomicUsize;
use std::sync::atomic::Ordering;

pub struct StubBackend {
    failure: Mutex<Option<BackendError>>,
    spawned: bool,
    started: AtomicUsize,
    stopped: AtomicUsize,
}

impl StubBackend {
    pub fn new() -> Self {
        Self {
            failure: Mutex::new(None),
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
        *stub
            .failure
            .lock()
            .unwrap_or_else(|error| error.into_inner()) = Some(error);
        stub
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
            port: 4321,
            spawned: self.spawned,
        })
    }

    fn stop(&self) {
        self.stopped.fetch_add(1, Ordering::SeqCst);
    }
}
