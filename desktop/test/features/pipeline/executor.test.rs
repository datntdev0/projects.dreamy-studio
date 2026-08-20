use super::*;
use crate::features::novel::models::NovelInput;
use crate::features::novel::service::NovelWorkspace;
use crate::infra::storage::database::Database;
use crate::infra::storage::migrator::Migrator;
use crate::infra::storage::migrator::workspace_scripts;
use crate::testing::translator::FakeTranslator;
use std::sync::Condvar;
use std::sync::atomic::AtomicBool;
use std::time::Duration;
use std::time::Instant;
use tempfile::TempDir;

struct RecordingTarget {
    events: Mutex<Vec<PipelineEvent>>,
    finished: Condvar,
}

impl RecordingTarget {
    fn new() -> Self {
        Self {
            events: Mutex::new(Vec::new()),
            finished: Condvar::new(),
        }
    }

    fn wait_for_finished(&self) -> PipelineSnapshot {
        let events = lock(&self.events);
        let (events, _) = self
            .finished
            .wait_timeout_while(events, Duration::from_secs(5), |events| {
                !events
                    .iter()
                    .any(|event| matches!(event, PipelineEvent::Finished { .. }))
            })
            .unwrap();
        events
            .iter()
            .find_map(|event| match event {
                PipelineEvent::Finished { pipeline } => Some(pipeline.clone()),
                _ => None,
            })
            .expect("pipeline should finish")
    }
}

impl PipelineTarget for RecordingTarget {
    fn deliver(&self, event: PipelineEvent) -> Result<(), String> {
        let is_finished = matches!(event, PipelineEvent::Finished { .. });
        lock(&self.events).push(event);
        if is_finished {
            self.finished.notify_all();
        }
        Ok(())
    }
}

struct Fixture {
    _dir: TempDir,
    novel: NovelWorkspace,
    translation: TranslationWorkspace,
    novel_id: i64,
    chapter_id: String,
}

fn fixture() -> Fixture {
    let dir = TempDir::new().unwrap();
    let mut db = Database::create(&dir.path().join(WORKSPACE_DB_FILE)).unwrap();
    Migrator::migrate(
        db.connection_mut(),
        &workspace_scripts().unwrap(),
        &AtomicBool::new(false),
    )
    .unwrap();
    let path = dir.path().to_path_buf();
    let novel = NovelWorkspace::new(path.clone());
    let novel_id = novel
        .create(NovelInput {
            title: "Book".to_string(),
            name: String::new(),
            author: String::new(),
            lang: "ZH".to_string(),
            description: String::new(),
            tags: Vec::new(),
        })
        .unwrap()
        .id;
    let chapter = novel.chapter_add(novel_id, "Chapter").unwrap();
    novel
        .paragraph_add(novel_id, &chapter.id, "source")
        .unwrap();
    Fixture {
        _dir: dir,
        novel,
        translation: TranslationWorkspace::new(path),
        novel_id,
        chapter_id: chapter.id,
    }
}

#[test]
fn completes_a_translation_and_emits_lifecycle_events() {
    let fixture = fixture();
    let executor = PipelineExecutor::new(Arc::new(FakeTranslator::with_delay(
        Duration::from_millis(10),
    )));
    let target = Arc::new(RecordingTarget::new());
    let snapshot = executor
        .start(
            fixture.translation.clone(),
            PipelineStart {
                novel_id: fixture.novel_id,
                target: "VI".to_string(),
                tasks: vec![TaskRequest {
                    chapter_id: fixture.chapter_id.clone(),
                    passage: None,
                }],
            },
            target.clone(),
        )
        .unwrap();
    assert_eq!(snapshot.status, PipelineStatus::Running);
    let finished = target.wait_for_finished();
    assert_eq!(finished.status, PipelineStatus::Completed);
    assert_eq!(finished.done, 1);
    let translated = fixture.translation.get(fixture.novel_id, "VI").unwrap();
    assert_eq!(
        translated.chapters[&fixture.chapter_id].paragraphs[0].text,
        "[translated] source"
    );
    assert_eq!(
        fixture.novel.chapters(fixture.novel_id).unwrap()[0].translation_status,
        "none"
    );
    let events = lock(&target.events);
    assert!(matches!(
        events.first(),
        Some(PipelineEvent::Started { .. })
    ));
    assert!(matches!(
        events.last(),
        Some(PipelineEvent::Finished { .. })
    ));
}

#[test]
fn rejects_invalid_requests_without_claiming_the_executor() {
    let fixture = fixture();
    let executor = PipelineExecutor::new(Arc::new(FakeTranslator::with_delay(
        Duration::from_millis(10),
    )));
    let error = executor
        .start(
            fixture.translation,
            PipelineStart {
                novel_id: fixture.novel_id,
                target: "VI".to_string(),
                tasks: Vec::new(),
            },
            Arc::new(RecordingTarget::new()),
        )
        .unwrap_err();
    assert_eq!(error.code, PipelineErrorCode::InvalidInput);
    assert!(!executor.cancel());
}

