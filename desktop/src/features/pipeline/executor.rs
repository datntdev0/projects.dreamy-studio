use crate::features::pipeline::job::PipelineJob;
use crate::features::pipeline::job::TaskOutcome;
use crate::features::pipeline::log::RunLog;
use crate::features::pipeline::log::TaskLog;
use crate::features::pipeline::models::PipelineError;
use crate::features::pipeline::models::PipelineErrorCode;
use crate::features::pipeline::models::PipelineEvent;
use crate::features::pipeline::models::PipelineResult;
use crate::features::pipeline::models::PipelineSnapshot;
use crate::features::pipeline::models::PipelineStatus;
use crate::features::pipeline::models::PipelineTarget;
use crate::features::pipeline::models::PipelineTask;
use crate::features::pipeline::models::TaskRequest;
use crate::features::pipeline::models::TaskStatus;
use crate::features::pipeline::repository::PipelineRepository;
use crate::features::workspace::inspector::WORKSPACE_DB_FILE;
use crate::features::workspace::repository::format_timestamp;
use crate::infra::storage::database::Database;
use chrono::Local;
use chrono::Utc;
use std::collections::HashSet;
use std::collections::VecDeque;
use std::panic::AssertUnwindSafe;
use std::path::PathBuf;
use std::sync::Arc;
use std::sync::Condvar;
use std::sync::Mutex;
use std::sync::MutexGuard;
use std::sync::atomic::AtomicBool;
use std::sync::atomic::AtomicU64;
use std::sync::atomic::Ordering;
use std::thread;
use std::time::Duration;

pub const MAX_PARALLEL_TASKS: usize = 5;
pub const MAX_PARALLEL_PIPELINES: usize = 1;
const MAX_WORKERS_PER_PIPELINE: usize = 10;
const SLOT_POLL: Duration = Duration::from_millis(50);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PipelineLimits {
    pub max_pipelines: usize,
    pub max_tasks: usize,
}

impl Default for PipelineLimits {
    fn default() -> Self {
        Self {
            max_pipelines: MAX_PARALLEL_PIPELINES,
            max_tasks: MAX_PARALLEL_TASKS,
        }
    }
}

impl PipelineLimits {
    pub fn new(max_pipelines: usize, max_tasks: usize) -> Self {
        Self {
            max_pipelines: max_pipelines.max(1),
            max_tasks: max_tasks.max(1),
        }
    }
}

#[derive(Clone)]
pub struct PipelineExecutor {
    inner: Arc<Inner>,
}

struct Inner {
    active: Mutex<Vec<ActiveRun>>,
    limits: Mutex<PipelineLimits>,
    logs: Option<PathBuf>,
    next_token: AtomicU64,
    slots: Slots,
}

struct Slots {
    used: Mutex<usize>,
    freed: Condvar,
}

struct SlotGuard<'a> {
    inner: &'a Inner,
}

