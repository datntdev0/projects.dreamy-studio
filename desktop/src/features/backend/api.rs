use crate::features::backend::models::SynthesisRequest;
use crate::features::backend::models::SynthesizedAudio;
use crate::features::backend::models::TtsModel;
use crate::infra::backend_client::BackendClient;
use crate::infra::backend_client::BinaryResponse;
use crate::infra::backend_client::ClientError;
use crate::infra::backend_client::Method;
use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use serde::de::DeserializeOwned;

pub const SYNTHESIS_PATH: &str = "/tts/synthesize";

pub fn call<T: DeserializeOwned>(
    client: &BackendClient,
    method: Method,
    path: &str,
) -> Result<T, ClientError> {
    client.send(method, path)
}

pub fn proxy(client: &BackendClient, method: Method, path: &str) -> Result<(), ClientError> {
    call::<serde_json::Value>(client, method, path).map(drop)
}

pub fn list_models(client: &BackendClient) -> Result<Vec<TtsModel>, ClientError> {
    match client.send(Method::Get, "/models") {
        Err(ClientError::Unreachable(_)) => Ok(Vec::new()),
        other => other,
    }
}

pub fn model_path(id: &str) -> Result<String, String> {
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

pub fn synthesize(
    client: &BackendClient,
    request: &SynthesisRequest,
) -> Result<SynthesizedAudio, ClientError> {
    client
        .post_for_bytes(SYNTHESIS_PATH, request)
        .map(synthesized)
}

pub fn synthesized(response: BinaryResponse) -> SynthesizedAudio {
    SynthesizedAudio {
        duration_ms: response
            .header("x-duration-ms")
            .and_then(|value| value.parse().ok()),
        cached: response.header("x-cache") == Some("hit"),
        subtitles: response.header("x-subtitles").and_then(decode_subtitles),
        bytes: response.bytes,
    }
}

pub fn decode_subtitles(value: &str) -> Option<String> {
    let bytes = STANDARD.decode(value.trim()).ok()?;
    String::from_utf8(bytes).ok()
}
