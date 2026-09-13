use crate::features::settings::secrets::ApiKey;
use serde::Deserialize;
use serde::Serialize;
use std::collections::BTreeMap;

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct CloudSettings {
    pub accounts: BTreeMap<String, CloudAccountSettings>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct CloudAccountSettings {
    #[serde(flatten)]
    pub key: ApiKey,
}

impl CloudSettings {
    pub fn is_empty(&self) -> bool {
        self.accounts.is_empty()
    }

    pub fn api_key(&self, id: &str) -> Option<&str> {
        self.accounts
            .get(id)
            .and_then(|account| account.key.secret())
    }
}
