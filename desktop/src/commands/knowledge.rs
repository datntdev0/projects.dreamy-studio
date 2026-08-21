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

#[cfg(test)]
#[path = "../../test/commands/knowledge.test.rs"]
mod tests;
