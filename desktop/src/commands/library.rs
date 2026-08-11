use crate::commands::workspace::picked_path;
use crate::features::library::images::IMAGE_EXTENSIONS;
use crate::features::library::models::CollectionInput;
use crate::features::library::models::CollectionPatch;
use crate::features::library::models::ImageCheck;
use crate::features::library::models::ImagePatch;
use crate::features::library::models::ImageUploadInput;
use crate::features::library::models::LibraryCollection;
use crate::features::library::models::LibraryError;
use crate::features::library::models::LibraryErrorCode;
use crate::features::library::models::LibraryImage;
use crate::features::library::models::LibraryResult;
use crate::features::library::models::LibrarySummary;
use crate::features::library::models::LibraryTag;
use crate::features::library::service::LibraryService;
use crate::features::workspace::session::WorkspaceSession;
use tauri::AppHandle;
use tauri::Manager;
use tauri::async_runtime::spawn_blocking;
use tauri_plugin_dialog::DialogExt;

const IMAGE_PICKER_LABEL: &str = "Images";

pub fn get_summary(
    service: &LibraryService,
    session: &WorkspaceSession,
) -> LibraryResult<LibrarySummary> {
    service.open(session)?.summary()
}

pub fn list_collections(
    service: &LibraryService,
    session: &WorkspaceSession,
) -> LibraryResult<Vec<LibraryCollection>> {
    service.open(session)?.collection_list()
}

pub fn create_collection(
    service: &LibraryService,
    session: &WorkspaceSession,
    input: CollectionInput,
) -> LibraryResult<LibraryCollection> {
    service.open(session)?.collection_create(input)
}

pub fn update_collection(
    service: &LibraryService,
    session: &WorkspaceSession,
    id: i64,
    patch: CollectionPatch,
) -> LibraryResult<LibraryCollection> {
    service.open(session)?.collection_update(id, patch)
}

pub fn delete_collection(
    service: &LibraryService,
    session: &WorkspaceSession,
    id: i64,
) -> LibraryResult<i64> {
    service.open(session)?.collection_delete(id)
}

pub fn list_tags(
    service: &LibraryService,
    session: &WorkspaceSession,
) -> LibraryResult<Vec<LibraryTag>> {
    service.open(session)?.tag_list()
}

pub fn rename_tag(
    service: &LibraryService,
    session: &WorkspaceSession,
    from: String,
    to: String,
) -> LibraryResult<LibraryTag> {
    service.open(session)?.tag_rename(&from, &to)
}

pub fn merge_tag(
    service: &LibraryService,
    session: &WorkspaceSession,
    from: String,
    into: String,
) -> LibraryResult<LibraryTag> {
    service.open(session)?.tag_merge(&from, &into)
}

pub fn delete_tag(
    service: &LibraryService,
    session: &WorkspaceSession,
    tag: String,
) -> LibraryResult<i64> {
    service.open(session)?.tag_delete(&tag)
}

pub fn pick_images(app: &AppHandle) -> Vec<String> {
    app.dialog()
        .file()
        .add_filter(IMAGE_PICKER_LABEL, &IMAGE_EXTENSIONS)
        .blocking_pick_files()
        .unwrap_or_default()
        .into_iter()
        .filter_map(|picked| picked_path(Some(picked)))
        .collect()
}

pub fn inspect_images(
    service: &LibraryService,
    session: &WorkspaceSession,
    paths: Vec<String>,
) -> LibraryResult<Vec<ImageCheck>> {
    service.open(session)?.image_inspect(&paths)
}

pub fn upload_image(
    service: &LibraryService,
    session: &WorkspaceSession,
    path: String,
    input: ImageUploadInput,
) -> LibraryResult<LibraryImage> {
    service.open(session)?.image_upload(&path, input)
}

pub fn list_images(
    service: &LibraryService,
    session: &WorkspaceSession,
) -> LibraryResult<Vec<LibraryImage>> {
    service.open(session)?.image_list()
}

pub fn update_image(
    service: &LibraryService,
    session: &WorkspaceSession,
    id: i64,
    patch: ImagePatch,
) -> LibraryResult<LibraryImage> {
    service.open(session)?.image_update(id, patch)
}

pub fn delete_images(
    service: &LibraryService,
    session: &WorkspaceSession,
    ids: Vec<i64>,
) -> LibraryResult<usize> {
    service.open(session)?.image_delete(&ids)
}

pub fn image_thumb(
    service: &LibraryService,
    session: &WorkspaceSession,
    id: i64,
) -> LibraryResult<String> {
    service.open(session)?.image_thumb(id)
}

pub fn read_image(
    service: &LibraryService,
    session: &WorkspaceSession,
    id: i64,
) -> LibraryResult<String> {
    service.open(session)?.image_read(id)
}

async fn run_blocking<T, F>(app: AppHandle, job: F) -> LibraryResult<T>
where
    T: Send + 'static,
    F: FnOnce(&LibraryService, &WorkspaceSession) -> LibraryResult<T> + Send + 'static,
{
    let task = spawn_blocking(move || {
        let service = app.state::<LibraryService>();
        let session = app.state::<WorkspaceSession>();
        job(&service, &session)
    });
    match task.await {
        Ok(result) => result,
        Err(error) => Err(LibraryError::new(LibraryErrorCode::Task, error.to_string())),
    }
}

#[tauri::command]
pub async fn library_summary(app: AppHandle) -> LibraryResult<LibrarySummary> {
    run_blocking(app, get_summary).await
}

