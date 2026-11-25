use crate::features::settings::models::lenient;
use serde::Deserialize;
use serde::Serialize;
use serde_json::Map;
use serde_json::Value;

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Device {
    #[default]
    Cpu,
    Cuda,
}

impl Device {
    pub fn parse(text: &str) -> Result<Self, String> {
        match text {
            "cpu" => Ok(Device::Cpu),
            "cuda" => Ok(Device::Cuda),
            other => Err(format!("Unknown backend device: {other}")),
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Device::Cpu => "cpu",
            Device::Cuda => "cuda",
        }
    }
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackendSettings {
    #[serde(
        default,
        deserialize_with = "lenient",
        skip_serializing_if = "Option::is_none"
    )]
    pub device: Option<Device>,
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
    pub api_key: String,
    pub active: bool,
}

impl BackendSettings {
    pub fn device(&self) -> Device {
        self.device.unwrap_or_default()
    }

    pub fn is_empty(&self) -> bool {
        *self == Self::default()
    }
}

#[cfg(test)]
#[path = "../../../test/features/settings/backend.test.rs"]
mod tests;
