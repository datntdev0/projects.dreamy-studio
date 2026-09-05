use super::*;
use crate::commands::novel;
use crate::commands::workspace::perform_load;
use crate::container::AppContainer;
use crate::features::knowledge::models::KnowledgeLang;
use crate::features::knowledge::service::KnowledgeService;
use crate::features::novel::models::NovelInput;
use crate::features::novel::service::NovelService;
use crate::features::pipeline::job::JobFactory;
use crate::features::pipeline::job::PipelineJob;
use crate::features::pipeline::jobs::analysis::AnalysisJobFactory;
use crate::features::pipeline::jobs::translation::TranslationJobFactory;
use crate::features::pipeline::models::PipelineEvent;
use crate::features::pipeline::models::PipelineStatus;
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
use crate::testing::analyzer::FakeAnalyzer;
use crate::testing::app::MockHost;
use crate::testing::backend::StubBackend;
use crate::testing::translator::FakeTranslator;
use chrono::Utc;
use serde_json::json;
use std::sync::Arc;
use std::sync::Mutex;
use std::time::Duration;
use std::time::Instant;
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

impl RecordingTarget {
    fn wait_for_finished(&self) -> PipelineSnapshot {
        let until = Instant::now() + Duration::from_secs(5);
        loop {
            let finished = self
                .events
                .lock()
                .unwrap()
                .iter()
                .find_map(|event| match event {
                    PipelineEvent::Finished { pipeline } => Some(pipeline.clone()),
                    _ => None,
                });
            if let Some(pipeline) = finished {
                return pipeline;
            }
            assert!(Instant::now() < until, "pipeline did not finish in time");
            std::thread::sleep(Duration::from_millis(5));
        }
    }
}

struct ProbeFactory {
    seen: Arc<Mutex<Vec<serde_json::Value>>>,
}

impl JobFactory for ProbeFactory {
    fn kind(&self) -> &'static str {
        "probe"
    }

    fn create(
        &self,
        _session: &WorkspaceSession,
        _owner: JobOwner,
        params: &serde_json::Value,
    ) -> PipelineResult<Box<dyn PipelineJob>> {
        self.seen.lock().unwrap().push(params.clone());
        Err(PipelineError::invalid("probe stops here"))
    }
}

fn registry() -> JobRegistry {
    JobRegistry::new()
        .register(Arc::new(TranslationJobFactory::new(
            TranslationService::new(),
            Arc::new(FakeTranslator::with_delay(Duration::ZERO)),
        )))
        .register(Arc::new(AnalysisJobFactory::new(
            KnowledgeService::new(),
            Arc::new(FakeAnalyzer::new()),
        )))
}

fn analysis_request(novel_id: i64, lang: Option<&str>) -> JobRequest {
    JobRequest {
        kind: Some("analysis".to_string()),
        novel_id: Some(novel_id),
        lang: lang.map(str::to_string),
        ..JobRequest::default()
    }
}

fn request(novel_id: i64, target: Option<&str>) -> JobRequest {
    JobRequest {
        novel_id: Some(novel_id),
        target: target.map(str::to_string),
        ..JobRequest::default()
    }
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
    let executor = PipelineExecutor::new();
    let session = WorkspaceSession::new();
    let sink: Arc<dyn PipelineTarget> = Arc::new(RecordingTarget::default());

    let start = start_pipeline(
        &executor,
        &registry(),
        &session,
        request(1, Some("VI")),
        Vec::new(),
        sink,
    )
    .unwrap_err();
    let history = list_history(&session, Some(JobOwner::Novel(1)), None).unwrap_err();

    assert_eq!(start.code, PipelineErrorCode::NoWorkspace);
    assert_eq!(history.code, PipelineErrorCode::NoWorkspace);
    assert_eq!(serde_json::to_value(start).unwrap()["code"], "no_workspace");
}

