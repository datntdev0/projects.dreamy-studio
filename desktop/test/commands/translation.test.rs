use super::*;
use crate::commands::novel;
use crate::commands::workspace::perform_load;
use crate::container::AppContainer;
use crate::features::novel::models::NovelInput;
use crate::features::novel::service::NovelService;
use crate::features::translation::files::TranslationFiles;
use crate::features::translation::models::ChapterFile;
use crate::features::translation::models::DictInput;
use crate::features::translation::models::DictPatch;
use crate::features::translation::models::TranslatedParagraph;
use crate::features::translation::models::TranslationErrorCode;
use crate::features::translation::models::TranslationTarget;
use crate::features::translation::service::TranslationService;
use crate::features::workspace::load::LoadEvent;
use crate::features::workspace::load::LoadRequest;
use crate::features::workspace::loader::WorkspaceLoader;
use crate::features::workspace::repository::WorkspaceRepository;
use crate::features::workspace::service::WorkspaceService;
use crate::features::workspace::session::WorkspaceSession;
use crate::testing::backend::StubBackend;
use serde_json::json;
use std::sync::Arc;
use tempfile::TempDir;

struct Fixture {
    _dir: TempDir,
    session: WorkspaceSession,
    novels: NovelService,
    service: TranslationService,
}

fn ignore_event(_event: LoadEvent) {}

fn entered_fixture() -> Fixture {
    let dir = TempDir::new().unwrap();
    let workspace = dir.path().join("studio");
    std::fs::create_dir(&workspace).unwrap();
    let container = AppContainer::with_backend(
        dir.path().join("DreamyStudio"),
        Arc::new(StubBackend::new()),
    );
    let workspaces =
        WorkspaceService::new(WorkspaceRepository::new(container.database_path.clone()));
    let loader = WorkspaceLoader::from_container(&container, workspaces);
    let session = WorkspaceSession::new();
    perform_load(
        &loader,
        &session,
        LoadRequest::new(workspace.to_str().unwrap(), None),
        &ignore_event,
    )
    .unwrap();
    loader.enter(&session).unwrap();
    Fixture {
        _dir: dir,
        session,
        novels: NovelService::new(),
        service: TranslationService::new(),
    }
}

fn novel_input() -> NovelInput {
    serde_json::from_value(json!({ "title": "Title", "lang": "ZH" })).unwrap()
}

fn dict_input(src: &str, dst: &str) -> DictInput {
    serde_json::from_value(json!({ "src": src, "dst": dst, "type": "term", "note": "" })).unwrap()
}

fn translated_chapter(fixture: &Fixture, novel_id: i64) -> String {
    let chapter = novel::add_chapter(&fixture.novels, &fixture.session, novel_id, "One").unwrap();
    novel::add_paragraph(
        &fixture.novels,
        &fixture.session,
        novel_id,
        &chapter.id,
        "Source term",
    )
    .unwrap();
    let original =
        novel::read_chapter(&fixture.novels, &fixture.session, novel_id, &chapter.id).unwrap();
    let workspace = fixture.session.current().unwrap();
    TranslationFiles::new(workspace.path.into())
        .write_chapter(
            novel_id,
            TranslationTarget::Vi,
            &chapter.id,
            &ChapterFile {
                title: "Translated title".to_string(),
                paragraphs: vec![TranslatedParagraph {
                    original_hashcheck: original[0].hashcheck.clone(),
                    text: "Translated text".to_string(),
                    note: String::new(),
                }],
            },
        )
        .unwrap();
    chapter.id
}

#[test]
fn commands_without_a_workspace_return_no_workspace() {
    let error = get(
        &TranslationService::new(),
        &WorkspaceSession::new(),
        1,
        "VI",
    )
    .unwrap_err();

    assert_eq!(error.code, TranslationErrorCode::NoWorkspace);
    assert_eq!(serde_json::to_value(error).unwrap()["code"], "no_workspace");
}

#[test]
fn get_and_guidelines_save_round_trip_the_empty_translation() {
    let fixture = entered_fixture();
    let created = novel::create_novel(&fixture.novels, &fixture.session, novel_input()).unwrap();

    let empty = get(&fixture.service, &fixture.session, created.id, "VI").unwrap();
    assert!(empty.guidelines.is_empty());
    assert!(empty.dict.is_empty());
    assert!(empty.chapters.is_empty());
    assert!(empty.warnings.is_empty());
    assert!(
        guidelines_save(
            &fixture.service,
            &fixture.session,
            created.id,
            "VI",
            " guide "
        )
        .unwrap()
    );
    assert!(
        !guidelines_save(
            &fixture.service,
            &fixture.session,
            created.id,
            "VI",
            "guide"
        )
        .unwrap()
    );

    let saved = get(&fixture.service, &fixture.session, created.id, "VI").unwrap();
    assert_eq!(saved.guidelines, "guide");
}

