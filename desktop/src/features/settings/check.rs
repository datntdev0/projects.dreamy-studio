use crate::features::settings::llm::CLI_SPECS;
use crate::features::settings::llm::spec;
use crate::features::settings::probe::CliProbe;
use crate::features::settings::probe::probe;
use std::collections::BTreeMap;
use std::path::PathBuf;
use std::sync::Arc;
use std::sync::Mutex;
use std::sync::atomic::AtomicBool;
use std::sync::atomic::Ordering;
use std::sync::mpsc;
use std::time::Duration;

const POLL_INTERVAL: Duration = Duration::from_millis(50);

pub trait LlmChecker: Send + Sync {
    fn check(&self, cancel: &AtomicBool) -> bool;
}

#[derive(Debug, Clone, Default)]
pub struct LlmStatus {
    probes: Arc<Mutex<BTreeMap<String, CliProbe>>>,
}

impl LlmStatus {
    pub fn snapshot(&self) -> BTreeMap<String, CliProbe> {
        match self.probes.lock() {
            Ok(probes) => probes.clone(),
            Err(poisoned) => poisoned.into_inner().clone(),
        }
    }

    pub fn store(&self, probe: CliProbe) {
        let mut probes = match self.probes.lock() {
            Ok(probes) => probes,
            Err(poisoned) => poisoned.into_inner(),
        };
        probes.insert(probe.id.clone(), probe);
    }
}

pub struct LlmCheck {
    data_dir: PathBuf,
    status: LlmStatus,
}

impl LlmCheck {
    pub fn new(data_dir: PathBuf, status: LlmStatus) -> Self {
        Self { data_dir, status }
    }
}

impl LlmChecker for LlmCheck {
    fn check(&self, cancel: &AtomicBool) -> bool {
        let (sender, receiver) = mpsc::channel();
        let mut pending = 0;
        for id in CLI_SPECS.iter().map(|cli| cli.id) {
            let Some(cli) = spec(id) else {
                continue;
            };
            let sender = sender.clone();
            let data_dir = self.data_dir.clone();
            pending += 1;
            std::thread::spawn(move || {
                let _ = sender.send(probe(cli, &data_dir));
            });
        }
        drop(sender);
        while pending > 0 {
            if cancel.load(Ordering::SeqCst) {
                return false;
            }
            match receiver.recv_timeout(POLL_INTERVAL) {
                Ok(result) => {
                    self.status.store(result);
                    pending -= 1;
                }
                Err(mpsc::RecvTimeoutError::Timeout) => {}
                Err(mpsc::RecvTimeoutError::Disconnected) => break,
            }
        }
        !cancel.load(Ordering::SeqCst)
    }
}

pub struct NoLlmCheck;

impl LlmChecker for NoLlmCheck {
    fn check(&self, cancel: &AtomicBool) -> bool {
        !cancel.load(Ordering::SeqCst)
    }
}

#[cfg(test)]
#[path = "../../../test/features/settings/check.test.rs"]
mod tests;
