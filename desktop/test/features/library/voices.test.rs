use super::*;
use crate::features::library::models::AssetRights;
use crate::features::library::models::AssetUploadInput;
use crate::features::library::service::LibraryWorkspace;
use crate::features::workspace::inspector::WORKSPACE_DB_FILE;
use crate::infra::storage::database::Database;
use crate::infra::storage::migrator::Migrator;
use crate::infra::storage::migrator::workspace_scripts;
use std::sync::Arc;
use std::sync::Mutex;
use std::sync::atomic::AtomicBool;
use tempfile::TempDir;

fn fixture() -> (TempDir, LibraryWorkspace) {
    let dir = TempDir::new().unwrap();
    let mut db = Database::create(&dir.path().join(WORKSPACE_DB_FILE)).unwrap();
    Migrator::migrate(
        db.connection_mut(),
        &workspace_scripts().unwrap(),
        &AtomicBool::new(false),
    )
    .unwrap();
    let workspace = LibraryWorkspace::with_gate(dir.path().to_path_buf(), Arc::new(Mutex::new(())));
    (dir, workspace)
}

fn wav_bytes(seconds: u32) -> Vec<u8> {
    let sample_rate = 8_000_u32;
    let sample_count = (sample_rate * seconds) as usize;
    let data_len = sample_count * 2;
    let mut bytes = Vec::with_capacity(44 + data_len);
    bytes.extend_from_slice(b"RIFF");
    bytes.extend_from_slice(&(36 + data_len as u32).to_le_bytes());
    bytes.extend_from_slice(b"WAVEfmt ");
    bytes.extend_from_slice(&16_u32.to_le_bytes());
    bytes.extend_from_slice(&1_u16.to_le_bytes());
    bytes.extend_from_slice(&1_u16.to_le_bytes());
    bytes.extend_from_slice(&sample_rate.to_le_bytes());
    bytes.extend_from_slice(&(sample_rate * 2).to_le_bytes());
    bytes.extend_from_slice(&2_u16.to_le_bytes());
    bytes.extend_from_slice(&16_u16.to_le_bytes());
    bytes.extend_from_slice(b"data");
    bytes.extend_from_slice(&(data_len as u32).to_le_bytes());
    for index in 0..sample_count {
        let sample = if index % 16 < 8 {
            8_000_i16
        } else {
            -8_000_i16
        };
        bytes.extend_from_slice(&sample.to_le_bytes());
    }
    bytes
}

fn write_wav(dir: &TempDir, name: &str, seconds: u32) -> PathBuf {
    let path = dir.path().join(name);
    fs::write(&path, wav_bytes(seconds)).unwrap();
    path
}

fn input(source: VoiceSource) -> VoiceInput {
    VoiceInput {
        name: "  Narrator  ".to_string(),
        description: " Warm voice ".to_string(),
        engine: "vieneu-turbo".to_string(),
        engine_kind: VoiceEngineKind::Local,
        source,
        language: "vi".to_string(),
        gender: VoiceGender::Female,
        preset: Some("Mai Anh".to_string()),
        reference: None,
        prompt: "female, young adult".to_string(),
    }
}

fn clone_input(reference: VoiceReference) -> VoiceInput {
    VoiceInput {
        reference: Some(reference),
        ..input(VoiceSource::Clone)
    }
}

fn error_code(result: LibraryResult<impl std::fmt::Debug>) -> LibraryErrorCode {
    result.unwrap_err().code
}

#[test]
fn validation_normalizes_each_source() {
    let preset = validate_input(&input(VoiceSource::Preset)).unwrap();
    assert_eq!(preset.name, "Narrator");
    assert_eq!(preset.description, "Warm voice");
    assert_eq!(preset.preset.as_deref(), Some("Mai Anh"));
    assert_eq!(preset.prompt, "");
    assert_eq!(preset.sample_text, default_sample_text("vi"));

    let design = validate_input(&input(VoiceSource::Design)).unwrap();
    assert_eq!(
        (design.preset, design.prompt.as_str()),
        (None, "female, young adult")
    );

    let english = VoiceInput {
        language: "en".to_string(),
        ..input(VoiceSource::Preset)
    };
    assert_eq!(
        validate_input(&english).unwrap().sample_text,
        "Hello, this is a sample voice for your story."
    );
}