#[test]
fn dictionary_commands_round_trip_and_refresh_warnings() {
    let fixture = entered_fixture();
    let created = novel::create_novel(&fixture.novels, &fixture.session, novel_input()).unwrap();
    let chapter_id = translated_chapter(&fixture, created.id);

    let added = dict_add(
        &fixture.service,
        &fixture.session,
        created.id,
        "VI",
        dict_input("Source", "Nguon"),
    )
    .unwrap();
    assert_eq!(added.flagged, 1);
    let patch: DictPatch = serde_json::from_value(json!({ "dst": "Translated" })).unwrap();
    let updated = dict_update(
        &fixture.service,
        &fixture.session,
        created.id,
        added.entry.id,
        patch,
    )
    .unwrap();
    assert_eq!(updated.entry.dst, "Translated");
    assert_eq!(
        warnings(&fixture.service, &fixture.session, created.id, "VI")
            .unwrap()
            .len(),
        0
    );
    dict_delete(
        &fixture.service,
        &fixture.session,
        created.id,
        updated.entry.id,
    )
    .unwrap();

    let translation = get(&fixture.service, &fixture.session, created.id, "VI").unwrap();
    assert!(translation.dict.is_empty());
    assert!(translation.chapters.contains_key(&chapter_id));
}

#[test]
fn passage_and_note_commands_round_trip_existing_translation() {
    let fixture = entered_fixture();
    let created = novel::create_novel(&fixture.novels, &fixture.session, novel_input()).unwrap();
    let chapter_id = translated_chapter(&fixture, created.id);

    let passage = passage_save(
        &fixture.service,
        &fixture.session,
        created.id,
        "VI",
        &chapter_id,
        1,
        "  Changed text  ",
    )
    .unwrap();
    let noted = note_save(
        &fixture.service,
        &fixture.session,
        created.id,
        "VI",
        &chapter_id,
        1,
        "  Note  ",
    )
    .unwrap();

    assert_eq!(passage.paragraphs[0].text, "Changed text");
    assert_eq!(noted.paragraphs[0].note, "Note");
    assert_eq!(
        noted.paragraphs[0].original_hashcheck,
        passage.paragraphs[0].original_hashcheck
    );
}

#[test]
fn invalid_target_returns_invalid_input() {
    let fixture = entered_fixture();
    let created = novel::create_novel(&fixture.novels, &fixture.session, novel_input()).unwrap();

    let error = get(&fixture.service, &fixture.session, created.id, "FR").unwrap_err();

    assert_eq!(error.code, TranslationErrorCode::InvalidInput);
    assert_eq!(
        serde_json::to_value(error).unwrap()["code"],
        "invalid_input"
    );
}

#[test]
fn translation_values_serialize_with_the_camel_case_contract() {
    let fixture = entered_fixture();
    let created = novel::create_novel(&fixture.novels, &fixture.session, novel_input()).unwrap();
    let chapter_id = translated_chapter(&fixture, created.id);
    let added = dict_add(
        &fixture.service,
        &fixture.session,
        created.id,
        "VI",
        dict_input("Source", "Missing"),
    )
    .unwrap();

    let value =
        serde_json::to_value(get(&fixture.service, &fixture.session, created.id, "VI").unwrap())
            .unwrap();
    assert!(value["chapters"].get(&chapter_id).is_some());
    assert_eq!(value["chapters"][&chapter_id]["paragraphs"][0]["n"], 1);
    assert!(
        value["chapters"][&chapter_id]["paragraphs"][0]
            .get("originalHashcheck")
            .is_some()
    );
    assert_eq!(value["dict"][0]["type"], "term");
    assert_eq!(value["warnings"][0]["entryId"], added.entry.id);
    assert_eq!(value["warnings"][0]["kind"], "dict");

    let source = serde_json::to_value(crate::features::translation::warnings::TranslationWarning {
        kind: crate::features::translation::warnings::WarningKind::Source,
        chapter_id,
        n: 1,
        entry_id: None,
    })
    .unwrap();
    assert!(source["entryId"].is_null());
}

#[test]
fn task_failure_maps_to_a_task_error() {
    let error = task_failure(tauri::Error::InvalidIcon(std::io::Error::other("boom")));

    assert_eq!(error.code, TranslationErrorCode::Task);
}
