use crate::commands::blocking::run_blocking_with;
use crate::features::project::models::ProjectError;
use crate::features::project::models::ProjectErrorCode;
use crate::features::project::models::ProjectInput;
use crate::features::project::models::ProjectModuleState;
use crate::features::project::models::ProjectPatch;
use crate::features::project::models::ProjectResult;
use crate::features::project::models::ProjectSummary;
use crate::features::project::service::ProjectService;
use crate::features::scripting::service::ScriptingWorkspace;
use crate::features::workspace::session::WorkspaceSession;
use tauri::AppHandle;
use tauri::Manager;
use tauri::Runtime;

pub fn list_projects(
    service: &ProjectService,
    session: &WorkspaceSession,
) -> ProjectResult<Vec<ProjectSummary>> {
    service.open(session)?.list()
}

pub fn create_project(
    service: &ProjectService,
    session: &WorkspaceSession,
    input: ProjectInput,
) -> ProjectResult<ProjectSummary> {
    service.open(session)?.create(input)
}

pub fn update_project(
    service: &ProjectService,
    session: &WorkspaceSession,
    id: i64,
    patch: ProjectPatch,
) -> ProjectResult<ProjectSummary> {
    service.open(session)?.update(id, patch)
}

pub fn archive_projects(
    service: &ProjectService,
    session: &WorkspaceSession,
    ids: Vec<i64>,
    archived: bool,
) -> ProjectResult<()> {
    service.open(session)?.archive(&ids, archived)
}

pub fn delete_projects(
    service: &ProjectService,
    session: &WorkspaceSession,
    ids: Vec<i64>,
) -> ProjectResult<usize> {
    service.open(session)?.delete(&ids)
}

pub fn open_project(
    service: &ProjectService,
    session: &WorkspaceSession,
    id: i64,
) -> ProjectResult<ProjectSummary> {
    service.open(session)?.open_project(id)
}

pub fn get_project_cover(
    service: &ProjectService,
    session: &WorkspaceSession,
    id: i64,
) -> ProjectResult<Option<String>> {
    service.open(session)?.cover_get(id)
}

pub fn set_project_cover(
    service: &ProjectService,
    session: &WorkspaceSession,
    id: i64,
    data_url: &str,
) -> ProjectResult<ProjectSummary> {
    service.open(session)?.cover_set(id, data_url)
}

pub fn clear_project_cover(
    service: &ProjectService,
    session: &WorkspaceSession,
    id: i64,
) -> ProjectResult<ProjectSummary> {
    service.open(session)?.cover_clear(id)
}

pub fn project_module_states(
    service: &ProjectService,
    session: &WorkspaceSession,
    project_id: i64,
) -> ProjectResult<Vec<ProjectModuleState>> {
    ScriptingWorkspace::new(service.open(session)?).modules(project_id)
}

pub(crate) fn task_failure(error: tauri::Error) -> ProjectError {
    ProjectError::new(ProjectErrorCode::Task, error.to_string())
}

pub(crate) async fn run_blocking<R: Runtime, T, F>(app: AppHandle<R>, job: F) -> ProjectResult<T>
where
    T: Send + 'static,
    F: FnOnce(&ProjectService, &WorkspaceSession) -> ProjectResult<T> + Send + 'static,
{
    run_blocking_with(app, task_failure, move |app| {
        let service = app.state::<ProjectService>();
        let session = app.state::<WorkspaceSession>();
        job(&service, &session)
    })
    .await
}

#[tauri::command]
pub async fn project_list<R: Runtime>(app: AppHandle<R>) -> ProjectResult<Vec<ProjectSummary>> {
    run_blocking(app, list_projects).await
}

#[tauri::command]
pub async fn project_create<R: Runtime>(
    app: AppHandle<R>,
    input: ProjectInput,
) -> ProjectResult<ProjectSummary> {
    run_blocking(app, move |service, session| {
        create_project(service, session, input)
    })
    .await
}

#[tauri::command]
pub async fn project_update<R: Runtime>(
    app: AppHandle<R>,
    id: i64,
    patch: ProjectPatch,
) -> ProjectResult<ProjectSummary> {
    run_blocking(app, move |service, session| {
        update_project(service, session, id, patch)
    })
    .await
}

#[tauri::command]
pub async fn project_archive<R: Runtime>(
    app: AppHandle<R>,
    ids: Vec<i64>,
    archived: bool,
) -> ProjectResult<()> {
    run_blocking(app, move |service, session| {
        archive_projects(service, session, ids, archived)
    })
    .await
}

#[tauri::command]
pub async fn project_delete<R: Runtime>(app: AppHandle<R>, ids: Vec<i64>) -> ProjectResult<usize> {
    run_blocking(app, move |service, session| {
        delete_projects(service, session, ids)
    })
    .await
}

#[tauri::command]
pub async fn project_open<R: Runtime>(app: AppHandle<R>, id: i64) -> ProjectResult<ProjectSummary> {
    run_blocking(app, move |service, session| {
        open_project(service, session, id)
    })
    .await
}

#[tauri::command]
pub async fn project_cover_get<R: Runtime>(
    app: AppHandle<R>,
    id: i64,
) -> ProjectResult<Option<String>> {
    run_blocking(app, move |service, session| {
        get_project_cover(service, session, id)
    })
    .await
}

#[tauri::command]
pub async fn project_cover_set<R: Runtime>(
    app: AppHandle<R>,
    id: i64,
    data_url: String,
) -> ProjectResult<ProjectSummary> {
    run_blocking(app, move |service, session| {
        set_project_cover(service, session, id, &data_url)
    })
    .await
}

#[tauri::command]
pub async fn project_cover_clear<R: Runtime>(
    app: AppHandle<R>,
    id: i64,
) -> ProjectResult<ProjectSummary> {
    run_blocking(app, move |service, session| {
        clear_project_cover(service, session, id)
    })
    .await
}

#[tauri::command]
pub async fn project_modules<R: Runtime>(
    app: AppHandle<R>,
    project_id: i64,
) -> ProjectResult<Vec<ProjectModuleState>> {
    run_blocking(app, move |service, session| {
        project_module_states(service, session, project_id)
    })
    .await
}

#[cfg(test)]
#[path = "../../test/commands/project.test.rs"]
mod tests;
