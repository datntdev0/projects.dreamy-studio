use crate::features::novel::files::NovelFiles;
use crate::features::novel::repository::NovelRepository;
use crate::features::pipeline::job::JobFactory;
use crate::features::pipeline::job::PipelineJob;
use crate::features::pipeline::job::TaskOutcome;
use crate::features::pipeline::log::TaskLog;
use crate::features::pipeline::models::JobOwner;
use crate::features::pipeline::models::PipelineError;
use crate::features::pipeline::models::PipelineErrorCode;
use crate::features::pipeline::models::PipelineResult;
use crate::features::pipeline::models::PipelineTask;
use crate::features::pipeline::models::TaskRequest;
use crate::features::pipeline::translator::TranslateError;
use crate::features::pipeline::translator::TranslateJob;
use crate::features::pipeline::translator::Translator;
use crate::features::translation::dictionary::DictionaryFiles;
use crate::features::translation::files::TranslationFiles;
use crate::features::translation::models::DictEntry;
use crate::features::translation::models::TranslationTarget;
use crate::features::translation::service::TranslationService;
use crate::features::translation::service::TranslationWorkspace;
use crate::features::workspace::inspector::WORKSPACE_DB_FILE;
use crate::features::workspace::session::WorkspaceSession;
use crate::infra::storage::database::Database;
use std::panic::AssertUnwindSafe;
use std::path::Path;
use std::sync::Arc;
use std::sync::Mutex;
use std::sync::PoisonError;
use std::sync::atomic::AtomicBool;
use std::sync::atomic::Ordering;

pub const KIND_TRANSLATION: &str = "translation";

#[derive(Clone)]
struct Prepared {
    guidelines: String,
    dict: Vec<DictEntry>,
}

pub struct TranslationJob {
    workspace: TranslationWorkspace,
    novel_id: i64,
    target: TranslationTarget,
    translator: Arc<dyn Translator>,
    prepared: Mutex<Option<Prepared>>,
}

impl TranslationJob {
    pub fn new(
        workspace: TranslationWorkspace,
        novel_id: i64,
        target: TranslationTarget,
        translator: Arc<dyn Translator>,
    ) -> Self {
        Self {
            workspace,
            novel_id,
            target,
            translator,
            prepared: Mutex::new(None),
        }
    }

    fn database(&self) -> PipelineResult<Database> {
        Ok(Database::open_read_write(
            &self.workspace.dir().join(WORKSPACE_DB_FILE),
        )?)
    }

    fn prepared(&self) -> Result<Prepared, TaskOutcome> {
        self.prepared
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .clone()
            .ok_or_else(|| TaskOutcome::Failed("translation job was not prepared".to_string()))
    }

    fn build_job(&self, task: &PipelineTask) -> Result<TranslateJob, TaskOutcome> {
        let prepared = self.prepared()?;
        let db = self
            .database()
            .map_err(|error| TaskOutcome::Failed(error.detail))?;
        let chapter = NovelRepository::new(db.connection())
            .find_chapter(self.novel_id, &task.chapter_id)
            .map_err(|error| TaskOutcome::Failed(error.to_string()))?
            .ok_or_else(|| {
                TaskOutcome::Failed(format!("chapter {} does not exist", task.chapter_id))
            })?;
        let paragraphs = NovelFiles::new(self.workspace.dir().to_path_buf())
            .read_chapter(self.novel_id, &task.chapter_id)
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
            target: self.target.as_str().to_string(),
            passage: task.passage,
            title: chapter.title,
            paragraphs,
            guidelines: prepared.guidelines,
            dict: prepared.dict,
        })
    }
}

