use super::*;
use crate::commands::novel;
use crate::commands::workspace::perform_load;
use crate::container::AppContainer;
use crate::features::novel::models::NovelInput;
use crate::features::novel::service::NovelService;
use crate::features::pipeline::models::PipelineEvent;
use crate::features::pipeline::repository::PipelineRepository;
use crate::features::translation::service::TranslationService;
use crate::features::workspace::inspector::WORKSPACE_DB_FILE;
use crate::features::workspace::load::LoadEvent;
use crate::features::workspace::load::LoadRequest;
use crate::features::workspace::loader::WorkspaceLoader;
use crate::features::workspace::repository::WorkspaceRepository;
use crate::features::workspace::repository::format_timestamp;
use crate::features::workspace::service::WorkspaceService;
use crate::features::workspace::session::WorkspaceSession;
use crate::infra::storage::database::Database;
use crate::testing::backend::StubBackend;
use crate::testing::translator::FakeTranslator;
use chrono::Utc;
use serde_json::json;
use std::sync::Arc;
use std::sync::Mutex;
use std::time::Duration;
use tempfile::TempDir;

struct Fixture {
    _dir: TempDir,
    session: WorkspaceSession,
    novels: NovelService,
}

#[derive(Default)]
struct RecordingTarget {
    events: Mutex<Vec<PipelineEvent>>,
}

impl PipelineTarget for RecordingTarget {
    fn deliver(&self, event: PipelineEvent) -> Result<(), String> {
        self.events.lock().unwrap().push(event);
        Ok(())
    }
}

fn ignore_event(_event: LoadEvent) {}

fn fixture() -> Fixture {
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
    }
}

fn novel_input() -> NovelInput {
    serde_json::from_value(json!({ "title": "Title", "lang": "ZH" })).unwrap()
}

fn novel_with_chapter(fixture: &Fixture) -> (i64, String) {
    let novel = novel::create_novel(&fixture.novels, &fixture.session, novel_input()).unwrap();
    let chapter = novel::add_chapter(&fixture.novels, &fixture.session, novel.id, "One").unwrap();
    novel::add_paragraph(
        &fixture.novels,
        &fixture.session,
        novel.id,
        &chapter.id,
        "Source",
    )
    .unwrap();
    (novel.id, chapter.id)
}

fn database(fixture: &Fixture) -> Database {
    let workspace = fixture.session.current().unwrap();
    Database::open_read_write(&std::path::Path::new(&workspace.path).join(WORKSPACE_DB_FILE))
        .unwrap()
}

#[test]
fn commands_without_a_workspace_return_no_workspace() {
    let executor = PipelineExecutor::new(Arc::new(FakeTranslator::with_delay(Duration::ZERO)));
    let translation = TranslationService::new();
    let session = WorkspaceSession::new();
    let sink: Arc<dyn PipelineTarget> = Arc::new(RecordingTarget::default());

    let start = start_pipeline(
        &executor,
        &translation,
        &session,
        1,
        "VI".to_string(),
        Vec::new(),
        sink,
    )
    .unwrap_err();
    let history = list_history(&session, 1, None).unwrap_err();

    assert_eq!(start.code, PipelineErrorCode::NoWorkspace);
    assert_eq!(history.code, PipelineErrorCode::NoWorkspace);
    assert_eq!(serde_json::to_value(start).unwrap()["code"], "no_workspace");
}

#[test]
fn cancel_on_an_idle_executor_is_false() {
    let executor = PipelineExecutor::new(Arc::new(FakeTranslator::with_delay(Duration::ZERO)));

    assert!(!cancel_pipeline(&executor, None));
    assert!(!cancel_pipeline(&executor, Some(1)));
}

#[test]
fn history_is_newest_first_and_clamps_the_limit() {
    let fixture = fixture();
    let (novel_id, chapter_id) = novel_with_chapter(&fixture);
    let database = database(&fixture);
    let repo = PipelineRepository::new(database.connection());
    let task = TaskRequest {
        chapter_id,
        passage: None,
    };
    let first = repo
        .insert_pipeline_with_tasks(
            novel_id,
            "translation",
            "VI",
            &[task.clone()],
            &format_timestamp(Utc::now()),
        )
        .unwrap();
    let second = repo
        .insert_pipeline_with_tasks(
            novel_id,
            "translation",
            "EN",
            &[task.clone()],
            &format_timestamp(Utc::now()),
        )
        .unwrap();
    let third = repo
        .insert_pipeline_with_tasks(
            novel_id,
            "translation",
            "VI",
            &[task],
            &format_timestamp(Utc::now()),
        )
        .unwrap();

    let one = list_history(&fixture.session, novel_id, Some(0)).unwrap();
    let all = list_history(&fixture.session, novel_id, Some(1000)).unwrap();

    assert_eq!(one.len(), 1);
    assert_eq!(one[0].id, third);
    assert_eq!(
        all.iter().map(|snapshot| snapshot.id).collect::<Vec<_>>(),
        vec![third, second, first]
    );
}

#[test]
fn snapshot_serializes_with_camel_case_fields() {
    let fixture = fixture();
    let (novel_id, chapter_id) = novel_with_chapter(&fixture);
    let database = database(&fixture);
    let repo = PipelineRepository::new(database.connection());
    let id = repo
        .insert_pipeline_with_tasks(
            novel_id,
            "translation",
            "VI",
            &[TaskRequest {
                chapter_id,
                passage: Some(1),
            }],
            &format_timestamp(Utc::now()),
        )
        .unwrap();
    let snapshot = repo.snapshot(id).unwrap().unwrap();
    let value = serde_json::to_value(snapshot).unwrap();

    assert!(value.get("novelId").is_some());
    assert!(value.get("createdAt").is_some());
    assert!(value["tasks"][0].get("chapterId").is_some());
    assert!(value["tasks"][0].get("startedAt").is_some());
}

#[test]
fn limits_follow_the_saved_pipeline_settings() {
    let saved = PipelineSettings {
        max_pipelines: Some(3),
        max_tasks: Some(8),
    };

    assert_eq!(limits_of(saved), PipelineLimits::new(3, 8));
    assert_eq!(
        limits_of(PipelineSettings::default()),
        PipelineLimits::default()
    );
}
