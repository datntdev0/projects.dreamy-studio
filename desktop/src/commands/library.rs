use crate::commands::workspace::picked_path;
use crate::features::library::images::IMAGE_EXTENSIONS;
use crate::features::library::models::AssetCheck;
use crate::features::library::models::AssetPatch;
use crate::features::library::models::AssetUploadInput;
use crate::features::library::models::CollectionInput;
use crate::features::library::models::CollectionPatch;
use crate::features::library::models::LibraryCollection;
use crate::features::library::models::LibraryError;
use crate::features::library::models::LibraryErrorCode;
use crate::features::library::models::LibraryImage;
use crate::features::library::models::LibraryPrompt;
use crate::features::library::models::LibraryResult;
use crate::features::library::models::LibrarySound;
use crate::features::library::models::LibrarySummary;
use crate::features::library::models::LibraryTag;
use crate::features::library::models::LibraryVideo;
use crate::features::library::models::PromptCreateInput;
use crate::features::library::models::PromptPatch;
use crate::features::library::prompts::PROMPT_EXTENSIONS;
use crate::features::library::service::LibraryService;
use crate::features::library::sounds::SOUND_EXTENSIONS;
use crate::features::library::videos::VIDEO_EXTENSIONS;
use crate::features::workspace::session::WorkspaceSession;
use tauri::AppHandle;
use tauri::Manager;
use tauri::async_runtime::spawn_blocking;
use tauri_plugin_dialog::DialogExt;

const IMAGE_PICKER_LABEL: &str = "Images";
const SOUND_PICKER_LABEL: &str = "Sounds";
const VIDEO_PICKER_LABEL: &str = "Videos";
const PROMPT_PICKER_LABEL: &str = "Prompts";

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
) -> LibraryResult<Vec<AssetCheck>> {
    service.open(session)?.image_inspect(&paths)
}

pub fn upload_image(
    service: &LibraryService,
    session: &WorkspaceSession,
    path: String,
    input: AssetUploadInput,
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
    patch: AssetPatch,
) -> LibraryResult<LibraryImage> {
    service.open(session)?.image_update(id, patch)
}

pub fn pick_sounds(app: &AppHandle) -> Vec<String> {
    app.dialog()
        .file()
        .add_filter(SOUND_PICKER_LABEL, &SOUND_EXTENSIONS)
        .blocking_pick_files()
        .unwrap_or_default()
        .into_iter()
        .filter_map(|picked| picked_path(Some(picked)))
        .collect()
}

pub fn inspect_sounds(
    service: &LibraryService,
    session: &WorkspaceSession,
    paths: Vec<String>,
) -> LibraryResult<Vec<AssetCheck>> {
    service.open(session)?.sound_inspect(&paths)
}

pub fn upload_sound(
    service: &LibraryService,
    session: &WorkspaceSession,
    path: String,
    input: AssetUploadInput,
) -> LibraryResult<LibrarySound> {
    service.open(session)?.sound_upload(&path, input)
}

pub fn list_sounds(
    service: &LibraryService,
    session: &WorkspaceSession,
) -> LibraryResult<Vec<LibrarySound>> {
    service.open(session)?.sound_list()
}

pub fn update_sound(
    service: &LibraryService,
    session: &WorkspaceSession,
    id: i64,
    patch: AssetPatch,
) -> LibraryResult<LibrarySound> {
    service.open(session)?.sound_update(id, patch)
}

pub fn delete_sounds(
    service: &LibraryService,
    session: &WorkspaceSession,
    ids: Vec<i64>,
) -> LibraryResult<usize> {
    service.open(session)?.sound_delete(&ids)
}

pub fn sound_peaks(
    service: &LibraryService,
    session: &WorkspaceSession,
    id: i64,
) -> LibraryResult<String> {
    service.open(session)?.sound_peaks(id)
}

