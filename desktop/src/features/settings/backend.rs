use crate::features::settings::models::lenient;
use crate::features::settings::secrets::ApiKey;
use serde::Deserialize;
use serde::Serialize;
use serde_json::Map;
use serde_json::Value;

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackendSettings {
    #[serde(
        default,
        deserialize_with = "lenient",
        skip_serializing_if = "Option::is_none"
    )]
    pub remote: Option<RemoteSettings>,
    #[serde(flatten)]
    pub other: Map<String, Value>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct RemoteSettings {
    pub url: String,
    #[serde(flatten)]
    pub key: ApiKey,
    pub active: bool,
}

impl BackendSettings {
    pub fn is_empty(&self) -> bool {
        *self == Self::default()
    }
}
