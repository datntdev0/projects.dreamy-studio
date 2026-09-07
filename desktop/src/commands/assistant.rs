use crate::commands::blocking::run_blocking_with;
use crate::features::assistant::grants::Grant;
use crate::features::assistant::models::AssistantContext;
use crate::features::assistant::models::AssistantError;
use crate::features::assistant::models::AssistantEvent;
use crate::features::assistant::models::AssistantEventSink;
use crate::features::assistant::models::AssistantResult;
use crate::features::assistant::models::AssistantScope;
use crate::features::assistant::models::AssistantSession;
use crate::features::assistant::models::AssistantSessionSummary;
use crate::features::assistant::models::Decision;
use crate::features::assistant::server::McpHost;
use crate::features::assistant::service::AssistantService;
use crate::features::assistant::sources::ProjectScripts;
use crate::features::assistant::sources::Sources;
use crate::features::assistant::sources::WorkspacePipelines;
use crate::features::audiobook::service::AudiobookWorkspace;
use crate::features::knowledge::service::KnowledgeService;
use crate::features::novel::models::NovelError;
use crate::features::novel::service::NovelService;
use crate::features::pipeline::executor::PipelineExecutor;
use crate::features::project::models::ProjectError;
use crate::features::project::service::ProjectService;
use crate::features::translation::service::TranslationService;
use crate::features::workspace::session::WorkspaceSession;
use serde_json::Value;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::AppHandle;
use tauri::Manager;
use tauri::Runtime;
use tauri::ipc::Channel;

const WORKSPACE_CLOSED: &str = "workspace is no longer open";

pub struct ChannelSink(pub Channel<AssistantEvent>);

impl AssistantEventSink for ChannelSink {
    fn emit(&self, event: AssistantEvent) {
        let _ = self.0.send(event);
    }
}

pub struct AppMcpHost<R: Runtime>(pub AppHandle<R>);

impl<R: Runtime> McpHost for AppMcpHost<R> {
    fn open(&self, grant: &Grant) -> Result<Sources, String> {
        let novels = self.0.state::<NovelService>();
        let knowledge = self.0.state::<KnowledgeService>();
        let translation = self.0.state::<TranslationService>();
        let projects = self.0.state::<ProjectService>();
        let executor = self.0.state::<PipelineExecutor>();
        let session = self.0.state::<WorkspaceSession>();
        let services = SourceServices {
            novels: &novels,
            knowledge: &knowledge,
            translation: &translation,
            projects: &projects,
            executor: &executor,
        };
        open_sources(&services, &session, grant)
    }
}

pub fn open_sources(
    services: &SourceServices,
    session: &WorkspaceSession,
    grant: &Grant,
) -> Result<Sources, String> {
    if !session.is_current(&grant.workspace) {
        return Err(WORKSPACE_CLOSED.to_string());
    }
    build_sources(services, session)
}

fn build_sources(services: &SourceServices, session: &WorkspaceSession) -> Result<Sources, String> {
    let novels = services
        .novels
        .open(session)
        .map_err(|error| error.to_string())?;
    let knowledge = services
        .knowledge
        .open(session)
        .map_err(|error| error.to_string())?;
    let translation = services
        .translation
        .open(session)
        .map_err(|error| error.to_string())?;
    let projects = services
        .projects
        .open(session)
        .map_err(|error| error.to_string())?;
    let workspace = session
        .current()
        .ok_or_else(|| WORKSPACE_CLOSED.to_string())?;
    Ok(Sources {
        novels: Box::new(novels),
        knowledge: Box::new(knowledge),
        translation: Box::new(translation),
        scripts: Box::new(ProjectScripts::new(projects.clone())),
        audiobooks: Box::new(AudiobookWorkspace::new(projects.clone())),
        pipelines: Box::new(WorkspacePipelines::new(
            PathBuf::from(workspace.path),
            services.executor.clone(),
        )),
        projects: Box::new(projects),
    })
}