pub fn pick_videos(app: &AppHandle) -> Vec<String> {
    app.dialog()
        .file()
        .add_filter(VIDEO_PICKER_LABEL, &VIDEO_EXTENSIONS)
        .blocking_pick_files()
        .unwrap_or_default()
        .into_iter()
        .filter_map(|picked| picked_path(Some(picked)))
        .collect()
}
pub fn inspect_videos(
    service: &LibraryService,
    session: &WorkspaceSession,
    paths: Vec<String>,
) -> LibraryResult<Vec<AssetCheck>> {
    service.open(session)?.video_inspect(&paths)
}
pub fn upload_video(
    service: &LibraryService,
    session: &WorkspaceSession,
    path: String,
    input: AssetUploadInput,
) -> LibraryResult<LibraryVideo> {
    service.open(session)?.video_upload(&path, input)
}
pub fn list_videos(
    service: &LibraryService,
    session: &WorkspaceSession,
) -> LibraryResult<Vec<LibraryVideo>> {
    service.open(session)?.video_list()
}
pub fn update_video(
    service: &LibraryService,
    session: &WorkspaceSession,
    id: i64,
    patch: AssetPatch,
) -> LibraryResult<LibraryVideo> {
    service.open(session)?.video_update(id, patch)
}
pub fn delete_videos(
    service: &LibraryService,
    session: &WorkspaceSession,
    ids: Vec<i64>,
) -> LibraryResult<usize> {
    service.open(session)?.video_delete(&ids)
}
pub fn video_poster(
    service: &LibraryService,
    session: &WorkspaceSession,
    id: i64,
) -> LibraryResult<Option<String>> {
    service.open(session)?.video_poster(id)
}
pub fn video_poster_set(
    service: &LibraryService,
    session: &WorkspaceSession,
    id: i64,
    data: String,
) -> LibraryResult<()> {
    service.open(session)?.video_poster_set(id, &data)
}

pub fn pick_prompts(app: &AppHandle) -> Vec<String> {
    app.dialog()
        .file()
        .add_filter(PROMPT_PICKER_LABEL, &PROMPT_EXTENSIONS)
        .blocking_pick_files()
        .unwrap_or_default()
        .into_iter()
        .filter_map(|picked| picked_path(Some(picked)))
        .collect()
}

pub fn inspect_prompts(
    service: &LibraryService,
    session: &WorkspaceSession,
    paths: Vec<String>,
) -> LibraryResult<Vec<AssetCheck>> {
    service.open(session)?.prompt_inspect(&paths)
}

pub fn upload_prompt(
    service: &LibraryService,
    session: &WorkspaceSession,
    path: String,
    input: AssetUploadInput,
) -> LibraryResult<LibraryPrompt> {
    service.open(session)?.prompt_upload(&path, input)
}

pub fn create_prompt(
    service: &LibraryService,
    session: &WorkspaceSession,
    input: PromptCreateInput,
) -> LibraryResult<LibraryPrompt> {
    service.open(session)?.prompt_create(input)
}

pub fn list_prompts(
    service: &LibraryService,
    session: &WorkspaceSession,
) -> LibraryResult<Vec<LibraryPrompt>> {
    service.open(session)?.prompt_list()
}

pub fn update_prompt(
    service: &LibraryService,
    session: &WorkspaceSession,
    id: i64,
    patch: PromptPatch,
) -> LibraryResult<LibraryPrompt> {
    service.open(session)?.prompt_update(id, patch)
}

pub fn delete_prompts(
    service: &LibraryService,
    session: &WorkspaceSession,
    ids: Vec<i64>,
) -> LibraryResult<usize> {
    service.open(session)?.prompt_delete(&ids)
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
) -> LibraryResult<Vec<AssetCheck>> {
    run_blocking(app, move |service, session| {
        inspect_images(service, session, paths)
    })
    .await
}

