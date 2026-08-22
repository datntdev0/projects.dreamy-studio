use super::*;
use crate::commands::novel;
use crate::commands::workspace::perform_load;
use crate::container::AppContainer;
use crate::features::knowledge::files::KnowledgeFiles;
use crate::features::knowledge::merge::entity_id;
use crate::features::knowledge::models::AnalysisEntity;
use crate::features::knowledge::models::AnalysisEvidence;
use crate::features::knowledge::models::ChapterAnalysis;
use crate::features::knowledge::models::KnowledgeLang;
use crate::features::knowledge::text::text_hash;
use crate::features::novel::models::NovelInput;
use crate::features::novel::service::NovelService;
use crate::features::workspace::load::LoadEvent;
use crate::features::workspace::load::LoadRequest;
use crate::features::workspace::loader::WorkspaceLoader;
use crate::features::workspace::repository::WorkspaceRepository;
use crate::features::workspace::service::WorkspaceService;
use crate::testing::backend::StubBackend;
use serde_json::json;
use std::sync::Arc;
use tempfile::TempDir;

struct Fixture {
    _dir: TempDir,
    session: WorkspaceSession,
    novels: NovelService,
    service: KnowledgeService,
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
        service: KnowledgeService::new(),
    }
}

fn novel_input() -> NovelInput {
    serde_json::from_value(json!({ "title": "Title", "lang": "ZH" })).unwrap()
}

fn analyzed_novel(fixture: &Fixture, source_hash: &str) -> i64 {
    let created = novel::create_novel(&fixture.novels, &fixture.session, novel_input()).unwrap();
    let chapter = novel::add_chapter(&fixture.novels, &fixture.session, created.id, "One").unwrap();
    novel::add_paragraph(
        &fixture.novels,
        &fixture.session,
        created.id,
        &chapter.id,
        "Lin Mo drew his sword.",
    )
    .unwrap();
    let workspace = fixture.session.current().unwrap();
    KnowledgeFiles::new(workspace.path.into())
        .write(
            created.id,
            KnowledgeLang::Src,
            &chapter.id,
            &ChapterAnalysis {
                ontology: 1,
                source_hash: source_hash.to_string(),
                analyzed_at: "2026-01-01T00:00:00Z".to_string(),
                entities: vec![AnalysisEntity {
                    id: "E1".to_string(),
                    kind: "character".to_string(),
                    name: "Lin Mo".to_string(),
                    titles: Vec::new(),
                    aliases: Vec::new(),
                    ev: vec![AnalysisEvidence {
                        p: 1,
                        q: "drew his sword".to_string(),
                    }],
                }],
                facts: Vec::new(),
            },
        )
        .unwrap();
    created.id
}

#[test]
fn get_without_a_workspace_returns_no_workspace() {
    let error = get(&KnowledgeService::new(), &WorkspaceSession::new(), 1, "src").unwrap_err();

    assert_eq!(error.code, KnowledgeErrorCode::NoWorkspace);
    assert_eq!(serde_json::to_value(error).unwrap()["code"], "no_workspace");
}

#[test]
fn get_serializes_the_merged_knowledge_as_camel_case() {
    let fixture = entered_fixture();
    let fresh = text_hash(&["Lin Mo drew his sword.".to_string()]);
    let novel_id = analyzed_novel(&fixture, &fresh);

    let knowledge = get(&fixture.service, &fixture.session, novel_id, "src").unwrap();
    let value = serde_json::to_value(knowledge).unwrap();

    assert_eq!(value["lang"], "src");
    assert_eq!(value["items"][0]["kind"], "entity");
    assert_eq!(value["items"][0]["type"], "character");
    assert_eq!(value["items"][0]["name"], "Lin Mo");
    assert_eq!(value["items"][0]["ev"][0]["chapter"], 1);
    assert_eq!(value["items"][0]["ev"][0]["verified"], true);
    assert_eq!(value["items"][0]["stale"], json!([]));
    assert_eq!(value["analyzed"]["1"]["stale"], false);
    assert_eq!(value["analyzed"]["1"]["entities"], 1);
    assert_eq!(value["analyzed"]["1"]["facts"], 0);
    assert_eq!(value["analyzed"]["1"]["at"], "2026-01-01T00:00:00Z");
    assert!(!value.to_string().contains("sourceHash"));
    assert!(!value.to_string().contains("source_hash"));
}

