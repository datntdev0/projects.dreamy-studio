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
mod tests {
    use super::*;
    use crate::commands::workspace::perform_load;
    use crate::container::AppContainer;
    use crate::features::novel::models::InspectStatus;
    use crate::features::novel::models::InspectStep;
    use crate::features::novel::package::fixtures::sample_package;
    use crate::features::workspace::load::LoadEvent;
    use crate::features::workspace::load::LoadRequest;
    use crate::features::workspace::loader::WorkspaceLoader;
    use crate::features::workspace::repository::WorkspaceRepository;
    use crate::features::workspace::service::WorkspaceService;
    use crate::infra::backend::StubBackend;
    use serde_json::json;
    use std::path::PathBuf;
    use std::sync::Arc;
    use std::sync::Mutex;
    use tempfile::TempDir;

    #[derive(Default)]
    struct RecordingTarget {
        events: Mutex<Vec<InspectEvent>>,
    }

    impl InspectTarget for &RecordingTarget {
        fn deliver(&self, event: InspectEvent) -> Result<(), String> {
            self.events.lock().unwrap().push(event);
            Ok(())
        }
    }

    struct ClosedTarget {
        attempts: Mutex<u32>,
    }

    impl InspectTarget for &ClosedTarget {
        fn deliver(&self, _event: InspectEvent) -> Result<(), String> {
            *self.attempts.lock().unwrap() += 1;
            Err("channel closed".to_string())
        }
    }

    struct Fixture {
        dir: TempDir,
        session: WorkspaceSession,
        service: NovelService,
    }

    fn ignore_event(_event: LoadEvent) {}

    fn entered_fixture() -> Fixture {
        let dir = TempDir::new().unwrap();
        let workspace = dir.path().join("studio");
        std::fs::create_dir(&workspace).unwrap();
        let backend = Arc::new(StubBackend::new());
        let container = AppContainer::with_backend(dir.path().join("DreamyStudio"), backend);
        let repository = WorkspaceRepository::new(container.database_path.clone());
        let workspaces = WorkspaceService::new(repository);
        let loader = WorkspaceLoader::from_container(&container, workspaces);
        let session = WorkspaceSession::new();
        let request = LoadRequest::new(workspace.to_str().unwrap(), None);
        perform_load(&loader, &session, request, &ignore_event).unwrap();
        loader.enter(&session).unwrap();
        Fixture {
            dir,
            session,
            service: NovelService::new(),
        }
    }

    fn input(title: &str) -> NovelInput {
        serde_json::from_value(json!({ "title": title, "lang": "ZH", "tags": ["B", "a"] })).unwrap()
    }

    fn package_file(fixture: &Fixture, chapters: usize) -> PathBuf {
        let path = fixture.dir.path().join("book.dsnovel");
        std::fs::write(&path, sample_package(chapters)).unwrap();
        path
    }

    #[test]
    fn forwards_every_inspect_event_to_the_target_in_order() {
        let target = RecordingTarget::default();
        let sink = InspectChannelSink::new(&target);
        let fixture = entered_fixture();
        let path = package_file(&fixture, 2);

        let summary = inspect_package(path.to_str().unwrap(), &sink).unwrap();

        assert_eq!(summary.chapter_count, 2);
        assert!(
            summary
                .cover
                .as_deref()
                .is_some_and(|url| url.starts_with("data:image/jpeg;base64,"))
        );
        let events = target.events.lock().unwrap();
        assert_eq!(events[0].step, InspectStep::Format);
        assert_eq!(events[0].status, InspectStatus::Running);
        let last = events.last().unwrap();
        assert_eq!(
            (last.step, last.status),
            (InspectStep::Cover, InspectStatus::Ok)
        );
    }

    #[test]
    fn failed_delivery_does_not_panic_and_keeps_going() {
        let target = ClosedTarget {
            attempts: Mutex::new(0),
        };
        let sink = InspectChannelSink::new(&target);
        let fixture = entered_fixture();
        let path = package_file(&fixture, 1);

        let result = inspect_package(path.to_str().unwrap(), &sink);

        assert!(result.is_ok());
        assert!(*target.attempts.lock().unwrap() > 2);
    }