pub fn list_sessions(
    service: &AssistantService,
    session: &WorkspaceSession,
) -> AssistantResult<Vec<AssistantSessionSummary>> {
    service.open(session)?.list()
}

pub fn get_session(
    service: &AssistantService,
    session: &WorkspaceSession,
    id: &str,
) -> AssistantResult<AssistantSession> {
    service.open(session)?.get(id)
}

pub fn create_session(
    service: &AssistantService,
    novels: &NovelService,
    projects: &ProjectService,
    session: &WorkspaceSession,
    scope: AssistantScope,
) -> AssistantResult<AssistantSession> {
    let workspace = service.open(session)?;
    let novel_source = novels.open(session).map_err(novel_failure)?;
    let project_source = projects.open(session).map_err(project_failure)?;
    workspace.create(scope, &novel_source, &project_source)
}

pub fn permit_session(
    service: &AssistantService,
    session: &WorkspaceSession,
    id: &str,
    granted: bool,
) -> AssistantResult<AssistantSession> {
    service.open(session)?.permit(id, granted)
}

pub fn delete_session(
    service: &AssistantService,
    session: &WorkspaceSession,
    id: &str,
) -> AssistantResult<()> {
    service.open(session)?.delete(id)
}

pub struct SendInput<'a> {
    pub session_id: &'a str,
    pub text: &'a str,
    pub context: Option<Value>,
}

pub struct SourceServices<'a> {
    pub novels: &'a NovelService,
    pub knowledge: &'a KnowledgeService,
    pub translation: &'a TranslationService,
    pub projects: &'a ProjectService,
    pub executor: &'a PipelineExecutor,
}

pub fn send_message(
    service: &AssistantService,
    services: &SourceServices,
    session: &WorkspaceSession,
    input: SendInput,
    sink: Arc<dyn AssistantEventSink>,
) -> AssistantResult<AssistantSession> {
    let workspace = service.open(session)?;
    let context = parse_context(input.context)?;
    let sources = build_sources(services, session).map_err(AssistantError::storage)?;
    workspace.send(input.session_id, input.text, context, sink, &sources)
}

pub struct ResolveInput<'a> {
    pub session_id: &'a str,
    pub message_id: &'a str,
    pub item_ids: &'a [String],
    pub status: &'a str,
    pub pipeline_id: Option<i64>,
}

pub fn resolve_proposal(
    service: &AssistantService,
    services: &SourceServices,
    session: &WorkspaceSession,
    input: ResolveInput,
) -> AssistantResult<AssistantSession> {
    let workspace = service.open(session)?;
    let status = Decision::parse(input.status)
        .ok_or_else(|| AssistantError::invalid(format!("unknown decision '{}'", input.status)))?;
    let sources = build_sources(services, session).map_err(AssistantError::storage)?;
    workspace.resolve(
        input.session_id,
        input.message_id,
        input.item_ids,
        status,
        input.pipeline_id,
        &sources,
    )
}

fn parse_context(context: Option<Value>) -> AssistantResult<Option<AssistantContext>> {
    match context {
        None | Some(Value::Null) => Ok(None),
        Some(value) => serde_json::from_value(value)
            .map(Some)
            .map_err(|error| AssistantError::invalid(format!("bad context: {error}"))),
    }
}

fn novel_failure(error: NovelError) -> AssistantError {
    AssistantError::storage(error.to_string())
}

fn project_failure(error: ProjectError) -> AssistantError {
    AssistantError::storage(error.to_string())
}

fn task_failure(error: tauri::Error) -> AssistantError {
    AssistantError::storage(error.to_string())
}

