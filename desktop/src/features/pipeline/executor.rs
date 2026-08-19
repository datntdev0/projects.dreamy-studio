use crate::features::novel::files::NovelFiles;
use crate::features::novel::repository::NovelRepository;
use crate::features::pipeline::models::KIND_TRANSLATION;
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
use crate::features::pipeline::translator::TranslateError;
use crate::features::pipeline::translator::TranslateJob;
use crate::features::pipeline::translator::Translator;
use crate::features::translation::dictionary::DictionaryRepository;
use crate::features::translation::files::TranslationFiles;
use crate::features::translation::models::DictEntry;
use crate::features::translation::models::TranslationTarget;
use crate::features::translation::service::TranslatedRun;
use crate::features::translation::service::TranslationWorkspace;
use crate::features::workspace::inspector::WORKSPACE_DB_FILE;
use crate::features::workspace::repository::format_timestamp;
use crate::infra::storage::database::Database;
use chrono::Utc;
use std::collections::HashSet;
use std::collections::VecDeque;
use std::panic::AssertUnwindSafe;
use std::sync::Arc;
use std::sync::Mutex;
use std::sync::MutexGuard;
use std::sync::atomic::AtomicBool;
use std::sync::atomic::Ordering;
use std::thread;

pub const MAX_PARALLEL_TASKS: usize = 5;

#[derive(Debug, Clone)]
pub struct PipelineStart {
    pub novel_id: i64,
    pub target: String,
    pub tasks: Vec<TaskRequest>,
}

#[derive(Clone)]
pub struct PipelineExecutor {
    inner: Arc<Inner>,
}

struct Inner {
    translator: Arc<dyn Translator>,
    active: Mutex<Option<Arc<AtomicBool>>>,
}

struct CoordinatorContext {
    inner: Arc<Inner>,
    workspace: TranslationWorkspace,
    pipeline_id: i64,
    novel_id: i64,
    target_name: String,
    target: TranslationTarget,
    tasks: Arc<Mutex<VecDeque<PipelineTask>>>,
    cancel: Arc<AtomicBool>,
    sink: Arc<dyn PipelineTarget>,
}

struct WorkerContext {
    coordinator: Arc<CoordinatorContext>,
    guidelines: String,
    dict: Vec<DictEntry>,
}

impl PipelineExecutor {
    pub fn new(translator: Arc<dyn Translator>) -> Self {
        Self {
            inner: Arc::new(Inner {
                translator,
                active: Mutex::new(None),
            }),
        }
    }

    pub fn start(
        &self,
        workspace: TranslationWorkspace,
        request: PipelineStart,
        target: Arc<dyn PipelineTarget>,
    ) -> PipelineResult<PipelineSnapshot> {
        let cancel = Arc::new(AtomicBool::new(false));
        {
            let mut active = lock(&self.inner.active);
            if active.is_some() {
                return Err(PipelineError::new(
                    PipelineErrorCode::PipelineBusy,
                    "a pipeline is already running",
                ));
            }
            *active = Some(cancel.clone());
        }

        let result = self.start_claimed(workspace, request, target, cancel.clone());
        if result.is_err() {
            release_active(&self.inner, &cancel);
        }
        result
    }

    pub fn cancel(&self) -> bool {
        let active = lock(&self.inner.active);
        match active.as_ref() {
            Some(cancel) => {
                cancel.store(true, Ordering::SeqCst);
                true
            }
            None => false,
        }
    }

    pub fn is_running(&self) -> bool {
        lock(&self.inner.active).is_some()
    }

