use crate::commands::workspace::picked_path;
use crate::features::novel::models::ChapterRow;
use crate::features::novel::models::ExportSummary;
use crate::features::novel::models::InspectEvent;
use crate::features::novel::models::InspectSink;
use crate::features::novel::models::NovelError;
use crate::features::novel::models::NovelErrorCode;
use crate::features::novel::models::NovelInput;
use crate::features::novel::models::NovelPatch;
use crate::features::novel::models::NovelResult;
use crate::features::novel::models::NovelSummary;
use crate::features::novel::models::PackageSummary;
use crate::features::novel::models::ParagraphRow;
use crate::features::novel::package::EXPORT_EXTENSION;
use crate::features::novel::package::PACKAGE_EXTENSIONS;
use crate::features::novel::package::inspect_path;
use crate::features::novel::service::NovelService;
use crate::features::novel::service::cover_data_url;
use crate::features::workspace::session::WorkspaceSession;
use std::path::Path;
use tauri::AppHandle;
use tauri::Manager;
use tauri::async_runtime::spawn_blocking;
use tauri::ipc::Channel;
use tauri_plugin_dialog::DialogExt;

const PICKER_LABEL: &str = "Dreamy Studio novel package";

pub trait InspectTarget {
    fn deliver(&self, event: InspectEvent) -> Result<(), String>;
}

impl InspectTarget for Channel<InspectEvent> {
    fn deliver(&self, event: InspectEvent) -> Result<(), String> {
        self.send(event).map_err(|error| error.to_string())
    }
}

pub struct InspectChannelSink<T: InspectTarget> {
    target: T,
}

impl<T: InspectTarget> InspectChannelSink<T> {
    pub fn new(target: T) -> Self {
        Self { target }
    }
}

impl<T: InspectTarget> InspectSink for InspectChannelSink<T> {
    fn emit(&self, event: InspectEvent) {
        if let Err(error) = self.target.deliver(event) {
            eprintln!("cannot forward inspect event: {error}");
        }
    }
}

pub fn list_novels(
    service: &NovelService,
    session: &WorkspaceSession,
) -> NovelResult<Vec<NovelSummary>> {
    service.open(session)?.list()
}

pub fn create_novel(
    service: &NovelService,
    session: &WorkspaceSession,
    input: NovelInput,
) -> NovelResult<NovelSummary> {
    service.open(session)?.create(input)
}

pub fn update_novel(
    service: &NovelService,
    session: &WorkspaceSession,
    id: i64,
    patch: NovelPatch,
) -> NovelResult<NovelSummary> {
    service.open(session)?.update(id, patch)
}

pub fn delete_novels(
    service: &NovelService,
    session: &WorkspaceSession,
    ids: Vec<i64>,
) -> NovelResult<usize> {
    service.open(session)?.delete(&ids)
}

pub fn get_cover(
    service: &NovelService,
    session: &WorkspaceSession,
    id: i64,
) -> NovelResult<Option<String>> {
    service.open(session)?.cover_get(id)
}

pub fn set_cover(
    service: &NovelService,
    session: &WorkspaceSession,
    id: i64,
    data_url: &str,
) -> NovelResult<NovelSummary> {
    service.open(session)?.cover_set(id, data_url)
}

pub fn clear_cover(
    service: &NovelService,
    session: &WorkspaceSession,
    id: i64,
) -> NovelResult<NovelSummary> {
    service.open(session)?.cover_clear(id)
}

pub fn list_chapters(
    service: &NovelService,
    session: &WorkspaceSession,
    novel_id: i64,
) -> NovelResult<Vec<ChapterRow>> {
    service.open(session)?.chapters(novel_id)
}

pub fn read_chapter(
    service: &NovelService,
    session: &WorkspaceSession,
    novel_id: i64,
    chapter_id: &str,
) -> NovelResult<Vec<ParagraphRow>> {
    service.open(session)?.chapter_read(novel_id, chapter_id)
}

pub fn update_paragraph(
    service: &NovelService,
    session: &WorkspaceSession,
    novel_id: i64,
    chapter_id: &str,
    n: usize,
    text: &str,
) -> NovelResult<ChapterRow> {
    service
        .open(session)?
        .paragraph_update(novel_id, chapter_id, n, text)
}

pub fn write_chapter(
    service: &NovelService,
    session: &WorkspaceSession,
    novel_id: i64,
    chapter_id: &str,
    text: &str,
) -> NovelResult<ChapterRow> {
    service
        .open(session)?
        .chapter_write(novel_id, chapter_id, text)
}

pub fn add_chapter(
    service: &NovelService,
    session: &WorkspaceSession,
    novel_id: i64,
    title: &str,
) -> NovelResult<ChapterRow> {
    service.open(session)?.chapter_add(novel_id, title)
}

