use crate::features::backend::api;
use crate::features::backend::models::BackendView;
use crate::features::backend::models::RemoteView;
use crate::features::backend::models::ServerStatus;
use crate::features::backend::models::ServerView;
use crate::features::backend::models::SynthesisRequest;
use crate::features::backend::models::SynthesizedAudio;
use crate::features::backend::models::SystemView;
use crate::features::backend::models::TtsModel;
use crate::features::backend::monitor::MonitorState;
use crate::features::settings::backend::RemoteSettings;
use crate::features::settings::repository::SettingsRepository;
use crate::infra::backend_client::BackendClient;
use crate::infra::backend_client::ClientError;
use crate::infra::backend_client::Health;
use crate::infra::backend_client::Method;
use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use chrono::SecondsFormat;
use chrono::Utc;
use serde::de::DeserializeOwned;
use std::fs;
use std::path::Path;
use std::sync::Mutex;
use std::time::Duration;
use std::time::Instant;

const STATUS_TIMEOUT: Duration = Duration::from_secs(10);
const REQUEST_TIMEOUT: Duration = Duration::from_secs(60);
const SYNTHESIS_TIMEOUT: Duration = Duration::from_secs(1_200);
const SYNTHESIS_ATTEMPTS: usize = 6;
const GATEWAY_TIMEOUT: u16 = 524;
const KEY_HINT_MASK: &str = "••••";
const KEY_HINT_LENGTH: usize = 4;
const NOT_CONNECTED: &str = "No remote backend is connected.";
const INVALID_URL: &str = "Enter an address that starts with http:// or https://.";

pub struct RemoteBackendService {
    settings: SettingsRepository,
    gate: Mutex<()>,
}

impl RemoteBackendService {
    pub fn new(settings: SettingsRepository) -> Self {
        Self {
            settings,
            gate: Mutex::new(()),
        }
    }

    pub fn config(&self) -> Option<RemoteSettings> {
        let settings = self.settings.load().ok()?;
        settings
            .backend
            .remote
            .filter(|remote| !remote.url.is_empty())
    }

    pub fn active(&self) -> bool {
        self.config().is_some_and(|remote| remote.active)
    }

    pub fn view(&self) -> RemoteView {
        match self.config() {
            Some(remote) => inspect(&remote),
            None => RemoteView::disconnected(now()),
        }
    }

    pub fn connect(&self, url: &str, api_key: &str) -> Result<RemoteView, String> {
        let url = valid_url(url)?;
        let client = BackendClient::remote(&url, api_key, STATUS_TIMEOUT);
        client.health().map_err(remote_error)?;
        let active = self.active();
        self.save(Some(RemoteSettings {
            url,
            api_key: api_key.trim().to_string(),
            active,
        }))?;
        Ok(self.view())
    }

    pub fn disconnect(&self) -> Result<(), String> {
        self.save(None)
    }

    pub fn set_active(&self, active: bool) -> Result<(), String> {
        let remote = self.config().ok_or_else(|| NOT_CONNECTED.to_string())?;
        self.save(Some(RemoteSettings { active, ..remote }))
    }

