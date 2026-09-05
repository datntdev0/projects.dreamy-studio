use crate::commands::project::run_blocking;
use crate::features::audiobook::service::AudiobookWorkspace;
use crate::features::project::models::ProjectResult;
use crate::features::project::service::ProjectService;
use crate::features::workspace::session::WorkspaceSession;
use serde_json::Value;
use tauri::AppHandle;
use tauri::Runtime;

pub fn get_audiobook(
    service: &ProjectService,
    session: &WorkspaceSession,
    project_id: i64,
) -> ProjectResult<Option<Value>> {
    AudiobookWorkspace::new(service.open(session)?).get(project_id)
}

#[tauri::command]
pub async fn audiobook_get<R: Runtime>(
    app: AppHandle<R>,
    project_id: i64,
) -> ProjectResult<Option<Value>> {
    run_blocking(app, move |service, session| {
        get_audiobook(service, session, project_id)
    })
    .await
}

#[cfg(test)]
#[path = "../../test/commands/audiobook.test.rs"]
mod tests;
