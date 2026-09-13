use crate::features::settings::models::AppSettings;
use crate::infra::secret_store::SecretRead;
use crate::infra::secret_store::SecretStore;
use serde::Deserialize;
use serde::Serialize;
use std::fmt;

pub const REMOTE_ACCOUNT: &str = "backend.remote";
const CLOUD_PREFIX: &str = "cloud.";
const KEY_HINT_MASK: &str = "••••";
const KEY_HINT_LENGTH: usize = 4;

#[derive(Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct ApiKey {
    #[serde(skip_serializing_if = "String::is_empty")]
    pub api_key: String,
    #[serde(skip_serializing_if = "String::is_empty")]
    pub key_hint: String,
    #[serde(skip_serializing_if = "is_false")]
    pub stored: bool,
}

impl ApiKey {
    pub fn new(secret: &str) -> Self {
        let secret = secret.trim();
        Self {
            api_key: secret.to_string(),
            key_hint: key_hint(secret),
            stored: false,
        }
    }

    pub fn secret(&self) -> Option<&str> {
        Some(self.api_key.as_str()).filter(|key| !key.is_empty())
    }

    pub fn is_set(&self) -> bool {
        !self.api_key.is_empty() || self.stored
    }

    pub fn hint(&self) -> String {
        if self.key_hint.is_empty() {
            return key_hint(&self.api_key);
        }
        self.key_hint.clone()
    }

    fn seal(&mut self, store: &SecretStore, account: &str) -> bool {
        if self.api_key.is_empty() || self.stored {
            return false;
        }
        self.key_hint = key_hint(&self.api_key);
        self.stored = store.set(account, &self.api_key);
        self.stored
    }

    fn unseal(&mut self, store: &SecretStore, account: &str) {
        if !self.stored || !self.api_key.is_empty() {
            return;
        }
        if let SecretRead::Found(secret) = store.get(account) {
            self.api_key = secret;
        }
    }

    fn redact(&mut self) {
        if self.stored {
            self.api_key.clear();
        }
    }
}

impl fmt::Debug for ApiKey {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("ApiKey")
            .field("key_hint", &self.hint())
            .field("stored", &self.stored)
            .finish()
    }
}

pub fn cloud_account(id: &str) -> String {
    format!("{CLOUD_PREFIX}{id}")
}

pub fn seal(settings: &mut AppSettings, store: &SecretStore) -> bool {
    let mut sealed = false;
    for (account, key) in keys(settings) {
        sealed |= key.seal(store, &account);
    }
    sealed
}

pub fn unseal(settings: &mut AppSettings, store: &SecretStore) {
    for (account, key) in keys(settings) {
        key.unseal(store, &account);
    }
}

pub fn redact(settings: &mut AppSettings) {
    for (_, key) in keys(settings) {
        key.redact();
    }
}

pub fn key_hint(api_key: &str) -> String {
    if api_key.is_empty() {
        return String::new();
    }
    let tail: String = api_key
        .chars()
        .rev()
        .take(KEY_HINT_LENGTH)
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect();
    format!("{KEY_HINT_MASK}{tail}")
}

fn keys(settings: &mut AppSettings) -> Vec<(String, &mut ApiKey)> {
    let cloud = settings
        .cloud
        .accounts
        .iter_mut()
        .map(|(id, account)| (cloud_account(id), &mut account.key));
    let remote = settings
        .backend
        .remote
        .iter_mut()
        .map(|remote| (REMOTE_ACCOUNT.to_string(), &mut remote.key));
    cloud.chain(remote).collect()
}

fn is_false(value: &bool) -> bool {
    !*value
}