impl Drop for SlotGuard<'_> {
    fn drop(&mut self) {
        let mut used = lock(&self.inner.slots.used);
        *used = used.saturating_sub(1);
        drop(used);
        self.inner.slots.freed.notify_all();
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum RunState {
    Queued,
    Running,
}

struct ActiveRun {
    token: u64,
    pipeline_id: Option<i64>,
    state: RunState,
    cancel: Arc<AtomicBool>,
    context: Option<Arc<CoordinatorContext>>,
}

struct CoordinatorContext {
    inner: Arc<Inner>,
    job: Arc<dyn PipelineJob>,
    token: u64,
    pipeline_id: i64,
    tasks: Arc<Mutex<VecDeque<PipelineTask>>>,
    cancel: Arc<AtomicBool>,
    sink: Arc<dyn PipelineTarget>,
    log: RunLog,
}

impl Default for PipelineExecutor {
    fn default() -> Self {
        Self::new()
    }
}

impl PipelineExecutor {
    pub fn new() -> Self {
        Self::build(None)
    }

    pub fn with_logs(logs: PathBuf) -> Self {
        Self::build(Some(logs))
    }

    fn build(logs: Option<PathBuf>) -> Self {
        Self {
            inner: Arc::new(Inner {
                active: Mutex::new(Vec::new()),
                limits: Mutex::new(PipelineLimits::default()),
                logs,
                next_token: AtomicU64::new(1),
                slots: Slots {
                    used: Mutex::new(0),
                    freed: Condvar::new(),
                },
            }),
        }
    }

    pub fn set_limits(&self, limits: PipelineLimits) {
        *lock(&self.inner.limits) = PipelineLimits::new(limits.max_pipelines, limits.max_tasks);
        self.inner.slots.freed.notify_all();
        promote(&self.inner);
    }

    pub fn start(
        &self,
        job: Box<dyn PipelineJob>,
        tasks: Vec<TaskRequest>,
        sink: Arc<dyn PipelineTarget>,
    ) -> PipelineResult<PipelineSnapshot> {
        let job: Arc<dyn PipelineJob> = Arc::from(job);
        let cancel = Arc::new(AtomicBool::new(false));
        let token = self.inner.next_token.fetch_add(1, Ordering::SeqCst);
        let state = claim(&self.inner, token, cancel.clone());
        let result = self.start_claimed(job, tasks, sink, cancel, token, state);
        if result.is_err() {
            release_active(&self.inner, token);
        }
        result
    }

    pub fn cancel(&self) -> bool {
        self.cancel_runs(None)
    }

    pub fn cancel_pipeline(&self, pipeline_id: i64) -> bool {
        self.cancel_runs(Some(pipeline_id))
    }

    fn cancel_runs(&self, pipeline_id: Option<i64>) -> bool {
        let mut found = false;
        let mut waiting = Vec::new();
        {
            let mut active = lock(&self.inner.active);
            for run in active.iter() {
                if pipeline_id.is_none() || run.pipeline_id == pipeline_id {
                    run.cancel.store(true, Ordering::SeqCst);
                    found = true;
                }
            }
            let mut index = 0;
            while index < active.len() {
                let run = &active[index];
                let cancelled = run.cancel.load(Ordering::SeqCst);
                if cancelled && run.state == RunState::Queued && run.context.is_some() {
                    waiting.extend(active.remove(index).context);
                } else {
                    index += 1;
                }
            }
        }
        for context in waiting {
            abort_queued(&context);
        }
        found
    }

    fn run_log(&self, job: &dyn PipelineJob, pipeline_id: i64) -> RunLog {
        match &self.inner.logs {
            Some(root) => RunLog::create(root, Local::now(), job.kind(), pipeline_id),
            None => RunLog::none(),
        }
    }

    fn start_claimed(
        &self,
        job: Arc<dyn PipelineJob>,
        tasks: Vec<TaskRequest>,
        sink: Arc<dyn PipelineTarget>,
        cancel: Arc<AtomicBool>,
        token: u64,
        state: RunState,
    ) -> PipelineResult<PipelineSnapshot> {
        validate_requests(&tasks)?;
        job.validate(&tasks)?;

        let now = format_timestamp(Utc::now());
        let db = database(job.as_ref())?;
        let repo = PipelineRepository::new(db.connection());
        let status = match state {
            RunState::Running => PipelineStatus::Running,
            RunState::Queued => PipelineStatus::Queued,
        };
        let pipeline_id =
            repo.insert_pipeline(job.owner(), job.kind(), &job.scope(), status, &tasks, &now)?;
        let snapshot = repo
            .snapshot(pipeline_id)?
            .ok_or_else(|| PipelineError::not_found("pipeline was not created"))?;
        bind_pipeline(&self.inner, token, pipeline_id);
        let log = self.run_log(job.as_ref(), pipeline_id);
        log.line(
            "pipeline",
            &format!(
                "{} pipeline {pipeline_id} ({}) for {}: {} tasks, {}",
                job.kind(),
                job.scope(),
                job.owner(),
                tasks.len(),
                match state {
                    RunState::Running => "running",
                    RunState::Queued => "waiting for a free slot",
                }
            ),
        );
        deliver(
            &sink,
            PipelineEvent::Started {
                pipeline: snapshot.clone(),
            },
        );

        let context = Arc::new(CoordinatorContext {
            inner: self.inner.clone(),
            job,
            token,
            pipeline_id,
            tasks: Arc::new(Mutex::new(VecDeque::from(snapshot.tasks.clone()))),
            cancel,
            sink,
            log,
        });
        match state {
            RunState::Running => spawn_coordinator(context, false)?,
            RunState::Queued => {
                attach_context(&self.inner, token, context);
                promote(&self.inner);
            }
        }
        Ok(snapshot)
    }
}

fn claim(inner: &Inner, token: u64, cancel: Arc<AtomicBool>) -> RunState {
    let mut active = lock(&inner.active);
    let max_pipelines = lock(&inner.limits).max_pipelines;
    let running = active
        .iter()
        .filter(|run| run.state == RunState::Running)
        .count();
    let waiting = active.iter().any(|run| run.state == RunState::Queued);
    let state = if running < max_pipelines && !waiting {
        RunState::Running
    } else {
        RunState::Queued
    };
    active.push(ActiveRun {
        token,
        pipeline_id: None,
        state,
        cancel,
        context: None,
    });
    state
}

fn attach_context(inner: &Inner, token: u64, context: Arc<CoordinatorContext>) {
    let mut active = lock(&inner.active);
    if let Some(run) = active.iter_mut().find(|run| run.token == token) {
        run.context = Some(context);
    }
}

fn promote(inner: &Arc<Inner>) {
    let mut ready = Vec::new();
    {
        let mut active = lock(&inner.active);
        let max_pipelines = lock(&inner.limits).max_pipelines;
        let mut running = active
            .iter()
            .filter(|run| run.state == RunState::Running)
            .count();
        for run in active.iter_mut() {
            if running >= max_pipelines {
                break;
            }
            if run.state != RunState::Queued {
                continue;
            }
            let Some(context) = run.context.take() else {
                break;
            };
            run.state = RunState::Running;
            running += 1;
            ready.push(context);
        }
    }
    for context in ready {
        if let Err(error) = spawn_coordinator(context.clone(), true) {
            eprintln!("cannot start queued pipeline: {}", error.detail);
            context.cancel.store(true, Ordering::SeqCst);
            abort_queued(&context);
            release_active(&context.inner, context.token);
        }
    }
}

fn spawn_coordinator(context: Arc<CoordinatorContext>, promoted: bool) -> PipelineResult<()> {
    thread::Builder::new()
        .name(format!("pipeline-{}", context.pipeline_id))
        .spawn(move || coordinator(context, promoted))
        .map(|_| ())
        .map_err(|error| PipelineError::new(PipelineErrorCode::Task, error.to_string()))
}

fn task_label(task: &PipelineTask) -> String {
    match (&task.segment_id, task.passage) {
        (Some(segment), _) => format!("{}-{segment}", task.chapter_id),
        (None, Some(passage)) => format!("{}-p{passage}", task.chapter_id),
        (None, None) => task.chapter_id.clone(),
    }
}

fn abort_queued(context: &CoordinatorContext) {
    while let Some(task) = pop_task(&context.tasks) {
        context
            .log
            .task(task.id, &task_label(&task))
            .line("cancelled while queued");
        finish_task(context, task.id, TaskStatus::Cancelled, String::new());
    }
    finish_pipeline(context);
}

fn acquire_slot<'a>(inner: &'a Inner, cancel: &AtomicBool) -> Option<SlotGuard<'a>> {
    let mut used = lock(&inner.slots.used);
    loop {
        if cancel.load(Ordering::SeqCst) {
            return None;
        }
        let limit = lock(&inner.limits).max_tasks;
        if *used < limit {
            *used += 1;
            return Some(SlotGuard { inner });
        }
        used = match inner.slots.freed.wait_timeout(used, SLOT_POLL) {
            Ok((guard, _)) => guard,
            Err(poisoned) => poisoned.into_inner().0,
        };
    }
}

