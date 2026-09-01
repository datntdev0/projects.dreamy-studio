use crate::commands::blocking::run_blocking_with;
use crate::features::translation::models::DictInput;
use crate::features::translation::models::DictPatch;
use crate::features::translation::models::TranslationError;
use crate::features::translation::models::TranslationErrorCode;
use crate::features::translation::models::TranslationResult;
use crate::features::translation::service::ChapterTranslation;
use crate::features::translation::service::DictChange;
use crate::features::translation::service::NovelTranslation;
use crate::features::translation::service::TranslationService;
use crate::features::translation::warnings::TranslationWarning;
use crate::features::workspace::session::WorkspaceSession;
use tauri::AppHandle;
use tauri::Manager;
use tauri::Runtime;

pub fn get(
    service: &TranslationService,
    session: &WorkspaceSession,
    novel_id: i64,
    target: &str,
) -> TranslationResult<NovelTranslation> {
    service.open(session)?.get(novel_id, target)
}

pub fn warnings(
    service: &TranslationService,
    session: &WorkspaceSession,
    novel_id: i64,
    target: &str,
) -> TranslationResult<Vec<TranslationWarning>> {
    service.open(session)?.warnings(novel_id, target)
}

pub fn guidelines_save(
    service: &TranslationService,
    session: &WorkspaceSession,
    novel_id: i64,
    target: &str,
    text: &str,
) -> TranslationResult<bool> {
    service
        .open(session)?
        .guidelines_save(novel_id, target, text)
}

pub fn dict_add(
    service: &TranslationService,
    session: &WorkspaceSession,
    novel_id: i64,
    target: &str,
    input: DictInput,
) -> TranslationResult<DictChange> {
    service.open(session)?.dict_add(novel_id, target, input)
}

pub fn dict_update(
    service: &TranslationService,
    session: &WorkspaceSession,
    novel_id: i64,
    id: i64,
    patch: DictPatch,
) -> TranslationResult<DictChange> {
    service.open(session)?.dict_update(novel_id, id, patch)
}

pub fn dict_delete(
    service: &TranslationService,
    session: &WorkspaceSession,
    novel_id: i64,
    id: i64,
) -> TranslationResult<()> {
    service.open(session)?.dict_delete(novel_id, id)
}

pub fn passage_save(
    service: &TranslationService,
    session: &WorkspaceSession,
    novel_id: i64,
    target: &str,
    chapter_id: &str,
    n: usize,
    text: &str,
) -> TranslationResult<ChapterTranslation> {
    service
        .open(session)?
        .passage_save(novel_id, target, chapter_id, n, text)
}

pub fn note_save(
    service: &TranslationService,
    session: &WorkspaceSession,
    novel_id: i64,
    target: &str,
    chapter_id: &str,
    n: usize,
    text: &str,
) -> TranslationResult<ChapterTranslation> {
    service
        .open(session)?
        .note_save(novel_id, target, chapter_id, n, text)
}

fn task_failure(error: tauri::Error) -> TranslationError {
    TranslationError::new(TranslationErrorCode::Task, error.to_string())
}

async fn run_blocking<R: Runtime, T, F>(app: AppHandle<R>, job: F) -> TranslationResult<T>
where
    T: Send + 'static,
    F: FnOnce(&TranslationService, &WorkspaceSession) -> TranslationResult<T> + Send + 'static,
{
    run_blocking_with(app, task_failure, move |app| {
        let service = app.state::<TranslationService>();
        let session = app.state::<WorkspaceSession>();
        job(&service, &session)
    })
    .await
}

#[tauri::command]
pub async fn translation_get<R: Runtime>(
    app: AppHandle<R>,
    novel_id: i64,
    target: String,
) -> TranslationResult<NovelTranslation> {
    run_blocking(app, move |service, session| {
        get(service, session, novel_id, &target)
    })
    .await
}

#[tauri::command]
pub async fn translation_warnings<R: Runtime>(
    app: AppHandle<R>,
    novel_id: i64,
    target: String,
) -> TranslationResult<Vec<TranslationWarning>> {
    run_blocking(app, move |service, session| {
        warnings(service, session, novel_id, &target)
    })
    .await
}

#[tauri::command]
pub async fn translation_guidelines_save<R: Runtime>(
    app: AppHandle<R>,
    novel_id: i64,
    target: String,
    text: String,
) -> TranslationResult<bool> {
    run_blocking(app, move |service, session| {
        guidelines_save(service, session, novel_id, &target, &text)
    })
    .await
}

#[tauri::command]
pub async fn translation_dict_add<R: Runtime>(
    app: AppHandle<R>,
    novel_id: i64,
    target: String,
    input: DictInput,
) -> TranslationResult<DictChange> {
    run_blocking(app, move |service, session| {
        dict_add(service, session, novel_id, &target, input)
    })
    .await
}

#[tauri::command]
pub async fn translation_dict_update<R: Runtime>(
    app: AppHandle<R>,
    novel_id: i64,
    id: i64,
    patch: DictPatch,
) -> TranslationResult<DictChange> {
    run_blocking(app, move |service, session| {
        dict_update(service, session, novel_id, id, patch)
    })
    .await
}

#[tauri::command]
pub async fn translation_dict_delete<R: Runtime>(
    app: AppHandle<R>,
    novel_id: i64,
    id: i64,
) -> TranslationResult<()> {
    run_blocking(app, move |service, session| {
        dict_delete(service, session, novel_id, id)
    })
    .await
}

#[tauri::command]
pub async fn translation_passage_save<R: Runtime>(
    app: AppHandle<R>,
    novel_id: i64,
    target: String,
    chapter_id: String,
    n: usize,
    text: String,
) -> TranslationResult<ChapterTranslation> {
    run_blocking(app, move |service, session| {
        passage_save(service, session, novel_id, &target, &chapter_id, n, &text)
    })
    .await
}

#[tauri::command]
pub async fn translation_note_save<R: Runtime>(
    app: AppHandle<R>,
    novel_id: i64,
    target: String,
    chapter_id: String,
    n: usize,
    text: String,
) -> TranslationResult<ChapterTranslation> {
    run_blocking(app, move |service, session| {
        note_save(service, session, novel_id, &target, &chapter_id, n, &text)
    })
    .await
}

#[cfg(test)]
#[path = "../../test/commands/translation.test.rs"]
mod tests;
