use crate::features::backend::monitor::MonitorState;
use crate::features::settings::backend::Device;
use crate::infra::backend_client::Health;
use serde::Deserialize;
use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ServerStatus {
    Starting,
    Running,
    Stopped,
    Error,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerView {
    pub status: ServerStatus,
    pub port: Option<u16>,
    pub version: String,
    pub python_version: String,
    pub started_at: Option<String>,
    pub latency_ms: Option<u64>,
    pub checked_at: String,
    pub error: String,
}

impl ServerView {
    pub fn from_state(state: &MonitorState, checked_at: String) -> Self {
        let (status, port, error) = match state {
            MonitorState::Starting => (ServerStatus::Starting, None, String::new()),
            MonitorState::Running(port) => (ServerStatus::Running, Some(*port), String::new()),
            MonitorState::Stopped => (ServerStatus::Stopped, None, String::new()),
            MonitorState::Error(message) => (ServerStatus::Error, None, message.clone()),
        };
        Self {
            status,
            port,
            version: String::new(),
            python_version: String::new(),
            started_at: None,
            latency_ms: None,
            checked_at,
            error,
        }
    }

    pub fn with_health(self, health: Health, latency_ms: u64) -> Self {
        Self {
            version: health.version,
            python_version: health.python_version,
            started_at: health.started_at,
            latency_ms: Some(latency_ms),
            ..self
        }
    }
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DownloadState {
    #[default]
    None,
    Downloading,
    Installed,
    Error,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Download {
    pub state: DownloadState,
    pub received_bytes: u64,
    pub total_bytes: u64,
    pub error: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct GpuView {
    pub found: bool,
    pub name: String,
    pub vram_mb: u64,
    pub driver: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct CudaView {
    #[serde(flatten)]
    pub download: Download,
    pub version: String,
}

impl CudaView {
    pub fn installed(&self) -> bool {
        self.download.state == DownloadState::Installed
    }
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct SystemView {
    pub gpu: GpuView,
    pub cuda: CudaView,
}

impl SystemView {
    pub fn cuda_ready(&self) -> bool {
        self.gpu.found && self.cuda.installed()
    }
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct TtsModel {
    #[serde(flatten)]
    pub download: Download,
    pub id: String,
    pub name: String,
    pub source: String,
    pub languages: Vec<String>,
    pub cloning: bool,
    pub gpu_recommended: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackendView {
    pub server: ServerView,
    pub gpu: GpuView,
    pub cuda: CudaView,
    pub device: Device,
    pub models_dir: String,
}