#[test]
fn cancel_on_an_idle_executor_is_false() {
    let executor = PipelineExecutor::new();

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
        segment_id: None,
    };
    let first = repo
        .insert_pipeline_with_tasks(
            novel_id,
            "translation",
            "VI",
            std::slice::from_ref(&task),
            &format_timestamp(Utc::now()),
        )
        .unwrap();
    let second = repo
        .insert_pipeline_with_tasks(
            novel_id,
            "translation",
            "EN",
            std::slice::from_ref(&task),
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

    let one = list_history(&fixture.session, Some(JobOwner::Novel(novel_id)), Some(0)).unwrap();
    let all = list_history(
        &fixture.session,
        Some(JobOwner::Novel(novel_id)),
        Some(1000),
    )
    .unwrap();

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
                segment_id: None,
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

fn task_of(chapter_id: &str) -> Vec<TaskRequest> {
    vec![TaskRequest {
        chapter_id: chapter_id.to_string(),
        passage: None,
        segment_id: None,
    }]
}

#[test]
fn the_default_kind_is_translation() {
    let fixture = fixture();
    let (novel_id, chapter_id) = novel_with_chapter(&fixture);
    let executor = PipelineExecutor::new();
    let sink = Arc::new(RecordingTarget::default());

    let snapshot = start_pipeline(
        &executor,
        &registry(),
        &fixture.session,
        request(novel_id, Some("VI")),
        task_of(&chapter_id),
        sink.clone(),
    )
    .unwrap();

    assert_eq!(snapshot.kind, "translation");
    assert_eq!(snapshot.target, "VI");
    assert_eq!(snapshot.novel_id, Some(novel_id));
    let finished = sink.wait_for_finished();
    assert_eq!(finished.status, PipelineStatus::Completed);
    assert_eq!(finished.done, 1);
}

#[test]
fn an_explicit_translation_kind_reads_the_target_from_params() {
    let fixture = fixture();
    let (novel_id, chapter_id) = novel_with_chapter(&fixture);
    let executor = PipelineExecutor::new();
    let sink = Arc::new(RecordingTarget::default());
    let mut job = request(novel_id, None);
    job.kind = Some("translation".to_string());
    job.params = Some(json!({ "target": "EN" }));

    let snapshot = start_pipeline(
        &executor,
        &registry(),
        &fixture.session,
        job,
        task_of(&chapter_id),
        sink.clone(),
    )
    .unwrap();

    assert_eq!(snapshot.target, "EN");
    assert_eq!(sink.wait_for_finished().status, PipelineStatus::Completed);
}

#[test]
fn an_unknown_kind_is_invalid_input() {
    let fixture = fixture();
    let (novel_id, chapter_id) = novel_with_chapter(&fixture);
    let executor = PipelineExecutor::new();
    let mut job = request(novel_id, Some("VI"));
    job.kind = Some("unknown".to_string());

    let error = start_pipeline(
        &executor,
        &registry(),
        &fixture.session,
        job,
        task_of(&chapter_id),
        Arc::new(RecordingTarget::default()),
    )
    .unwrap_err();

    assert_eq!(error.code, PipelineErrorCode::InvalidInput);
    assert_eq!(
        serde_json::to_value(error).unwrap()["code"],
        "invalid_input"
    );
    assert!(!executor.cancel());
}

#[test]
fn a_translation_without_a_target_is_invalid_input() {
    let fixture = fixture();
    let (novel_id, chapter_id) = novel_with_chapter(&fixture);

    let error = start_pipeline(
        &PipelineExecutor::new(),
        &registry(),
        &fixture.session,
        request(novel_id, None),
        task_of(&chapter_id),
        Arc::new(RecordingTarget::default()),
    )
    .unwrap_err();

    assert_eq!(error.code, PipelineErrorCode::InvalidInput);
}

#[test]
fn a_translation_to_an_unsupported_target_is_invalid_input() {
    let fixture = fixture();
    let (novel_id, chapter_id) = novel_with_chapter(&fixture);

    let error = start_pipeline(
        &PipelineExecutor::new(),
        &registry(),
        &fixture.session,
        request(novel_id, Some("FR")),
        task_of(&chapter_id),
        Arc::new(RecordingTarget::default()),
    )
    .unwrap_err();

    assert_eq!(error.code, PipelineErrorCode::InvalidInput);
}

#[test]
fn a_target_equal_to_the_novel_language_is_rejected() {
    let fixture = fixture();
    let input = serde_json::from_value(json!({ "title": "Sach", "lang": "VI" })).unwrap();
    let novel = novel::create_novel(&fixture.novels, &fixture.session, input).unwrap();
    let chapter = novel::add_chapter(&fixture.novels, &fixture.session, novel.id, "Mot").unwrap();
    novel::add_paragraph(
        &fixture.novels,
        &fixture.session,
        novel.id,
        &chapter.id,
        "Van ban",
    )
    .unwrap();

    let error = start_pipeline(
        &PipelineExecutor::new(),
        &registry(),
        &fixture.session,
        request(novel.id, Some("VI")),
        task_of(&chapter.id),
        Arc::new(RecordingTarget::default()),
    )
    .unwrap_err();

    assert_eq!(error.code, PipelineErrorCode::InvalidInput);
    assert_eq!(error.detail, "target must differ from the novel language");
}

#[test]
fn target_and_lang_fold_into_the_params_of_the_job() {
    let fixture = fixture();
    let seen = Arc::new(Mutex::new(Vec::new()));
    let registry = JobRegistry::new().register(Arc::new(ProbeFactory { seen: seen.clone() }));
    let mut job = request(1, Some("VI"));
    job.kind = Some("probe".to_string());
    job.lang = Some("src".to_string());
    job.params = Some(json!({ "extra": 1 }));

    let error = start_pipeline(
        &PipelineExecutor::new(),
        &registry,
        &fixture.session,
        job,
        Vec::new(),
        Arc::new(RecordingTarget::default()),
    )
    .unwrap_err();

    assert_eq!(error.detail, "probe stops here");
    assert_eq!(
        *seen.lock().unwrap(),
        vec![json!({ "extra": 1, "target": "VI", "lang": "src" })]
    );
}

#[test]
fn params_fold_only_what_is_given() {
    assert_eq!(job_params(None, None, None).unwrap(), json!({}));
    assert_eq!(
        job_params(None, None, Some(Value::Null)).unwrap(),
        json!({})
    );
    assert_eq!(
        job_params(Some("VI".to_string()), None, None).unwrap(),
        json!({ "target": "VI" })
    );
    assert_eq!(
        job_params(None, Some("EN".to_string()), None).unwrap(),
        json!({ "lang": "EN" })
    );
    assert_eq!(
        job_params(Some("VI".to_string()), Some("EN".to_string()), None).unwrap(),
        json!({ "target": "VI", "lang": "EN" })
    );
}

#[test]
fn explicit_params_win_over_target_and_lang() {
    let params = job_params(
        Some("VI".to_string()),
        Some("EN".to_string()),
        Some(json!({ "target": "EN", "other": true })),
    )
    .unwrap();

    assert_eq!(
        params,
        json!({ "target": "EN", "other": true, "lang": "EN" })
    );
}

#[test]
fn params_must_be_an_object() {
    let error = job_params(None, None, Some(json!([1]))).unwrap_err();

    assert_eq!(error.code, PipelineErrorCode::InvalidInput);
}

fn start_analysis(
    fixture: &Fixture,
    request: JobRequest,
    tasks: Vec<TaskRequest>,
) -> PipelineResult<PipelineSnapshot> {
    start_pipeline(
        &PipelineExecutor::new(),
        &registry(),
        &fixture.session,
        request,
        tasks,
        Arc::new(RecordingTarget::default()),
    )
}

#[test]
fn an_analysis_starts_with_a_lang_and_stores_the_result() {
    let fixture = fixture();
    let (novel_id, chapter_id) = novel_with_chapter(&fixture);
    let executor = PipelineExecutor::new();
    let translated = Arc::new(RecordingTarget::default());
    start_pipeline(
        &executor,
        &registry(),
        &fixture.session,
        request(novel_id, Some("VI")),
        task_of(&chapter_id),
        translated.clone(),
    )
    .unwrap();
    translated.wait_for_finished();
    let sink = Arc::new(RecordingTarget::default());

    let snapshot = start_pipeline(
        &executor,
        &registry(),
        &fixture.session,
        analysis_request(novel_id, Some("VI")),
        task_of(&chapter_id),
        sink.clone(),
    )
    .unwrap();

    assert_eq!(snapshot.kind, "analysis");
    assert_eq!(snapshot.target, "VI");
    assert_eq!(snapshot.novel_id, Some(novel_id));
    let finished = sink.wait_for_finished();
    assert_eq!(finished.status, PipelineStatus::Completed);
    let stored = KnowledgeService::new()
        .open(&fixture.session)
        .unwrap()
        .load_chapters(novel_id, KnowledgeLang::Vi)
        .unwrap();
    assert_eq!(stored.len(), 1);
    assert_eq!(stored[0].id, chapter_id);
}

#[test]
fn an_analysis_of_the_source_text_needs_no_translation() {
    let fixture = fixture();
    let (novel_id, chapter_id) = novel_with_chapter(&fixture);
    let sink = Arc::new(RecordingTarget::default());

    let snapshot = start_pipeline(
        &PipelineExecutor::new(),
        &registry(),
        &fixture.session,
        analysis_request(novel_id, Some("src")),
        task_of(&chapter_id),
        sink.clone(),
    )
    .unwrap();

    assert_eq!(snapshot.target, "src");
    assert_eq!(sink.wait_for_finished().status, PipelineStatus::Completed);
}

#[test]
fn an_analysis_without_a_lang_is_invalid_input() {
    let fixture = fixture();
    let (novel_id, chapter_id) = novel_with_chapter(&fixture);

    let error = start_analysis(
        &fixture,
        analysis_request(novel_id, None),
        task_of(&chapter_id),
    )
    .unwrap_err();

    assert_eq!(error.code, PipelineErrorCode::InvalidInput);
    assert_eq!(error.detail, "lang is required");
}

#[test]
fn an_analysis_with_an_unsupported_lang_is_invalid_input() {
    let fixture = fixture();
    let (novel_id, chapter_id) = novel_with_chapter(&fixture);

    let error = start_analysis(
        &fixture,
        analysis_request(novel_id, Some("FR")),
        task_of(&chapter_id),
    )
    .unwrap_err();

    assert_eq!(error.code, PipelineErrorCode::InvalidInput);
    assert_eq!(error.detail, "unsupported lang 'FR'");
}

#[test]
fn an_analysis_of_an_unknown_novel_is_not_found() {
    let fixture = fixture();
    let (novel_id, chapter_id) = novel_with_chapter(&fixture);

    let error = start_analysis(
        &fixture,
        analysis_request(novel_id + 100, Some("src")),
        task_of(&chapter_id),
    )
    .unwrap_err();

    assert_eq!(error.code, PipelineErrorCode::NotFound);
}

#[test]
fn an_analysis_reads_the_lang_from_params() {
    let fixture = fixture();
    let (novel_id, chapter_id) = novel_with_chapter(&fixture);
    let mut job = analysis_request(novel_id, None);
    job.params = Some(json!({ "lang": "src" }));

    let sink = Arc::new(RecordingTarget::default());

    let snapshot = start_pipeline(
        &PipelineExecutor::new(),
        &registry(),
        &fixture.session,
        job,
        task_of(&chapter_id),
        sink.clone(),
    )
    .unwrap();

    assert_eq!(snapshot.kind, "analysis");
    assert_eq!(snapshot.target, "src");
    assert_eq!(sink.wait_for_finished().status, PipelineStatus::Completed);
}

#[test]
fn pipeline_commands_report_no_workspace_through_ipc() {
    let host = MockHost::new();

    host.expect_code(
        &[
            (
                "pipeline_history_list",
                json!({ "novelId": 1, "limit": null }),
            ),
            (
                "pipeline_start",
                json!({
                    "kind": "analysis",
                    "novelId": 1,
                    "lang": "src",
                    "tasks": [],
                    "onEvent": "__CHANNEL__:1"
                }),
            ),
        ],
        "no_workspace",
    );
}

#[test]
fn pipeline_history_is_listed_and_cancelling_nothing_is_false_through_ipc() {
    let host = MockHost::new();
    host.open_workspace();
    let (novel, _) = host.seed_novel(&[("One", "alpha")]);

    let history = host
        .invoke(
            "pipeline_history_list",
            json!({ "novelId": novel, "limit": 5 }),
        )
        .unwrap();
    let cancelled = host
        .invoke("pipeline_cancel", json!({ "pipelineId": null }))
        .unwrap();
    let invalid = host
        .invoke(
            "pipeline_start",
            json!({
                "kind": "translation",
                "novelId": novel,
                "tasks": [],
                "onEvent": "__CHANNEL__:2"
            }),
        )
        .unwrap_err();

    assert!(history.as_array().unwrap().is_empty());
    assert_eq!(cancelled, false);
    assert_eq!(invalid["code"], "invalid_input");
}

#[test]
fn pipelines_need_exactly_one_owner() {
    let fixture = fixture();
    let executor = PipelineExecutor::new();
    let sink: Arc<dyn PipelineTarget> = Arc::new(RecordingTarget::default());
    let both = JobRequest {
        project_id: Some(2),
        ..request(1, Some("VI"))
    };
    let neither = JobRequest {
        novel_id: None,
        ..request(1, Some("VI"))
    };

    for job in [both, neither] {
        let error = start_pipeline(
            &executor,
            &registry(),
            &fixture.session,
            job,
            task_of("c1"),
            sink.clone(),
        )
        .unwrap_err();
        assert_eq!(error.code, PipelineErrorCode::InvalidInput);
    }
    let project = start_pipeline(
        &executor,
        &registry(),
        &fixture.session,
        JobRequest {
            novel_id: None,
            project_id: Some(1),
            ..request(1, Some("VI"))
        },
        task_of("c1"),
        sink,
    )
    .unwrap_err();
    assert_eq!(project.code, PipelineErrorCode::InvalidInput);
    assert_eq!(JobOwner::filter(None, None).unwrap(), None);
    assert!(JobOwner::filter(Some(1), Some(2)).is_err());
}