pub fn rename_chapter(
    service: &NovelService,
    session: &WorkspaceSession,
    novel_id: i64,
    chapter_id: &str,
    title: &str,
) -> NovelResult<ChapterRow> {
    service
        .open(session)?
        .chapter_rename(novel_id, chapter_id, title)
}

pub fn delete_chapter(
    service: &NovelService,
    session: &WorkspaceSession,
    novel_id: i64,
    chapter_id: &str,
) -> NovelResult<Vec<ChapterRow>> {
    service.open(session)?.chapter_delete(novel_id, chapter_id)
}

pub fn move_chapter(
    service: &NovelService,
    session: &WorkspaceSession,
    novel_id: i64,
    chapter_id: &str,
    to_seq: i64,
) -> NovelResult<Vec<ChapterRow>> {
    service
        .open(session)?
        .chapter_move(novel_id, chapter_id, to_seq)
}

pub fn add_paragraph(
    service: &NovelService,
    session: &WorkspaceSession,
    novel_id: i64,
    chapter_id: &str,
    text: &str,
) -> NovelResult<ChapterRow> {
    service
        .open(session)?
        .paragraph_add(novel_id, chapter_id, text)
}

pub fn inspect_package(path: &str, sink: &dyn InspectSink) -> NovelResult<PackageSummary> {
    let (mut reader, package) = inspect_path(Path::new(path), sink)?;
    let mut summary = package.summary();
    if let Some(cover) = &package.cover
        && let Ok(bytes) = reader.read_cover(cover)
    {
        summary.cover = Some(cover_data_url(cover.kind, &bytes));
    }
    Ok(summary)
}

pub fn import_package(
    service: &NovelService,
    session: &WorkspaceSession,
    path: &str,
    meta: NovelInput,
) -> NovelResult<NovelSummary> {
    service.open(session)?.import_package(Path::new(path), meta)
}

pub fn export_package(
    service: &NovelService,
    session: &WorkspaceSession,
    id: i64,
    path: &str,
) -> NovelResult<ExportSummary> {
    service.open(session)?.export_package(id, Path::new(path))
}

fn pick_export_path(app: &AppHandle, file_name: String) -> Option<String> {
    let picked = app
        .dialog()
        .file()
        .add_filter(PICKER_LABEL, &[EXPORT_EXTENSION])
        .set_file_name(file_name)
        .blocking_save_file();
    picked_path(picked)
}

fn pick_package(app: &AppHandle) -> Option<String> {
    let picked = app
        .dialog()
        .file()
        .add_filter(PICKER_LABEL, &PACKAGE_EXTENSIONS)
        .blocking_pick_file();
    picked_path(picked)
}

fn task_failure(error: tauri::Error) -> NovelError {
    NovelError::new(NovelErrorCode::Task, error.to_string())
}

async fn run_blocking<T, F>(app: AppHandle, job: F) -> NovelResult<T>
where
    T: Send + 'static,
    F: FnOnce(&NovelService, &WorkspaceSession) -> NovelResult<T> + Send + 'static,
{
    let task = spawn_blocking(move || {
        let service = app.state::<NovelService>();
        let session = app.state::<WorkspaceSession>();
        job(&service, &session)
    });
    match task.await {
        Ok(result) => result,
        Err(error) => Err(task_failure(error)),
    }
}

#[tauri::command]
pub async fn novel_list(app: AppHandle) -> NovelResult<Vec<NovelSummary>> {
    run_blocking(app, list_novels).await
}

#[tauri::command]
pub async fn novel_create(app: AppHandle, input: NovelInput) -> NovelResult<NovelSummary> {
    run_blocking(app, move |service, session| {
        create_novel(service, session, input)
    })
    .await
}

#[tauri::command]
pub async fn novel_update(app: AppHandle, id: i64, patch: NovelPatch) -> NovelResult<NovelSummary> {
    run_blocking(app, move |service, session| {
        update_novel(service, session, id, patch)
    })
    .await
}

#[tauri::command]
pub async fn novel_delete(app: AppHandle, ids: Vec<i64>) -> NovelResult<usize> {
    run_blocking(app, move |service, session| {
        delete_novels(service, session, ids)
    })
    .await
}

#[tauri::command]
pub async fn novel_cover_get(app: AppHandle, id: i64) -> NovelResult<Option<String>> {
    run_blocking(app, move |service, session| get_cover(service, session, id)).await
}

#[tauri::command]
pub async fn novel_cover_set(
    app: AppHandle,
    id: i64,
    data_url: String,
) -> NovelResult<NovelSummary> {
    run_blocking(app, move |service, session| {
        set_cover(service, session, id, &data_url)
    })
    .await
}