    fn start_claimed(
        &self,
        workspace: TranslationWorkspace,
        request: PipelineStart,
        target: Arc<dyn PipelineTarget>,
        cancel: Arc<AtomicBool>,
    ) -> PipelineResult<PipelineSnapshot> {
        let translation_target = workspace.target_for(request.novel_id, &request.target)?;
        validate_tasks(&workspace, request.novel_id, &request.tasks)?;

        let now = format_timestamp(Utc::now());
        let db = database(&workspace)?;
        let repo = PipelineRepository::new(db.connection());
        let pipeline_id = repo.insert_pipeline_with_tasks(
            request.novel_id,
            KIND_TRANSLATION,
            translation_target.as_str(),
            &request.tasks,
            &now,
        )?;
        let snapshot = repo
            .snapshot(pipeline_id)?
            .ok_or_else(|| PipelineError::not_found("pipeline was not created"))?;
        deliver(
            &target,
            PipelineEvent::Started {
                pipeline: snapshot.clone(),
            },
        );

        let context = Arc::new(CoordinatorContext {
            inner: self.inner.clone(),
            workspace,
            pipeline_id,
            novel_id: request.novel_id,
            target_name: translation_target.as_str().to_string(),
            target: translation_target,
            tasks: Arc::new(Mutex::new(VecDeque::from(snapshot.tasks.clone()))),
            cancel,
            sink: target,
        });
        thread::Builder::new()
            .name(format!("pipeline-{pipeline_id}"))
            .spawn(move || coordinator(context))
            .map_err(|error| PipelineError::new(PipelineErrorCode::Task, error.to_string()))?;
        Ok(snapshot)
    }
}

fn coordinator(context: Arc<CoordinatorContext>) {
    let inputs = load_inputs(&context);
    let workers = context
        .tasks
        .lock()
        .map_or(0, |tasks| tasks.len())
        .min(MAX_PARALLEL_TASKS);
    let mut handles = Vec::with_capacity(workers);
    for _ in 0..workers {
        let worker = WorkerContext {
            coordinator: context.clone(),
            guidelines: inputs
                .as_ref()
                .map_or_else(|error| error.clone(), |inputs| inputs.0.clone()),
            dict: inputs
                .as_ref()
                .map_or_else(|_| Vec::new(), |inputs| inputs.1.clone()),
        };
        let input_error = inputs.as_ref().err().cloned();
        handles.push(thread::spawn(move || worker_loop(worker, input_error)));
    }
    for handle in handles {
        if handle.join().is_err() {
            eprintln!("pipeline worker panicked");
        }
    }
    finish_pipeline(&context);
    release_active(&context.inner, &context.cancel);
}

fn worker_loop(context: WorkerContext, input_error: Option<String>) {
    while let Some(task) = pop_task(&context.coordinator.tasks) {
        if context.coordinator.cancel.load(Ordering::SeqCst) {
            finish_task(
                &context.coordinator,
                task.id,
                TaskStatus::Cancelled,
                String::new(),
            );
            continue;
        }
        set_running(&context.coordinator, task.id);
        if let Some(error) = &input_error {
            finish_task(
                &context.coordinator,
                task.id,
                TaskStatus::Failed,
                error.clone(),
            );
            continue;
        }
        run_task(&context, task);
    }
}

fn run_task(context: &WorkerContext, task: PipelineTask) {
    let coordinator = &context.coordinator;
    match translate_task(context, &task) {
        Ok(_run) if coordinator.cancel.load(Ordering::SeqCst) => {
            finish_task(coordinator, task.id, TaskStatus::Cancelled, String::new());
        }
        Ok(run) => match coordinator.workspace.save_run(
            coordinator.novel_id,
            &coordinator.target_name,
            &task.chapter_id,
            task.passage,
            run,
        ) {
            Ok(()) => finish_task(coordinator, task.id, TaskStatus::Completed, String::new()),
            Err(error) => finish_task(coordinator, task.id, TaskStatus::Failed, error.detail),
        },
        Err(TaskOutcome::Cancelled) => {
            finish_task(coordinator, task.id, TaskStatus::Cancelled, String::new())
        }
        Err(TaskOutcome::Failed(error)) => {
            finish_task(coordinator, task.id, TaskStatus::Failed, error)
        }
    }
}

fn translate_task(
    context: &WorkerContext,
    task: &PipelineTask,
) -> Result<TranslatedRun, TaskOutcome> {
    let coordinator = &context.coordinator;
    let job = build_job(context, task)?;
    let progress = ProgressReporter {
        context: coordinator.clone(),
        task_id: task.id,
    };
    let translated = std::panic::catch_unwind(AssertUnwindSafe(|| {
        coordinator.inner.translator.translate(
            &job,
            &|value| progress.report(value),
            &coordinator.cancel,
        )
    }));
    match translated {
        Ok(Ok(run)) => Ok(run),
        Ok(Err(TranslateError::Cancelled)) => Err(TaskOutcome::Cancelled),
        Ok(Err(TranslateError::Failed(error))) => Err(TaskOutcome::Failed(error)),
        Err(_) => Err(TaskOutcome::Failed("translator panicked".to_string())),
    }
}

