use crate::features::audiobook::audio::encode_wav;
use crate::features::backend::models::CloudCheckResult;
use crate::features::backend::models::SynthesizedAudio;
use crate::features::library::sounds;
use crate::features::library::sounds::SoundFormat;
use crate::infra::backend_client::ClientError;

pub const FAILURE_STATUS: u16 = 502;
pub const INVALID_STATUS: u16 = 422;
pub const UNAVAILABLE_STATUS: u16 = 409;

pub fn mp3_audio(
    mp3: Vec<u8>,
    subtitles: Option<String>,
    failure_code: &str,
) -> Result<SynthesizedAudio, ClientError> {
    let sound = sounds::decode_bytes(mp3, SoundFormat::Mp3)
        .map_err(|error| api_error(FAILURE_STATUS, failure_code, &error.to_string()))?;
    let channels = sound.channels.max(1);
    let frames = (sound.samples.len() / channels as usize) as i64;
    Ok(SynthesizedAudio {
        bytes: encode_wav(&sound.samples, sound.sample_rate, channels, 1.0),
        duration_ms: Some(frames * 1_000 / i64::from(sound.sample_rate.max(1))),
        cached: false,
        subtitles: subtitles.filter(|text| !text.trim().is_empty()),
    })
}

pub fn collapsed_text(text: &str) -> Result<String, ClientError> {
    let text = text.split_whitespace().collect::<Vec<_>>().join(" ");
    if text.is_empty() {
        return Err(api_error(
            INVALID_STATUS,
            "TEXT_EMPTY",
            "Sample text is empty",
        ));
    }
    Ok(text)
}

pub fn api_error(status: u16, code: &str, message: &str) -> ClientError {
    ClientError::Api {
        status,
        code: code.to_string(),
        message: message.to_string(),
    }
}

pub fn check_result(outcome: Result<(), ClientError>) -> CloudCheckResult {
    CloudCheckResult {
        ok: outcome.is_ok(),
        error: outcome
            .err()
            .map(|error| error.to_string())
            .unwrap_or_default(),
        checked_at_ms: chrono::Utc::now().timestamp_millis(),
    }
}
