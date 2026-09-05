use super::*;
use crate::testing::job::FAKE_KIND;
use crate::testing::job::FakeJob;
use crate::testing::job::FakeProbe;
use crate::testing::job::JobFixture;
use crate::testing::job::RecordingTarget;
use std::time::Instant;

fn slow_job(fixture: &JobFixture, scope: &str) -> FakeJob {
    FakeJob::new(fixture, scope).with_delay(Duration::from_secs(10))
}

fn wait_until(condition: impl Fn() -> bool) {
    let until = Instant::now() + Duration::from_secs(5);
    while !condition() && Instant::now() < until {
        std::thread::sleep(Duration::from_millis(5));
    }
    assert!(condition(), "condition was not met in time");
}

fn statuses(job: &FakeJob, ids: &[i64]) -> Vec<PipelineStatus> {
    let db = database(job).unwrap();
    let repo = PipelineRepository::new(db.connection());
    ids.iter()
        .map(|id| repo.snapshot(*id).unwrap().unwrap().status)
        .collect()
}

#[test]
fn completes_a_job_and_emits_lifecycle_events() {
    let fixture = JobFixture::new();
    let executor = PipelineExecutor::new();
    let job = FakeJob::new(&fixture, "VI").with_delay(Duration::from_millis(10));
    let target = Arc::new(RecordingTarget::new());
    let snapshot = executor
        .start(job.boxed(), fixture.tasks(), target.clone())
        .unwrap();
    assert_eq!(snapshot.status, PipelineStatus::Running);
    assert_eq!(snapshot.kind, FAKE_KIND);
    assert_eq!(snapshot.target, "VI");
    assert_eq!(snapshot.novel_id, Some(fixture.novel_id));
    assert_eq!(snapshot.project_id, None);
    let finished = target.wait_for_finished();
    assert_eq!(finished.status, PipelineStatus::Completed);
    assert_eq!(finished.done, 1);
    assert_eq!(finished.tasks[0].progress, 100);
    assert_eq!(job.probe().prepared.load(Ordering::SeqCst), 1);
    assert_eq!(job.probe().ran(), vec![(fixture.chapter_id.clone(), None)]);
    let events = target.events();
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
fn marks_only_the_failing_task_as_failed() {
    let fixture = JobFixture::new();
    let second = fixture.add_chapter("Two");
    let executor = PipelineExecutor::new();
    let job = FakeJob::new(&fixture, "VI").failing_chapter(&second);
    let target = Arc::new(RecordingTarget::new());
    let mut tasks = fixture.tasks();
    tasks.push(TaskRequest {
        chapter_id: second.clone(),
        passage: None,
        segment_id: None,
    });
    executor.start(job.boxed(), tasks, target.clone()).unwrap();
    let finished = target.wait_for_finished();
    assert_eq!(finished.status, PipelineStatus::Failed);
    assert_eq!(finished.done, 1);
    assert_eq!(finished.failed, 1);
    let first = finished
        .tasks
        .iter()
        .find(|task| task.chapter_id == fixture.chapter_id)
        .unwrap();
    let failed = finished
        .tasks
        .iter()
        .find(|task| task.chapter_id == second)
        .unwrap();
    assert_eq!(first.status, TaskStatus::Completed);
    assert_eq!(failed.status, TaskStatus::Failed);
    assert_eq!(failed.error, "fake failure");
}

#[test]
fn a_failed_prepare_fails_every_task_with_its_text() {
    let fixture = JobFixture::new();
    let second = fixture.add_chapter("Two");
    let executor = PipelineExecutor::new();
    let job = FakeJob::new(&fixture, "VI").failing_prepare("cannot read the guidelines");
    let target = Arc::new(RecordingTarget::new());
    let mut tasks = fixture.tasks();
    tasks.push(TaskRequest {
        chapter_id: second,
        passage: None,
        segment_id: None,
    });
    executor.start(job.boxed(), tasks, target.clone()).unwrap();
    let finished = target.wait_for_finished();
    assert_eq!(finished.status, PipelineStatus::Failed);
    assert_eq!(finished.failed, 2);
    assert_eq!(job.probe().prepared.load(Ordering::SeqCst), 1);
    assert!(job.probe().ran().is_empty());
    for task in &finished.tasks {
        assert_eq!(task.status, TaskStatus::Failed);
        assert_eq!(task.error, "cannot read the guidelines");
    }
}

#[test]
fn a_panicking_run_fails_only_that_task() {
    let fixture = JobFixture::new();
    let executor = PipelineExecutor::new();
    let job = FakeJob::new(&fixture, "VI").panicking();
    let target = Arc::new(RecordingTarget::new());
    executor
        .start(job.boxed(), fixture.tasks(), target.clone())
        .unwrap();
    let finished = target.wait_for_finished();
    assert_eq!(finished.status, PipelineStatus::Failed);
    assert_eq!(finished.tasks[0].status, TaskStatus::Failed);
    assert_eq!(finished.tasks[0].error, "pipeline task panicked");
}

#[test]
fn rejects_invalid_requests_without_claiming_the_executor() {
    let fixture = JobFixture::new();
    let executor = PipelineExecutor::new();
    let job = FakeJob::new(&fixture, "VI");
    let error = executor
        .start(job.boxed(), Vec::new(), Arc::new(RecordingTarget::new()))
        .unwrap_err();
    assert_eq!(error.code, PipelineErrorCode::InvalidInput);
    assert!(!executor.cancel());
}

#[test]
fn rejects_duplicate_tasks() {
    let fixture = JobFixture::new();
    let executor = PipelineExecutor::new();
    let job = FakeJob::new(&fixture, "VI");
    let mut tasks = fixture.tasks();
    tasks.push(tasks[0].clone());
    let error = executor
        .start(job.boxed(), tasks, Arc::new(RecordingTarget::new()))
        .unwrap_err();
    assert_eq!(error.code, PipelineErrorCode::InvalidInput);
    assert_eq!(error.detail, "duplicate pipeline task");
    assert!(!executor.cancel());
}

#[test]
fn allows_the_same_chapter_as_a_chapter_and_as_a_passage() {
    let fixture = JobFixture::new();
    let executor = PipelineExecutor::new();
    let job = FakeJob::new(&fixture, "VI");
    let mut tasks = fixture.tasks();
    tasks.push(TaskRequest {
        chapter_id: fixture.chapter_id.clone(),
        passage: Some(1),
        segment_id: None,
    });
    let target = Arc::new(RecordingTarget::new());
    executor.start(job.boxed(), tasks, target.clone()).unwrap();
    assert_eq!(target.wait_for_finished().done, 2);
}

#[test]
fn rejects_what_the_job_refuses_without_claiming_the_executor() {
    let fixture = JobFixture::new();
    let executor = PipelineExecutor::new();
    let job = FakeJob::new(&fixture, "VI").rejecting("chapter is not ready");
    let error = executor
        .start(
            job.boxed(),
            fixture.tasks(),
            Arc::new(RecordingTarget::new()),
        )
        .unwrap_err();
    assert_eq!(error.code, PipelineErrorCode::InvalidInput);
    assert_eq!(error.detail, "chapter is not ready");
    assert!(!executor.cancel());
    assert!(job.probe().ran().is_empty());
}

#[test]
fn queues_a_second_pipeline_at_the_default_limit_and_runs_it_afterwards() {
    let fixture = JobFixture::new();
    let executor = PipelineExecutor::new();
    let first_target = Arc::new(RecordingTarget::new());
    let second_target = Arc::new(RecordingTarget::new());
    let first = executor
        .start(
            FakeJob::new(&fixture, "VI")
                .with_delay(Duration::from_millis(150))
                .boxed(),
            fixture.tasks(),
            first_target.clone(),
        )
        .unwrap();
    let second = executor
        .start(
            FakeJob::new(&fixture, "EN")
                .with_delay(Duration::from_millis(150))
                .boxed(),
            fixture.tasks(),
            second_target.clone(),
        )
        .unwrap();
    assert_eq!(first.status, PipelineStatus::Running);
    assert_eq!(second.status, PipelineStatus::Queued);
    assert_eq!(second.started_at, None);
    assert_eq!(second.tasks[0].status, TaskStatus::Queued);

    assert_eq!(
        first_target.wait_for_finished().status,
        PipelineStatus::Completed
    );
    let finished = second_target.wait_for_finished();
    assert_eq!(finished.status, PipelineStatus::Completed);
    assert!(finished.started_at.is_some());
    let events = second_target.events();
    assert!(
        matches!(events.first(), Some(PipelineEvent::Started { pipeline }) if pipeline.status == PipelineStatus::Queued)
    );
    assert!(events.iter().any(|event| matches!(event, PipelineEvent::Updated { pipeline } if pipeline.status == PipelineStatus::Running)));
}

#[test]
fn runs_pipelines_in_parallel_up_to_the_limit() {
    let fixture = JobFixture::new();
    let executor = PipelineExecutor::new();
    executor.set_limits(PipelineLimits::new(2, 5));
    let first = executor
        .start(
            slow_job(&fixture, "VI").boxed(),
            fixture.tasks(),
            Arc::new(RecordingTarget::new()),
        )
        .unwrap();
    let second = executor
        .start(
            slow_job(&fixture, "EN").boxed(),
            fixture.tasks(),
            Arc::new(RecordingTarget::new()),
        )
        .unwrap();
    let third = executor
        .start(
            slow_job(&fixture, "VI").boxed(),
            fixture.tasks(),
            Arc::new(RecordingTarget::new()),
        )
        .unwrap();
    assert_eq!(first.status, PipelineStatus::Running);
    assert_eq!(second.status, PipelineStatus::Running);
    assert_eq!(third.status, PipelineStatus::Queued);
    assert!(executor.cancel());
}

#[test]
fn allows_the_same_novel_and_scope_twice() {
    let fixture = JobFixture::new();
    let executor = PipelineExecutor::new();
    executor.set_limits(PipelineLimits::new(2, 5));
    let first = executor
        .start(
            slow_job(&fixture, "VI").boxed(),
            fixture.tasks(),
            Arc::new(RecordingTarget::new()),
        )
        .unwrap();
    let second = executor
        .start(
            slow_job(&fixture, "VI").boxed(),
            fixture.tasks(),
            Arc::new(RecordingTarget::new()),
        )
        .unwrap();
    assert_eq!(first.status, PipelineStatus::Running);
    assert_eq!(second.status, PipelineStatus::Running);
    assert!(executor.cancel());
}

#[test]
fn cancels_a_running_job_and_marks_its_task_cancelled() {
    let fixture = JobFixture::new();
    let executor = PipelineExecutor::new();
    let job = slow_job(&fixture, "VI");
    let target = Arc::new(RecordingTarget::new());
    let snapshot = executor
        .start(job.boxed(), fixture.tasks(), target.clone())
        .unwrap();
    wait_until(|| job.probe().running.load(Ordering::SeqCst) == 1);
    assert!(executor.cancel_pipeline(snapshot.id));
    let finished = target.wait_for_finished();
    assert_eq!(finished.status, PipelineStatus::Cancelled);
    assert_eq!(finished.tasks[0].status, TaskStatus::Cancelled);
    assert_eq!(finished.done, 0);
}

#[test]
fn a_run_that_succeeds_after_cancel_is_recorded_as_cancelled() {
    let fixture = JobFixture::new();
    let executor = PipelineExecutor::new();
    let job = FakeJob::new(&fixture, "VI")
        .with_delay(Duration::from_millis(200))
        .ignoring_cancel();
    let target = Arc::new(RecordingTarget::new());
    let snapshot = executor
        .start(job.boxed(), fixture.tasks(), target.clone())
        .unwrap();
    wait_until(|| job.probe().running.load(Ordering::SeqCst) == 1);
    assert!(executor.cancel_pipeline(snapshot.id));
    let finished = target.wait_for_finished();
    assert_eq!(finished.status, PipelineStatus::Cancelled);
    assert_eq!(finished.tasks[0].status, TaskStatus::Cancelled);
    assert_eq!(finished.done, 0);
}

#[test]
fn cancels_a_queued_pipeline_without_running_it() {
    let fixture = JobFixture::new();
    let executor = PipelineExecutor::new();
    let first_job = slow_job(&fixture, "VI");
    let first_target = Arc::new(RecordingTarget::new());
    let first = executor
        .start(first_job.boxed(), fixture.tasks(), first_target.clone())
        .unwrap();
    let second_job = slow_job(&fixture, "EN");
    let second_target = Arc::new(RecordingTarget::new());
    let second = executor
        .start(second_job.boxed(), fixture.tasks(), second_target.clone())
        .unwrap();
    assert_eq!(second.status, PipelineStatus::Queued);
    assert!(executor.cancel_pipeline(second.id));
    let finished = second_target.wait_for_finished();
    assert_eq!(finished.status, PipelineStatus::Cancelled);
    assert_eq!(finished.tasks[0].status, TaskStatus::Cancelled);
    assert_eq!(finished.started_at, None);
    assert_eq!(
        statuses(&first_job, &[first.id]),
        vec![PipelineStatus::Running]
    );
    assert!(second_job.probe().ran().is_empty());
    assert_eq!(second_job.probe().prepared.load(Ordering::SeqCst), 0);
    assert!(!executor.cancel_pipeline(second.id));
    assert!(executor.cancel_pipeline(first.id));
    assert_eq!(
        first_target.wait_for_finished().status,
        PipelineStatus::Cancelled
    );
}

#[test]
fn cancels_only_the_requested_pipeline() {
    let fixture = JobFixture::new();
    let executor = PipelineExecutor::new();
    executor.set_limits(PipelineLimits::new(2, 5));
    let first_target = Arc::new(RecordingTarget::new());
    let first = executor
        .start(
            slow_job(&fixture, "VI").boxed(),
            fixture.tasks(),
            first_target.clone(),
        )
        .unwrap();
    let second_target = Arc::new(RecordingTarget::new());
    let second = executor
        .start(
            slow_job(&fixture, "EN").boxed(),
            fixture.tasks(),
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
    assert_eq!(
        second_target.wait_for_finished().status,
        PipelineStatus::Cancelled
    );
}

#[test]
fn caps_the_running_tasks_across_every_pipeline() {
    let fixture = JobFixture::new();
    let second_chapter = fixture.add_chapter("Two");
    let third_chapter = fixture.add_chapter("Three");
    let probe = Arc::new(FakeProbe::default());
    let executor = PipelineExecutor::new();
    executor.set_limits(PipelineLimits::new(2, 2));
    let chapters = [
        fixture.chapter_id.clone(),
        second_chapter.clone(),
        third_chapter.clone(),
    ];
    let targets = [
        Arc::new(RecordingTarget::new()),
        Arc::new(RecordingTarget::new()),
    ];
    for (target, name) in targets.iter().zip(["VI", "EN"]) {
        let tasks = chapters
            .iter()
            .map(|chapter_id| TaskRequest {
                chapter_id: chapter_id.clone(),
                passage: None,
                segment_id: None,
            })
            .collect();
        let job = FakeJob::new(&fixture, name)
            .with_delay(Duration::from_millis(40))
            .with_probe(probe.clone());
        executor.start(job.boxed(), tasks, target.clone()).unwrap();
    }
    for target in &targets {
        let finished = target.wait_for_finished();
        assert_eq!(finished.status, PipelineStatus::Completed);
        assert_eq!(finished.done, 3);
    }
    assert_eq!(probe.peak.load(Ordering::SeqCst), 2);
}

#[test]
fn clamps_the_limits_to_at_least_one() {
    assert_eq!(PipelineLimits::new(0, 0), PipelineLimits::new(1, 1));
    assert_eq!(PipelineLimits::new(0, 0).max_tasks, 1);
}