    #[test]
    fn inspect_failure_is_a_serializable_error_after_a_fail_event() {
        let target = RecordingTarget::default();
        let sink = InspectChannelSink::new(&target);
        let fixture = entered_fixture();
        let path = fixture.dir.path().join("notes.txt");
        std::fs::write(&path, b"x").unwrap();

        let error = inspect_package(path.to_str().unwrap(), &sink).unwrap_err();

        let value = serde_json::to_value(&error).unwrap();
        assert_eq!(value["code"], "package_format");
        assert!(value["detail"].is_string());
        let events = target.events.lock().unwrap();
        let last = events.last().unwrap();
        assert_eq!(
            (last.step, last.status),
            (InspectStep::Format, InspectStatus::Fail)
        );
    }

    #[test]
    fn events_serialize_with_lowercase_step_and_status() {
        let event = InspectEvent::new(
            InspectStep::Manifest,
            InspectStatus::Warn,
            Some("d".to_string()),
        );

        let value = serde_json::to_value(event).unwrap();

        assert_eq!(
            value,
            json!({ "step": "manifest", "status": "warn", "detail": "d" })
        );
        let bare = serde_json::to_value(InspectEvent::new(
            InspectStep::List,
            InspectStatus::Running,
            None,
        ))
        .unwrap();
        assert_eq!(bare, json!({ "step": "list", "status": "running" }));
    }

    #[test]
    fn commands_without_a_workspace_fail_with_a_serializable_error() {
        let service = NovelService::new();
        let session = WorkspaceSession::new();

        let error = list_novels(&service, &session).unwrap_err();

        let value = serde_json::to_value(error).unwrap();
        assert_eq!(
            value,
            json!({ "code": "no_workspace", "detail": "no workspace is open" })
        );
    }

    #[test]
    fn create_and_list_serialize_the_camel_case_contract() {
        let fixture = entered_fixture();

        create_novel(&fixture.service, &fixture.session, input("Title")).unwrap();
        let listed = list_novels(&fixture.service, &fixture.session).unwrap();

        let value = serde_json::to_value(&listed[0]).unwrap();
        for key in [
            "id",
            "title",
            "name",
            "author",
            "lang",
            "description",
            "origin",
            "createdAt",
            "updatedAt",
            "chapterCount",
            "wordCount",
            "translatedCount",
            "analyzedCount",
            "tags",
        ] {
            assert!(value.get(key).is_some(), "{key}");
        }
        assert_eq!(value["tags"], json!(["a", "b"]));
        assert_eq!(value["name"], "");
        assert_eq!(value["origin"], "created");
    }

    #[test]
    fn patch_deserializes_partial_camel_case_payloads() {
        let patch: NovelPatch = serde_json::from_value(json!({ "name": "Shown" })).unwrap();

        assert_eq!(patch.name.as_deref(), Some("Shown"));
        assert!(patch.title.is_none() && patch.tags.is_none());
    }

    #[test]
    fn update_delete_and_cover_flow_through_the_current_workspace() {
        let fixture = entered_fixture();
        let created = create_novel(&fixture.service, &fixture.session, input("Title")).unwrap();
        let patch: NovelPatch = serde_json::from_value(json!({ "author": "New" })).unwrap();

        let updated = update_novel(&fixture.service, &fixture.session, created.id, patch).unwrap();
        let cover = "data:image/png;base64,iVBORw0KGgo=";
        let with_cover = set_cover(&fixture.service, &fixture.session, created.id, cover).unwrap();
        let fetched = get_cover(&fixture.service, &fixture.session, created.id).unwrap();
        let cleared = clear_cover(&fixture.service, &fixture.session, created.id).unwrap();
        let removed = delete_novels(&fixture.service, &fixture.session, vec![created.id]).unwrap();

        assert_eq!(updated.author, "New");
        assert!(with_cover.updated_at >= updated.updated_at);
        assert_eq!(fetched.as_deref(), Some(cover));
        assert!(cleared.updated_at >= with_cover.updated_at);
        assert_eq!(removed, 1);
        assert!(
            list_novels(&fixture.service, &fixture.session)
                .unwrap()
                .is_empty()
        );
    }