struct ProgressReporter {
    context: Arc<CoordinatorContext>,
    task_id: i64,
}

impl ProgressReporter {
    fn report(&self, value: u8) {
        set_progress(&self.context, self.task_id, value);
    }
}

enum TaskOutcome {
    Cancelled,
    Failed(String),
}

fn build_job(context: &WorkerContext, task: &PipelineTask) -> Result<TranslateJob, TaskOutcome> {
    let coordinator = &context.coordinator;
    let db = database(&coordinator.workspace).map_err(|error| TaskOutcome::Failed(error.detail))?;
    let chapter = NovelRepository::new(db.connection())
        .find_chapter(coordinator.novel_id, &task.chapter_id)
        .map_err(|error| TaskOutcome::Failed(error.to_string()))?
        .ok_or_else(|| {
            TaskOutcome::Failed(format!("chapter {} does not exist", task.chapter_id))
        })?;
    let paragraphs = NovelFiles::new(coordinator.workspace.dir().to_path_buf())
        .read_chapter(coordinator.novel_id, &task.chapter_id)
        .map_err(|error| TaskOutcome::Failed(error.detail))?;
    let paragraphs = match task.passage {
        Some(passage) => paragraphs
            .get(passage - 1)
            .map(|paragraph| vec![paragraph.text.clone()])
            .ok_or_else(|| TaskOutcome::Failed("passage is out of range".to_string()))?,
        None => paragraphs
            .into_iter()
            .map(|paragraph| paragraph.text)
            .collect(),
    };
    Ok(TranslateJob {
        novel_id: coordinator.novel_id,
        target: coordinator.target_name.clone(),
        chapter_id: task.chapter_id.clone(),
        passage: task.passage,
        title: chapter.title,
        paragraphs,
        guidelines: context.guidelines.clone(),
        dict: context.dict.clone(),
    })
}

fn load_inputs(context: &CoordinatorContext) -> Result<(String, Vec<DictEntry>), String> {
    let guidelines = TranslationFiles::new(context.workspace.dir().to_path_buf())
        .read_guidelines(context.novel_id, context.target)
        .map_err(|error| error.detail)?;
    let db = database(&context.workspace).map_err(|error| error.detail)?;
    let dict = DictionaryRepository::new(db.connection())
        .list(context.novel_id, context.target)
        .map_err(|error| error.to_string())?;
    Ok((guidelines, dict))
}

fn validate_tasks(
    workspace: &TranslationWorkspace,
    novel_id: i64,
    tasks: &[TaskRequest],
) -> PipelineResult<()> {
    if tasks.is_empty() {
        return Err(PipelineError::invalid("at least one task is required"));
    }
    let db = database(workspace)?;
    let repo = NovelRepository::new(db.connection());
    let files = NovelFiles::new(workspace.dir().to_path_buf());
    let mut seen = HashSet::new();
    for task in tasks {
        if !seen.insert((task.chapter_id.clone(), task.passage)) {
            return Err(PipelineError::invalid("duplicate pipeline task"));
        }
        if repo.find_chapter(novel_id, &task.chapter_id)?.is_none() {
            return Err(PipelineError::not_found(format!(
                "chapter {} does not exist in novel {novel_id}",
                task.chapter_id
            )));
        }
        let paragraphs = files
            .read_chapter(novel_id, &task.chapter_id)
            .map_err(|error| PipelineError::new(PipelineErrorCode::Io, error.detail))?;
        if paragraphs.is_empty() {
            return Err(PipelineError::invalid("chapter has no paragraphs"));
        }
        if let Some(passage) = task.passage {
            if passage == 0 || passage > paragraphs.len() {
                return Err(PipelineError::invalid("passage is out of range"));
            }
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
    let Ok(db) = database(&context.workspace) else {
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
    let Ok(db) = database(&context.workspace) else {
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

fn database(workspace: &TranslationWorkspace) -> PipelineResult<Database> {
    Ok(Database::open_read_write(
        &workspace.dir().join(WORKSPACE_DB_FILE),
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

fn release_active(inner: &Inner, cancel: &Arc<AtomicBool>) {
    let mut active = lock(&inner.active);
    if active
        .as_ref()
        .is_some_and(|active_cancel| Arc::ptr_eq(active_cancel, cancel))
    {
        *active = None;
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
