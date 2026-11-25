use super::*;
use crate::commands::workspace::perform_load;
use crate::container::AppContainer;
use crate::features::novel::models::InspectStatus;
use crate::features::novel::models::InspectStep;
use crate::features::workspace::load::LoadEvent;
use crate::features::workspace::load::LoadRequest;
use crate::features::workspace::loader::WorkspaceLoader;
use crate::features::workspace::repository::WorkspaceRepository;
use crate::features::workspace::service::WorkspaceService;
use crate::testing::app::MockHost;
use crate::testing::backend::StubBackend;
use crate::testing::package::sample_package;
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
        "translated",
        "analyzed",
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
        "createdAt",
        "updatedAt",
    ] {
        assert!(value.get(key).is_some(), "{key}");
    }
    assert!(value.get("translationStatus").is_none());
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

fn novel_payload(title: &str) -> serde_json::Value {
    json!({ "title": title, "lang": "ZH", "tags": ["B", "a"] })
}

#[test]
fn every_novel_command_reports_no_workspace_through_ipc() {
    let host = MockHost::new();

    host.expect_code(
        &[
            ("novel_list", json!({})),
            ("novel_create", json!({ "input": novel_payload("Book") })),
            ("novel_update", json!({ "id": 1, "patch": {} })),
            ("novel_delete", json!({ "ids": [1] })),
            ("novel_cover_get", json!({ "id": 1 })),
            (
                "novel_cover_set",
                json!({ "id": 1, "dataUrl": "data:image/png;base64,AA==" }),
            ),
            ("novel_cover_clear", json!({ "id": 1 })),
            ("novel_chapters", json!({ "novelId": 1 })),
            (
                "novel_chapter_read",
                json!({ "novelId": 1, "chapterId": "c" }),
            ),
            (
                "novel_paragraph_update",
                json!({ "novelId": 1, "chapterId": "c", "n": 1, "text": "t" }),
            ),
            (
                "novel_chapter_write",
                json!({ "novelId": 1, "chapterId": "c", "text": "t" }),
            ),
            ("novel_chapter_add", json!({ "novelId": 1, "title": "t" })),
            (
                "novel_chapter_rename",
                json!({ "novelId": 1, "chapterId": "c", "title": "t" }),
            ),
            (
                "novel_chapter_delete",
                json!({ "novelId": 1, "chapterId": "c" }),
            ),
            (
                "novel_chapter_move",
                json!({ "novelId": 1, "chapterId": "c", "toSeq": 1 }),
            ),
            (
                "novel_paragraph_add",
                json!({ "novelId": 1, "chapterId": "c", "text": "t" }),
            ),
            (
                "novel_package_import",
                json!({ "path": "book.dsnovel", "meta": novel_payload("Book") }),
            ),
            (
                "novel_package_export",
                json!({ "id": 1, "path": "book.dsnovel" }),
            ),
        ],
        "no_workspace",
    );
}

#[test]
fn novels_and_chapters_are_managed_through_ipc() {
    let host = MockHost::new();
    host.open_workspace();

    let book = host
        .invoke("novel_create", json!({ "input": novel_payload("Book") }))
        .unwrap();
    let id = book["id"].as_i64().unwrap();
    let renamed = host
        .invoke(
            "novel_update",
            json!({ "id": id, "patch": { "title": "Renamed" } }),
        )
        .unwrap();
    let added = host
        .invoke(
            "novel_chapter_add",
            json!({ "novelId": id, "title": "One" }),
        )
        .unwrap();
    let chapter = added["id"].as_str().unwrap().to_string();
    let second = host
        .invoke(
            "novel_chapter_add",
            json!({ "novelId": id, "title": "Two" }),
        )
        .unwrap();
    let second_id = second["id"].as_str().unwrap().to_string();
    host.invoke(
        "novel_chapter_write",
        json!({ "novelId": id, "chapterId": chapter, "text": "first\nsecond" }),
    )
    .unwrap();
    host.invoke(
        "novel_paragraph_add",
        json!({ "novelId": id, "chapterId": chapter, "text": "third" }),
    )
    .unwrap();
    host.invoke(
        "novel_paragraph_update",
        json!({ "novelId": id, "chapterId": chapter, "n": 1, "text": "changed" }),
    )
    .unwrap();
    let paragraphs = host
        .invoke(
            "novel_chapter_read",
            json!({ "novelId": id, "chapterId": chapter }),
        )
        .unwrap();
    let titled = host
        .invoke(
            "novel_chapter_rename",
            json!({ "novelId": id, "chapterId": chapter, "title": "Opening" }),
        )
        .unwrap();
    let moved = host
        .invoke(
            "novel_chapter_move",
            json!({ "novelId": id, "chapterId": second_id, "toSeq": 1 }),
        )
        .unwrap();
    let remaining = host
        .invoke(
            "novel_chapter_delete",
            json!({ "novelId": id, "chapterId": second_id }),
        )
        .unwrap();
    let chapters = host
        .invoke("novel_chapters", json!({ "novelId": id }))
        .unwrap();
    let listed = host.invoke("novel_list", json!({})).unwrap();
    let deleted = host.invoke("novel_delete", json!({ "ids": [id] })).unwrap();

    assert_eq!(renamed["title"], "Renamed");
    assert_eq!(paragraphs.as_array().unwrap().len(), 3);
    assert_eq!(titled["title"], "Opening");
    assert_eq!(moved.as_array().unwrap().len(), 2);
    assert_eq!(remaining.as_array().unwrap().len(), 1);
    assert_eq!(chapters.as_array().unwrap().len(), 1);
    assert_eq!(listed.as_array().unwrap().len(), 1);
    assert_eq!(deleted, 1);
}

#[test]
fn novel_covers_are_set_read_and_cleared_through_ipc() {
    let host = MockHost::new();
    host.open_workspace();
    let book = host
        .invoke("novel_create", json!({ "input": novel_payload("Book") }))
        .unwrap();
    let id = book["id"].as_i64().unwrap();
    let png = "data:image/png;base64,iVBORw0KGgo=";

    host.invoke("novel_cover_set", json!({ "id": id, "dataUrl": png }))
        .unwrap();
    let stored = host.invoke("novel_cover_get", json!({ "id": id })).unwrap();
    host.invoke("novel_cover_clear", json!({ "id": id }))
        .unwrap();
    let cleared = host.invoke("novel_cover_get", json!({ "id": id })).unwrap();

    assert_eq!(stored, png);
    assert!(cleared.is_null());
}

#[test]
fn packages_are_inspected_imported_and_exported_through_ipc() {
    let host = MockHost::new();
    let dir = host.dir.path().to_path_buf();
    host.open_workspace();
    let package = dir.join("book.dsnovel");
    std::fs::write(&package, sample_package(2)).unwrap();
    let path = package.to_str().unwrap();

    let inspected = host.invoke(
        "novel_package_inspect",
        json!({ "path": path, "onEvent": "__CHANNEL__:1" }),
    );
    let imported = host
        .invoke(
            "novel_package_import",
            json!({ "path": path, "meta": novel_payload("Imported") }),
        )
        .unwrap();
    let target = dir.join("out.dsnovel");
    let exported = host
        .invoke(
            "novel_package_export",
            json!({ "id": imported["id"], "path": target.to_str().unwrap() }),
        )
        .unwrap();

    assert!(inspected.is_ok(), "{inspected:?}");
    assert_eq!(imported["chapterCount"], 2);
    assert_eq!(exported["chapterCount"], 2);
    assert!(target.is_file());
}
