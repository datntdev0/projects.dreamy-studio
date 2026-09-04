use crate::commands::blocking::run_blocking_with;
use crate::features::backend::models::SynthesisRequest;
use crate::features::backend::service::BackendService;
use crate::features::library::models::LibraryError;
use crate::features::library::models::LibraryErrorCode;
use crate::features::library::models::LibraryResult;
use crate::features::library::models::LibraryVoice;
use crate::features::library::models::VoiceEngineKind;
use crate::features::library::models::VoiceInput;
use crate::features::library::models::VoicePatch;
use crate::features::library::service::LibraryService;
use crate::features::library::voices;
use crate::features::workspace::session::WorkspaceSession;
use crate::infra::backend_client::ClientError;
use std::path::Path;
use tauri::AppHandle;
use tauri::Manager;
use tauri::Runtime;
use tauri::ipc::Response;

const ENGINE_UNAVAILABLE_CODES: [&str; 4] = [
    "MODEL_NOT_FOUND",
    "MODEL_NOT_INSTALLED",
    "MODEL_BUSY",
    "ENGINE_UNSUPPORTED",
];

fn task_failure(error: tauri::Error) -> LibraryError {
    LibraryError::new(LibraryErrorCode::Task, error.to_string())
}

async fn run_blocking<R: Runtime, T, F>(app: AppHandle<R>, job: F) -> LibraryResult<T>
where
    T: Send + 'static,
    F: FnOnce(&AppHandle<R>) -> LibraryResult<T> + Send + 'static,
{
    run_blocking_with(app, task_failure, job).await
}

fn library_job<R: Runtime>(
    app: &AppHandle<R>,
) -> (
    tauri::State<'_, LibraryService>,
    tauri::State<'_, WorkspaceSession>,
) {
    (
        app.state::<LibraryService>(),
        app.state::<WorkspaceSession>(),
    )
}

pub fn synthesis_error(error: ClientError) -> LibraryError {
    match error {
        ClientError::Unreachable(detail) => {
            LibraryError::new(LibraryErrorCode::VoiceBackendOffline, detail)
        }
        ClientError::Api { code, message, .. }
            if ENGINE_UNAVAILABLE_CODES.contains(&code.as_str()) =>
        {
            LibraryError::new(LibraryErrorCode::VoiceEngineUnavailable, message)
        }
        ClientError::Api { code, message, .. } => LibraryError::new(
            LibraryErrorCode::VoiceSynthesisFailed,
            format!("{code}: {message}"),
        ),
        ClientError::Invalid(detail) => {
            LibraryError::new(LibraryErrorCode::VoiceSynthesisFailed, detail)
        }
    }
}

pub fn synthesis_request(
    voice: &LibraryVoice,
    reference: Option<&Path>,
    text: &str,
) -> LibraryResult<SynthesisRequest> {
    if voice.engine_kind == VoiceEngineKind::Cloud {
        return Err(LibraryError::new(
            LibraryErrorCode::VoiceEngineUnavailable,
            "cloud voices cannot be previewed yet",
        ));
    }
    Ok(SynthesisRequest {
        model: voice.engine.clone(),
        text: text.to_string(),
        source: voice.source.as_str().to_string(),
        language: voice.language.clone(),
        gender: voice.gender.as_str().to_string(),
        preset: voice.preset.clone().unwrap_or_default(),
        prompt: voice.prompt.clone(),
        reference_path: reference
            .map(|path| path.to_string_lossy().into_owned())
            .unwrap_or_default(),
    })
}

pub fn preview_voice(
    library: &LibraryService,
    session: &WorkspaceSession,
    backend: &BackendService,
    id: i64,
    text: Option<String>,
) -> LibraryResult<Vec<u8>> {
    let workspace = library.open(session)?;
    let (voice, reference) = workspace.voice_for_synthesis(id)?;
    let text = voices::normalize_sample_text(text.as_deref().unwrap_or(&voice.sample_text))?;
    let request = synthesis_request(&voice, reference.as_deref(), &text)?;
    let audio = backend.synthesize(&request).map_err(synthesis_error)?;
    if let Some(duration_ms) = audio.duration_ms {
        workspace.voice_record_duration(id, &text, duration_ms)?;
    }
    Ok(audio.bytes)
}

#[tauri::command]
pub async fn library_voice_list<R: Runtime>(app: AppHandle<R>) -> LibraryResult<Vec<LibraryVoice>> {
    run_blocking(app, |app| {
        let (library, session) = library_job(app);
        library.open(&session)?.voice_list()
    })
    .await
}

#[tauri::command]
pub async fn library_voice_create<R: Runtime>(
    app: AppHandle<R>,
    input: VoiceInput,
) -> LibraryResult<LibraryVoice> {
    run_blocking(app, move |app| {
        let (library, session) = library_job(app);
        library.open(&session)?.voice_create(input)
    })
    .await
}

#[tauri::command]
pub async fn library_voice_update<R: Runtime>(
    app: AppHandle<R>,
    id: i64,
    patch: VoicePatch,
) -> LibraryResult<LibraryVoice> {
    run_blocking(app, move |app| {
        let (library, session) = library_job(app);
        library.open(&session)?.voice_update(id, patch)
    })
    .await
}

#[tauri::command]
pub async fn library_voice_delete<R: Runtime>(
    app: AppHandle<R>,
    ids: Vec<i64>,
) -> LibraryResult<usize> {
    run_blocking(app, move |app| {
        let (library, session) = library_job(app);
        library.open(&session)?.voice_delete(&ids)
    })
    .await
}

#[tauri::command]
pub async fn library_voice_preview<R: Runtime>(
    app: AppHandle<R>,
    id: i64,
    text: Option<String>,
) -> LibraryResult<Response> {
    let bytes = run_blocking(app, move |app| {
        let (library, session) = library_job(app);
        preview_voice(&library, &session, &app.state::<BackendService>(), id, text)
    })
    .await?;
    Ok(Response::new(bytes))
}

#[cfg(test)]
#[path = "../../test/commands/library_voices.test.rs"]
mod tests;
