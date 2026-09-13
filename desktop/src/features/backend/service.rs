use crate::features::backend::api;
use crate::features::backend::cloud;
use crate::features::backend::cloud::CloudAccountService;
use crate::features::backend::models::BackendView;
use crate::features::backend::models::ServerView;
use crate::features::backend::models::SynthesisRequest;
use crate::features::backend::models::SynthesizedAudio;
use crate::features::backend::models::SystemView;
use crate::features::backend::models::TtsModel;
use crate::features::backend::monitor::MonitorState;
use crate::features::backend::remote::RemoteBackendService;
use crate::features::backend::supervisor::BackendSupervisor;
use crate::infra::backend_client::BackendClient;
use crate::infra::backend_client::ClientError;
use crate::infra::backend_client::Method;
use chrono::SecondsFormat;
use chrono::Utc;
use std::fs;
use std::path::Path;
use std::path::PathBuf;
use std::sync::Arc;
use std::thread;
use std::time::Duration;
use std::time::Instant;

pub const MODELS_DIR: &str = "models";
const STATUS_TIMEOUT: Duration = Duration::from_secs(3);
const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);
const SYNTHESIS_TIMEOUT: Duration = Duration::from_secs(1_200);
const NOT_RUNNING: &str = "The local backend is not running.";

pub trait Synthesizer: Send + Sync {
    fn synthesize(&self, request: &SynthesisRequest) -> Result<SynthesizedAudio, ClientError>;
}

pub struct BackendService {
    supervisor: Arc<BackendSupervisor>,
    remote: Arc<RemoteBackendService>,
    cloud: Arc<CloudAccountService>,
    logs_dir: PathBuf,
    models_dir: PathBuf,
}

impl BackendService {
    pub fn new(
        supervisor: Arc<BackendSupervisor>,
        remote: Arc<RemoteBackendService>,
        cloud: Arc<CloudAccountService>,
        data_dir: PathBuf,
        logs_dir: PathBuf,
    ) -> Self {
        Self {
            supervisor,
            remote,
            cloud,
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
            device: system.device,
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

    pub fn models(&self) -> Result<Vec<TtsModel>, String> {
        let Some(client) = self.client() else {
            return Ok(Vec::new());
        };
        api::list_models(&client).map_err(|error| error.to_string())
    }

    pub fn download_model(&self, id: &str) -> Result<(), String> {
        self.proxy(Method::Post, &format!("{}/download", api::model_path(id)?))
    }

    pub fn cancel_model(&self, id: &str) -> Result<(), String> {
        self.proxy(Method::Post, &format!("{}/cancel", api::model_path(id)?))
    }

    pub fn remove_model(&self, id: &str) -> Result<(), String> {
        self.proxy(Method::Delete, &api::model_path(id)?)
    }

    pub fn logs_dir(&self) -> Result<PathBuf, String> {
        ensure_dir(&self.logs_dir)
    }

    pub fn models_dir(&self) -> Result<PathBuf, String> {
        ensure_dir(&self.models_dir)
    }

    fn proxy(&self, method: Method, path: &str) -> Result<(), String> {
        let client = self.client().ok_or_else(|| NOT_RUNNING.to_string())?;
        api::proxy(&client, method, path).map_err(|error| error.to_string())
    }

    fn synthesize_locally(
        &self,
        request: &SynthesisRequest,
    ) -> Result<SynthesizedAudio, ClientError> {
        let port = self
            .supervisor
            .monitor()
            .port()
            .ok_or_else(|| ClientError::Unreachable(NOT_RUNNING.to_string()))?;
        api::synthesize(&BackendClient::new(port, SYNTHESIS_TIMEOUT), request)
    }

    fn client(&self) -> Option<BackendClient> {
        let port = self.supervisor.monitor().port()?;
        Some(BackendClient::new(port, REQUEST_TIMEOUT))
    }
}

fn restart_quietly(supervisor: &BackendSupervisor) {
    let _ = supervisor.restart();
}

fn ensure_dir(path: &Path) -> Result<PathBuf, String> {
    fs::create_dir_all(path).map_err(|error| error.to_string())?;
    Ok(path.to_path_buf())
}

fn now() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)
}

impl Synthesizer for BackendService {
    fn synthesize(&self, request: &SynthesisRequest) -> Result<SynthesizedAudio, ClientError> {
        if cloud::supports(&request.model) {
            return self.cloud.synthesize(request);
        }
        if self.remote.active() {
            return self.remote.synthesize(request);
        }
        self.synthesize_locally(request)
    }
}
