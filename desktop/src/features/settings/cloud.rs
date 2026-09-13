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
    pub api_key: String,
}

impl CloudSettings {
    pub fn is_empty(&self) -> bool {
        self.accounts.is_empty()
    }

    pub fn api_key(&self, id: &str) -> Option<&str> {
        self.accounts
            .get(id)
            .map(|account| account.api_key.as_str())
            .filter(|key| !key.is_empty())
    }
}