fn coordinator(context: Arc<CoordinatorContext>, promoted: bool) {
    if promoted {
        mark_running(&context);
    }
    let prepared = context.job.prepare();
    match &prepared {
        Ok(()) => context.log.line("pipeline", "prepared"),
        Err(error) => context
            .log
            .line("pipeline", &format!("prepare failed: {error}")),
    }
    let workers = context
        .tasks
        .lock()
        .map_or(0, |tasks| tasks.len())
        .min(MAX_WORKERS_PER_PIPELINE);
    let mut handles = Vec::with_capacity(workers);
    for _ in 0..workers {
        let worker = context.clone();
        let prepare_error = prepared.as_ref().err().cloned();
        handles.push(thread::spawn(move || worker_loop(worker, prepare_error)));
    }
    for handle in handles {
        if handle.join().is_err() {
            eprintln!("pipeline worker panicked");
        }
    }
    finish_pipeline(&context);
    release_active(&context.inner, context.token);
}

fn worker_loop(context: Arc<CoordinatorContext>, prepare_error: Option<String>) {
    loop {
        let slot = acquire_slot(&context.inner, &context.cancel);
        let Some(task) = pop_task(&context.tasks) else {
            break;
        };
        if slot.is_none() {
            cancel_before_start(&context, &task);
            continue;
        }
        set_running(&context, task.id);
        match &prepare_error {
            Some(error) => fail_before_start(&context, &task, error),
            None => run_task(&context, task),
        }
    }
}

