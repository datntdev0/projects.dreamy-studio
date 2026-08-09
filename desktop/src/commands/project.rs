use crate::features::project::models::DirEntry;
use crate::features::project::models::ProjectError;
use crate::features::project::models::ProjectErrorCode;
use crate::features::project::models::ProjectInput;
use crate::features::project::models::ProjectPatch;
use crate::features::project::models::ProjectResult;
use crate::features::project::models::ProjectSummary;
use crate::features::project::service::ProjectService;
use crate::features::workspace::session::WorkspaceSession;
use tauri::AppHandle;
use tauri::Manager;
use tauri::async_runtime::spawn_blocking;
use tauri_plugin_opener::OpenerExt;

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

pub fn list_project_dir(
    service: &ProjectService,
    session: &WorkspaceSession,
    id: i64,
    path: &str,
) -> ProjectResult<Vec<DirEntry>> {
    service.open(session)?.dir_list(id, path)
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

fn task_failure(error: tauri::Error) -> ProjectError {
    ProjectError::new(ProjectErrorCode::Task, error.to_string())
}

async fn run_blocking<T, F>(app: AppHandle, job: F) -> ProjectResult<T>
where
    T: Send + 'static,
    F: FnOnce(&ProjectService, &WorkspaceSession) -> ProjectResult<T> + Send + 'static,
{
    let task = spawn_blocking(move || {
        let service = app.state::<ProjectService>();
        let session = app.state::<WorkspaceSession>();
        job(&service, &session)
    });
    match task.await {
        Ok(result) => result,
        Err(error) => Err(task_failure(error)),
    }
}

#[tauri::command]
pub async fn project_list(app: AppHandle) -> ProjectResult<Vec<ProjectSummary>> {
    run_blocking(app, list_projects).await
}

#[tauri::command]
pub async fn project_create(app: AppHandle, input: ProjectInput) -> ProjectResult<ProjectSummary> {
    run_blocking(app, move |service, session| {
        create_project(service, session, input)
    })
    .await
}

#[tauri::command]
pub async fn project_update(
    app: AppHandle,
    id: i64,
    patch: ProjectPatch,
) -> ProjectResult<ProjectSummary> {
    run_blocking(app, move |service, session| {
        update_project(service, session, id, patch)
    })
    .await
}

#[tauri::command]
pub async fn project_archive(app: AppHandle, ids: Vec<i64>, archived: bool) -> ProjectResult<()> {
    run_blocking(app, move |service, session| {
        archive_projects(service, session, ids, archived)
    })
    .await
}

#[tauri::command]
pub async fn project_delete(app: AppHandle, ids: Vec<i64>) -> ProjectResult<usize> {
    run_blocking(app, move |service, session| {
        delete_projects(service, session, ids)
    })
    .await
}

#[tauri::command]
pub async fn project_open(app: AppHandle, id: i64) -> ProjectResult<ProjectSummary> {
    run_blocking(app, move |service, session| {
        open_project(service, session, id)
    })
    .await
}

#[tauri::command]
pub async fn project_dir_list(
    app: AppHandle,
    id: i64,
    path: String,
) -> ProjectResult<Vec<DirEntry>> {
    run_blocking(app, move |service, session| {
        list_project_dir(service, session, id, &path)
    })
    .await
}

#[tauri::command]
pub async fn project_cover_get(app: AppHandle, id: i64) -> ProjectResult<Option<String>> {
    run_blocking(app, move |service, session| {
        get_project_cover(service, session, id)
    })
    .await
}

#[tauri::command]
pub async fn project_cover_set(
    app: AppHandle,
    id: i64,
    data_url: String,
) -> ProjectResult<ProjectSummary> {
    run_blocking(app, move |service, session| {
        set_project_cover(service, session, id, &data_url)
    })
    .await
}

#[tauri::command]
pub async fn project_cover_clear(app: AppHandle, id: i64) -> ProjectResult<ProjectSummary> {
    run_blocking(app, move |service, session| {
        clear_project_cover(service, session, id)
    })
    .await
}

#[tauri::command]
pub async fn project_folder_open(app: AppHandle, id: i64) -> ProjectResult<()> {
    let path = run_blocking(app.clone(), move |service, session| {
        service.open(session)?.folder_path(id)
    })
    .await?;
    app.opener()
        .reveal_item_in_dir(path)
        .map_err(|error| ProjectError::new(ProjectErrorCode::Io, error.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn project_payloads_serialize_as_camel_case() {
        let summary = ProjectSummary {
            id: 3,
            name: "Book".to_string(),
            folder: "projects/book".to_string(),
            template: "audiobook".to_string(),
            description: String::new(),
            novel_id: Some(8),
            novel_missing: true,
            src_kind: Some("original".to_string()),
            src_lang: Some("ZH".to_string()),
            range_from: Some(1),
            range_to: Some(2),
            archived: false,
            created_at: "a".to_string(),
            updated_at: "b".to_string(),
            opened_at: "c".to_string(),
        };
        let entry = DirEntry {
            name: "cover.png".to_string(),
            kind: "file".to_string(),
            size: 12,
        };
        let serialized = serde_json::to_value(summary).unwrap();
        assert_eq!(serialized["novelId"], json!(8));
        assert_eq!(serialized["novelMissing"], json!(true));
        assert_eq!(serialized["rangeFrom"], json!(1));
        let serialized_entry = serde_json::to_value(entry).unwrap();
        assert_eq!(
            serialized_entry,
            json!({"name":"cover.png","kind":"file","size":12})
        );
    }

    #[test]
    fn commands_report_no_workspace() {
        let error = list_projects(&ProjectService::new(), &WorkspaceSession::new()).unwrap_err();
        assert_eq!(error.code, ProjectErrorCode::NoWorkspace);
    }
}
