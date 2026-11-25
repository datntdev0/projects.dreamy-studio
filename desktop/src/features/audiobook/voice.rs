use crate::features::backend::service::Synthesizer;
use crate::features::library::models::LibraryError;
use crate::features::library::models::LibraryErrorCode;
use crate::features::library::service::LibraryWorkspace;
use crate::features::library::voices;
use crate::features::project::models::ProjectError;
use crate::features::project::models::ProjectErrorCode;
use crate::features::project::models::ProjectResult;
use std::sync::Arc;

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Speech {
    pub wav: Vec<u8>,
    pub subtitles: Option<String>,
}

pub trait SegmentVoice: Send + Sync {
    fn speak(&self, voice_id: i64, text: &str, pause_ms: i64) -> ProjectResult<Speech>;
}

pub struct LibrarySpeaker {
    library: LibraryWorkspace,
    synthesizer: Arc<dyn Synthesizer>,
}

impl LibrarySpeaker {
    pub fn new(library: LibraryWorkspace, synthesizer: Arc<dyn Synthesizer>) -> Self {
        Self {
            library,
            synthesizer,
        }
    }
}

impl SegmentVoice for LibrarySpeaker {
    fn speak(&self, voice_id: i64, text: &str, pause_ms: i64) -> ProjectResult<Speech> {
        let (voice, reference) = self
            .library
            .voice_for_synthesis(voice_id)
            .map_err(voice_error)?;
        voices::synthesize(
            self.synthesizer.as_ref(),
            &voice,
            reference.as_deref(),
            text,
            pause_ms,
        )
        .map(|audio| Speech {
            wav: audio.bytes,
            subtitles: audio.subtitles,
        })
        .map_err(voice_error)
    }
}

pub fn voice_error(error: LibraryError) -> ProjectError {
    let code = match error.code {
        LibraryErrorCode::NoWorkspace => ProjectErrorCode::NoWorkspace,
        LibraryErrorCode::VoiceNotFound => ProjectErrorCode::NotFound,
        LibraryErrorCode::VoiceBackendOffline
        | LibraryErrorCode::VoiceEngineUnavailable
        | LibraryErrorCode::VoiceSynthesisFailed => ProjectErrorCode::BackendFailed,
        LibraryErrorCode::Io => ProjectErrorCode::Io,
        LibraryErrorCode::Db => ProjectErrorCode::Db,
        _ => ProjectErrorCode::InvalidInput,
    };
    ProjectError::new(code, error.detail)
}
