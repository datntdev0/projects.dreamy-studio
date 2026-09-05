use crate::features::novel::models::NovelInput;
use crate::features::novel::service::NovelWorkspace;
use crate::features::pipeline::job::PipelineJob;
use crate::features::pipeline::job::TaskOutcome;
use crate::features::pipeline::log::TaskLog;
use crate::features::pipeline::models::JobOwner;
use crate::features::pipeline::models::PipelineError;
use crate::features::pipeline::models::PipelineEvent;
use crate::features::pipeline::models::PipelineResult;
use crate::features::pipeline::models::PipelineSnapshot;
use crate::features::pipeline::models::PipelineTarget;
use crate::features::pipeline::models::PipelineTask;
use crate::features::pipeline::models::TaskRequest;
use crate::features::workspace::inspector::WORKSPACE_DB_FILE;
use crate::infra::storage::database::Database;
use crate::infra::storage::migrator::Migrator;
use crate::infra::storage::migrator::workspace_scripts;
use std::path::Path;
use std::path::PathBuf;
use std::sync::Arc;
use std::sync::Condvar;
use std::sync::Mutex;
use std::sync::MutexGuard;
use std::sync::atomic::AtomicBool;
use std::sync::atomic::AtomicUsize;
use std::sync::atomic::Ordering;
use std::thread;
use std::time::Duration;
use std::time::Instant;
use tempfile::TempDir;

pub const FAKE_KIND: &str = "fake";

pub struct JobFixture {
    pub dir: TempDir,
    pub novel: NovelWorkspace,
    pub novel_id: i64,
    pub chapter_id: String,
}

impl JobFixture {
    pub fn new() -> Self {
        let dir = TempDir::new().unwrap();
        let mut db = Database::create(&dir.path().join(WORKSPACE_DB_FILE)).unwrap();
        Migrator::migrate(
            db.connection_mut(),
            &workspace_scripts().unwrap(),
            &AtomicBool::new(false),
        )
        .unwrap();
        let novel = NovelWorkspace::new(dir.path().to_path_buf());
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
        Self {
            dir,
            novel,
            novel_id,
            chapter_id: chapter.id,
        }
    }

    pub fn path(&self) -> PathBuf {
        self.dir.path().to_path_buf()
    }

    pub fn add_chapter(&self, title: &str) -> String {
        let chapter = self.novel.chapter_add(self.novel_id, title).unwrap();
        self.novel
            .paragraph_add(self.novel_id, &chapter.id, "source")
            .unwrap();
        chapter.id
    }

    pub fn tasks(&self) -> Vec<TaskRequest> {
        vec![TaskRequest {
            chapter_id: self.chapter_id.clone(),
            passage: None,
            segment_id: None,
        }]
    }
}

pub struct RecordingTarget {
    pub events: Mutex<Vec<PipelineEvent>>,
    finished: Condvar,
}

impl RecordingTarget {
    pub fn new() -> Self {
        Self {
            events: Mutex::new(Vec::new()),
            finished: Condvar::new(),
        }
    }

    pub fn events(&self) -> MutexGuard<'_, Vec<PipelineEvent>> {
        self.events
            .lock()
            .unwrap_or_else(|error| error.into_inner())
    }

    pub fn wait_for_finished(&self) -> PipelineSnapshot {
        let events = self.events();
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
        self.events().push(event);
        if is_finished {
            self.finished.notify_all();
        }
        Ok(())
    }
}

#[derive(Default)]
pub struct FakeProbe {
    pub prepared: AtomicUsize,
    pub running: AtomicUsize,
    pub peak: AtomicUsize,
    pub ran: Mutex<Vec<(String, Option<usize>)>>,
}

impl FakeProbe {
    pub fn ran(&self) -> Vec<(String, Option<usize>)> {
        self.ran.lock().unwrap().clone()
    }
}

#[derive(Clone)]
pub struct FakeJob {
    dir: PathBuf,
    novel_id: i64,
    scope: String,
    delay: Duration,
    failing: Vec<String>,
    prepare_error: Option<String>,
    rejection: Option<String>,
    ignore_cancel: bool,
    panics: bool,
    probe: Arc<FakeProbe>,
}

