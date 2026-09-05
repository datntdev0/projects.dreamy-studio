use super::*;
use crate::features::pipeline::executor::PipelineExecutor;
use crate::features::pipeline::models::PipelineStatus;
use crate::features::pipeline::models::TaskStatus;
use crate::features::pipeline::repository::PipelineRepository;
use crate::features::project::models::ProjectResult;
use crate::features::project::service::ProjectWorkspace;
use crate::features::workspace::inspector::WORKSPACE_DB_FILE;
use crate::infra::storage::database::Database;
use crate::testing::audio::FakeVoice;
use crate::testing::audio::segment_request;
use crate::testing::job::RecordingTarget;
use crate::testing::project::create_project;
use crate::testing::project::project_workspace;
use serde_json::json;
use std::sync::atomic::Ordering;
use tempfile::TempDir;

struct Setup {
    _dir: TempDir,
    projects: ProjectWorkspace,
    project_id: i64,
}

fn setup() -> Setup {
    let (dir, projects) = project_workspace();
    let project_id = create_project(&projects);
    Setup {
        _dir: dir,
        projects,
        project_id,
    }
}

fn requests() -> BTreeMap<String, SegmentRequest> {
    ["b1", "b2"]
        .iter()
        .map(|id| (id.to_string(), segment_request("Hello", Some("narr"), 4)))
        .collect()
}

fn job(setup: &Setup, voice: Arc<dyn SegmentVoice>) -> AudioJob {
    AudioJob::new(
        AudiobookWorkspace::new(setup.projects.clone()),
        setup.project_id,
        requests(),
        voice,
    )
}

fn boxed(job: AudioJob) -> Box<dyn PipelineJob> {
    Box::new(job)
}

fn tasks(ids: &[&str]) -> Vec<TaskRequest> {
    ids.iter()
        .map(|id| TaskRequest {
            chapter_id: "U01".to_string(),
            passage: None,
            segment_id: Some(id.to_string()),
        })
        .collect()
}

fn task_of(id: &str) -> PipelineTask {
    PipelineTask {
        id: 1,
        chapter_id: "U01".to_string(),
        segment_id: Some(id.to_string()),
        passage: None,
        status: TaskStatus::Running,
        progress: 0,
        error: String::new(),
        started_at: None,
        finished_at: None,
    }
}

fn stored(setup: &Setup) -> Vec<String> {
    AudiobookWorkspace::new(setup.projects.clone())
        .unit_get(setup.project_id, "U01")
        .unwrap()
        .audio
        .into_keys()
        .collect()
}

#[test]
fn the_job_belongs_to_the_project() {
    let setup = setup();
    let job = job(&setup, Arc::new(FakeVoice::speaking(1.0))).with_scope("Chapter 1");

    assert_eq!(job.kind(), KIND_AUDIO);
    assert_eq!(job.owner(), JobOwner::Project(setup.project_id));
    assert_eq!(job.scope(), "Chapter 1");
    assert_eq!(job.dir(), setup.projects.dir());
}

#[test]
fn generates_one_segment_per_task_and_records_the_project_pipeline() {
    let setup = setup();
    let voice = Arc::new(FakeVoice::speaking(1.0));
    let sink = Arc::new(RecordingTarget::new());

    let started = PipelineExecutor::new()
        .start(
            boxed(job(&setup, voice.clone())),
            tasks(&["b1", "b2"]),
            sink.clone(),
        )
        .unwrap();
    let finished = sink.wait_for_finished();

    assert_eq!(started.project_id, Some(setup.project_id));
    assert_eq!(started.novel_id, None);
    assert_eq!(started.tasks[0].segment_id.as_deref(), Some("b1"));
    assert_eq!(finished.status, PipelineStatus::Completed);
    assert_eq!(finished.done, 2);
    assert_eq!(voice.calls().len(), 2);
    assert_eq!(stored(&setup), vec!["b1", "b2"]);
}

#[test]
fn backend_failures_fail_the_task_with_the_backend_message() {
    let setup = setup();
    let sink = Arc::new(RecordingTarget::new());
    let voice = Arc::new(FakeVoice::failing("backend is not running"));

    PipelineExecutor::new()
        .start(boxed(job(&setup, voice)), tasks(&["b1"]), sink.clone())
        .unwrap();
    let finished = sink.wait_for_finished();

    assert_eq!(finished.status, PipelineStatus::Failed);
    assert_eq!(finished.tasks[0].status, TaskStatus::Failed);
    assert_eq!(finished.tasks[0].error, "backend is not running");
    assert!(stored(&setup).is_empty());
}