#[tauri::command]
pub async fn library_collection_list(app: AppHandle) -> LibraryResult<Vec<LibraryCollection>> {
    run_blocking(app, list_collections).await
}

#[tauri::command]
pub async fn library_collection_create(
    app: AppHandle,
    input: CollectionInput,
) -> LibraryResult<LibraryCollection> {
    run_blocking(app, move |service, session| {
        create_collection(service, session, input)
    })
    .await
}

#[tauri::command]
pub async fn library_collection_update(
    app: AppHandle,
    id: i64,
    patch: CollectionPatch,
) -> LibraryResult<LibraryCollection> {
    run_blocking(app, move |service, session| {
        update_collection(service, session, id, patch)
    })
    .await
}

#[tauri::command]
pub async fn library_collection_delete(app: AppHandle, id: i64) -> LibraryResult<i64> {
    run_blocking(app, move |service, session| {
        delete_collection(service, session, id)
    })
    .await
}

#[tauri::command]
pub async fn library_tag_list(app: AppHandle) -> LibraryResult<Vec<LibraryTag>> {
    run_blocking(app, list_tags).await
}

#[tauri::command]
pub async fn library_tag_rename(
    app: AppHandle,
    from: String,
    to: String,
) -> LibraryResult<LibraryTag> {
    run_blocking(app, move |service, session| {
        rename_tag(service, session, from, to)
    })
    .await
}

#[tauri::command]
pub async fn library_tag_merge(
    app: AppHandle,
    from: String,
    into: String,
) -> LibraryResult<LibraryTag> {
    run_blocking(app, move |service, session| {
        merge_tag(service, session, from, into)
    })
    .await
}

#[tauri::command]
pub async fn library_tag_delete(app: AppHandle, tag: String) -> LibraryResult<i64> {
    run_blocking(app, move |service, session| {
        delete_tag(service, session, tag)
    })
    .await
}

#[tauri::command]
pub async fn library_image_pick(app: AppHandle) -> Vec<String> {
    let task = spawn_blocking(move || pick_images(&app));
    task.await.unwrap_or_default()
}

#[tauri::command]
pub async fn library_image_inspect(
    app: AppHandle,
    paths: Vec<String>,
) -> LibraryResult<Vec<ImageCheck>> {
    run_blocking(app, move |service, session| {
        inspect_images(service, session, paths)
    })
    .await
}

#[tauri::command]
pub async fn library_image_upload(
    app: AppHandle,
    path: String,
    input: ImageUploadInput,
) -> LibraryResult<LibraryImage> {
    run_blocking(app, move |service, session| {
        upload_image(service, session, path, input)
    })
    .await
}

#[tauri::command]
pub async fn library_image_list(app: AppHandle) -> LibraryResult<Vec<LibraryImage>> {
    run_blocking(app, list_images).await
}

#[tauri::command]
pub async fn library_image_update(
    app: AppHandle,
    id: i64,
    patch: ImagePatch,
) -> LibraryResult<LibraryImage> {
    run_blocking(app, move |service, session| {
        update_image(service, session, id, patch)
    })
    .await
}

#[tauri::command]
pub async fn library_image_delete(app: AppHandle, ids: Vec<i64>) -> LibraryResult<usize> {
    run_blocking(app, move |service, session| {
        delete_images(service, session, ids)
    })
    .await
}

#[tauri::command]
pub async fn library_image_thumb(app: AppHandle, id: i64) -> LibraryResult<String> {
    run_blocking(app, move |service, session| {
        image_thumb(service, session, id)
    })
    .await
}

#[tauri::command]
pub async fn library_image_read(app: AppHandle, id: i64) -> LibraryResult<String> {
    run_blocking(app, move |service, session| {
        read_image(service, session, id)
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::features::library::models::ImageRights;
    use crate::features::library::models::KindCounts;
    use serde_json::json;

    #[test]
    fn library_payloads_serialize_as_camel_case() {
        let collection = LibraryCollection {
            id: 2,
            name: "Folder".into(),
            description: "Text".into(),
            created_at: "a".into(),
            updated_at: "b".into(),
            counts: KindCounts::default(),
        };
        let value = serde_json::to_value(collection).unwrap();
        assert_eq!(value["createdAt"], json!("a"));
        assert!(value.get("created_at").is_none());
        assert_eq!(value["counts"]["image"], json!(0));
        assert_eq!(
            serde_json::to_value(LibraryError::new(LibraryErrorCode::NoWorkspace, "closed"))
                .unwrap(),
            json!({"code":"no_workspace","detail":"closed"})
        );

        let image = LibraryImage {
            id: 3,
            name: "Sky.png".into(),
            ext: "png".into(),
            size: 12,
            width: 2,
            height: 3,
            rights: ImageRights::Own,
            origin: "upload".into(),
            collection_id: Some(4),
            tags: vec!["sky".into()],
            created_at: "c".into(),
            updated_at: "d".into(),
        };
        let value = serde_json::to_value(image).unwrap();
        assert_eq!(value["collectionId"], json!(4));
        assert_eq!(value["createdAt"], json!("c"));
        assert!(value.get("collection_id").is_none());
    }

    #[test]
    fn commands_report_no_workspace() {
        assert_eq!(
            get_summary(&LibraryService::new(), &WorkspaceSession::new())
                .unwrap_err()
                .code,
            LibraryErrorCode::NoWorkspace
        );
        assert_eq!(
            list_images(&LibraryService::new(), &WorkspaceSession::new())
                .unwrap_err()
                .code,
            LibraryErrorCode::NoWorkspace
        );
    }
}
