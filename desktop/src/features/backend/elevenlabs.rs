use crate::features::backend::models::CloudCheckResult;
use crate::features::backend::models::CloudVoice;
use crate::features::backend::models::SynthesisRequest;
use crate::features::backend::models::SynthesizedAudio;
use crate::features::backend::speech;
use crate::features::backend::speech::FAILURE_STATUS;
use crate::features::backend::speech::INVALID_STATUS;
use crate::features::backend::speech::api_error;
use crate::infra::backend_client::ClientError;
use serde::Deserialize;
use serde::de::DeserializeOwned;
use serde_json::Value;
use serde_json::json;
use std::collections::HashSet;
use std::time::Duration;
use ureq::Agent;
use ureq::Body;
use ureq::RequestBuilder;
use ureq::http::Response;

pub const ELEVENLABS_ENGINE: &str = "elevenlabs";
const API_BASE: &str = "https://api.elevenlabs.io";
const KEY_HEADER: &str = "xi-api-key";
const JSON_TYPE: &str = "application/json";
const MY_VOICES_PATH: &str = "/v2/voices";
const SHARED_VOICES_PATH: &str = "/v1/shared-voices";
const SPEECH_PATH: &str = "/v1/text-to-speech";
const SUBSCRIPTION_PATH: &str = "/v1/user/subscription";
const OUTPUT_FORMAT: &str = "mp3_44100_128";
const SPEECH_MODEL: &str = "eleven_v4";
const STABILITY: f64 = 0.5;
const SIMILARITY_BOOST: f64 = 0.75;
const SEARCH_PAGE_SIZE: &str = "20";
const SHARED_SORT: &str = "trending";
const PRESET_SOURCE: &str = "preset";
const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);
const SPEECH_TIMEOUT: Duration = Duration::from_secs(300);
const MAX_RESPONSE_BYTES: u64 = 64 * 1024 * 1024;
const FAILURE_CODE: &str = "ELEVENLABS_FAILED";
const UNREACHABLE_CODE: &str = "ELEVENLABS_UNREACHABLE";

#[derive(Debug, Default, Deserialize)]
#[serde(default)]
struct VoiceList {
    voices: Vec<VoiceItem>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(default)]
struct VoiceItem {
    voice_id: String,
    name: String,
    category: String,
    description: Option<String>,
    preview_url: Option<String>,
    labels: VoiceLabels,
    gender: Option<String>,
    accent: Option<String>,
    language: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(default)]
struct VoiceLabels {
    gender: Option<String>,
    accent: Option<String>,
    language: Option<String>,
}

struct ElevenLabsClient {
    agent: Agent,
    api_key: String,
}

pub fn supports(engine: &str) -> bool {
    engine == ELEVENLABS_ENGINE
}

pub fn search(api_key: &str, query: &str) -> Result<Vec<CloudVoice>, ClientError> {
    let client = ElevenLabsClient::new(api_key, REQUEST_TIMEOUT);
    let query = query.trim();
    let mut voices = client.my_voices(query, SEARCH_PAGE_SIZE)?;
    if !query.is_empty() {
        voices.extend(client.shared_voices(query)?);
    }
    let mut seen = HashSet::new();
    voices.retain(|voice| seen.insert(voice.id.clone()));
    Ok(voices)
}

pub fn synthesize(
    api_key: &str,
    request: &SynthesisRequest,
) -> Result<SynthesizedAudio, ClientError> {
    if request.source != PRESET_SOURCE {
        let message = format!("ElevenLabs does not support {} voices yet", request.source);
        return Err(api_error(INVALID_STATUS, "SOURCE_UNSUPPORTED", &message));
    }
    let voice = path_segment(&request.preset)?;
    let text = speech::collapsed_text(&request.text)?;
    let client = ElevenLabsClient::new(api_key, SPEECH_TIMEOUT);
    let mp3 = client.speak(voice, &text)?;
    speech::mp3_audio(mp3, None, FAILURE_CODE)
}

pub fn check(api_key: &str) -> CloudCheckResult {
    let client = ElevenLabsClient::new(api_key, REQUEST_TIMEOUT);
    speech::check_result(client.subscription())
}

impl ElevenLabsClient {
    fn new(api_key: &str, timeout: Duration) -> Self {
        let config = Agent::config_builder()
            .timeout_global(Some(timeout))
            .http_status_as_error(false)
            .build();
        Self {
            agent: Agent::new_with_config(config),
            api_key: api_key.trim().to_string(),
        }
    }

    fn my_voices(&self, query: &str, page_size: &str) -> Result<Vec<CloudVoice>, ClientError> {
        let mut request = self.get(MY_VOICES_PATH).query("page_size", page_size);
        if !query.is_empty() {
            request = request.query("search", query);
        }
        let list: VoiceList = decode_json(request.call())?;
        Ok(list.voices.into_iter().map(VoiceItem::into_voice).collect())
    }

