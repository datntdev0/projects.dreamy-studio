use crate::commands::blocking::run_blocking_with;
use crate::commands::project::run_blocking;
use crate::commands::project::task_failure;
use crate::features::audiobook::models::AudioRecord;
use crate::features::audiobook::models::Audiobook;
use crate::features::audiobook::models::AudiobookConfig;
use crate::features::audiobook::models::ExportFormat;
use crate::features::audiobook::models::ExportReply;
use crate::features::audiobook::models::MixSettings;
use crate::features::audiobook::models::SegmentRequest;
use crate::features::audiobook::models::UnitAudio;
use crate::features::audiobook::service::AudiobookWorkspace;
use crate::features::audiobook::voice::LibrarySpeaker;
use crate::features::audiobook::voice::voice_error;
use crate::features::backend::models::SynthesisRequest;
use crate::features::backend::models::SynthesizedAudio;
use crate::features::backend::service::BackendService;
use crate::features::backend::service::Synthesizer;
use crate::features::library::service::LibraryService;
use crate::features::project::models::ProjectResult;
use crate::features::project::service::ProjectService;
use crate::features::workspace::session::WorkspaceSession;
use crate::infra::backend_client::ClientError;
use std::sync::Arc;
use tauri::AppHandle;
use tauri::Manager;
use tauri::Runtime;
use tauri::ipc::Response;

pub struct AppSynthesizer<R: Runtime> {
    app: AppHandle<R>,
}

impl<R: Runtime> AppSynthesizer<R> {
    pub fn new(app: AppHandle<R>) -> Self {
        Self { app }
    }
}

impl<R: Runtime> Synthesizer for AppSynthesizer<R> {
    fn synthesize(&self, request: &SynthesisRequest) -> Result<SynthesizedAudio, ClientError> {
        self.app.state::<BackendService>().synthesize(request)
    }
}

pub struct VoiceContext<'a> {
    pub library: &'a LibraryService,
    pub synthesizer: Arc<dyn Synthesizer>,
}

fn audiobook(
    service: &ProjectService,
    session: &WorkspaceSession,
) -> ProjectResult<AudiobookWorkspace> {
    Ok(AudiobookWorkspace::new(service.open(session)?))
}

fn speaker(context: VoiceContext<'_>, session: &WorkspaceSession) -> ProjectResult<LibrarySpeaker> {
    let library = context.library.open(session).map_err(voice_error)?;
    Ok(LibrarySpeaker::new(library, context.synthesizer))
}

pub fn get_audiobook(
    service: &ProjectService,
    session: &WorkspaceSession,
    project_id: i64,
) -> ProjectResult<Option<Audiobook>> {
    audiobook(service, session)?.get(project_id)
}

pub fn get_unit(
    service: &ProjectService,
    session: &WorkspaceSession,
    project_id: i64,
    unit_id: &str,
) -> ProjectResult<UnitAudio> {
    audiobook(service, session)?.unit_get(project_id, unit_id)
}

pub fn save_config(
    service: &ProjectService,
    session: &WorkspaceSession,
    project_id: i64,
    config: AudiobookConfig,
) -> ProjectResult<()> {
    audiobook(service, session)?.config_save(project_id, config)
}

pub fn save_mix(
    service: &ProjectService,
    session: &WorkspaceSession,
    project_id: i64,
    unit_id: &str,
    mix: MixSettings,
) -> ProjectResult<MixSettings> {
    audiobook(service, session)?.mix_save(project_id, unit_id, mix)
}

pub fn set_flag(
    service: &ProjectService,
    session: &WorkspaceSession,
    project_id: i64,
    segment: (&str, &str),
    flag: &str,
) -> ProjectResult<AudioRecord> {
    let (unit_id, block_id) = segment;
    audiobook(service, session)?.flag_set(project_id, unit_id, block_id, flag)
}

pub fn segment_audio(
    service: &ProjectService,
    session: &WorkspaceSession,
    project_id: i64,
    segment: (&str, &str),
) -> ProjectResult<Vec<u8>> {
    let (unit_id, block_id) = segment;
    audiobook(service, session)?.segment_audio(project_id, unit_id, block_id)
}

pub fn generate_segment(
    service: &ProjectService,
    session: &WorkspaceSession,
    context: VoiceContext<'_>,
    project_id: i64,
    segment: (&str, &str),
    request: &SegmentRequest,
) -> ProjectResult<AudioRecord> {
    let (unit_id, block_id) = segment;
    let workspace = audiobook(service, session)?;
    let voice = speaker(context, session)?;
    workspace.generate(project_id, unit_id, block_id, request, &voice)
}

