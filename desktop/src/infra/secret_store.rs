use crate::infra::logging::Logger;
use std::fmt;
use std::sync::Arc;
use std::sync::atomic::AtomicBool;
use std::sync::atomic::Ordering;

pub const SECRET_SERVICE: &str = "DreamyStudio";
const LOG_TARGET: &str = "secrets";

#[derive(Clone, PartialEq, Eq)]
pub enum SecretRead {
    Found(String),
    Missing,
    Unavailable,
}

#[derive(Clone, Default)]
pub struct SecretStore {
    logger: Option<Logger>,
    failed: Arc<AtomicBool>,
}

impl SecretStore {
    pub fn new(logger: Logger) -> Self {
        Self {
            logger: Some(logger),
            failed: Arc::new(AtomicBool::new(false)),
        }
    }

    pub fn available(&self) -> bool {
        native::SUPPORTED && !self.failed.load(Ordering::Relaxed)
    }

    pub fn get(&self, account: &str) -> SecretRead {
        match native::get(account) {
            Ok(Some(secret)) => SecretRead::Found(secret),
            Ok(None) => SecretRead::Missing,
            Err(detail) => {
                self.report("read", account, &detail);
                SecretRead::Unavailable
            }
        }
    }

    pub fn set(&self, account: &str, secret: &str) -> bool {
        match native::set(account, secret) {
            Ok(()) => true,
            Err(detail) => {
                self.report("write", account, &detail);
                false
            }
        }
    }

    pub fn delete(&self, account: &str) -> bool {
        match native::delete(account) {
            Ok(()) => true,
            Err(detail) => {
                self.report("delete", account, &detail);
                false
            }
        }
    }

    fn report(&self, action: &str, account: &str, detail: &str) {
        if self.failed.swap(true, Ordering::Relaxed) {
            return;
        }
        let message = format!(
            "credential store could not {action} {account}, API keys stay in the settings file: {detail}"
        );
        match &self.logger {
            Some(logger) => logger.log("WARN", LOG_TARGET, &message),
            None => eprintln!("{message}"),
        }
    }
}

impl fmt::Debug for SecretStore {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("SecretStore")
            .field("available", &self.available())
            .finish()
    }
}

#[cfg(any(windows, target_os = "macos"))]
mod native {
    use super::SECRET_SERVICE;
    use keyring::Entry;
    use keyring::Error;

    pub const SUPPORTED: bool = true;

    pub fn get(account: &str) -> Result<Option<String>, String> {
        match entry(account)?.get_password() {
            Ok(secret) => Ok(Some(secret)),
            Err(Error::NoEntry) => Ok(None),
            Err(error) => Err(error.to_string()),
        }
    }

    pub fn set(account: &str, secret: &str) -> Result<(), String> {
        entry(account)?
            .set_password(secret)
            .map_err(|error| error.to_string())
    }

    pub fn delete(account: &str) -> Result<(), String> {
        match entry(account)?.delete_credential() {
            Ok(()) | Err(Error::NoEntry) => Ok(()),
            Err(error) => Err(error.to_string()),
        }
    }

    fn entry(account: &str) -> Result<Entry, String> {
        Entry::new(SECRET_SERVICE, account).map_err(|error| error.to_string())
    }
}

#[cfg(not(any(windows, target_os = "macos")))]
mod native {
    const UNSUPPORTED: &str = "no system credential store is supported on this platform";

    pub const SUPPORTED: bool = false;

    pub fn get(_account: &str) -> Result<Option<String>, String> {
        Err(UNSUPPORTED.to_string())
    }

    pub fn set(_account: &str, _secret: &str) -> Result<(), String> {
        Err(UNSUPPORTED.to_string())
    }

    pub fn delete(_account: &str) -> Result<(), String> {
        Err(UNSUPPORTED.to_string())
    }
}