impl PipelineJob for TranslationJob {
    fn kind(&self) -> &'static str {
        KIND_TRANSLATION
    }

    fn owner(&self) -> JobOwner {
        JobOwner::Novel(self.novel_id)
    }

    fn scope(&self) -> String {
        self.target.as_str().to_string()
    }

    fn dir(&self) -> &Path {
        self.workspace.dir()
    }

    fn validate(&self, tasks: &[TaskRequest]) -> PipelineResult<()> {
        let db = self.database()?;
        let repo = NovelRepository::new(db.connection());
        let files = NovelFiles::new(self.workspace.dir().to_path_buf());
        for task in tasks {
            if repo
                .find_chapter(self.novel_id, &task.chapter_id)?
                .is_none()
            {
                return Err(PipelineError::not_found(format!(
                    "chapter {} does not exist in novel {}",
                    task.chapter_id, self.novel_id
                )));
            }
            let paragraphs = files
                .read_chapter(self.novel_id, &task.chapter_id)
                .map_err(|error| PipelineError::new(PipelineErrorCode::Io, error.detail))?;
            if paragraphs.is_empty() {
                return Err(PipelineError::invalid("chapter has no paragraphs"));
            }
            if let Some(passage) = task.passage
                && (passage == 0 || passage > paragraphs.len())
            {
                return Err(PipelineError::invalid("passage is out of range"));
            }
        }
        Ok(())
    }

    fn prepare(&self) -> Result<(), String> {
        let root = self.workspace.dir().to_path_buf();
        let guidelines = TranslationFiles::new(root.clone())
            .read_guidelines(self.novel_id, self.target)
            .map_err(|error| error.detail)?;
        let dict = DictionaryFiles::new(root)
            .list(self.novel_id, self.target)
            .map_err(|error| error.detail)?;
        *self.prepared.lock().unwrap_or_else(PoisonError::into_inner) =
            Some(Prepared { guidelines, dict });
        Ok(())
    }

    fn run(
        &self,
        task: &PipelineTask,
        log: &TaskLog,
        progress: &dyn Fn(u8),
        cancel: &AtomicBool,
    ) -> Result<(), TaskOutcome> {
        let job = self.build_job(task)?;
        log.line(&format!(
            "translating \"{}\" into {}: {} paragraphs, {} dictionary entries",
            job.title,
            job.target,
            job.paragraphs.len(),
            job.dict.len()
        ));
        let translated = std::panic::catch_unwind(AssertUnwindSafe(|| {
            self.translator.translate(&job, log, progress, cancel)
        }));
        let run = match translated {
            Ok(Ok(run)) => run,
            Ok(Err(TranslateError::Cancelled)) => return Err(TaskOutcome::Cancelled),
            Ok(Err(TranslateError::Failed(error))) => return Err(TaskOutcome::Failed(error)),
            Err(_) => {
                log.line("translator panicked");
                return Err(TaskOutcome::Failed("translator panicked".to_string()));
            }
        };
        if cancel.load(Ordering::SeqCst) {
            return Err(TaskOutcome::Cancelled);
        }
        self.workspace
            .save_run(
                self.novel_id,
                self.target.as_str(),
                &task.chapter_id,
                task.passage,
                run,
            )
            .map_err(|error| TaskOutcome::Failed(error.detail))?;
        log.line(&format!(
            "saved the {} translation of {}",
            self.target.as_str(),
            task.chapter_id
        ));
        Ok(())
    }
}

pub struct TranslationJobFactory {
    translation: TranslationService,
    translator: Arc<dyn Translator>,
}

impl TranslationJobFactory {
    pub fn new(translation: TranslationService, translator: Arc<dyn Translator>) -> Self {
        Self {
            translation,
            translator,
        }
    }
}

impl JobFactory for TranslationJobFactory {
    fn kind(&self) -> &'static str {
        KIND_TRANSLATION
    }

    fn create(
        &self,
        session: &WorkspaceSession,
        owner: JobOwner,
        params: &serde_json::Value,
    ) -> PipelineResult<Box<dyn PipelineJob>> {
        let novel_id = owner.require_novel()?;
        let workspace = self.translation.open(session)?;
        let raw = params
            .get("target")
            .and_then(serde_json::Value::as_str)
            .ok_or_else(|| PipelineError::invalid("target is required"))?;
        let target = workspace.target_for(novel_id, raw)?;
        Ok(Box::new(TranslationJob::new(
            workspace,
            novel_id,
            target,
            self.translator.clone(),
        )))
    }
}
