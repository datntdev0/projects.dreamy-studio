use serde::Deserialize;
use serde::Serialize;
use serde_json::Map;
use serde_json::Value;

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackendSettings {
    #[serde(flatten)]
    pub other: Map<String, Value>,
}

impl BackendSettings {
    pub fn is_empty(&self) -> bool {
        *self == Self::default()
    }
}