#[test]
fn validation_rejects_incomplete_voices() {
    let cases = [
        VoiceInput {
            name: "   ".to_string(),
            ..input(VoiceSource::Preset)
        },
        VoiceInput {
            name: "x".repeat(256),
            ..input(VoiceSource::Preset)
        },
        VoiceInput {
            preset: Some(" ".to_string()),
            ..input(VoiceSource::Preset)
        },
        VoiceInput {
            prompt: " ".to_string(),
            ..input(VoiceSource::Design)
        },
        VoiceInput {
            engine: " ".to_string(),
            ..input(VoiceSource::Preset)
        },
        VoiceInput {
            engine: "edge-read-aloud".to_string(),
            ..input(VoiceSource::Design)
        },
    ];
    for case in cases {
        assert_eq!(
            error_code(validate_input(&case)),
            LibraryErrorCode::VoiceInvalid
        );
    }
    assert!(
        validate_input(&VoiceInput {
            name: "x".repeat(255),
            ..input(VoiceSource::Preset)
        })
        .is_ok()
    );
    assert_eq!(
        error_code(validate_input(&input(VoiceSource::Clone))),
        LibraryErrorCode::VoiceReferenceInvalid
    );
}

#[test]
fn sample_text_and_recording_helpers() {
    assert_eq!(
        normalize_sample_text("  Xin \n chào  ").unwrap(),
        "Xin chào"
    );
    assert!(normalize_sample_text(" ").is_err());
    assert!(normalize_sample_text(&"a".repeat(501)).is_err());
    assert_eq!(recording_extension("audio/webm;codecs=opus"), "webm");
    assert_eq!(recording_extension("audio/ogg; codecs=opus"), "ogg");
    assert_eq!(recording_extension("audio/mp4"), "m4a");
    assert_eq!(recording_extension("audio/wav"), "wav");
    assert!(decode_recording("AAAA", 31_000).is_err());
    assert!(decode_recording("AAAA", 0).is_err());
    assert!(decode_recording("not base64!", 1_000).is_err());
    assert!(decode_recording("", 1_000).is_err());
    assert_eq!(decode_recording("AAAA", 30_000).unwrap(), vec![0, 0, 0]);
}

#[test]
fn preset_voice_lifecycle() {
    let (dir, workspace) = fixture();
    let voice = workspace.voice_create(input(VoiceSource::Preset)).unwrap();
    assert_eq!(voice.name, "Narrator");
    assert_eq!(voice.reference_kind, None);
    assert_eq!(voice.sample_duration_ms, None);
    assert_eq!(workspace.voice_list().unwrap(), vec![voice.clone()]);

    workspace
        .voice_record_duration(voice.id, &voice.sample_text, 2_400)
        .unwrap();
    workspace
        .voice_record_duration(voice.id, "Other text", 9_999)
        .unwrap();
    let (stored, reference) = workspace.voice_for_synthesis(voice.id).unwrap();
    assert_eq!((stored.sample_duration_ms, reference), (Some(2_400), None));

    let updated = workspace
        .voice_update(
            voice.id,
            VoicePatch {
                sample_text: Some("  Một   câu mới ".to_string()),
                description: Some(" Mới ".to_string()),
            },
        )
        .unwrap();
    assert_eq!(updated.sample_text, "Một câu mới");
    assert_eq!(updated.description, "Mới");
    assert_eq!(updated.sample_duration_ms, None);
    assert_eq!(updated.name, voice.name);
    assert_eq!(
        error_code(workspace.voice_update(
            voice.id,
            VoicePatch {
                sample_text: Some(" ".to_string()),
                description: None,
            },
        )),
        LibraryErrorCode::VoiceInvalid
    );

    assert_eq!(workspace.voice_delete(&[voice.id, 999]).unwrap(), 1);
    assert!(workspace.voice_list().unwrap().is_empty());
    assert_eq!(
        error_code(workspace.voice_for_synthesis(voice.id)),
        LibraryErrorCode::VoiceNotFound
    );
    drop(dir);
}

