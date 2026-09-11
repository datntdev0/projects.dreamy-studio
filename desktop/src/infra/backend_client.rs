use serde::Deserialize;
use serde::Serialize;
use serde::de::DeserializeOwned;
use std::fmt;
use std::time::Duration;
use ureq::Agent;
use ureq::Body;
use ureq::RequestBuilder;
use ureq::http::Response;

const HOST: &str = "127.0.0.1";
pub const API_KEY_HEADER: &str = "X-API-Key";
const JSON_TYPE: &str = "application/json";
const HEALTH_PATH: &str = "/health";
const HEALTH_OK: &str = "ok";
const MAX_BINARY_BYTES: u64 = 256 * 1024 * 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Method {
    Get,
    Post,
    Delete,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ClientError {
    Unreachable(String),
    Api {
        status: u16,
        code: String,
        message: String,
    },
    Invalid(String),
}

impl fmt::Display for ClientError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ClientError::Unreachable(detail) => {
                write!(f, "The local backend is not reachable: {detail}")
            }
            ClientError::Api { message, .. } => f.write_str(message),
            ClientError::Invalid(detail) => write!(f, "Invalid backend response: {detail}"),
        }
    }
}

impl std::error::Error for ClientError {}

#[derive(Debug, Clone, Default, PartialEq, Eq, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Health {
    pub status: String,
    pub version: String,
    pub python_version: String,
    pub started_at: Option<String>,
    pub device: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BinaryResponse {
    pub bytes: Vec<u8>,
    pub headers: Vec<(String, String)>,
}

impl BinaryResponse {
    pub fn header(&self, name: &str) -> Option<&str> {
        self.headers
            .iter()
            .find(|(key, _)| key.eq_ignore_ascii_case(name))
            .map(|(_, value)| value.as_str())
    }
}

#[derive(Debug, Default, Deserialize)]
#[serde(default)]
struct ApiError {
    code: String,
    message: String,
}

pub struct BackendClient {
    agent: Agent,
    base: String,
    api_key: Option<String>,
}

impl BackendClient {
    pub fn new(port: u16, timeout: Duration) -> Self {
        Self::at(format!("http://{HOST}:{port}"), None, timeout)
    }

    pub fn remote(url: &str, api_key: &str, timeout: Duration) -> Self {
        let api_key = Some(api_key.to_string()).filter(|key| !key.is_empty());
        Self::at(
            url.trim().trim_end_matches('/').to_string(),
            api_key,
            timeout,
        )
    }

    fn at(base: String, api_key: Option<String>, timeout: Duration) -> Self {
        let config = Agent::config_builder()
            .timeout_global(Some(timeout))
            .http_status_as_error(false)
            .build();
        Self {
            agent: Agent::new_with_config(config),
            base,
            api_key,
        }
    }

    fn authorize<B>(&self, request: RequestBuilder<B>) -> RequestBuilder<B> {
        match &self.api_key {
            Some(key) => request.header(API_KEY_HEADER, key),
            None => request,
        }
    }

    pub fn health(&self) -> Result<Health, ClientError> {
        let health: Health = self.send(Method::Get, HEALTH_PATH)?;
        if health.status == HEALTH_OK {
            Ok(health)
        } else {
            Err(ClientError::Invalid(format!(
                "health status is {:?}",
                health.status
            )))
        }
    }

    pub fn send<T: DeserializeOwned>(&self, method: Method, path: &str) -> Result<T, ClientError> {
        let url = format!("{}{path}", self.base);
        let result = match method {
            Method::Get => self.authorize(self.agent.get(&url)).call(),
            Method::Post => self.authorize(self.agent.post(&url)).send_empty(),
            Method::Delete => self.authorize(self.agent.delete(&url)).call(),
        };
        match result {
            Ok(response) => decode(response),
            Err(error) => Err(ClientError::Unreachable(error.to_string())),
        }
    }

    pub fn post_for_bytes<B: Serialize>(
        &self,
        path: &str,
        body: &B,
    ) -> Result<BinaryResponse, ClientError> {
        let url = format!("{}{path}", self.base);
        let payload = encode(body)?;
        let request = self
            .authorize(self.agent.post(&url))
            .header("Content-Type", JSON_TYPE);
        match request.send(&payload[..]) {
            Ok(response) => read_binary(response),
            Err(error) => Err(ClientError::Unreachable(error.to_string())),
        }
    }
}

fn encode<B: Serialize>(body: &B) -> Result<Vec<u8>, ClientError> {
    serde_json::to_vec(body).map_err(|error| ClientError::Invalid(error.to_string()))
}

fn read_binary(mut response: Response<Body>) -> Result<BinaryResponse, ClientError> {
    let status = response.status().as_u16();
    let headers = response
        .headers()
        .iter()
        .filter_map(|(name, value)| Some((name.to_string(), value.to_str().ok()?.to_string())))
        .collect();
    let bytes = response
        .body_mut()
        .with_config()
        .limit(MAX_BINARY_BYTES)
        .read_to_vec()
        .map_err(|error| ClientError::Unreachable(error.to_string()))?;
    if status >= 400 {
        return Err(api_error(status, &String::from_utf8_lossy(&bytes)));
    }
    Ok(BinaryResponse { bytes, headers })
}

fn decode<T: DeserializeOwned>(mut response: Response<Body>) -> Result<T, ClientError> {
    let status = response.status().as_u16();
    let text = response
        .body_mut()
        .read_to_string()
        .map_err(|error| ClientError::Unreachable(error.to_string()))?;
    if status >= 400 {
        return Err(api_error(status, &text));
    }
    serde_json::from_str(&text).map_err(|error| ClientError::Invalid(error.to_string()))
}

fn api_error(status: u16, text: &str) -> ClientError {
    let error: ApiError = serde_json::from_str(text).unwrap_or_default();
    let message = if error.message.is_empty() {
        format!("The local backend answered with status {status}.")
    } else {
        error.message
    };
    ClientError::Api {
        status,
        code: error.code,
        message,
    }
}
