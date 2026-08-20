use crate::features::settings::llm::LlmSettings;
use crate::features::settings::window::WindowSettings;
use serde::Deserialize;
use serde::Deserializer;
use serde::Serialize;
use serde::de::DeserializeOwned;
use serde_json::Map;
use serde_json::Value;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Language {
    Vi,
    En,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Theme {
    Dark,
    Light,
}

impl Theme {
    pub fn background(self) -> (u8, u8, u8) {
        match self {
            Theme::Dark => (10, 10, 10),
            Theme::Light => (250, 250, 247),
        }
    }
}

pub const MAX_PIPELINES_LIMIT: u8 = 5;
pub const MAX_TASKS_LIMIT: u8 = 10;

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PipelineSettings {
    #[serde(
        default,
        deserialize_with = "lenient",
        skip_serializing_if = "Option::is_none"
    )]
    pub max_pipelines: Option<u8>,
    #[serde(
        default,
        deserialize_with = "lenient",
        skip_serializing_if = "Option::is_none"
    )]
    pub max_tasks: Option<u8>,
}

impl PipelineSettings {
    pub fn normalized(self) -> Self {
        Self {
            max_pipelines: self
                .max_pipelines
                .map(|value| value.clamp(1, MAX_PIPELINES_LIMIT)),
            max_tasks: self.max_tasks.map(|value| value.clamp(1, MAX_TASKS_LIMIT)),
        }
    }

    pub fn is_empty(&self) -> bool {
        *self == Self::default()
    }
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeneralSettings {
    #[serde(
        default,
        deserialize_with = "lenient",
        skip_serializing_if = "Option::is_none"
    )]
    pub language: Option<Language>,
    #[serde(
        default,
        deserialize_with = "lenient",
        skip_serializing_if = "Option::is_none"
    )]
    pub theme: Option<Theme>,
    #[serde(
        default,
        deserialize_with = "lenient",
        skip_serializing_if = "PipelineSettings::is_empty"
    )]
    pub pipelines: PipelineSettings,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RightTab {
    Inspector,
    Assistant,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LayoutSettings {
    #[serde(
        default,
        deserialize_with = "lenient",
        skip_serializing_if = "Option::is_none"
    )]
    pub explorer_open: Option<bool>,
    #[serde(
        default,
        deserialize_with = "lenient",
        skip_serializing_if = "Option::is_none"
    )]
    pub inspector_open: Option<bool>,
    #[serde(
        default,
        deserialize_with = "lenient",
        skip_serializing_if = "Option::is_none"
    )]
    pub bottom_open: Option<bool>,
    #[serde(
        default,
        deserialize_with = "lenient",
        skip_serializing_if = "Option::is_none"
    )]
    pub right_tab: Option<RightTab>,
    #[serde(
        default,
        deserialize_with = "lenient",
        skip_serializing_if = "Option::is_none"
    )]
    pub explorer_size: Option<u32>,
    #[serde(
        default,
        deserialize_with = "lenient",
        skip_serializing_if = "Option::is_none"
    )]
    pub inspector_size: Option<u32>,
    #[serde(
        default,
        deserialize_with = "lenient",
        skip_serializing_if = "Option::is_none"
    )]
    pub bottom_size: Option<u32>,
}

impl LayoutSettings {
    pub fn is_empty(&self) -> bool {
        *self == Self::default()
    }
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct AppSettings {
    #[serde(default, deserialize_with = "lenient")]
    pub general: GeneralSettings,
    #[serde(
        default,
        deserialize_with = "lenient",
        skip_serializing_if = "LayoutSettings::is_empty"
    )]
    pub layout: LayoutSettings,
    #[serde(
        default,
        deserialize_with = "lenient",
        skip_serializing_if = "LlmSettings::is_empty"
    )]
    pub llm: LlmSettings,
    #[serde(
        default,
        deserialize_with = "lenient",
        skip_serializing_if = "Option::is_none"
    )]
    pub window: Option<WindowSettings>,
    #[serde(flatten)]
    pub other: Map<String, Value>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsView {
    pub general: GeneralSettings,
    pub layout: LayoutSettings,
    pub data_dir: String,
    pub file: String,
}

pub fn lenient<'de, D, T>(deserializer: D) -> Result<T, D::Error>
where
    D: Deserializer<'de>,
    T: DeserializeOwned + Default,
{
    let value = Value::deserialize(deserializer)?;
    Ok(serde_json::from_value(value).unwrap_or_default())
}