fn cancel_before_start(context: &CoordinatorContext, task: &PipelineTask) {
    context
        .log
        .task(task.id, &task_label(task))
        .line("cancelled before it started");
    finish_task(context, task.id, TaskStatus::Cancelled, String::new());
}

fn fail_before_start(context: &CoordinatorContext, task: &PipelineTask, error: &str) {
    context
        .log
        .task(task.id, &task_label(task))
        .line(&format!("failed: {error}"));
    finish_task(context, task.id, TaskStatus::Failed, error.to_string());
}

fn run_task(context: &CoordinatorContext, task: PipelineTask) {
    let log = context.log.task(task.id, &task_label(&task));
    log.line("started");
    match execute_task(context, &task, &log) {
        Ok(()) if context.cancel.load(Ordering::SeqCst) => {
            log.line("cancelled");
            finish_task(context, task.id, TaskStatus::Cancelled, String::new());
        }
        Ok(()) => {
            log.line("completed");
            finish_task(context, task.id, TaskStatus::Completed, String::new());
        }
        Err(TaskOutcome::Cancelled) => {
            log.line("cancelled");
            finish_task(context, task.id, TaskStatus::Cancelled, String::new())
        }
        Err(TaskOutcome::Failed(error)) => {
            log.line(&format!("failed: {error}"));
            finish_task(context, task.id, TaskStatus::Failed, error)
        }
    }
}

fn execute_task(
    context: &CoordinatorContext,
    task: &PipelineTask,
    log: &TaskLog,
) -> Result<(), TaskOutcome> {
    let task_id = task.id;
    let result = std::panic::catch_unwind(AssertUnwindSafe(|| {
        context.job.run(
            task,
            log,
            &|value| set_progress(context, task_id, value),
            &context.cancel,
        )
    }));
    match result {
        Ok(outcome) => outcome,
        Err(_) => Err(TaskOutcome::Failed("pipeline task panicked".to_string())),
    }
}

fn validate_requests(tasks: &[TaskRequest]) -> PipelineResult<()> {
    if tasks.is_empty() {
        return Err(PipelineError::invalid("at least one task is required"));
    }
    let mut seen = HashSet::new();
    for task in tasks {
        if !seen.insert((
            task.chapter_id.clone(),
            task.segment_id.clone(),
            task.passage,
        )) {
            return Err(PipelineError::invalid("duplicate pipeline task"));
        }
    }
    Ok(())
}

fn set_running(context: &CoordinatorContext, task_id: i64) {
    with_task_update(context, task_id, |repo| {
        repo.set_task_running(task_id, &timestamp())
    });
}

fn set_progress(context: &CoordinatorContext, task_id: i64, progress: u8) {
    with_task_update(context, task_id, |repo| {
        repo.set_task_progress(task_id, progress)
    });
}

fn finish_task(context: &CoordinatorContext, task_id: i64, status: TaskStatus, error: String) {
    with_task_update(context, task_id, |repo| {
        repo.finish_task(task_id, status, &error, &timestamp())
    });
}

