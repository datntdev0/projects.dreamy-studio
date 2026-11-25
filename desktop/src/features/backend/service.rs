use crate::features::backend::models::BackendView;
use crate::features::backend::models::ServerView;
use crate::features::backend::models::SynthesisRequest;
use crate::features::backend::models::SynthesizedAudio;
use crate::features::backend::models::SystemView;
use crate::features::backend::models::TtsModel;
use crate::features::backend::monitor::MonitorState;
use crate::features::backend::supervisor::BackendSupervisor;
use crate::features::settings::backend::Device;
use crate::features::settings::repository::SettingsRepository;
use crate::infra::backend_client::BackendClient;
use crate::infra::backend_client::ClientError;
use crate::infra::backend_client::Method;
use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use chrono::SecondsFormat;
use chrono::Utc;
use serde::de::DeserializeOwned;
use std::fs;
use std::path::Path;
use std::path::PathBuf;
use std::sync::Arc;
use std::sync::Mutex;
use std::thread;
use std::time::Duration;
use std::time::Instant;

pub const MODELS_DIR: &str = "models";
const STATUS_TIMEOUT: Duration = Duration::from_secs(3);
const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);
const SYNTHESIS_TIMEOUT: Duration = Duration::from_secs(1_200);
const SYNTHESIS_PATH: &str = "/tts/synthesize";
const NOT_RUNNING: &str = "The local backend is not running.";
const CUDA_NOT_READY: &str =
    "CUDA needs an NVIDIA GPU and an installed CUDA runtime before it can be selected.";

pub trait Synthesizer: Send + Sync {
    fn synthesize(&self, request: &SynthesisRequest) -> Result<SynthesizedAudio, ClientError>;
}

pub struct BackendService {
    supervisor: Arc<BackendSupervisor>,
    settings: SettingsRepository,
    gate: Mutex<()>,
    logs_dir: PathBuf,
    models_dir: PathBuf,
}

impl BackendService {
    pub fn new(
        supervisor: Arc<BackendSupervisor>,
        settings: SettingsRepository,
        data_dir: PathBuf,
        logs_dir: PathBuf,
    ) -> Self {
        Self {
            supervisor,
            settings,
            gate: Mutex::new(()),
            logs_dir,
            models_dir: data_dir.join(MODELS_DIR),
        }
    }

    pub fn view(&self) -> BackendView {
        let state = self.supervisor.monitor().state();
        let (server, system) = match state {
            MonitorState::Running(port) => self.inspect(port),
            other => (ServerView::from_state(&other, now()), SystemView::default()),
        };
        BackendView {
            server,
            gpu: system.gpu,
            cuda: system.cuda,
            device: self.supervisor.device(),
            models_dir: self.models_dir.to_string_lossy().into_owned(),
        }
    }

    fn inspect(&self, port: u16) -> (ServerView, SystemView) {
        let client = BackendClient::new(port, STATUS_TIMEOUT);
        let started = Instant::now();
        match client.health() {
            Ok(health) => {
                let latency = u64::try_from(started.elapsed().as_millis()).unwrap_or(u64::MAX);
                let system = client.send(Method::Get, "/system").unwrap_or_default();
                let server = ServerView::from_state(&MonitorState::Running(port), now())
                    .with_health(health, latency);
                (server, system)
            }
            Err(error) => {
                let message = format!("The local backend stopped responding: {error}");
                self.supervisor.monitor().lose(port, message.clone());
                let server = ServerView::from_state(&MonitorState::Error(message), now());
                (server, SystemView::default())
            }
        }
    }

    pub fn restart(&self) {
        self.supervisor.monitor().set(MonitorState::Starting);
        let supervisor = self.supervisor.clone();
        thread::spawn(move || restart_quietly(&supervisor));
    }

    pub fn scan_gpu(&self) -> Result<(), String> {
        self.call::<SystemView>(Method::Post, "/system/gpu/scan")
            .map(drop)
    }

    pub fn set_device(&self, device: &str) -> Result<(), String> {
        let device = Device::parse(device)?;
        if device == Device::Cuda {
            let system: SystemView = self.call(Method::Get, "/system")?;
            if !system.cuda_ready() {
                return Err(CUDA_NOT_READY.to_string());
            }
        }
        self.save_device(device)?;
        self.apply_device()
    }

