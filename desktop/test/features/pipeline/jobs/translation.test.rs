use super::*;
use crate::features::pipeline::executor::PipelineExecutor;
use crate::features::pipeline::models::PipelineStatus;
use crate::features::pipeline::models::TaskStatus;
use crate::features::pipeline::translator::TranslateError;
use crate::features::pipeline::translator::TranslateJob;
use crate::features::translation::service::TranslatedRun;
use crate::testing::job::JobFixture;
use crate::testing::job::RecordingTarget;
use crate::testing::translator::FakeTranslator;
use std::time::Duration;

struct PickyTranslator;

impl Translator for PickyTranslator {
    fn translate(
        &self,
        job: &TranslateJob,
        _log: &TaskLog,
        progress: &dyn Fn(u8),
        _cancel: &AtomicBool,
    ) -> Result<TranslatedRun, TranslateError> {
        if job.title == "Bad" {
            return Err(TranslateError::Failed("provider refused".to_string()));
        }
        progress(100);
        Ok(TranslatedRun {
            title: job.title.clone(),
            paragraphs: job.paragraphs.clone(),
        })
    }
}

struct PanickingTranslator;

impl Translator for PanickingTranslator {
    fn translate(
        &self,
        _job: &TranslateJob,
        _log: &TaskLog,
        _progress: &dyn Fn(u8),
        _cancel: &AtomicBool,
    ) -> Result<TranslatedRun, TranslateError> {
        panic!("translator exploded");
    }
}

struct Setup {
    fixture: JobFixture,
    workspace: TranslationWorkspace,
}

fn setup() -> Setup {
    let fixture = JobFixture::new();
    let workspace = TranslationWorkspace::new(fixture.path());
    Setup { fixture, workspace }
}

fn job_with(setup: &Setup, target: &str, translator: Arc<dyn Translator>) -> TranslationJob {
    TranslationJob::new(
        setup.workspace.clone(),
        setup.fixture.novel_id,
        TranslationTarget::parse(target).unwrap(),
        translator,
    )
}

fn job(setup: &Setup, target: &str) -> TranslationJob {
    job_with(
        setup,
        target,
        Arc::new(FakeTranslator::with_delay(Duration::ZERO)),
    )
}

fn break_guidelines(setup: &Setup) {
    let dir = NovelFiles::new(setup.fixture.path()).novel_dir(setup.fixture.novel_id);
    std::fs::create_dir_all(&dir).unwrap();
    std::fs::write(dir.join("translation.json"), "{ not json").unwrap();
}

fn task_of(chapter_id: &str, passage: Option<usize>) -> PipelineTask {
    PipelineTask {
        id: 1,
        chapter_id: chapter_id.to_string(),
        segment_id: None,
        passage,
        status: TaskStatus::Running,
        progress: 0,
        error: String::new(),
        started_at: None,
        finished_at: None,
    }
}

fn request(chapter_id: &str, passage: Option<usize>) -> TaskRequest {
    TaskRequest {
        chapter_id: chapter_id.to_string(),
        passage,
        segment_id: None,
    }
}

fn run(job: &TranslationJob, task: &PipelineTask) -> Result<(), TaskOutcome> {
    job.run(task, &TaskLog::none(), &|_| {}, &AtomicBool::new(false))
}

#[test]
fn describes_itself_for_the_executor() {
    let setup = setup();
    let job = job(&setup, "VI");

    assert_eq!(job.kind(), "translation");
    assert_eq!(job.kind(), KIND_TRANSLATION);
    assert_eq!(job.scope(), "VI");
    assert_eq!(job.owner(), JobOwner::Novel(setup.fixture.novel_id));
    assert_eq!(job.dir(), setup.fixture.path());
}

#[test]
fn a_chapter_run_writes_the_translation_file() {
    let setup = setup();
    let job = job(&setup, "VI");
    job.prepare().unwrap();

    run(&job, &task_of(&setup.fixture.chapter_id, None)).unwrap();

    let translated = setup.workspace.get(setup.fixture.novel_id, "VI").unwrap();
    let chapter = &translated.chapters[&setup.fixture.chapter_id];
    assert_eq!(chapter.title, "[translated] Chapter");
    assert_eq!(chapter.paragraphs[0].text, "[translated] source");
    assert_eq!(
        setup
            .fixture
            .novel
            .chapters(setup.fixture.novel_id)
            .unwrap()[0]
            .translation_status,
        "none"
    );
}

