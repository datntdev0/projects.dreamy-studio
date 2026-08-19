use crate::features::pipeline::executor::PipelineExecutor;
use crate::features::pipeline::executor::PipelineStart;
use crate::features::pipeline::models::PipelineError;
use crate::features::pipeline::models::PipelineErrorCode;
use crate::features::pipeline::models::PipelineEvent;
use crate::features::pipeline::models::PipelineResult;
use crate::features::pipeline::models::PipelineSnapshot;
use crate::features::pipeline::models::PipelineTarget;
use crate::features::pipeline::models::TaskRequest;
use crate::features::pipeline::repository::PipelineRepository;
use crate::features::translation::service::TranslationService;
use crate::features::workspace::inspector::WORKSPACE_DB_FILE;
use crate::features::workspace::session::WorkspaceSession;
use crate::infra::storage::database::Database;
use std::path::Path;
use std::sync::Arc;
use tauri::AppHandle;
use tauri::Manager;
use tauri::async_runtime::spawn_blocking;
use tauri::ipc::Channel;

impl PipelineTarget for Channel<PipelineEvent> {
    fn deliver(&self, event: PipelineEvent) -> Result<(), String> {
        self.send(event).map_err(|error| error.to_string())
    }
}

pub fn start_pipeline(
    executor: &PipelineExecutor,
    translation: &TranslationService,
    session: &WorkspaceSession,
    novel_id: i64,
    target: String,
    tasks: Vec<TaskRequest>,
    sink: Arc<dyn PipelineTarget>,
) -> PipelineResult<PipelineSnapshot> {
    let workspace = translation.open(session)?;
    executor.start(
        workspace,
        PipelineStart {
            novel_id,
            target,
            tasks,
        },
        sink,
    )
}

pub fn cancel_pipeline(executor: &PipelineExecutor) -> bool {
    executor.cancel()
}

pub fn list_history(
    session: &WorkspaceSession,
    novel_id: i64,
    limit: Option<i64>,
) -> PipelineResult<Vec<PipelineSnapshot>> {
    let workspace = session.current().ok_or_else(|| {
        PipelineError::new(PipelineErrorCode::NoWorkspace, "no workspace is open")
    })?;
    let limit = limit.unwrap_or(20).clamp(1, 100);
    let database = Database::open_read_only(&Path::new(&workspace.path).join(WORKSPACE_DB_FILE))?;
    Ok(PipelineRepository::new(database.connection()).list_history(novel_id, limit)?)
}

fn task_failure(error: tauri::Error) -> PipelineError {
    PipelineError::new(PipelineErrorCode::Task, error.to_string())
}

async fn run_blocking<T, F>(app: AppHandle, job: F) -> PipelineResult<T>
where
    T: Send + 'static,
    F: FnOnce(&PipelineExecutor, &TranslationService, &WorkspaceSession) -> PipelineResult<T>
        + Send
        + 'static,
{
    let task = spawn_blocking(move || {
        let executor = app.state::<PipelineExecutor>();
        let translation = app.state::<TranslationService>();
        let session = app.state::<WorkspaceSession>();
        job(&executor, &translation, &session)
    });
    match task.await {
        Ok(result) => result,
        Err(error) => Err(task_failure(error)),
    }
}

#[tauri::command]
pub async fn pipeline_start(
    app: AppHandle,
    novel_id: i64,
    target: String,
    tasks: Vec<TaskRequest>,
    on_event: Channel<PipelineEvent>,
) -> PipelineResult<PipelineSnapshot> {
    let sink: Arc<dyn PipelineTarget> = Arc::new(on_event);
    run_blocking(app, move |executor, translation, session| {
        start_pipeline(
            executor,
            translation,
            session,
            novel_id,
            target,
            tasks,
            sink,
        )
    })
    .await
}

#[tauri::command]
pub fn pipeline_cancel(app: AppHandle) -> bool {
    app.state::<PipelineExecutor>().cancel()
}

#[tauri::command]
pub async fn pipeline_history_list(
    app: AppHandle,
    novel_id: i64,
    limit: Option<i64>,
) -> PipelineResult<Vec<PipelineSnapshot>> {
    run_blocking(app, move |_, _, session| {
        list_history(session, novel_id, limit)
    })
    .await
}

#[cfg(test)]
#[path = "../../test/commands/pipeline.test.rs"]
mod tests;
