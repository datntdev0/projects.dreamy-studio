use crate::commands::blocking::run_blocking_with;
use crate::features::pipeline::executor::PipelineExecutor;
use crate::features::pipeline::executor::PipelineLimits;
use crate::features::pipeline::job::JobRegistry;
use crate::features::pipeline::jobs::translation::KIND_TRANSLATION;
use crate::features::pipeline::models::JobOwner;
use crate::features::pipeline::models::PipelineError;
use crate::features::pipeline::models::PipelineErrorCode;
use crate::features::pipeline::models::PipelineEvent;
use crate::features::pipeline::models::PipelineResult;
use crate::features::pipeline::models::PipelineSnapshot;
use crate::features::pipeline::models::PipelineTarget;
use crate::features::pipeline::models::TaskRequest;
use crate::features::pipeline::repository::PipelineRepository;
use crate::features::settings::models::PipelineSettings;
use crate::features::settings::service::SettingsService;
use crate::features::workspace::inspector::WORKSPACE_DB_FILE;
use crate::features::workspace::session::WorkspaceSession;
use crate::infra::storage::database::Database;
use serde_json::Map;
use serde_json::Value;
use std::path::Path;
use std::sync::Arc;
use tauri::AppHandle;
use tauri::Manager;
use tauri::Runtime;
use tauri::ipc::Channel;

impl PipelineTarget for Channel<PipelineEvent> {
    fn deliver(&self, event: PipelineEvent) -> Result<(), String> {
        self.send(event).map_err(|error| error.to_string())
    }
}

#[derive(Debug, Clone, Default)]
pub struct JobRequest {
    pub kind: Option<String>,
    pub novel_id: Option<i64>,
    pub project_id: Option<i64>,
    pub target: Option<String>,
    pub lang: Option<String>,
    pub params: Option<Value>,
}

pub fn job_params(
    target: Option<String>,
    lang: Option<String>,
    params: Option<Value>,
) -> PipelineResult<Value> {
    let mut merged = match params {
        None | Some(Value::Null) => Map::new(),
        Some(Value::Object(map)) => map,
        Some(_) => return Err(PipelineError::invalid("params must be an object")),
    };
    for (key, value) in [("target", target), ("lang", lang)] {
        if let Some(value) = value {
            merged.entry(key).or_insert(Value::String(value));
        }
    }
    Ok(Value::Object(merged))
}

pub fn start_pipeline(
    executor: &PipelineExecutor,
    registry: &JobRegistry,
    session: &WorkspaceSession,
    request: JobRequest,
    tasks: Vec<TaskRequest>,
    sink: Arc<dyn PipelineTarget>,
) -> PipelineResult<PipelineSnapshot> {
    let JobRequest {
        kind,
        novel_id,
        project_id,
        target,
        lang,
        params,
    } = request;
    let owner = JobOwner::of(novel_id, project_id)?;
    let params = job_params(target, lang, params)?;
    let kind = kind.as_deref().unwrap_or(KIND_TRANSLATION);
    let job = registry.create(kind, session, owner, &params)?;
    executor.start(job, tasks, sink)
}

pub fn cancel_pipeline(executor: &PipelineExecutor, pipeline_id: Option<i64>) -> bool {
    match pipeline_id {
        Some(id) => executor.cancel_pipeline(id),
        None => executor.cancel(),
    }
}

pub fn limits_of(settings: PipelineSettings) -> PipelineLimits {
    let defaults = PipelineLimits::default();
    PipelineLimits::new(
        settings
            .max_pipelines
            .map_or(defaults.max_pipelines, usize::from),
        settings.max_tasks.map_or(defaults.max_tasks, usize::from),
    )
}

pub fn list_history(
    session: &WorkspaceSession,
    owner: Option<JobOwner>,
    limit: Option<i64>,
) -> PipelineResult<Vec<PipelineSnapshot>> {
    let workspace = session.current().ok_or_else(|| {
        PipelineError::new(PipelineErrorCode::NoWorkspace, "no workspace is open")
    })?;
    let limit = limit.unwrap_or(20).clamp(1, 100);
    let database = Database::open_read_only(&Path::new(&workspace.path).join(WORKSPACE_DB_FILE))?;
    Ok(PipelineRepository::new(database.connection()).list_history(owner, limit)?)
}

fn task_failure(error: tauri::Error) -> PipelineError {
    PipelineError::new(PipelineErrorCode::Task, error.to_string())
}

async fn run_blocking<R: Runtime, T, F>(app: AppHandle<R>, job: F) -> PipelineResult<T>
where
    T: Send + 'static,
    F: FnOnce(&PipelineExecutor, &JobRegistry, &WorkspaceSession) -> PipelineResult<T>
        + Send
        + 'static,
{
    run_blocking_with(app, task_failure, move |app| {
        let executor = app.state::<PipelineExecutor>();
        let registry = app.state::<JobRegistry>();
        let session = app.state::<WorkspaceSession>();
        job(&executor, &registry, &session)
    })
    .await
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn pipeline_start<R: Runtime>(
    app: AppHandle<R>,
    kind: Option<String>,
    novel_id: Option<i64>,
    project_id: Option<i64>,
    target: Option<String>,
    lang: Option<String>,
    params: Option<Value>,
    tasks: Vec<TaskRequest>,
    on_event: Channel<PipelineEvent>,
) -> PipelineResult<PipelineSnapshot> {
    let sink: Arc<dyn PipelineTarget> = Arc::new(on_event);
    let settings = app.state::<SettingsService>().general().pipelines;
    let request = JobRequest {
        kind,
        novel_id,
        project_id,
        target,
        lang,
        params,
    };
    run_blocking(app, move |executor, registry, session| {
        executor.set_limits(limits_of(settings));
        start_pipeline(executor, registry, session, request, tasks, sink)
    })
    .await
}

#[tauri::command]
pub fn pipeline_cancel<R: Runtime>(app: AppHandle<R>, pipeline_id: Option<i64>) -> bool {
    cancel_pipeline(&app.state::<PipelineExecutor>(), pipeline_id)
}

#[tauri::command]
pub async fn pipeline_history_list<R: Runtime>(
    app: AppHandle<R>,
    novel_id: Option<i64>,
    project_id: Option<i64>,
    limit: Option<i64>,
) -> PipelineResult<Vec<PipelineSnapshot>> {
    run_blocking(app, move |_, _, session| {
        list_history(session, JobOwner::filter(novel_id, project_id)?, limit)
    })
    .await
}