fn with_task_update<F>(context: &CoordinatorContext, task_id: i64, update: F)
where
    F: FnOnce(&PipelineRepository<'_>) -> rusqlite::Result<()>,
{
    let Ok(db) = database(context.job.as_ref()) else {
        eprintln!("cannot open database for pipeline task update");
        return;
    };
    let repo = PipelineRepository::new(db.connection());
    if let Err(error) = update(&repo) {
        eprintln!("cannot update pipeline task: {error}");
        return;
    }
    match repo.task(task_id) {
        Ok(Some(task)) => deliver(
            &context.sink,
            PipelineEvent::Task {
                pipeline_id: context.pipeline_id,
                task,
            },
        ),
        Ok(None) => eprintln!("pipeline task {task_id} does not exist"),
        Err(error) => eprintln!("cannot read pipeline task: {error}"),
    }
}

fn finish_pipeline(context: &CoordinatorContext) {
    let Ok(db) = database(context.job.as_ref()) else {
        eprintln!("cannot open database to finish pipeline");
        return;
    };
    let repo = PipelineRepository::new(db.connection());
    let Ok(Some(snapshot)) = repo.snapshot(context.pipeline_id) else {
        eprintln!("cannot read pipeline before finishing");
        return;
    };
    let done = snapshot
        .tasks
        .iter()
        .filter(|task| task.status == TaskStatus::Completed)
        .count() as i64;
    let failed = snapshot
        .tasks
        .iter()
        .filter(|task| task.status == TaskStatus::Failed)
        .count() as i64;
    let status = if context.cancel.load(Ordering::SeqCst) {
        PipelineStatus::Cancelled
    } else if failed > 0 {
        PipelineStatus::Failed
    } else {
        PipelineStatus::Completed
    };
    context.log.line(
        "pipeline",
        &format!(
            "finished {status:?}: {done} done, {failed} failed of {} tasks",
            snapshot.tasks.len()
        ),
    );
    if let Err(error) =
        repo.finish_pipeline(context.pipeline_id, status, done, failed, &timestamp())
    {
        eprintln!("cannot finish pipeline: {error}");
        return;
    }
    match repo.snapshot(context.pipeline_id) {
        Ok(Some(snapshot)) => deliver(
            &context.sink,
            PipelineEvent::Finished { pipeline: snapshot },
        ),
        Ok(None) => eprintln!("finished pipeline does not exist"),
        Err(error) => eprintln!("cannot read finished pipeline: {error}"),
    }
}

fn pop_task(tasks: &Mutex<VecDeque<PipelineTask>>) -> Option<PipelineTask> {
    lock(tasks).pop_front()
}

fn database(job: &dyn PipelineJob) -> PipelineResult<Database> {
    Ok(Database::open_read_write(
        &job.dir().join(WORKSPACE_DB_FILE),
    )?)
}

fn timestamp() -> String {
    format_timestamp(Utc::now())
}

fn deliver(target: &Arc<dyn PipelineTarget>, event: PipelineEvent) {
    if let Err(error) = target.deliver(event) {
        eprintln!("cannot forward pipeline event: {error}");
    }
}

fn bind_pipeline(inner: &Inner, token: u64, pipeline_id: i64) {
    let mut active = lock(&inner.active);
    if let Some(run) = active.iter_mut().find(|run| run.token == token) {
        run.pipeline_id = Some(pipeline_id);
    }
}

fn release_active(inner: &Arc<Inner>, token: u64) {
    lock(&inner.active).retain(|run| run.token != token);
    promote(inner);
}

fn mark_running(context: &CoordinatorContext) {
    let Ok(db) = database(context.job.as_ref()) else {
        eprintln!("cannot open database to start pipeline");
        return;
    };
    let repo = PipelineRepository::new(db.connection());
    if let Err(error) = repo.mark_pipeline_running(context.pipeline_id, &timestamp()) {
        eprintln!("cannot start pipeline: {error}");
        return;
    }
    context
        .log
        .line("pipeline", "left the queue and started running");
    match repo.snapshot(context.pipeline_id) {
        Ok(Some(snapshot)) => deliver(&context.sink, PipelineEvent::Updated { pipeline: snapshot }),
        Ok(None) => eprintln!("started pipeline does not exist"),
        Err(error) => eprintln!("cannot read started pipeline: {error}"),
    }
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    match mutex.lock() {
        Ok(guard) => guard,
        Err(poisoned) => poisoned.into_inner(),
    }
}

#[cfg(test)]
#[path = "../../../test/features/pipeline/executor.test.rs"]
mod tests;
