use super::*;
use crate::features::library::models::VoiceGender;
use crate::features::library::models::VoiceSource;
use std::path::PathBuf;

fn voice(source: VoiceSource, engine_kind: VoiceEngineKind) -> LibraryVoice {
    LibraryVoice {
        id: 7,
        name: "Narrator".to_string(),
        description: String::new(),
        engine: "omnivoice".to_string(),
        engine_kind,
        source,
        language: "vi".to_string(),
        gender: VoiceGender::Male,
        preset: Some("elderly-man".to_string()),
        reference_kind: None,
        reference_sound_id: None,
        reference_name: String::new(),
        prompt: "male, low pitch".to_string(),
        sample_text: "Xin chào".to_string(),
        sample_duration_ms: None,
        created_at: String::new(),
        updated_at: String::new(),
    }
}

#[test]
fn synthesis_request_carries_the_voice_settings() {
    let reference = PathBuf::from("C:/ws/library/voices/7/reference.wav");
    let request = synthesis_request(
        &voice(VoiceSource::Clone, VoiceEngineKind::Local),
        Some(&reference),
        "Một hai ba",
    )
    .unwrap();
    assert_eq!(
        request,
        SynthesisRequest {
            model: "omnivoice".to_string(),
            text: "Một hai ba".to_string(),
            source: "clone".to_string(),
            language: "vi".to_string(),
            gender: "male".to_string(),
            preset: "elderly-man".to_string(),
            prompt: "male, low pitch".to_string(),
            reference_path: reference.to_string_lossy().into_owned(),
        }
    );
    let preset = synthesis_request(
        &voice(VoiceSource::Preset, VoiceEngineKind::Local),
        None,
        "a",
    )
    .unwrap();
    assert_eq!(preset.reference_path, "");
}

#[test]
fn cloud_voices_cannot_be_previewed_yet() {
    let error = synthesis_request(
        &voice(VoiceSource::Preset, VoiceEngineKind::Cloud),
        None,
        "a",
    )
    .unwrap_err();
    assert_eq!(error.code, LibraryErrorCode::VoiceEngineUnavailable);
}

#[test]
fn backend_failures_map_to_voice_errors() {
    let api = |code: &str| ClientError::Api {
        status: 422,
        code: code.to_string(),
        message: "Nope".to_string(),
    };
    assert_eq!(
        synthesis_error(ClientError::Unreachable("down".to_string())).code,
        LibraryErrorCode::VoiceBackendOffline
    );
    for code in [
        "MODEL_NOT_INSTALLED",
        "MODEL_BUSY",
        "ENGINE_UNSUPPORTED",
        "MODEL_NOT_FOUND",
    ] {
        let error = synthesis_error(api(code));
        assert_eq!(
            (error.code, error.detail.as_str()),
            (LibraryErrorCode::VoiceEngineUnavailable, "Nope")
        );
    }
    let failed = synthesis_error(api("PROMPT_INVALID"));
    assert_eq!(
        (failed.code, failed.detail.as_str()),
        (
            LibraryErrorCode::VoiceSynthesisFailed,
            "PROMPT_INVALID: Nope"
        )
    );
    assert_eq!(
        synthesis_error(ClientError::Invalid("bad".to_string())).code,
        LibraryErrorCode::VoiceSynthesisFailed
    );
}