#[test]
fn a_passage_run_replaces_only_that_paragraph() {
    let setup = setup();
    let fixture = &setup.fixture;
    fixture
        .novel
        .paragraph_add(fixture.novel_id, &fixture.chapter_id, "second")
        .unwrap();
    let job = job(&setup, "VI");
    job.prepare().unwrap();
    run(&job, &task_of(&fixture.chapter_id, None)).unwrap();
    setup
        .workspace
        .passage_save(
            fixture.novel_id,
            "VI",
            &fixture.chapter_id,
            1,
            "kept by hand",
        )
        .unwrap();

    run(&job, &task_of(&fixture.chapter_id, Some(2))).unwrap();

    let translated = setup.workspace.get(fixture.novel_id, "VI").unwrap();
    let paragraphs = &translated.chapters[&fixture.chapter_id].paragraphs;
    assert_eq!(paragraphs[0].text, "kept by hand");
    assert_eq!(paragraphs[1].text, "[translated] second");
}

#[test]
fn a_passage_run_without_a_translation_fails_the_task() {
    let setup = setup();
    let job = job(&setup, "VI");
    job.prepare().unwrap();

    let outcome = run(&job, &task_of(&setup.fixture.chapter_id, Some(1))).unwrap_err();

    assert!(matches!(outcome, TaskOutcome::Failed(_)));
}

#[test]
fn a_translator_error_is_a_failed_task() {
    let setup = setup();
    let job = job_with(&setup, "VI", Arc::new(PickyTranslator));
    job.prepare().unwrap();
    let bad = setup.fixture.add_chapter("Bad");

    let outcome = run(&job, &task_of(&bad, None)).unwrap_err();

    assert_eq!(outcome, TaskOutcome::Failed("provider refused".to_string()));
}

#[test]
fn a_translator_panic_is_a_failed_task() {
    let setup = setup();
    let job = job_with(&setup, "VI", Arc::new(PanickingTranslator));
    job.prepare().unwrap();

    let outcome = run(&job, &task_of(&setup.fixture.chapter_id, None)).unwrap_err();

    assert_eq!(
        outcome,
        TaskOutcome::Failed("translator panicked".to_string())
    );
}

#[test]
fn a_cancelled_translator_is_a_cancelled_task_and_writes_nothing() {
    let setup = setup();
    let job = job(&setup, "VI");
    job.prepare().unwrap();
    let cancel = AtomicBool::new(true);

    let outcome = job
        .run(
            &task_of(&setup.fixture.chapter_id, None),
            &TaskLog::none(),
            &|_| {},
            &cancel,
        )
        .unwrap_err();

    assert_eq!(outcome, TaskOutcome::Cancelled);
    let translated = setup.workspace.get(setup.fixture.novel_id, "VI").unwrap();
    assert!(translated.chapters.is_empty());
}

#[test]
fn running_before_prepare_fails_the_task() {
    let setup = setup();
    let job = job(&setup, "VI");

    let outcome = run(&job, &task_of(&setup.fixture.chapter_id, None)).unwrap_err();

    assert_eq!(
        outcome,
        TaskOutcome::Failed("translation job was not prepared".to_string())
    );
}

#[test]
fn prepare_fails_when_the_guidelines_cannot_be_read() {
    let setup = setup();
    let job = job(&setup, "VI");
    break_guidelines(&setup);

    let error = job.prepare().unwrap_err();

    assert!(!error.is_empty());
}

#[test]
fn validates_the_chapters_and_passages_of_the_tasks() {
    let setup = setup();
    let job = job(&setup, "VI");
    let chapter_id = setup.fixture.chapter_id.clone();
    let empty = setup
        .fixture
        .novel
        .chapter_add(setup.fixture.novel_id, "Empty")
        .unwrap();

    assert!(
        job.validate(&[request(&chapter_id, None), request(&chapter_id, Some(1))])
            .is_ok()
    );
    let missing = job
        .validate(&[request("0123456789abcdef0123456789abcdef", None)])
        .unwrap_err();
    let no_paragraphs = job.validate(&[request(&empty.id, None)]).unwrap_err();
    let zero = job.validate(&[request(&chapter_id, Some(0))]).unwrap_err();
    let far = job.validate(&[request(&chapter_id, Some(2))]).unwrap_err();

    assert_eq!(missing.code, PipelineErrorCode::NotFound);
    assert_eq!(no_paragraphs.code, PipelineErrorCode::InvalidInput);
    assert_eq!(no_paragraphs.detail, "chapter has no paragraphs");
    assert_eq!(zero.code, PipelineErrorCode::InvalidInput);
    assert_eq!(far.detail, "passage is out of range");
}