async fn run_blocking<R: Runtime, T, F>(app: AppHandle<R>, job: F) -> AssistantResult<T>
where
    T: Send + 'static,
    F: FnOnce(&AssistantService, &NovelService, &WorkspaceSession) -> AssistantResult<T>
        + Send
        + 'static,
{
    run_blocking_with(app, task_failure, move |app| {
        let service = app.state::<AssistantService>();
        let novels = app.state::<NovelService>();
        let session = app.state::<WorkspaceSession>();
        job(&service, &novels, &session)
    })
    .await
}

#[tauri::command]
pub async fn assistant_session_list<R: Runtime>(
    app: AppHandle<R>,
) -> AssistantResult<Vec<AssistantSessionSummary>> {
    run_blocking(app, |service, _, session| list_sessions(service, session)).await
}

#[tauri::command]
pub async fn assistant_session_get<R: Runtime>(
    app: AppHandle<R>,
    id: String,
) -> AssistantResult<AssistantSession> {
    run_blocking(app, move |service, _, session| {
        get_session(service, session, &id)
    })
    .await
}

#[tauri::command]
pub async fn assistant_session_create<R: Runtime>(
    app: AppHandle<R>,
    scope: AssistantScope,
) -> AssistantResult<AssistantSession> {
    let handle = app.clone();
    run_blocking(app, move |service, novels, session| {
        let projects = handle.state::<ProjectService>();
        create_session(service, novels, &projects, session, scope)
    })
    .await
}

#[tauri::command]
pub async fn assistant_message_send<R: Runtime>(
    app: AppHandle<R>,
    session_id: String,
    text: String,
    context: Option<Value>,
    on_event: Channel<AssistantEvent>,
) -> AssistantResult<AssistantSession> {
    let sink: Arc<dyn AssistantEventSink> = Arc::new(ChannelSink(on_event));
    let handle = app.clone();
    run_blocking(app, move |service, novels, session| {
        let knowledge = handle.state::<KnowledgeService>();
        let translation = handle.state::<TranslationService>();
        let projects = handle.state::<ProjectService>();
        let executor = handle.state::<PipelineExecutor>();
        let services = SourceServices {
            novels,
            knowledge: &knowledge,
            translation: &translation,
            projects: &projects,
            executor: &executor,
        };
        let input = SendInput {
            session_id: &session_id,
            text: &text,
            context,
        };
        send_message(service, &services, session, input, sink)
    })
    .await
}

#[tauri::command]
pub async fn assistant_proposal_resolve<R: Runtime>(
    app: AppHandle<R>,
    session_id: String,
    message_id: String,
    item_ids: Vec<String>,
    status: String,
    pipeline_id: Option<i64>,
) -> AssistantResult<AssistantSession> {
    let handle = app.clone();
    run_blocking(app, move |service, novels, session| {
        let knowledge = handle.state::<KnowledgeService>();
        let translation = handle.state::<TranslationService>();
        let projects = handle.state::<ProjectService>();
        let executor = handle.state::<PipelineExecutor>();
        let services = SourceServices {
            novels,
            knowledge: &knowledge,
            translation: &translation,
            projects: &projects,
            executor: &executor,
        };
        let input = ResolveInput {
            session_id: &session_id,
            message_id: &message_id,
            item_ids: &item_ids,
            status: &status,
            pipeline_id,
        };
        resolve_proposal(service, &services, session, input)
    })
    .await
}

#[tauri::command]
pub async fn assistant_session_permit<R: Runtime>(
    app: AppHandle<R>,
    id: String,
    edit_granted: bool,
) -> AssistantResult<AssistantSession> {
    run_blocking(app, move |service, _, session| {
        permit_session(service, session, &id, edit_granted)
    })
    .await
}

#[tauri::command]
pub async fn assistant_session_delete<R: Runtime>(
    app: AppHandle<R>,
    id: String,
) -> AssistantResult<()> {
    run_blocking(app, move |service, _, session| {
        delete_session(service, session, &id)
    })
    .await
}

#[cfg(test)]
#[path = "../../test/commands/assistant.test.rs"]
mod tests;