#[tauri::command]
pub async fn novel_cover_clear(app: AppHandle, id: i64) -> NovelResult<NovelSummary> {
    run_blocking(app, move |service, session| {
        clear_cover(service, session, id)
    })
    .await
}

#[tauri::command]
pub async fn novel_chapters(app: AppHandle, novel_id: i64) -> NovelResult<Vec<ChapterRow>> {
    run_blocking(app, move |service, session| {
        list_chapters(service, session, novel_id)
    })
    .await
}

#[tauri::command]
pub async fn novel_chapter_read(
    app: AppHandle,
    novel_id: i64,
    chapter_id: String,
) -> NovelResult<Vec<ParagraphRow>> {
    run_blocking(app, move |service, session| {
        read_chapter(service, session, novel_id, &chapter_id)
    })
    .await
}

#[tauri::command]
pub async fn novel_paragraph_update(
    app: AppHandle,
    novel_id: i64,
    chapter_id: String,
    n: usize,
    text: String,
) -> NovelResult<ChapterRow> {
    run_blocking(app, move |service, session| {
        update_paragraph(service, session, novel_id, &chapter_id, n, &text)
    })
    .await
}

#[tauri::command]
pub async fn novel_chapter_write(
    app: AppHandle,
    novel_id: i64,
    chapter_id: String,
    text: String,
) -> NovelResult<ChapterRow> {
    run_blocking(app, move |service, session| {
        write_chapter(service, session, novel_id, &chapter_id, &text)
    })
    .await
}

#[tauri::command]
pub async fn novel_chapter_add(
    app: AppHandle,
    novel_id: i64,
    title: String,
) -> NovelResult<ChapterRow> {
    run_blocking(app, move |service, session| {
        add_chapter(service, session, novel_id, &title)
    })
    .await
}

#[tauri::command]
pub async fn novel_chapter_rename(
    app: AppHandle,
    novel_id: i64,
    chapter_id: String,
    title: String,
) -> NovelResult<ChapterRow> {
    run_blocking(app, move |service, session| {
        rename_chapter(service, session, novel_id, &chapter_id, &title)
    })
    .await
}

#[tauri::command]
pub async fn novel_chapter_delete(
    app: AppHandle,
    novel_id: i64,
    chapter_id: String,
) -> NovelResult<Vec<ChapterRow>> {
    run_blocking(app, move |service, session| {
        delete_chapter(service, session, novel_id, &chapter_id)
    })
    .await
}

#[tauri::command]
pub async fn novel_chapter_move(
    app: AppHandle,
    novel_id: i64,
    chapter_id: String,
    to_seq: i64,
) -> NovelResult<Vec<ChapterRow>> {
    run_blocking(app, move |service, session| {
        move_chapter(service, session, novel_id, &chapter_id, to_seq)
    })
    .await
}

#[tauri::command]
pub async fn novel_paragraph_add(
    app: AppHandle,
    novel_id: i64,
    chapter_id: String,
    text: String,
) -> NovelResult<ChapterRow> {
    run_blocking(app, move |service, session| {
        add_paragraph(service, session, novel_id, &chapter_id, &text)
    })
    .await
}

#[tauri::command]
pub async fn novel_package_pick(app: AppHandle) -> Option<String> {
    let task = spawn_blocking(move || pick_package(&app));
    task.await.unwrap_or_default()
}

#[tauri::command]
pub async fn novel_package_inspect(
    path: String,
    on_event: Channel<InspectEvent>,
) -> NovelResult<PackageSummary> {
    let sink = InspectChannelSink::new(on_event);
    let task = spawn_blocking(move || inspect_package(&path, &sink));
    match task.await {
        Ok(result) => result,
        Err(error) => Err(task_failure(error)),
    }
}

#[tauri::command]
pub async fn novel_package_import(
    app: AppHandle,
    path: String,
    meta: NovelInput,
) -> NovelResult<NovelSummary> {
    run_blocking(app, move |service, session| {
        import_package(service, session, &path, meta)
    })
    .await
}

#[tauri::command]
pub async fn novel_package_save_pick(app: AppHandle, file_name: String) -> Option<String> {
    let task = spawn_blocking(move || pick_export_path(&app, file_name));
    task.await.unwrap_or_default()
}

#[tauri::command]
pub async fn novel_package_export(
    app: AppHandle,
    id: i64,
    path: String,
) -> NovelResult<ExportSummary> {
    run_blocking(app, move |service, session| {
        export_package(service, session, id, &path)
    })
    .await
}

#[cfg(test)]
#[path = "../../test/commands/novel.test.rs"]
mod tests;
