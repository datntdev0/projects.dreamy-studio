use crate::commands::blocking::run_blocking_with;
use crate::features::audiobook::models::MixSettings;
use crate::features::backend::service::BackendService;
use crate::features::library::models::LibraryError;
use crate::features::library::models::LibraryErrorCode;
use crate::features::library::models::LibraryResult;
use crate::features::library::models::LibraryVoice;
use crate::features::library::models::VoiceInput;
use crate::features::library::models::VoicePatch;
use crate::features::library::service::LibraryService;
use crate::features::library::voices;
use crate::features::workspace::session::WorkspaceSession;
use tauri::AppHandle;
use tauri::Manager;
use tauri::Runtime;
use tauri::ipc::Response;

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
    let audio = voices::synthesize(
        backend,
        &voice,
        reference.as_deref(),
        &text,
        MixSettings::default().sentence_pause_ms(),
    )?;
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
pub async fn library_voice_duplicate<R: Runtime>(
    app: AppHandle<R>,
    id: i64,
    name: String,
) -> LibraryResult<LibraryVoice> {
    run_blocking(app, move |app| {
        let (library, session) = library_job(app);
        library.open(&session)?.voice_duplicate(id, &name)
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
