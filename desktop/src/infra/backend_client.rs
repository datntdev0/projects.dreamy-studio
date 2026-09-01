use serde::Deserialize;
use serde::de::DeserializeOwned;
use std::fmt;
use std::time::Duration;
use ureq::Agent;
use ureq::Body;
use ureq::http::Response;

const HOST: &str = "127.0.0.1";
const HEALTH_PATH: &str = "/health";
const HEALTH_OK: &str = "ok";

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

#[derive(Debug, Default, Deserialize)]
#[serde(default)]
struct ApiError {
    code: String,
    message: String,
}

pub struct BackendClient {
    agent: Agent,
    base: String,
}

impl BackendClient {
    pub fn new(port: u16, timeout: Duration) -> Self {
        let config = Agent::config_builder()
            .timeout_global(Some(timeout))
            .http_status_as_error(false)
            .build();
        Self {
            agent: Agent::new_with_config(config),
            base: format!("http://{HOST}:{port}"),
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
            Method::Get => self.agent.get(&url).call(),
            Method::Post => self.agent.post(&url).send_empty(),
            Method::Delete => self.agent.delete(&url).call(),
        };
        match result {
            Ok(response) => decode(response),
            Err(error) => Err(ClientError::Unreachable(error.to_string())),
        }
    }
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

#[cfg(test)]
#[path = "../../test/infra/backend_client.test.rs"]
mod tests;