#[test]
fn clone_from_uploaded_file_stores_a_wave_reference() {
    let (dir, workspace) = fixture();
    let source = write_wav(&dir, "my take.wav", 2);
    let voice = workspace
        .voice_create(clone_input(VoiceReference::File {
            path: source.to_string_lossy().into_owned(),
            name: "my take.wav".to_string(),
        }))
        .unwrap();
    assert_eq!(voice.reference_kind.as_deref(), Some("file"));
    assert_eq!(voice.reference_name, "my take.wav");
    assert_eq!((voice.preset, voice.prompt.as_str()), (None, ""));
    let (_, reference) = workspace.voice_for_synthesis(voice.id).unwrap();
    let reference = reference.unwrap();
    assert!(reference.ends_with(format!("library/voices/{}/reference.wav", voice.id)));
    assert!(
        sounds::analyze(&reference, SoundFormat::Wav)
            .unwrap()
            .duration_ms
            >= 1_900
    );
    assert!(workspace.sound_list().unwrap().is_empty());
    let staging: Vec<_> = fs::read_dir(dir.path().join("library").join("voices"))
        .unwrap()
        .filter_map(Result::ok)
        .filter(|entry| {
            entry
                .file_name()
                .to_string_lossy()
                .starts_with(STAGING_PREFIX)
        })
        .collect();
    assert!(staging.is_empty());

    workspace.voice_delete(&[voice.id]).unwrap();
    assert!(!reference.exists());
}

#[test]
fn clone_from_library_sound_is_detached_when_the_sound_is_deleted() {
    let (dir, workspace) = fixture();
    let path = write_wav(&dir, "Narration.wav", 1);
    let sound = workspace
        .sound_upload(
            path.to_str().unwrap(),
            AssetUploadInput {
                rights: AssetRights::Own,
                collection_id: None,
                tags: Vec::new(),
            },
        )
        .unwrap();
    let voice = workspace
        .voice_create(clone_input(VoiceReference::Sound { sound_id: sound.id }))
        .unwrap();
    assert_eq!(voice.reference_sound_id, Some(sound.id));
    assert_eq!(voice.reference_name, sound.name);

    workspace.sound_delete(&[sound.id]).unwrap();
    let (stored, reference) = workspace.voice_for_synthesis(voice.id).unwrap();
    assert_eq!(stored.reference_sound_id, None);
    assert_eq!(stored.reference_name, sound.name);
    assert!(reference.unwrap().is_file());
}

#[test]
fn clone_from_recording_enforces_the_duration_limit() {
    let (_dir, workspace) = fixture();
    let short = base64::engine::general_purpose::STANDARD.encode(wav_bytes(2));
    let voice = workspace
        .voice_create(clone_input(VoiceReference::Recording {
            data: short,
            mime: "audio/wav".to_string(),
            duration_ms: 2_000,
        }))
        .unwrap();
    assert_eq!(voice.reference_kind.as_deref(), Some("recording"));
    assert!(workspace.voice_for_synthesis(voice.id).unwrap().1.is_some());

    let long = base64::engine::general_purpose::STANDARD.encode(wav_bytes(32));
    assert_eq!(
        error_code(
            workspace.voice_create(clone_input(VoiceReference::Recording {
                data: long,
                mime: "audio/wav".to_string(),
                duration_ms: 30_000,
            }))
        ),
        LibraryErrorCode::VoiceReferenceInvalid
    );
    assert_eq!(workspace.voice_list().unwrap().len(), 1);
}