#[test]
fn the_executor_runs_a_translation_job_to_completion() {
    let setup = setup();
    let executor = PipelineExecutor::new();
    let target = Arc::new(RecordingTarget::new());
    let job = job(&setup, "VI");

    let snapshot = executor
        .start(Box::new(job), setup.fixture.tasks(), target.clone())
        .unwrap();

    assert_eq!(snapshot.kind, "translation");
    assert_eq!(snapshot.target, "VI");
    let finished = target.wait_for_finished();
    assert_eq!(finished.status, PipelineStatus::Completed);
    assert_eq!(finished.done, 1);
    let translated = setup.workspace.get(setup.fixture.novel_id, "VI").unwrap();
    assert_eq!(
        translated.chapters[&setup.fixture.chapter_id].paragraphs[0].text,
        "[translated] source"
    );
}

#[test]
fn the_executor_fails_only_the_task_the_translator_refused() {
    let setup = setup();
    let bad = setup.fixture.add_chapter("Bad");
    let executor = PipelineExecutor::new();
    let target = Arc::new(RecordingTarget::new());
    let job = job_with(&setup, "EN", Arc::new(PickyTranslator));
    let mut tasks = setup.fixture.tasks();
    tasks.push(request(&bad, None));

    executor
        .start(Box::new(job), tasks, target.clone())
        .unwrap();

    let finished = target.wait_for_finished();
    assert_eq!(finished.status, PipelineStatus::Failed);
    assert_eq!(finished.done, 1);
    assert_eq!(finished.failed, 1);
    let failed = finished
        .tasks
        .iter()
        .find(|task| task.chapter_id == bad)
        .unwrap();
    assert_eq!(failed.status, TaskStatus::Failed);
    assert_eq!(failed.error, "provider refused");
    let translated = setup.workspace.get(setup.fixture.novel_id, "EN").unwrap();
    assert!(translated.chapters.contains_key(&setup.fixture.chapter_id));
    assert!(!translated.chapters.contains_key(&bad));
}

#[test]
fn the_executor_fails_every_task_when_prepare_fails() {
    let setup = setup();
    break_guidelines(&setup);
    let executor = PipelineExecutor::new();
    let target = Arc::new(RecordingTarget::new());

    executor
        .start(
            Box::new(job(&setup, "VI")),
            setup.fixture.tasks(),
            target.clone(),
        )
        .unwrap();

    let finished = target.wait_for_finished();
    assert_eq!(finished.status, PipelineStatus::Failed);
    assert_eq!(finished.tasks[0].status, TaskStatus::Failed);
    assert!(!finished.tasks[0].error.is_empty());
}

#[test]
fn the_executor_records_a_cancelled_translation_without_writing_it() {
    let setup = setup();
    let executor = PipelineExecutor::new();
    let target = Arc::new(RecordingTarget::new());
    let job = job_with(
        &setup,
        "VI",
        Arc::new(FakeTranslator::with_delay(Duration::from_secs(10))),
    );
    let snapshot = executor
        .start(Box::new(job), setup.fixture.tasks(), target.clone())
        .unwrap();

    assert!(executor.cancel_pipeline(snapshot.id));

    let finished = target.wait_for_finished();
    assert_eq!(finished.status, PipelineStatus::Cancelled);
    assert_eq!(finished.tasks[0].status, TaskStatus::Cancelled);
    let translated = setup.workspace.get(setup.fixture.novel_id, "VI").unwrap();
    assert!(translated.chapters.is_empty());
}

#[test]
fn the_factory_needs_an_open_workspace() {
    let factory = TranslationJobFactory::new(
        TranslationService::new(),
        Arc::new(FakeTranslator::with_delay(Duration::ZERO)),
    );

    let error = factory
        .create(
            &WorkspaceSession::new(),
            JobOwner::Novel(1),
            &serde_json::json!({ "target": "VI" }),
        )
        .err()
        .unwrap();

    assert_eq!(factory.kind(), KIND_TRANSLATION);
    assert_eq!(error.code, PipelineErrorCode::NoWorkspace);
}
