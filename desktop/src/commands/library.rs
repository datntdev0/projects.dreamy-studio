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
use crate::features::library::service::LibraryService;
use crate::features::library::sounds::SOUND_EXTENSIONS;
use crate::features::library::videos::VIDEO_EXTENSIONS;
use crate::features::workspace::session::WorkspaceSession;
use tauri::AppHandle;
use tauri::Manager;
use tauri::Runtime;
use tauri::async_runtime::spawn_blocking;
use tauri_plugin_dialog::DialogExt;

const IMAGE_PICKER_LABEL: &str = "Images";
const SOUND_PICKER_LABEL: &str = "Sounds";
const VIDEO_PICKER_LABEL: &str = "Videos";

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

fn pick_files<R: Runtime>(app: &AppHandle<R>, label: &str, extensions: &[&str]) -> Vec<String> {
    app.dialog()
        .file()
        .add_filter(label, extensions)
        .blocking_pick_files()
        .unwrap_or_default()
        .into_iter()
        .filter_map(|picked| picked_path(Some(picked)))
        .collect()
}

pub fn pick_images<R: Runtime>(app: &AppHandle<R>) -> Vec<String> {
    pick_files(app, IMAGE_PICKER_LABEL, &IMAGE_EXTENSIONS)
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

pub fn pick_sounds<R: Runtime>(app: &AppHandle<R>) -> Vec<String> {
    pick_files(app, SOUND_PICKER_LABEL, &SOUND_EXTENSIONS)
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

pub fn pick_videos<R: Runtime>(app: &AppHandle<R>) -> Vec<String> {
    pick_files(app, VIDEO_PICKER_LABEL, &VIDEO_EXTENSIONS)
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

async fn run_blocking<R: Runtime, T, F>(app: AppHandle<R>, job: F) -> LibraryResult<T>
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
pub async fn library_summary<R: Runtime>(app: AppHandle<R>) -> LibraryResult<LibrarySummary> {
    run_blocking(app, get_summary).await
}

#[tauri::command]
pub async fn library_collection_list<R: Runtime>(
    app: AppHandle<R>,
) -> LibraryResult<Vec<LibraryCollection>> {
    run_blocking(app, list_collections).await
}

#[tauri::command]
pub async fn library_collection_create<R: Runtime>(
    app: AppHandle<R>,
    input: CollectionInput,
) -> LibraryResult<LibraryCollection> {
    run_blocking(app, move |service, session| {
        create_collection(service, session, input)
    })
    .await
}

#[tauri::command]
pub async fn library_collection_update<R: Runtime>(
    app: AppHandle<R>,
    id: i64,
    patch: CollectionPatch,
) -> LibraryResult<LibraryCollection> {
    run_blocking(app, move |service, session| {
        update_collection(service, session, id, patch)
    })
    .await
}

#[tauri::command]
pub async fn library_collection_delete<R: Runtime>(
    app: AppHandle<R>,
    id: i64,
) -> LibraryResult<i64> {
    run_blocking(app, move |service, session| {
        delete_collection(service, session, id)
    })
    .await
}

#[tauri::command]
pub async fn library_tag_list<R: Runtime>(app: AppHandle<R>) -> LibraryResult<Vec<LibraryTag>> {
    run_blocking(app, list_tags).await
}

#[tauri::command]
pub async fn library_tag_rename<R: Runtime>(
    app: AppHandle<R>,
    from: String,
    to: String,
) -> LibraryResult<LibraryTag> {
    run_blocking(app, move |service, session| {
        rename_tag(service, session, from, to)
    })
    .await
}

#[tauri::command]
pub async fn library_tag_merge<R: Runtime>(
    app: AppHandle<R>,
    from: String,
    into: String,
) -> LibraryResult<LibraryTag> {
    run_blocking(app, move |service, session| {
        merge_tag(service, session, from, into)
    })
    .await
}

#[tauri::command]
pub async fn library_tag_delete<R: Runtime>(app: AppHandle<R>, tag: String) -> LibraryResult<i64> {
    run_blocking(app, move |service, session| {
        delete_tag(service, session, tag)
    })
    .await
}

#[tauri::command]
pub async fn library_image_pick<R: Runtime>(app: AppHandle<R>) -> Vec<String> {
    let task = spawn_blocking(move || pick_images(&app));
    task.await.unwrap_or_default()
}

#[tauri::command]
pub async fn library_image_inspect<R: Runtime>(
    app: AppHandle<R>,
    paths: Vec<String>,
) -> LibraryResult<Vec<AssetCheck>> {
    run_blocking(app, move |service, session| {
        inspect_images(service, session, paths)
    })
    .await
}

#[tauri::command]
pub async fn library_image_upload<R: Runtime>(
    app: AppHandle<R>,
    path: String,
    input: AssetUploadInput,
) -> LibraryResult<LibraryImage> {
    run_blocking(app, move |service, session| {
        upload_image(service, session, path, input)
    })
    .await
}

#[tauri::command]
pub async fn library_image_list<R: Runtime>(app: AppHandle<R>) -> LibraryResult<Vec<LibraryImage>> {
    run_blocking(app, list_images).await
}

#[tauri::command]
pub async fn library_image_update<R: Runtime>(
    app: AppHandle<R>,
    id: i64,
    patch: AssetPatch,
) -> LibraryResult<LibraryImage> {
    run_blocking(app, move |service, session| {
        update_image(service, session, id, patch)
    })
    .await
}

#[tauri::command]
pub async fn library_image_delete<R: Runtime>(
    app: AppHandle<R>,
    ids: Vec<i64>,
) -> LibraryResult<usize> {
    run_blocking(app, move |service, session| {
        delete_images(service, session, ids)
    })
    .await
}

#[tauri::command]
pub async fn library_image_thumb<R: Runtime>(app: AppHandle<R>, id: i64) -> LibraryResult<String> {
    run_blocking(app, move |service, session| {
        image_thumb(service, session, id)
    })
    .await
}

#[tauri::command]
pub async fn library_image_read<R: Runtime>(app: AppHandle<R>, id: i64) -> LibraryResult<String> {
    run_blocking(app, move |service, session| {
        read_image(service, session, id)
    })
    .await
}

#[tauri::command]
pub async fn library_sound_pick<R: Runtime>(app: AppHandle<R>) -> Vec<String> {
    let task = spawn_blocking(move || pick_sounds(&app));
    task.await.unwrap_or_default()
}

#[tauri::command]
pub async fn library_sound_inspect<R: Runtime>(
    app: AppHandle<R>,
    paths: Vec<String>,
) -> LibraryResult<Vec<AssetCheck>> {
    run_blocking(app, move |service, session| {
        inspect_sounds(service, session, paths)
    })
    .await
}

#[tauri::command]
pub async fn library_sound_upload<R: Runtime>(
    app: AppHandle<R>,
    path: String,
    input: AssetUploadInput,
) -> LibraryResult<LibrarySound> {
    run_blocking(app, move |service, session| {
        upload_sound(service, session, path, input)
    })
    .await
}

#[tauri::command]
pub async fn library_sound_list<R: Runtime>(app: AppHandle<R>) -> LibraryResult<Vec<LibrarySound>> {
    run_blocking(app, list_sounds).await
}

#[tauri::command]
pub async fn library_sound_update<R: Runtime>(
    app: AppHandle<R>,
    id: i64,
    patch: AssetPatch,
) -> LibraryResult<LibrarySound> {
    run_blocking(app, move |service, session| {
        update_sound(service, session, id, patch)
    })
    .await
}

#[tauri::command]
pub async fn library_sound_delete<R: Runtime>(
    app: AppHandle<R>,
    ids: Vec<i64>,
) -> LibraryResult<usize> {
    run_blocking(app, move |service, session| {
        delete_sounds(service, session, ids)
    })
    .await
}

#[tauri::command]
pub async fn library_sound_peaks<R: Runtime>(app: AppHandle<R>, id: i64) -> LibraryResult<String> {
    run_blocking(app, move |service, session| {
        sound_peaks(service, session, id)
    })
    .await
}

#[tauri::command]
pub async fn library_video_pick<R: Runtime>(app: AppHandle<R>) -> Vec<String> {
    spawn_blocking(move || pick_videos(&app))
        .await
        .unwrap_or_default()
}
#[tauri::command]
pub async fn library_video_inspect<R: Runtime>(
    app: AppHandle<R>,
    paths: Vec<String>,
) -> LibraryResult<Vec<AssetCheck>> {
    run_blocking(app, move |service, session| {
        inspect_videos(service, session, paths)
    })
    .await
}
#[tauri::command]
pub async fn library_video_upload<R: Runtime>(
    app: AppHandle<R>,
    path: String,
    input: AssetUploadInput,
) -> LibraryResult<LibraryVideo> {
    run_blocking(app, move |service, session| {
        upload_video(service, session, path, input)
    })
    .await
}
#[tauri::command]
pub async fn library_video_list<R: Runtime>(app: AppHandle<R>) -> LibraryResult<Vec<LibraryVideo>> {
    run_blocking(app, list_videos).await
}
#[tauri::command]
pub async fn library_video_update<R: Runtime>(
    app: AppHandle<R>,
    id: i64,
    patch: AssetPatch,
) -> LibraryResult<LibraryVideo> {
    run_blocking(app, move |service, session| {
        update_video(service, session, id, patch)
    })
    .await
}
#[tauri::command]
pub async fn library_video_delete<R: Runtime>(
    app: AppHandle<R>,
    ids: Vec<i64>,
) -> LibraryResult<usize> {
    run_blocking(app, move |service, session| {
        delete_videos(service, session, ids)
    })
    .await
}
#[tauri::command]
pub async fn library_video_poster<R: Runtime>(
    app: AppHandle<R>,
    id: i64,
) -> LibraryResult<Option<String>> {
    run_blocking(app, move |service, session| {
        video_poster(service, session, id)
    })
    .await
}
#[tauri::command]
pub async fn library_prompt_create<R: Runtime>(
    app: AppHandle<R>,
    input: PromptCreateInput,
) -> LibraryResult<LibraryPrompt> {
    run_blocking(app, move |service, session| {
        create_prompt(service, session, input)
    })
    .await
}

#[tauri::command]
pub async fn library_prompt_list<R: Runtime>(
    app: AppHandle<R>,
) -> LibraryResult<Vec<LibraryPrompt>> {
    run_blocking(app, list_prompts).await
}

#[tauri::command]
pub async fn library_prompt_update<R: Runtime>(
    app: AppHandle<R>,
    id: i64,
    patch: PromptPatch,
) -> LibraryResult<LibraryPrompt> {
    run_blocking(app, move |service, session| {
        update_prompt(service, session, id, patch)
    })
    .await
}

#[tauri::command]
pub async fn library_prompt_delete<R: Runtime>(
    app: AppHandle<R>,
    ids: Vec<i64>,
) -> LibraryResult<usize> {
    run_blocking(app, move |service, session| {
        delete_prompts(service, session, ids)
    })
    .await
}

#[cfg(test)]
#[path = "../../test/commands/library.test.rs"]
mod tests;