#[test]
fn clone_rejects_unreadable_references() {
    let (dir, workspace) = fixture();
    let text = dir.path().join("notes.txt");
    fs::write(&text, b"hello").unwrap();
    let broken = dir.path().join("broken.wav");
    fs::write(&broken, b"RIFF0000WAVEjunk").unwrap();
    for path in [text, broken] {
        assert_eq!(
            error_code(workspace.voice_create(clone_input(VoiceReference::File {
                path: path.to_string_lossy().into_owned(),
                name: "x".to_string(),
            }))),
            LibraryErrorCode::VoiceReferenceInvalid
        );
    }
    assert_eq!(
        error_code(workspace.voice_create(clone_input(VoiceReference::Sound { sound_id: 42 }))),
        LibraryErrorCode::SoundNotFound
    );
    assert!(workspace.voice_list().unwrap().is_empty());
}

#[test]
fn duplicates_keep_only_library_references() {
    let (dir, workspace) = fixture();
    let path = write_wav(&dir, "Narration.wav", 1);
    let sound = workspace
        .sound_upload(
            path.to_str().unwrap(),
            AssetUploadInput {
                rights: AssetRights::Own,
                collection_id: None,
                tags: Vec::new(),
            },
        )
        .unwrap();
    let from_library = workspace
        .voice_create(clone_input(VoiceReference::Sound { sound_id: sound.id }))
        .unwrap();
    let uploaded = workspace
        .voice_create(clone_input(VoiceReference::File {
            path: write_wav(&dir, "take.wav", 1)
                .to_string_lossy()
                .into_owned(),
            name: "take.wav".to_string(),
        }))
        .unwrap();

    let library_copy = workspace
        .voice_duplicate(from_library.id, "Narrator copy")
        .unwrap();
    assert_eq!(library_copy.name, "Narrator copy");
    assert_eq!(library_copy.source, VoiceSource::Clone);
    assert_eq!(library_copy.reference_sound_id, Some(sound.id));
    assert_eq!(library_copy.sample_text, from_library.sample_text);
    assert!(
        workspace
            .voice_for_synthesis(library_copy.id)
            .unwrap()
            .1
            .is_some()
    );

    let upload_copy = workspace.voice_duplicate(uploaded.id, "Take copy").unwrap();
    assert_eq!(upload_copy.reference_kind, None);
    assert_eq!(upload_copy.reference_name, "");
    assert!(
        workspace
            .voice_for_synthesis(upload_copy.id)
            .unwrap()
            .1
            .is_none()
    );

    let preset = workspace.voice_create(input(VoiceSource::Preset)).unwrap();
    let preset_copy = workspace.voice_duplicate(preset.id, "Preset copy").unwrap();
    assert_eq!(preset_copy.preset.as_deref(), Some("Mai Anh"));
    assert_eq!(
        error_code(workspace.voice_duplicate(preset.id, " ")),
        LibraryErrorCode::VoiceInvalid
    );
    assert_eq!(
        error_code(workspace.voice_duplicate(999, "x")),
        LibraryErrorCode::VoiceNotFound
    );
}

fn synthesis_voice(source: VoiceSource, engine_kind: VoiceEngineKind) -> LibraryVoice {
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
        &synthesis_voice(VoiceSource::Clone, VoiceEngineKind::Local),
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
        &synthesis_voice(VoiceSource::Preset, VoiceEngineKind::Local),
        None,
        "a",
    )
    .unwrap();
    assert_eq!(preset.reference_path, "");
}

#[test]
fn cloud_voices_cannot_be_previewed_yet() {
    let error = synthesis_request(
        &synthesis_voice(VoiceSource::Preset, VoiceEngineKind::Cloud),
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