fn start_request(fixture: &Fixture, target: &str) -> PipelineStart {
    PipelineStart {
        novel_id: fixture.novel_id,
        target: target.to_string(),
        tasks: vec![TaskRequest {
            chapter_id: fixture.chapter_id.clone(),
            passage: None,
        }],
    }
}

fn slow_executor() -> PipelineExecutor {
    PipelineExecutor::new(Arc::new(FakeTranslator::with_delay(Duration::from_secs(10))))
}

fn wait_until(condition: impl Fn() -> bool) {
    let until = Instant::now() + Duration::from_secs(5);
    while !condition() && Instant::now() < until {
        std::thread::sleep(Duration::from_millis(5));
    }
    assert!(condition(), "condition was not met in time");
}

fn statuses(fixture: &Fixture, ids: &[i64]) -> Vec<PipelineStatus> {
    let db = database(&fixture.translation).unwrap();
    let repo = PipelineRepository::new(db.connection());
    ids.iter()
        .map(|id| repo.snapshot(*id).unwrap().unwrap().status)
        .collect()
}

#[test]
fn queues_a_second_pipeline_at_the_default_limit_and_runs_it_afterwards() {
    let fixture = fixture();
    let executor = PipelineExecutor::new(Arc::new(FakeTranslator::with_delay(
        Duration::from_millis(150),
    )));
    let first_target = Arc::new(RecordingTarget::new());
    let second_target = Arc::new(RecordingTarget::new());
    let first = executor
        .start(
            fixture.translation.clone(),
            start_request(&fixture, "VI"),
            first_target.clone(),
        )
        .unwrap();
    let second = executor
        .start(
            fixture.translation.clone(),
            start_request(&fixture, "EN"),
            second_target.clone(),
        )
        .unwrap();
    assert_eq!(first.status, PipelineStatus::Running);
    assert_eq!(second.status, PipelineStatus::Queued);
    assert_eq!(second.started_at, None);
    assert_eq!(second.tasks[0].status, TaskStatus::Queued);

    assert_eq!(first_target.wait_for_finished().status, PipelineStatus::Completed);
    let finished = second_target.wait_for_finished();
    assert_eq!(finished.status, PipelineStatus::Completed);
    assert!(finished.started_at.is_some());
    let events = lock(&second_target.events);
    assert!(matches!(events.first(), Some(PipelineEvent::Started { pipeline }) if pipeline.status == PipelineStatus::Queued));
    assert!(events.iter().any(|event| matches!(event, PipelineEvent::Updated { pipeline } if pipeline.status == PipelineStatus::Running)));
}

#[test]
fn runs_pipelines_in_parallel_up_to_the_limit() {
    let fixture = fixture();
    let executor = slow_executor();
    executor.set_limits(PipelineLimits::new(2, 5));
    let first = executor
        .start(
            fixture.translation.clone(),
            start_request(&fixture, "VI"),
            Arc::new(RecordingTarget::new()),
        )
        .unwrap();
    let second = executor
        .start(
            fixture.translation.clone(),
            start_request(&fixture, "EN"),
            Arc::new(RecordingTarget::new()),
        )
        .unwrap();
    let third = executor
        .start(
            fixture.translation.clone(),
            start_request(&fixture, "VI"),
            Arc::new(RecordingTarget::new()),
        )
        .unwrap();
    assert_eq!(first.status, PipelineStatus::Running);
    assert_eq!(second.status, PipelineStatus::Running);
    assert_eq!(third.status, PipelineStatus::Queued);
    assert!(executor.cancel());
}

#[test]
fn allows_the_same_novel_and_target_twice() {
    let fixture = fixture();
    let executor = slow_executor();
    executor.set_limits(PipelineLimits::new(2, 5));
    let first = executor
        .start(
            fixture.translation.clone(),
            start_request(&fixture, "VI"),
            Arc::new(RecordingTarget::new()),
        )
        .unwrap();
    let second = executor
        .start(
            fixture.translation.clone(),
            start_request(&fixture, "VI"),
            Arc::new(RecordingTarget::new()),
        )
        .unwrap();
    assert_eq!(first.status, PipelineStatus::Running);
    assert_eq!(second.status, PipelineStatus::Running);
    assert!(executor.cancel());
}