impl FakeJob {
    pub fn new(fixture: &JobFixture, scope: &str) -> Self {
        Self {
            dir: fixture.path(),
            novel_id: fixture.novel_id,
            scope: scope.to_string(),
            delay: Duration::ZERO,
            failing: Vec::new(),
            prepare_error: None,
            rejection: None,
            ignore_cancel: false,
            panics: false,
            probe: Arc::new(FakeProbe::default()),
        }
    }

    pub fn with_delay(mut self, delay: Duration) -> Self {
        self.delay = delay;
        self
    }

    pub fn failing_chapter(mut self, chapter_id: &str) -> Self {
        self.failing.push(chapter_id.to_string());
        self
    }

    pub fn failing_prepare(mut self, error: &str) -> Self {
        self.prepare_error = Some(error.to_string());
        self
    }

    pub fn rejecting(mut self, detail: &str) -> Self {
        self.rejection = Some(detail.to_string());
        self
    }

    pub fn ignoring_cancel(mut self) -> Self {
        self.ignore_cancel = true;
        self
    }

    pub fn panicking(mut self) -> Self {
        self.panics = true;
        self
    }

    pub fn with_probe(mut self, probe: Arc<FakeProbe>) -> Self {
        self.probe = probe;
        self
    }

    pub fn probe(&self) -> Arc<FakeProbe> {
        self.probe.clone()
    }

    pub fn boxed(&self) -> Box<dyn PipelineJob> {
        Box::new(self.clone())
    }

    fn work(
        &self,
        task: &PipelineTask,
        progress: &dyn Fn(u8),
        cancel: &AtomicBool,
    ) -> Result<(), TaskOutcome> {
        let started = Instant::now();
        while started.elapsed() < self.delay {
            if !self.ignore_cancel && cancel.load(Ordering::SeqCst) {
                return Err(TaskOutcome::Cancelled);
            }
            thread::sleep(Duration::from_millis(1));
        }
        if !self.ignore_cancel && cancel.load(Ordering::SeqCst) {
            return Err(TaskOutcome::Cancelled);
        }
        if self.panics {
            panic!("fake job panic");
        }
        if self.failing.contains(&task.chapter_id) {
            return Err(TaskOutcome::Failed("fake failure".to_string()));
        }
        progress(100);
        Ok(())
    }
}

impl PipelineJob for FakeJob {
    fn kind(&self) -> &'static str {
        FAKE_KIND
    }

    fn owner(&self) -> JobOwner {
        JobOwner::Novel(self.novel_id)
    }

    fn scope(&self) -> String {
        self.scope.clone()
    }

    fn dir(&self) -> &Path {
        &self.dir
    }

    fn validate(&self, _tasks: &[TaskRequest]) -> PipelineResult<()> {
        match &self.rejection {
            Some(detail) => Err(PipelineError::invalid(detail.clone())),
            None => Ok(()),
        }
    }

    fn prepare(&self) -> Result<(), String> {
        self.probe.prepared.fetch_add(1, Ordering::SeqCst);
        match &self.prepare_error {
            Some(error) => Err(error.clone()),
            None => Ok(()),
        }
    }

    fn run(
        &self,
        task: &PipelineTask,
        _log: &TaskLog,
        progress: &dyn Fn(u8),
        cancel: &AtomicBool,
    ) -> Result<(), TaskOutcome> {
        let now = self.probe.running.fetch_add(1, Ordering::SeqCst) + 1;
        self.probe.peak.fetch_max(now, Ordering::SeqCst);
        self.probe
            .ran
            .lock()
            .unwrap()
            .push((task.chapter_id.clone(), task.passage));
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            self.work(task, progress, cancel)
        }));
        self.probe.running.fetch_sub(1, Ordering::SeqCst);
        match result {
            Ok(outcome) => outcome,
            Err(payload) => std::panic::resume_unwind(payload),
        }
    }
}