    pub fn download_cuda(&self) -> Result<(), String> {
        self.proxy(Method::Post, "/cuda/download")
    }

    pub fn cancel_cuda(&self) -> Result<(), String> {
        self.proxy(Method::Post, "/cuda/cancel")
    }

    pub fn remove_cuda(&self) -> Result<(), String> {
        self.proxy(Method::Delete, "/cuda")?;
        if self.supervisor.device() != Device::Cuda {
            return Ok(());
        }
        self.save_device(Device::Cpu)?;
        self.apply_device()
    }

    pub fn models(&self) -> Result<Vec<TtsModel>, String> {
        let Some(client) = self.client() else {
            return Ok(Vec::new());
        };
        match client.send(Method::Get, "/models") {
            Ok(models) => Ok(models),
            Err(ClientError::Unreachable(_)) => Ok(Vec::new()),
            Err(error) => Err(error.to_string()),
        }
    }

    pub fn download_model(&self, id: &str) -> Result<(), String> {
        self.proxy(Method::Post, &format!("{}/download", model_path(id)?))
    }

    pub fn cancel_model(&self, id: &str) -> Result<(), String> {
        self.proxy(Method::Post, &format!("{}/cancel", model_path(id)?))
    }

    pub fn remove_model(&self, id: &str) -> Result<(), String> {
        self.proxy(Method::Delete, &model_path(id)?)
    }

    pub fn logs_dir(&self) -> Result<PathBuf, String> {
        ensure_dir(&self.logs_dir)
    }

    pub fn models_dir(&self) -> Result<PathBuf, String> {
        ensure_dir(&self.models_dir)
    }

    fn save_device(&self, device: Device) -> Result<(), String> {
        let _guard = self
            .gate
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let mut settings = self.settings.load().map_err(|error| error.to_string())?;
        settings.backend.device = Some(device);
        self.settings
            .save(&settings)
            .map_err(|error| error.to_string())
    }

    fn apply_device(&self) -> Result<(), String> {
        if self.supervisor.monitor().state() == MonitorState::Stopped {
            return Ok(());
        }
        self.supervisor
            .restart()
            .map(drop)
            .map_err(|error| error.to_string())
    }

    fn proxy(&self, method: Method, path: &str) -> Result<(), String> {
        self.call::<serde_json::Value>(method, path).map(drop)
    }

    fn call<T: DeserializeOwned>(&self, method: Method, path: &str) -> Result<T, String> {
        let client = self.client().ok_or_else(|| NOT_RUNNING.to_string())?;
        client.send(method, path).map_err(|error| error.to_string())
    }

    fn client(&self) -> Option<BackendClient> {
        let port = self.supervisor.monitor().port()?;
        Some(BackendClient::new(port, REQUEST_TIMEOUT))
    }
}

fn restart_quietly(supervisor: &BackendSupervisor) {
    let _ = supervisor.restart();
}

fn model_path(id: &str) -> Result<String, String> {
    let valid = !id.is_empty()
        && id
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_'));
    if valid {
        Ok(format!("/models/{id}"))
    } else {
        Err(format!("Unknown TTS model: {id}"))
    }
}

fn ensure_dir(path: &Path) -> Result<PathBuf, String> {
    fs::create_dir_all(path).map_err(|error| error.to_string())?;
    Ok(path.to_path_buf())
}

pub fn decode_subtitles(value: &str) -> Option<String> {
    let bytes = STANDARD.decode(value.trim()).ok()?;
    String::from_utf8(bytes).ok()
}

fn now() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)
}

impl Synthesizer for BackendService {
    fn synthesize(&self, request: &SynthesisRequest) -> Result<SynthesizedAudio, ClientError> {
        let port = self
            .supervisor
            .monitor()
            .port()
            .ok_or_else(|| ClientError::Unreachable(NOT_RUNNING.to_string()))?;
        let response =
            BackendClient::new(port, SYNTHESIS_TIMEOUT).post_for_bytes(SYNTHESIS_PATH, request)?;
        Ok(SynthesizedAudio {
            duration_ms: response
                .header("x-duration-ms")
                .and_then(|value| value.parse().ok()),
            cached: response.header("x-cache") == Some("hit"),
            subtitles: response.header("x-subtitles").and_then(decode_subtitles),
            bytes: response.bytes,
        })
    }
}