pub fn preview_voice(
    service: &ProjectService,
    session: &WorkspaceSession,
    context: VoiceContext<'_>,
    project_id: i64,
    voice_id: i64,
    speed: f64,
    text: &str,
) -> ProjectResult<Vec<u8>> {
    let workspace = audiobook(service, session)?;
    let voice = speaker(context, session)?;
    workspace.preview(project_id, voice_id, speed, text, &voice)
}

pub fn export_unit(
    service: &ProjectService,
    session: &WorkspaceSession,
    project_id: i64,
    unit_id: &str,
    format: ExportFormat,
) -> ProjectResult<ExportReply> {
    audiobook(service, session)?.export(project_id, unit_id, format)
}

async fn run_voiced<R: Runtime, T, F>(app: AppHandle<R>, job: F) -> ProjectResult<T>
where
    T: Send + 'static,
    F: FnOnce(&ProjectService, &WorkspaceSession, VoiceContext<'_>) -> ProjectResult<T>
        + Send
        + 'static,
{
    run_blocking_with(app, task_failure, move |app| {
        let service = app.state::<ProjectService>();
        let session = app.state::<WorkspaceSession>();
        let library = app.state::<LibraryService>();
        let context = VoiceContext {
            library: &library,
            synthesizer: Arc::new(AppSynthesizer::new(app.clone())),
        };
        job(&service, &session, context)
    })
    .await
}

#[tauri::command]
pub async fn audiobook_get<R: Runtime>(
    app: AppHandle<R>,
    project_id: i64,
) -> ProjectResult<Option<Audiobook>> {
    run_blocking(app, move |service, session| {
        get_audiobook(service, session, project_id)
    })
    .await
}

#[tauri::command]
pub async fn audiobook_unit_get<R: Runtime>(
    app: AppHandle<R>,
    project_id: i64,
    unit_id: String,
) -> ProjectResult<UnitAudio> {
    run_blocking(app, move |service, session| {
        get_unit(service, session, project_id, &unit_id)
    })
    .await
}

#[tauri::command]
pub async fn audiobook_config_save<R: Runtime>(
    app: AppHandle<R>,
    project_id: i64,
    config: AudiobookConfig,
) -> ProjectResult<()> {
    run_blocking(app, move |service, session| {
        save_config(service, session, project_id, config)
    })
    .await
}

#[tauri::command]
pub async fn audiobook_mix_save<R: Runtime>(
    app: AppHandle<R>,
    project_id: i64,
    unit_id: String,
    mix: MixSettings,
) -> ProjectResult<MixSettings> {
    run_blocking(app, move |service, session| {
        save_mix(service, session, project_id, &unit_id, mix)
    })
    .await
}

#[tauri::command]
pub async fn audiobook_flag_set<R: Runtime>(
    app: AppHandle<R>,
    project_id: i64,
    unit_id: String,
    block_id: String,
    flag: String,
) -> ProjectResult<AudioRecord> {
    run_blocking(app, move |service, session| {
        set_flag(service, session, project_id, (&unit_id, &block_id), &flag)
    })
    .await
}

#[tauri::command]
pub async fn audiobook_segment_generate<R: Runtime>(
    app: AppHandle<R>,
    project_id: i64,
    unit_id: String,
    block_id: String,
    request: SegmentRequest,
) -> ProjectResult<AudioRecord> {
    run_voiced(app, move |service, session, context| {
        let segment = (unit_id.as_str(), block_id.as_str());
        generate_segment(service, session, context, project_id, segment, &request)
    })
    .await
}

#[tauri::command]
pub async fn audiobook_segment_audio<R: Runtime>(
    app: AppHandle<R>,
    project_id: i64,
    unit_id: String,
    block_id: String,
) -> ProjectResult<Response> {
    let bytes = run_blocking(app, move |service, session| {
        segment_audio(service, session, project_id, (&unit_id, &block_id))
    })
    .await?;
    Ok(Response::new(bytes))
}

#[tauri::command]
pub async fn audiobook_voice_preview<R: Runtime>(
    app: AppHandle<R>,
    project_id: i64,
    voice_id: i64,
    speed: f64,
    text: String,
) -> ProjectResult<Response> {
    let bytes = run_voiced(app, move |service, session, context| {
        preview_voice(
            service, session, context, project_id, voice_id, speed, &text,
        )
    })
    .await?;
    Ok(Response::new(bytes))
}

#[tauri::command]
pub async fn audiobook_export<R: Runtime>(
    app: AppHandle<R>,
    project_id: i64,
    unit_id: String,
    format: ExportFormat,
) -> ProjectResult<ExportReply> {
    run_blocking(app, move |service, session| {
        export_unit(service, session, project_id, &unit_id, format)
    })
    .await
}

#[cfg(test)]
#[path = "../../test/commands/audiobook.test.rs"]
mod tests;
