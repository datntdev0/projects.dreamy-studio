use crate::features::assistant::grants::Grant;
use crate::features::assistant::models::AssistantError;
use crate::features::assistant::models::AssistantEvent;
use crate::features::assistant::models::AssistantEventSink;
use crate::features::assistant::models::AssistantResult;
use crate::features::assistant::models::AssistantScope;
use crate::features::assistant::models::AssistantSession;
use crate::features::assistant::models::AssistantSessionSummary;
use crate::features::assistant::server::McpHost;
use crate::features::assistant::service::AssistantService;
use crate::features::assistant::sources::Sources;
use crate::features::knowledge::service::KnowledgeService;
use crate::features::novel::models::NovelError;
use crate::features::novel::service::NovelService;
use crate::features::workspace::session::WorkspaceSession;
use serde_json::Value;
use std::sync::Arc;
use tauri::AppHandle;
use tauri::Manager;
use tauri::async_runtime::spawn_blocking;
use tauri::ipc::Channel;

const WORKSPACE_CLOSED: &str = "workspace is no longer open";

pub struct ChannelSink(pub Channel<AssistantEvent>);

impl AssistantEventSink for ChannelSink {
    fn emit(&self, event: AssistantEvent) {
        let _ = self.0.send(event);
    }
}

pub struct AppMcpHost(pub AppHandle);

impl McpHost for AppMcpHost {
    fn open(&self, grant: &Grant) -> Result<Sources, String> {
        let novels = self.0.state::<NovelService>();
        let knowledge = self.0.state::<KnowledgeService>();
        let session = self.0.state::<WorkspaceSession>();
        open_sources(&novels, &knowledge, &session, grant)
    }
}

pub fn open_sources(
    novels: &NovelService,
    knowledge: &KnowledgeService,
    session: &WorkspaceSession,
    grant: &Grant,
) -> Result<Sources, String> {
    if !session.is_current(&grant.workspace) {
        return Err(WORKSPACE_CLOSED.to_string());
    }
    let novels = novels.open(session).map_err(|error| error.to_string())?;
    let knowledge = knowledge.open(session).map_err(|error| error.to_string())?;
    Ok(Sources {
        novels: Box::new(novels),
        knowledge: Box::new(knowledge),
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
    session: &WorkspaceSession,
    scope: AssistantScope,
) -> AssistantResult<AssistantSession> {
    service.open(session)?.create(scope)
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

pub fn send_message(
    service: &AssistantService,
    novels: &NovelService,
    session: &WorkspaceSession,
    session_id: &str,
    text: &str,
    context: Option<Value>,
    sink: Arc<dyn AssistantEventSink>,
) -> AssistantResult<AssistantSession> {
    let workspace = service.open(session)?;
    let source = novels.open(session).map_err(novel_failure)?;
    workspace.send(session_id, text, context, sink, &source)
}

fn novel_failure(error: NovelError) -> AssistantError {
    AssistantError::storage(error.to_string())
}

fn task_failure(error: tauri::Error) -> AssistantError {
    AssistantError::storage(error.to_string())
}

async fn run_blocking<T, F>(app: AppHandle, job: F) -> AssistantResult<T>
where
    T: Send + 'static,
    F: FnOnce(&AssistantService, &NovelService, &WorkspaceSession) -> AssistantResult<T>
        + Send
        + 'static,
{
    let task = spawn_blocking(move || {
        let service = app.state::<AssistantService>();
        let novels = app.state::<NovelService>();
        let session = app.state::<WorkspaceSession>();
        job(&service, &novels, &session)
    });
    match task.await {
        Ok(result) => result,
        Err(error) => Err(task_failure(error)),
    }
}

#[tauri::command]
pub async fn assistant_session_list(
    app: AppHandle,
) -> AssistantResult<Vec<AssistantSessionSummary>> {
    run_blocking(app, |service, _, session| list_sessions(service, session)).await
}

#[tauri::command]
pub async fn assistant_session_get(
    app: AppHandle,
    id: String,
) -> AssistantResult<AssistantSession> {
    run_blocking(app, move |service, _, session| {
        get_session(service, session, &id)
    })
    .await
}

#[tauri::command]
pub async fn assistant_session_create(
    app: AppHandle,
    scope: AssistantScope,
) -> AssistantResult<AssistantSession> {
    run_blocking(app, move |service, _, session| {
        create_session(service, session, scope)
    })
    .await
}

#[tauri::command]
pub async fn assistant_message_send(
    app: AppHandle,
    session_id: String,
    text: String,
    context: Option<Value>,
    on_event: Channel<AssistantEvent>,
) -> AssistantResult<AssistantSession> {
    let sink: Arc<dyn AssistantEventSink> = Arc::new(ChannelSink(on_event));
    run_blocking(app, move |service, novels, session| {
        send_message(service, novels, session, &session_id, &text, context, sink)
    })
    .await
}

#[tauri::command]
pub async fn assistant_session_permit(
    app: AppHandle,
    id: String,
    edit_granted: bool,
) -> AssistantResult<AssistantSession> {
    run_blocking(app, move |service, _, session| {
        permit_session(service, session, &id, edit_granted)
    })
    .await
}

#[tauri::command]
pub async fn assistant_session_delete(app: AppHandle, id: String) -> AssistantResult<()> {
    run_blocking(app, move |service, _, session| {
        delete_session(service, session, &id)
    })
    .await
}

#[cfg(test)]
#[path = "../../test/commands/assistant.test.rs"]
mod tests;
