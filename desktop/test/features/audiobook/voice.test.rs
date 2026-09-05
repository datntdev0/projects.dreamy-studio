use super::*;
use crate::features::backend::models::SynthesisRequest;
use crate::features::backend::models::SynthesizedAudio;
use crate::features::library::models::VoiceEngineKind;
use crate::features::library::models::VoiceGender;
use crate::features::library::models::VoiceSource;
use crate::features::library::voices::NewVoice;
use crate::features::workspace::inspector::WORKSPACE_DB_FILE;
use crate::infra::backend_client::ClientError;
use crate::infra::storage::database::Database;
use crate::infra::storage::migrator::Migrator;
use crate::infra::storage::migrator::workspace_scripts;
use std::sync::Mutex;
use std::sync::atomic::AtomicBool;
use tempfile::TempDir;

struct FakeSynthesizer {
    reply: Result<Vec<u8>, ClientError>,
    seen: Mutex<Vec<SynthesisRequest>>,
}

impl Synthesizer for FakeSynthesizer {
    fn synthesize(&self, request: &SynthesisRequest) -> Result<SynthesizedAudio, ClientError> {
        self.seen.lock().unwrap().push(request.clone());
        self.reply.clone().map(|bytes| SynthesizedAudio {
            bytes,
            duration_ms: None,
            cached: false,
        })
    }
}

fn synthesizer(reply: Result<Vec<u8>, ClientError>) -> Arc<FakeSynthesizer> {
    Arc::new(FakeSynthesizer {
        reply,
        seen: Mutex::new(Vec::new()),
    })
}

fn library_with_voice(engine_kind: VoiceEngineKind) -> (TempDir, LibraryWorkspace, i64) {
    let dir = TempDir::new().unwrap();
    let mut db = Database::create(&dir.path().join(WORKSPACE_DB_FILE)).unwrap();
    Migrator::migrate(
        db.connection_mut(),
        &workspace_scripts().unwrap(),
        &AtomicBool::new(false),
    )
    .unwrap();
    let voice = NewVoice {
        name: "Narrator".to_string(),
        description: String::new(),
        engine: "omnivoice".to_string(),
        engine_kind,
        source: VoiceSource::Preset,
        language: "vi".to_string(),
        gender: VoiceGender::Male,
        preset: Some("elderly-man".to_string()),
        prompt: String::new(),
        reference_kind: None,
        reference_sound_id: None,
        reference_name: String::new(),
        sample_text: "Xin chào".to_string(),
    };
    let id = voices::insert(db.connection(), &voice, "2026-11-23T00:00:00Z").unwrap();
    let library = LibraryWorkspace::with_gate(
        dir.path().to_path_buf(),
        Arc::new(std::sync::Mutex::new(())),
    );
    (dir, library, id)
}

#[test]
fn library_voices_are_sent_to_the_synthesizer() {
    let (_dir, library, id) = library_with_voice(VoiceEngineKind::Local);
    let fake = synthesizer(Ok(b"RIFF".to_vec()));
    let speaker = LibrarySpeaker::new(library, fake.clone());

    let bytes = speaker.speak(id, "Một hai").unwrap();

    assert_eq!(bytes, b"RIFF");
    let seen = fake.seen.lock().unwrap();
    assert_eq!(seen[0].text, "Một hai");
    assert_eq!(seen[0].model, "omnivoice");
    assert_eq!(seen[0].preset, "elderly-man");
}

#[test]
fn synthesis_failures_carry_the_backend_message() {
    let (_dir, library, id) = library_with_voice(VoiceEngineKind::Local);
    let offline = LibrarySpeaker::new(
        library.clone(),
        synthesizer(Err(ClientError::Unreachable(
            "backend is not running".to_string(),
        ))),
    );
    let api = LibrarySpeaker::new(
        library.clone(),
        synthesizer(Err(ClientError::Api {
            status: 422,
            code: "PROMPT_INVALID".to_string(),
            message: "Nope".to_string(),
        })),
    );
    let healthy = LibrarySpeaker::new(library, synthesizer(Ok(Vec::new())));

    let down = offline.speak(id, "a").unwrap_err();
    let rejected = api.speak(id, "a").unwrap_err();
    let missing = healthy.speak(id + 50, "a").unwrap_err();

    assert_eq!(
        (down.code, down.detail.as_str()),
        (ProjectErrorCode::BackendFailed, "backend is not running")
    );
    assert_eq!(
        (rejected.code, rejected.detail.as_str()),
        (ProjectErrorCode::BackendFailed, "PROMPT_INVALID: Nope")
    );
    assert_eq!(missing.code, ProjectErrorCode::NotFound);
}

#[test]
fn cloud_voices_are_not_connected() {
    let (_dir, library, id) = library_with_voice(VoiceEngineKind::Cloud);
    let fake = synthesizer(Ok(Vec::new()));

    let error = LibrarySpeaker::new(library, fake.clone())
        .speak(id, "a")
        .unwrap_err();

    assert_eq!(error.code, ProjectErrorCode::BackendFailed);
    assert!(fake.seen.lock().unwrap().is_empty());
}

#[test]
fn library_errors_map_to_project_codes() {
    let cases = [
        (LibraryErrorCode::NoWorkspace, ProjectErrorCode::NoWorkspace),
        (
            LibraryErrorCode::VoiceInvalid,
            ProjectErrorCode::InvalidInput,
        ),
        (LibraryErrorCode::Io, ProjectErrorCode::Io),
        (LibraryErrorCode::Db, ProjectErrorCode::Db),
    ];
    for (library, project) in cases {
        assert_eq!(voice_error(LibraryError::new(library, "x")).code, project);
    }
}
