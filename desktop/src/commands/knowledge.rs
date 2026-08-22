use crate::features::knowledge::models::KnowledgeEdit;
use crate::features::knowledge::models::KnowledgeEditResult;
use crate::features::knowledge::models::KnowledgeError;
use crate::features::knowledge::models::KnowledgeErrorCode;
use crate::features::knowledge::models::KnowledgeResult;
use crate::features::knowledge::models::WireKnowledge;
use crate::features::knowledge::service::KnowledgeService;
use crate::features::workspace::session::WorkspaceSession;
use tauri::AppHandle;
use tauri::Manager;
use tauri::async_runtime::spawn_blocking;

pub fn get(
    service: &KnowledgeService,
    session: &WorkspaceSession,
    novel_id: i64,
    lang: &str,
) -> KnowledgeResult<WireKnowledge> {
    service.open(session)?.get(novel_id, lang)
}

pub fn edit(
    service: &KnowledgeService,
    session: &WorkspaceSession,
    novel_id: i64,
    lang: &str,
    edits: Vec<KnowledgeEdit>,
) -> KnowledgeResult<KnowledgeEditResult> {
    service.open(session)?.edit(novel_id, lang, edits)
}

pub fn stale_accept(
    service: &KnowledgeService,
    session: &WorkspaceSession,
    novel_id: i64,
    lang: &str,
    chapters: &[i64],
) -> KnowledgeResult<WireKnowledge> {
    service
        .open(session)?
        .stale_accept(novel_id, lang, chapters)
}

fn task_failure(error: tauri::Error) -> KnowledgeError {
    KnowledgeError::new(KnowledgeErrorCode::Task, error.to_string())
}

async fn run_blocking<T, F>(app: AppHandle, job: F) -> KnowledgeResult<T>
where
    T: Send + 'static,
    F: FnOnce(&KnowledgeService, &WorkspaceSession) -> KnowledgeResult<T> + Send + 'static,
{
    let task = spawn_blocking(move || {
        let service = app.state::<KnowledgeService>();
        let session = app.state::<WorkspaceSession>();
        job(&service, &session)
    });
    match task.await {
        Ok(result) => result,
        Err(error) => Err(task_failure(error)),
    }
}

#[tauri::command]
pub async fn knowledge_get(
    app: AppHandle,
    novel_id: i64,
    lang: String,
) -> KnowledgeResult<WireKnowledge> {
    run_blocking(app, move |service, session| {
        get(service, session, novel_id, &lang)
    })
    .await
}

#[tauri::command]
pub async fn knowledge_edit(
    app: AppHandle,
    novel_id: i64,
    lang: String,
    edits: Vec<KnowledgeEdit>,
) -> KnowledgeResult<KnowledgeEditResult> {
    run_blocking(app, move |service, session| {
        edit(service, session, novel_id, &lang, edits)
    })
    .await
}

#[tauri::command]
pub async fn knowledge_stale_accept(
    app: AppHandle,
    novel_id: i64,
    lang: String,
    chapters: Vec<i64>,
) -> KnowledgeResult<WireKnowledge> {
    run_blocking(app, move |service, session| {
        stale_accept(service, session, novel_id, &lang, &chapters)
    })
    .await
}

#[cfg(test)]
#[path = "../../test/commands/knowledge.test.rs"]
mod tests;