#[test]
fn cancels_a_queued_pipeline_without_running_it() {
    let fixture = fixture();
    let executor = slow_executor();
    let first_target = Arc::new(RecordingTarget::new());
    let first = executor
        .start(
            fixture.translation.clone(),
            start_request(&fixture, "VI"),
            first_target.clone(),
        )
        .unwrap();
    let second_target = Arc::new(RecordingTarget::new());
    let second = executor
        .start(
            fixture.translation.clone(),
            start_request(&fixture, "EN"),
            second_target.clone(),
        )
        .unwrap();
    assert_eq!(second.status, PipelineStatus::Queued);
    assert!(executor.cancel_pipeline(second.id));
    let finished = second_target.wait_for_finished();
    assert_eq!(finished.status, PipelineStatus::Cancelled);
    assert_eq!(finished.tasks[0].status, TaskStatus::Cancelled);
    assert_eq!(finished.started_at, None);
    assert_eq!(statuses(&fixture, &[first.id]), vec![PipelineStatus::Running]);
    assert!(!executor.cancel_pipeline(second.id));
    assert!(executor.cancel_pipeline(first.id));
    assert_eq!(first_target.wait_for_finished().status, PipelineStatus::Cancelled);
}

#[test]
fn cancels_only_the_requested_pipeline() {
    let fixture = fixture();
    let executor = slow_executor();
    executor.set_limits(PipelineLimits::new(2, 5));
    let first_target = Arc::new(RecordingTarget::new());
    let first = executor
        .start(
            fixture.translation.clone(),
            start_request(&fixture, "VI"),
            first_target.clone(),
        )
        .unwrap();
    let second_target = Arc::new(RecordingTarget::new());
    let second = executor
        .start(
            fixture.translation.clone(),
            start_request(&fixture, "EN"),
            second_target.clone(),
        )
        .unwrap();
    assert!(!executor.cancel_pipeline(first.id + second.id + 1));
    assert!(executor.cancel_pipeline(first.id));
    let finished = first_target.wait_for_finished();
    assert_eq!(finished.id, first.id);
    assert_eq!(finished.status, PipelineStatus::Cancelled);
    wait_until(|| lock(&executor.inner.active).len() == 1);
    assert!(!executor.cancel_pipeline(first.id));
    assert!(executor.cancel_pipeline(second.id));
    assert_eq!(second_target.wait_for_finished().status, PipelineStatus::Cancelled);
}

struct CountingTranslator {
    running: std::sync::atomic::AtomicUsize,
    peak: std::sync::atomic::AtomicUsize,
}

impl Translator for CountingTranslator {
    fn translate(
        &self,
        job: &TranslateJob,
        progress: &dyn Fn(u8),
        _cancel: &AtomicBool,
    ) -> Result<TranslatedRun, TranslateError> {
        use std::sync::atomic::Ordering::SeqCst;
        let now = self.running.fetch_add(1, SeqCst) + 1;
        self.peak.fetch_max(now, SeqCst);
        std::thread::sleep(Duration::from_millis(40));
        self.running.fetch_sub(1, SeqCst);
        progress(100);
        Ok(TranslatedRun {
            title: job.title.clone(),
            paragraphs: job.paragraphs.clone(),
        })
    }
}

#[test]
fn caps_the_running_tasks_across_every_pipeline() {
    let fixture = fixture();
    let second_chapter = fixture.novel.chapter_add(fixture.novel_id, "Two").unwrap();
    fixture
        .novel
        .paragraph_add(fixture.novel_id, &second_chapter.id, "source")
        .unwrap();
    let third_chapter = fixture.novel.chapter_add(fixture.novel_id, "Three").unwrap();
    fixture
        .novel
        .paragraph_add(fixture.novel_id, &third_chapter.id, "source")
        .unwrap();
    let translator = Arc::new(CountingTranslator {
        running: std::sync::atomic::AtomicUsize::new(0),
        peak: std::sync::atomic::AtomicUsize::new(0),
    });
    let executor = PipelineExecutor::new(translator.clone());
    executor.set_limits(PipelineLimits::new(2, 2));
    let chapters = [
        fixture.chapter_id.clone(),
        second_chapter.id.clone(),
        third_chapter.id.clone(),
    ];
    let targets = [Arc::new(RecordingTarget::new()), Arc::new(RecordingTarget::new())];
    for (target, name) in targets.iter().zip(["VI", "EN"]) {
        let tasks = chapters
            .iter()
            .map(|chapter_id| TaskRequest {
                chapter_id: chapter_id.clone(),
                passage: None,
            })
            .collect();
        executor
            .start(
                fixture.translation.clone(),
                PipelineStart {
                    novel_id: fixture.novel_id,
                    target: name.to_string(),
                    tasks,
                },
                target.clone(),
            )
            .unwrap();
    }
    for target in &targets {
        let finished = target.wait_for_finished();
        assert_eq!(finished.status, PipelineStatus::Completed);
        assert_eq!(finished.done, 3);
    }
    assert_eq!(translator.peak.load(std::sync::atomic::Ordering::SeqCst), 2);
}

#[test]
fn clamps_the_limits_to_at_least_one() {
    assert_eq!(PipelineLimits::new(0, 0), PipelineLimits::new(1, 1));
    assert_eq!(PipelineLimits::new(0, 0).max_tasks, 1);
}