#[test]
fn get_marks_a_changed_chapter_stale() {
    let fixture = entered_fixture();
    let novel_id = analyzed_novel(&fixture, "outdated");

    let value =
        serde_json::to_value(get(&fixture.service, &fixture.session, novel_id, "src").unwrap())
            .unwrap();

    assert_eq!(value["analyzed"]["1"]["stale"], true);
    assert_eq!(value["items"][0]["stale"], json!([1]));
}

#[test]
fn errors_serialize_as_code_and_detail() {
    let fixture = entered_fixture();

    let error = get(&fixture.service, &fixture.session, 1, "FR").unwrap_err();
    let value = serde_json::to_value(error).unwrap();

    assert_eq!(value["code"], "invalid_input");
    assert_eq!(value["detail"], "unsupported lang 'FR'");
    assert_eq!(value.as_object().unwrap().len(), 2);
}

#[test]
fn edit_and_stale_accept_without_a_workspace_return_no_workspace() {
    let service = KnowledgeService::new();
    let session = WorkspaceSession::new();
    let edits: Vec<KnowledgeEdit> =
        serde_json::from_value(json!([{ "k": "del", "id": "E1" }])).unwrap();

    let edited = edit(&service, &session, 1, "src", edits).unwrap_err();
    let accepted = stale_accept(&service, &session, 1, "src", &[1]).unwrap_err();

    assert_eq!(edited.code, KnowledgeErrorCode::NoWorkspace);
    assert_eq!(accepted.code, KnowledgeErrorCode::NoWorkspace);
}

#[test]
fn edit_decodes_json_edits_and_serializes_the_result_as_camel_case() {
    let fixture = entered_fixture();
    let fresh = text_hash(&["Lin Mo drew his sword.".to_string()]);
    let novel_id = analyzed_novel(&fixture, &fresh);
    let old_id = entity_id("character", "Lin Mo");
    let new_id = entity_id("character", "Lin");
    let edits: Vec<KnowledgeEdit> =
        serde_json::from_value(json!([{ "k": "rename", "id": old_id, "name": "Lin" }])).unwrap();

    let result = edit(&fixture.service, &fixture.session, novel_id, "src", edits).unwrap();
    let value = serde_json::to_value(result).unwrap();

    assert_eq!(value.as_object().unwrap().len(), 2);
    assert_eq!(value["knowledge"]["lang"], "src");
    assert_eq!(value["knowledge"]["items"][0]["name"], "Lin");
    assert_eq!(value["knowledge"]["items"][0]["id"], new_id);
    assert_eq!(value["knowledge"]["analyzed"]["1"]["stale"], false);
    assert_eq!(value["remap"][&old_id], new_id);
    let reread = get(&fixture.service, &fixture.session, novel_id, "src").unwrap();
    assert_eq!(serde_json::to_value(reread).unwrap(), value["knowledge"]);
}

#[test]
fn edit_errors_serialize_as_code_and_detail() {
    let fixture = entered_fixture();
    let fresh = text_hash(&["Lin Mo drew his sword.".to_string()]);
    let novel_id = analyzed_novel(&fixture, &fresh);

    let empty = edit(
        &fixture.service,
        &fixture.session,
        novel_id,
        "src",
        Vec::new(),
    )
    .unwrap_err();
    let missing: Vec<KnowledgeEdit> = serde_json::from_value(
        json!([{ "k": "rename", "id": entity_id("character", "Lin Mo"), "name": "Nobody" }]),
    )
    .unwrap();
    let rejected = edit(&fixture.service, &fixture.session, novel_id, "src", missing).unwrap_err();

    assert_eq!(
        serde_json::to_value(empty).unwrap()["code"],
        "invalid_input"
    );
    assert_eq!(
        serde_json::to_value(rejected).unwrap()["code"],
        "text_not_found"
    );
}

#[test]
fn stale_accept_clears_the_stale_flag_in_the_serialized_view() {
    let fixture = entered_fixture();
    let novel_id = analyzed_novel(&fixture, "outdated");

    let accepted = stale_accept(&fixture.service, &fixture.session, novel_id, "src", &[1]).unwrap();
    let value = serde_json::to_value(accepted).unwrap();

    assert_eq!(value["analyzed"]["1"]["stale"], false);
    assert_eq!(value["items"][0]["stale"], json!([]));
    let unknown =
        stale_accept(&fixture.service, &fixture.session, novel_id, "src", &[7]).unwrap_err();
    assert_eq!(serde_json::to_value(unknown).unwrap()["code"], "not_found");
    let empty = stale_accept(&fixture.service, &fixture.session, novel_id, "src", &[]).unwrap_err();
    assert_eq!(
        serde_json::to_value(empty).unwrap()["code"],
        "invalid_input"
    );
}