    fn subscription(&self) -> Result<(), ClientError> {
        decode_json::<Value>(self.get(SUBSCRIPTION_PATH).call()).map(drop)
    }

    fn shared_voices(&self, query: &str) -> Result<Vec<CloudVoice>, ClientError> {
        let request = self
            .get(SHARED_VOICES_PATH)
            .query("page_size", SEARCH_PAGE_SIZE)
            .query("sort", SHARED_SORT)
            .query("search", query);
        let list: VoiceList = decode_json(request.call())?;
        Ok(list.voices.into_iter().map(VoiceItem::into_voice).collect())
    }

    fn speak(&self, voice: &str, text: &str) -> Result<Vec<u8>, ClientError> {
        let path = format!("{SPEECH_PATH}/{voice}");
        let body = speech_body(text);
        let request = self
            .post(&path)
            .query("output_format", OUTPUT_FORMAT)
            .header("Content-Type", JSON_TYPE);
        read_bytes(request.send(&encode(&body)?[..]))
    }

    fn get(&self, path: &str) -> RequestBuilder<ureq::typestate::WithoutBody> {
        self.agent
            .get(format!("{API_BASE}{path}"))
            .header(KEY_HEADER, &self.api_key)
    }

    fn post(&self, path: &str) -> RequestBuilder<ureq::typestate::WithBody> {
        self.agent
            .post(format!("{API_BASE}{path}"))
            .header(KEY_HEADER, &self.api_key)
    }
}

impl VoiceItem {
    fn into_voice(self) -> CloudVoice {
        CloudVoice {
            id: self.voice_id,
            name: self.name,
            gender: first_text(self.gender, self.labels.gender),
            language: first_text(self.language, self.labels.language),
            accent: first_text(self.accent, self.labels.accent),
            category: self.category,
            description: self.description.unwrap_or_default().trim().to_string(),
            preview_url: self.preview_url.unwrap_or_default(),
        }
    }
}

fn first_text(primary: Option<String>, fallback: Option<String>) -> String {
    primary
        .filter(|value| !value.is_empty())
        .or(fallback)
        .unwrap_or_default()
}

fn speech_body(text: &str) -> Value {
    json!({
        "text": text,
        "model_id": SPEECH_MODEL,
        "voice_settings": {
            "stability": STABILITY,
            "similarity_boost": SIMILARITY_BOOST,
        },
    })
}

fn path_segment(value: &str) -> Result<&str, ClientError> {
    let value = value.trim();
    let valid = !value.is_empty() && value.chars().all(|char| char.is_ascii_alphanumeric());
    if !valid {
        let message = format!("Unknown ElevenLabs voice '{value}'");
        return Err(api_error(INVALID_STATUS, "PRESET_UNKNOWN", &message));
    }
    Ok(value)
}

fn encode(body: &Value) -> Result<Vec<u8>, ClientError> {
    serde_json::to_vec(body).map_err(|error| ClientError::Invalid(error.to_string()))
}

fn decode_json<T: DeserializeOwned>(
    result: Result<Response<Body>, ureq::Error>,
) -> Result<T, ClientError> {
    let bytes = read_bytes(result)?;
    serde_json::from_slice(&bytes).map_err(|error| ClientError::Invalid(error.to_string()))
}

fn read_bytes(result: Result<Response<Body>, ureq::Error>) -> Result<Vec<u8>, ClientError> {
    let mut response = result.map_err(unreachable)?;
    let status = response.status().as_u16();
    let bytes = response
        .body_mut()
        .with_config()
        .limit(MAX_RESPONSE_BYTES)
        .read_to_vec()
        .map_err(unreachable)?;
    if status >= 400 {
        return Err(response_error(status, &bytes));
    }
    Ok(bytes)
}

fn unreachable(error: ureq::Error) -> ClientError {
    let message = format!("ElevenLabs is not reachable: {error}");
    api_error(FAILURE_STATUS, UNREACHABLE_CODE, &message)
}

fn response_error(status: u16, bytes: &[u8]) -> ClientError {
    let body: Value = serde_json::from_slice(bytes).unwrap_or_default();
    let detail = &body["detail"];
    let message = [
        &detail["message"],
        detail,
        &detail[0]["msg"],
        &detail["status"],
    ]
    .into_iter()
    .find_map(Value::as_str)
    .map(str::to_string)
    .unwrap_or_else(|| format!("status {status}"));
    let code = detail["status"]
        .as_str()
        .or_else(|| detail["code"].as_str())
        .unwrap_or(FAILURE_CODE)
        .to_ascii_uppercase();
    api_error(status, &code, &format!("ElevenLabs: {message}"))
}