    pub fn models(&self) -> Result<Vec<TtsModel>, String> {
        let Some(remote) = self.config() else {
            return Ok(Vec::new());
        };
        api::list_models(&client_for(&remote, REQUEST_TIMEOUT)).map_err(remote_error)
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

    pub fn synthesize(&self, request: &SynthesisRequest) -> Result<SynthesizedAudio, ClientError> {
        let remote = self
            .config()
            .ok_or_else(|| ClientError::Unreachable(NOT_CONNECTED.to_string()))?;
        let request = with_reference(request)?;
        let client = client_for(&remote, SYNTHESIS_TIMEOUT);
        let mut result = api::synthesize(&client, &request);
        for _ in 1..SYNTHESIS_ATTEMPTS {
            if !timed_out(&result) {
                break;
            }
            result = api::synthesize(&client, &request);
        }
        result
    }

    fn save(&self, remote: Option<RemoteSettings>) -> Result<(), String> {
        let _guard = self
            .gate
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let mut settings = self.settings.load().map_err(|error| error.to_string())?;
        settings.backend.remote = remote;
        self.settings
            .save(&settings)
            .map_err(|error| error.to_string())
    }

    fn proxy(&self, method: Method, path: &str) -> Result<(), String> {
        self.call::<serde_json::Value>(method, path).map(drop)
    }

    fn call<T: DeserializeOwned>(&self, method: Method, path: &str) -> Result<T, String> {
        api::call(&self.client(REQUEST_TIMEOUT)?, method, path).map_err(remote_error)
    }

    fn client(&self, timeout: Duration) -> Result<BackendClient, String> {
        let remote = self.config().ok_or_else(|| NOT_CONNECTED.to_string())?;
        Ok(client_for(&remote, timeout))
    }
}

fn client_for(remote: &RemoteSettings, timeout: Duration) -> BackendClient {
    BackendClient::remote(&remote.url, &remote.api_key, timeout)
}

fn inspect(remote: &RemoteSettings) -> RemoteView {
    let client = client_for(remote, STATUS_TIMEOUT);
    let started = Instant::now();
    let backend = match client.health() {
        Ok(health) => {
            let latency = u64::try_from(started.elapsed().as_millis()).unwrap_or(u64::MAX);
            let system = client.send(Method::Get, "/system").unwrap_or_default();
            connected_view(health, latency, system)
        }
        Err(error) => failed_view(remote_error(error)),
    };
    RemoteView {
        backend,
        url: remote.url.clone(),
        key_hint: key_hint(&remote.api_key),
        active: remote.active,
    }
}

fn connected_view(health: Health, latency_ms: u64, system: SystemView) -> BackendView {
    let server = ServerView {
        status: ServerStatus::Running,
        ..ServerView::from_state(&MonitorState::Stopped, now())
    }
    .with_health(health, latency_ms);
    BackendView {
        server,
        gpu: system.gpu,
        device: system.device,
        models_dir: system.models_dir,
    }
}

fn failed_view(message: String) -> BackendView {
    BackendView::offline(ServerView::from_state(&MonitorState::Error(message), now()))
}

fn with_reference(request: &SynthesisRequest) -> Result<SynthesisRequest, ClientError> {
    if request.reference_path.is_empty() {
        return Ok(request.clone());
    }
    let path = Path::new(&request.reference_path);
    let bytes = fs::read(path).map_err(|error| {
        ClientError::Invalid(format!("Could not read the reference audio: {error}"))
    })?;
    Ok(SynthesisRequest {
        reference_path: String::new(),
        reference_audio: STANDARD.encode(bytes),
        reference_name: path
            .file_name()
            .map(|name| name.to_string_lossy().into_owned())
            .unwrap_or_default(),
        ..request.clone()
    })
}

fn timed_out(result: &Result<SynthesizedAudio, ClientError>) -> bool {
    matches!(
        result,
        Err(ClientError::Api { status, .. }) if *status == GATEWAY_TIMEOUT
    )
}

pub fn valid_url(url: &str) -> Result<String, String> {
    let url = url.trim().trim_end_matches('/');
    let host = url
        .strip_prefix("https://")
        .or_else(|| url.strip_prefix("http://"))
        .unwrap_or_default();
    if host.is_empty() || host.starts_with('/') || host.contains(char::is_whitespace) {
        return Err(INVALID_URL.to_string());
    }
    Ok(url.to_string())
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

pub fn remote_error(error: ClientError) -> String {
    match error {
        ClientError::Unreachable(detail) => {
            format!("The remote backend is not reachable: {detail}")
        }
        ClientError::Api { status, code, .. } if code.is_empty() => {
            format!("The remote backend answered with status {status}.")
        }
        other => other.to_string(),
    }
}

fn now() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)
}