    #[test]
    fn import_then_read_and_edit_chapters() {
        let fixture = entered_fixture();
        let path = package_file(&fixture, 2);

        let imported = import_package(
            &fixture.service,
            &fixture.session,
            path.to_str().unwrap(),
            input("Imported"),
        )
        .unwrap();
        let chapters = list_chapters(&fixture.service, &fixture.session, imported.id).unwrap();
        let paragraphs = read_chapter(
            &fixture.service,
            &fixture.session,
            imported.id,
            &chapters[0].id,
        )
        .unwrap();
        let edited = update_paragraph(
            &fixture.service,
            &fixture.session,
            imported.id,
            &chapters[0].id,
            1,
            "changed",
        )
        .unwrap();

        assert_eq!(imported.chapter_count, 2);
        assert_eq!(paragraphs.len(), 3);
        let value = serde_json::to_value(&edited).unwrap();
        for key in [
            "id",
            "novelId",
            "seq",
            "title",
            "wordCount",
            "translationStatus",
            "analysisStatus",
            "createdAt",
            "updatedAt",
        ] {
            assert!(value.get(key).is_some(), "{key}");
        }
        assert_eq!(serde_json::to_value(&paragraphs[0]).unwrap()["n"], 1);
    }

    #[test]
    fn chapter_management_commands_flow_through_the_current_workspace() {
        let fixture = entered_fixture();
        let created = create_novel(&fixture.service, &fixture.session, input("Title")).unwrap();

        let first = add_chapter(&fixture.service, &fixture.session, created.id, " One ").unwrap();
        let second = add_chapter(&fixture.service, &fixture.session, created.id, "").unwrap();
        let renamed = rename_chapter(
            &fixture.service,
            &fixture.session,
            created.id,
            &second.id,
            "Two",
        )
        .unwrap();
        let grown = add_paragraph(
            &fixture.service,
            &fixture.session,
            created.id,
            &first.id,
            "Some words here",
        )
        .unwrap();
        let moved = move_chapter(
            &fixture.service,
            &fixture.session,
            created.id,
            &second.id,
            1,
        )
        .unwrap();
        let remaining =
            delete_chapter(&fixture.service, &fixture.session, created.id, &second.id).unwrap();

        assert_eq!((first.seq, first.title.as_str()), (1, "One"));
        assert_eq!((second.seq, second.title.as_str()), (2, "Chapter 2"));
        assert_eq!(renamed.title, "Two");
        assert_eq!(grown.word_count, 3);
        let order: Vec<_> = moved.iter().map(|row| row.title.as_str()).collect();
        assert_eq!(order, ["Two", "One"]);
        assert_eq!(remaining.len(), 1);
        assert_eq!((remaining[0].seq, remaining[0].title.as_str()), (1, "One"));
        let value = serde_json::to_value(&grown).unwrap();
        assert!(value.get("wordCount").is_some());
    }

    #[test]
    fn export_serializes_the_camel_case_contract_and_reimports() {
        let fixture = entered_fixture();
        let path = package_file(&fixture, 2);
        let imported = import_package(
            &fixture.service,
            &fixture.session,
            path.to_str().unwrap(),
            input("Imported"),
        )
        .unwrap();
        let dest = fixture.dir.path().join("exported");

        let summary = export_package(
            &fixture.service,
            &fixture.session,
            imported.id,
            dest.to_str().unwrap(),
        )
        .unwrap();

        let value = serde_json::to_value(&summary).unwrap();
        assert_eq!(value["chapterCount"], 2);
        assert!(
            value["path"]
                .as_str()
                .unwrap()
                .ends_with("exported.dsnovel")
        );
        let again = import_package(
            &fixture.service,
            &fixture.session,
            value["path"].as_str().unwrap(),
            input("Again"),
        )
        .unwrap();
        assert_eq!(again.chapter_count, 2);
    }

    #[test]
    fn export_without_a_workspace_is_a_typed_error() {
        let error = export_package(
            &NovelService::new(),
            &WorkspaceSession::new(),
            1,
            "x.dsnovel",
        )
        .unwrap_err();

        assert_eq!(error.code, NovelErrorCode::NoWorkspace);
    }

    #[test]
    fn import_rejects_a_non_package_path() {
        let fixture = entered_fixture();
        let path = fixture.dir.path().join("book.txt");
        std::fs::write(&path, b"x").unwrap();

        let error = import_package(
            &fixture.service,
            &fixture.session,
            path.to_str().unwrap(),
            input("x"),
        )
        .unwrap_err();

        assert_eq!(error.code, NovelErrorCode::PackageFormat);
    }

    #[test]
    fn task_failure_maps_to_a_task_error() {
        let cause = std::io::Error::other("boom");

        let error = task_failure(tauri::Error::InvalidIcon(cause));

        assert_eq!(error.code, NovelErrorCode::Task);
        assert!(!error.detail.is_empty());
    }
}
