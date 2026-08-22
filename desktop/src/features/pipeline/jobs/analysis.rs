use crate::features::knowledge::models::KnowledgeError;
use crate::features::knowledge::models::KnowledgeErrorCode;
use crate::features::knowledge::models::KnowledgeLang;
use crate::features::knowledge::ontology::Ontology;
use crate::features::knowledge::service::KnowledgeService;
use crate::features::knowledge::service::KnowledgeWorkspace;
use crate::features::knowledge::text::ChapterText;
use crate::features::novel::repository::NovelRepository;
use crate::features::pipeline::analyzer::AnalyzeError;
use crate::features::pipeline::analyzer::AnalyzeJob;
use crate::features::pipeline::analyzer::Analyzer;
use crate::features::pipeline::job::JobFactory;
use crate::features::pipeline::job::PipelineJob;
use crate::features::pipeline::job::TaskOutcome;
use crate::features::pipeline::log::TaskLog;
use crate::features::pipeline::models::PipelineError;
use crate::features::pipeline::models::PipelineErrorCode;
use crate::features::pipeline::models::PipelineResult;
use crate::features::pipeline::models::PipelineTask;
use crate::features::pipeline::models::TaskRequest;
use crate::features::workspace::inspector::WORKSPACE_DB_FILE;
use crate::features::workspace::session::WorkspaceSession;
use crate::infra::storage::database::Database;
use std::path::Path;
use std::sync::Arc;
use std::sync::atomic::AtomicBool;
use std::sync::atomic::Ordering;

pub const KIND_ANALYSIS: &str = "analysis";
const KNOWN_LIMIT: usize = 200;

pub struct AnalysisJob {
    workspace: KnowledgeWorkspace,
    novel_id: i64,
    lang: KnowledgeLang,
    analyzer: Arc<dyn Analyzer>,
}

impl AnalysisJob {
    pub fn new(
        workspace: KnowledgeWorkspace,
        novel_id: i64,
        lang: KnowledgeLang,
        analyzer: Arc<dyn Analyzer>,
    ) -> Self {
        Self {
            workspace,
            novel_id,
            lang,
            analyzer,
        }
    }

    fn database(&self) -> PipelineResult<Database> {
        Ok(Database::open_read_write(
            &self.workspace.dir().join(WORKSPACE_DB_FILE),
        )?)
    }

    fn text_of(&self, chapter_id: &str) -> Result<Option<Vec<String>>, KnowledgeError> {
        ChapterText::load(self.workspace.dir(), self.novel_id, self.lang, chapter_id)
    }

    fn build_job(&self, task: &PipelineTask) -> Result<AnalyzeJob, TaskOutcome> {
        let db = self.database().map_err(failed)?;
        let chapter = NovelRepository::new(db.connection())
            .find_chapter(self.novel_id, &task.chapter_id)
            .map_err(|error| TaskOutcome::Failed(error.to_string()))?
            .ok_or_else(|| {
                TaskOutcome::Failed(format!("chapter {} does not exist", task.chapter_id))
            })?;
        let paragraphs = self
            .text_of(&task.chapter_id)
            .map_err(|error| TaskOutcome::Failed(error.detail))?
            .ok_or_else(|| {
                TaskOutcome::Failed(format!("chapter {} has no text", task.chapter_id))
            })?;
        let known = self
            .workspace
            .known_entities(self.novel_id, self.lang, chapter.seq, KNOWN_LIMIT)
            .map_err(|error| TaskOutcome::Failed(error.detail))?;
        Ok(AnalyzeJob {
            lang: self.lang.as_str().to_string(),
            title: chapter.title,
            paragraphs,
            ontology: Ontology::raw().to_string(),
            known,
        })
    }

    fn missing_text(&self, seqs: &[i64]) -> PipelineError {
        let list: Vec<String> = seqs.iter().map(i64::to_string).collect();
        PipelineError::invalid(format!(
            "no {} text for chapters {}",
            self.lang.as_str(),
            list.join(", ")
        ))
    }
}