#[tauri::command]
pub async fn library_image_upload(
    app: AppHandle,
    path: String,
    input: AssetUploadInput,
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
    patch: AssetPatch,
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

#[tauri::command]
pub async fn library_sound_pick(app: AppHandle) -> Vec<String> {
    let task = spawn_blocking(move || pick_sounds(&app));
    task.await.unwrap_or_default()
}

#[tauri::command]
pub async fn library_sound_inspect(
    app: AppHandle,
    paths: Vec<String>,
) -> LibraryResult<Vec<AssetCheck>> {
    run_blocking(app, move |service, session| {
        inspect_sounds(service, session, paths)
    })
    .await
}

#[tauri::command]
pub async fn library_sound_upload(
    app: AppHandle,
    path: String,
    input: AssetUploadInput,
) -> LibraryResult<LibrarySound> {
    run_blocking(app, move |service, session| {
        upload_sound(service, session, path, input)
    })
    .await
}

#[tauri::command]
pub async fn library_sound_list(app: AppHandle) -> LibraryResult<Vec<LibrarySound>> {
    run_blocking(app, list_sounds).await
}

#[tauri::command]
pub async fn library_sound_update(
    app: AppHandle,
    id: i64,
    patch: AssetPatch,
) -> LibraryResult<LibrarySound> {
    run_blocking(app, move |service, session| {
        update_sound(service, session, id, patch)
    })
    .await
}

#[tauri::command]
pub async fn library_sound_delete(app: AppHandle, ids: Vec<i64>) -> LibraryResult<usize> {
    run_blocking(app, move |service, session| {
        delete_sounds(service, session, ids)
    })
    .await
}

#[tauri::command]
pub async fn library_sound_peaks(app: AppHandle, id: i64) -> LibraryResult<String> {
    run_blocking(app, move |service, session| {
        sound_peaks(service, session, id)
    })
    .await
}

#[tauri::command]
pub async fn library_video_pick(app: AppHandle) -> Vec<String> {
    spawn_blocking(move || pick_videos(&app))
        .await
        .unwrap_or_default()
}
#[tauri::command]
pub async fn library_video_inspect(
    app: AppHandle,
    paths: Vec<String>,
) -> LibraryResult<Vec<AssetCheck>> {
    run_blocking(app, move |service, session| {
        inspect_videos(service, session, paths)
    })
    .await
}
#[tauri::command]
pub async fn library_video_upload(
    app: AppHandle,
    path: String,
    input: AssetUploadInput,
) -> LibraryResult<LibraryVideo> {
    run_blocking(app, move |service, session| {
        upload_video(service, session, path, input)
    })
    .await
}
#[tauri::command]
pub async fn library_video_list(app: AppHandle) -> LibraryResult<Vec<LibraryVideo>> {
    run_blocking(app, list_videos).await
}
#[tauri::command]
pub async fn library_video_update(
    app: AppHandle,
    id: i64,
    patch: AssetPatch,
) -> LibraryResult<LibraryVideo> {
    run_blocking(app, move |service, session| {
        update_video(service, session, id, patch)
    })
    .await
}
#[tauri::command]
pub async fn library_video_delete(app: AppHandle, ids: Vec<i64>) -> LibraryResult<usize> {
    run_blocking(app, move |service, session| {
        delete_videos(service, session, ids)
    })
    .await
}
#[tauri::command]
pub async fn library_video_poster(app: AppHandle, id: i64) -> LibraryResult<Option<String>> {
    run_blocking(app, move |service, session| {
        video_poster(service, session, id)
    })
    .await
}
#[tauri::command]
pub async fn library_video_poster_set(app: AppHandle, id: i64, data: String) -> LibraryResult<()> {
    run_blocking(app, move |service, session| {
        video_poster_set(service, session, id, data)
    })
    .await
}

#[tauri::command]
pub async fn library_prompt_pick(app: AppHandle) -> Vec<String> {
    spawn_blocking(move || pick_prompts(&app))
        .await
        .unwrap_or_default()
}

#[tauri::command]
pub async fn library_prompt_inspect(
    app: AppHandle,
    paths: Vec<String>,
) -> LibraryResult<Vec<AssetCheck>> {
    run_blocking(app, move |service, session| {
        inspect_prompts(service, session, paths)
    })
    .await
}

#[tauri::command]
pub async fn library_prompt_upload(
    app: AppHandle,
    path: String,
    input: AssetUploadInput,
) -> LibraryResult<LibraryPrompt> {
    run_blocking(app, move |service, session| {
        upload_prompt(service, session, path, input)
    })
    .await
}

#[tauri::command]
pub async fn library_prompt_create(
    app: AppHandle,
    input: PromptCreateInput,
) -> LibraryResult<LibraryPrompt> {
    run_blocking(app, move |service, session| {
        create_prompt(service, session, input)
    })
    .await
}

#[tauri::command]
pub async fn library_prompt_list(app: AppHandle) -> LibraryResult<Vec<LibraryPrompt>> {
    run_blocking(app, list_prompts).await
}

#[tauri::command]
pub async fn library_prompt_update(
    app: AppHandle,
    id: i64,
    patch: PromptPatch,
) -> LibraryResult<LibraryPrompt> {
    run_blocking(app, move |service, session| {
        update_prompt(service, session, id, patch)
    })
    .await
}

#[tauri::command]
pub async fn library_prompt_delete(app: AppHandle, ids: Vec<i64>) -> LibraryResult<usize> {
    run_blocking(app, move |service, session| {
        delete_prompts(service, session, ids)
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::features::library::models::AssetRights;
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
            rights: AssetRights::Own,
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

        let sound = LibrarySound {
            id: 4,
            name: "Rain.wav".into(),
            ext: "wav".into(),
            size: 24,
            duration_ms: 1_000,
            sample_rate: 44_100,
            channels: 2,
            overview: [0; 32],
            rights: AssetRights::Free,
            origin: "upload".into(),
            collection_id: None,
            tags: vec!["rain".into()],
            created_at: "e".into(),
            updated_at: "f".into(),
        };
        let value = serde_json::to_value(sound).unwrap();
        assert_eq!(value["durationMs"], json!(1_000));
        assert_eq!(value["sampleRate"], json!(44_100));
        assert_eq!(value["collectionId"], serde_json::Value::Null);
        assert!(value.get("duration_ms").is_none());

        let prompt = LibraryPrompt {
            id: 5,
            name: "Prompt".into(),
            kind: crate::features::library::models::PromptKind::General,
            text: "text".into(),
            size: 4,
            rights: AssetRights::Own,
            origin: "app".into(),
            collection_id: Some(6),
            tags: vec![],
            created_at: "g".into(),
            updated_at: "h".into(),
        };
        let value = serde_json::to_value(prompt).unwrap();
        assert_eq!(value["collectionId"], json!(6));
        assert_eq!(value["createdAt"], json!("g"));
        assert!(value.get("collection_id").is_none());
    }

    #[test]
    fn prompt_patch_deserializes_collection_variants() {
        let absent: PromptPatch = serde_json::from_value(json!({})).unwrap();
        let null: PromptPatch = serde_json::from_value(json!({"collectionId": null})).unwrap();
        let number: PromptPatch = serde_json::from_value(json!({"collectionId": 7})).unwrap();
        assert_eq!(absent.collection_id, None);
        assert_eq!(null.collection_id, Some(None));
        assert_eq!(number.collection_id, Some(Some(7)));
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
        assert_eq!(
            list_sounds(&LibraryService::new(), &WorkspaceSession::new())
                .unwrap_err()
                .code,
            LibraryErrorCode::NoWorkspace
        );
        assert_eq!(
            list_prompts(&LibraryService::new(), &WorkspaceSession::new())
                .unwrap_err()
                .code,
            LibraryErrorCode::NoWorkspace
        );
    }
}