#[test]
fn a_cancelled_task_generates_nothing() {
    let setup = setup();
    let voice = Arc::new(FakeVoice::speaking(1.0));
    let job = job(&setup, voice.clone());

    let outcome = job.run(
        &task_of("b1"),
        &TaskLog::none(),
        &|_| {},
        &AtomicBool::new(true),
    );

    assert_eq!(outcome, Err(TaskOutcome::Cancelled));
    assert!(voice.calls().is_empty());
    assert!(stored(&setup).is_empty());
}

struct CancellingVoice {
    cancel: Arc<AtomicBool>,
    inner: FakeVoice,
}

impl SegmentVoice for CancellingVoice {
    fn speak(&self, voice_id: i64, text: &str) -> ProjectResult<Vec<u8>> {
        self.cancel.store(true, Ordering::SeqCst);
        self.inner.speak(voice_id, text)
    }
}

#[test]
fn a_task_cancelled_while_speaking_discards_the_audio() {
    let setup = setup();
    let cancel = Arc::new(AtomicBool::new(false));
    let voice = Arc::new(CancellingVoice {
        cancel: cancel.clone(),
        inner: FakeVoice::speaking(1.0),
    });
    let job = job(&setup, voice);

    let outcome = job.run(&task_of("b1"), &TaskLog::none(), &|_| {}, &cancel);

    assert_eq!(outcome, Err(TaskOutcome::Cancelled));
    assert!(stored(&setup).is_empty());
}

#[test]
fn validation_requires_a_request_for_every_segment() {
    let setup = setup();
    let job = job(&setup, Arc::new(FakeVoice::speaking(1.0)));
    let mut no_segment = tasks(&["b1"]);
    no_segment[0].segment_id = None;
    let mut bad_unit = tasks(&["b1"]);
    bad_unit[0].chapter_id = "../U".to_string();

    assert!(job.validate(&tasks(&["b1", "b2"])).is_ok());
    for rejected in [tasks(&["b3"]), no_segment, bad_unit, tasks(&["../b"])] {
        let error = job.validate(&rejected).unwrap_err();
        assert_eq!(error.code, PipelineErrorCode::InvalidInput);
    }
}

#[test]
fn same_unit_tasks_are_distinct_by_segment() {
    let setup = setup();
    let sink = Arc::new(RecordingTarget::new());
    let executor = PipelineExecutor::new();

    let duplicate = executor
        .start(
            boxed(job(&setup, Arc::new(FakeVoice::speaking(1.0)))),
            tasks(&["b1", "b1"]),
            sink,
        )
        .unwrap_err();

    assert_eq!(duplicate.code, PipelineErrorCode::InvalidInput);
}

#[test]
fn requests_are_read_from_the_params() {
    let parsed = requests_of(&json!({
        "requests": { "b1": { "text": "Hi", "speaker": "narr", "voice": 2, "speed": 1.2, "paren": "" } }
    }))
    .unwrap();

    assert_eq!(parsed["b1"].voice, 2);
    assert_eq!(parsed["b1"].speed, 1.2);
    assert!(requests_of(&json!({})).is_err());
    assert!(requests_of(&json!({ "requests": { "b1": { "text": "Hi" } } })).is_err());
}

struct SilentSynthesizer;

impl Synthesizer for SilentSynthesizer {
    fn synthesize(
        &self,
        _request: &crate::features::backend::models::SynthesisRequest,
    ) -> Result<
        crate::features::backend::models::SynthesizedAudio,
        crate::infra::backend_client::ClientError,
    > {
        Err(crate::infra::backend_client::ClientError::Unreachable(
            "offline".to_string(),
        ))
    }
}

#[test]
fn the_factory_needs_a_project_owner_and_an_open_workspace() {
    let factory = AudioJobFactory::new(
        ProjectService::new(),
        LibraryService::new(),
        Arc::new(SilentSynthesizer),
    );
    let session = WorkspaceSession::new();
    let params = json!({ "requests": {} });

    let novel = factory
        .create(&session, JobOwner::Novel(1), &params)
        .err()
        .unwrap();
    let closed = factory
        .create(&session, JobOwner::Project(1), &params)
        .err()
        .unwrap();

    assert_eq!(novel.code, PipelineErrorCode::InvalidInput);
    assert_eq!(closed.code, PipelineErrorCode::NoWorkspace);
}

#[test]
fn deleting_the_project_removes_its_pipelines() {
    let setup = setup();
    let sink = Arc::new(RecordingTarget::new());
    PipelineExecutor::new()
        .start(
            boxed(job(&setup, Arc::new(FakeVoice::speaking(1.0)))),
            tasks(&["b1"]),
            sink.clone(),
        )
        .unwrap();
    sink.wait_for_finished();

    setup.projects.delete(&[setup.project_id]).unwrap();

    let db = Database::open_read_only(&setup.projects.dir().join(WORKSPACE_DB_FILE)).unwrap();
    let left = PipelineRepository::new(db.connection())
        .list_history(None, 10)
        .unwrap();
    assert!(left.is_empty());
}