impl PipelineJob for AnalysisJob {
    fn kind(&self) -> &'static str {
        KIND_ANALYSIS
    }

    fn novel_id(&self) -> i64 {
        self.novel_id
    }

    fn scope(&self) -> String {
        self.lang.as_str().to_string()
    }

    fn dir(&self) -> &Path {
        self.workspace.dir()
    }

    fn validate(&self, tasks: &[TaskRequest]) -> PipelineResult<()> {
        if tasks.iter().any(|task| task.passage.is_some()) {
            return Err(PipelineError::invalid("analysis runs on whole chapters"));
        }
        let db = self.database()?;
        let repo = NovelRepository::new(db.connection());
        let mut missing = Vec::new();
        for task in tasks {
            let chapter = repo
                .find_chapter(self.novel_id, &task.chapter_id)?
                .ok_or_else(|| {
                    PipelineError::not_found(format!(
                        "chapter {} does not exist in novel {}",
                        task.chapter_id, self.novel_id
                    ))
                })?;
            let text = self.text_of(&task.chapter_id).map_err(pipeline_error)?;
            if text.is_none_or(|paragraphs| paragraphs.is_empty()) {
                missing.push(chapter.seq);
            }
        }
        if missing.is_empty() {
            return Ok(());
        }
        missing.sort_unstable();
        Err(self.missing_text(&missing))
    }

    fn prepare(&self) -> Result<(), String> {
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
            "analyzing \"{}\": {} paragraphs, {} known entities from earlier chapters, language {}",
            job.title,
            job.paragraphs.len(),
            job.known.len(),
            job.lang
        ));
        let analysis = match self.analyzer.analyze(&job, log, progress, cancel) {
            Ok(analysis) => analysis,
            Err(AnalyzeError::Cancelled) => return Err(TaskOutcome::Cancelled),
            Err(AnalyzeError::Failed(error)) => return Err(TaskOutcome::Failed(error)),
        };
        if cancel.load(Ordering::SeqCst) {
            return Err(TaskOutcome::Cancelled);
        }
        let counts = (analysis.entities.len(), analysis.facts.len());
        self.workspace
            .save_analysis(self.novel_id, self.lang, &task.chapter_id, analysis)
            .map_err(|error| TaskOutcome::Failed(error.detail))?;
        log.line(&format!(
            "saved {} entities and {} facts to the {} analysis of {}",
            counts.0,
            counts.1,
            self.lang.as_str(),
            task.chapter_id
        ));
        Ok(())
    }
}

pub struct AnalysisJobFactory {
    knowledge: KnowledgeService,
    analyzer: Arc<dyn Analyzer>,
}

impl AnalysisJobFactory {
    pub fn new(knowledge: KnowledgeService, analyzer: Arc<dyn Analyzer>) -> Self {
        Self {
            knowledge,
            analyzer,
        }
    }
}

impl JobFactory for AnalysisJobFactory {
    fn kind(&self) -> &'static str {
        KIND_ANALYSIS
    }

    fn create(
        &self,
        session: &WorkspaceSession,
        novel_id: i64,
        params: &serde_json::Value,
    ) -> PipelineResult<Box<dyn PipelineJob>> {
        let workspace = self.knowledge.open(session).map_err(pipeline_error)?;
        let raw = params
            .get("lang")
            .and_then(serde_json::Value::as_str)
            .ok_or_else(|| PipelineError::invalid("lang is required"))?;
        let lang = KnowledgeLang::parse(raw)
            .ok_or_else(|| PipelineError::invalid(format!("unsupported lang '{raw}'")))?;
        let job = AnalysisJob::new(workspace, novel_id, lang, self.analyzer.clone());
        if NovelRepository::new(job.database()?.connection())
            .find_novel(novel_id)?
            .is_none()
        {
            return Err(PipelineError::not_found(format!(
                "novel {novel_id} does not exist"
            )));
        }
        Ok(Box::new(job))
    }
}

fn failed(error: PipelineError) -> TaskOutcome {
    TaskOutcome::Failed(error.detail)
}

fn pipeline_error(error: KnowledgeError) -> PipelineError {
    let code = match error.code {
        KnowledgeErrorCode::NoWorkspace => PipelineErrorCode::NoWorkspace,
        KnowledgeErrorCode::NotFound => PipelineErrorCode::NotFound,
        KnowledgeErrorCode::Io => PipelineErrorCode::Io,
        KnowledgeErrorCode::Db => PipelineErrorCode::Db,
        KnowledgeErrorCode::Task => PipelineErrorCode::Task,
        KnowledgeErrorCode::InvalidInput
        | KnowledgeErrorCode::TextNotFound
        | KnowledgeErrorCode::RefNotFound
        | KnowledgeErrorCode::EvidenceInvalid => PipelineErrorCode::InvalidInput,
    };
    PipelineError::new(code, error.detail)
}

#[cfg(test)]
#[path = "../../../../test/features/pipeline/jobs/analysis.test.rs"]
mod tests;
