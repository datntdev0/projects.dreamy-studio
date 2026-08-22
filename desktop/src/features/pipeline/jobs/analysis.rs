use crate::features::knowledge::models::AnalysisEntity;
use crate::features::knowledge::models::AnalysisFact;
use crate::features::knowledge::models::ChapterAnalysis;
use crate::features::knowledge::models::KnowledgeError;
use crate::features::knowledge::models::KnowledgeErrorCode;
use crate::features::knowledge::models::KnowledgeLang;
use crate::features::knowledge::models::KnownEntity;
use crate::features::knowledge::service::KnowledgeService;
use crate::features::knowledge::service::KnowledgeWorkspace;
use crate::features::knowledge::text::ChapterText;
use crate::features::knowledge::text::norm;
use crate::features::novel::repository::NovelRepository;
use crate::features::pipeline::analyzer::AnalyzeError;
use crate::features::pipeline::analyzer::Analyzer;
use crate::features::pipeline::analyzer::CandidateChapter;
use crate::features::pipeline::analyzer::CandidateJob;
use crate::features::pipeline::analyzer::FactsJob;
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
use std::collections::HashMap;
use std::collections::HashSet;
use std::panic::AssertUnwindSafe;
use std::path::Path;
use std::sync::Arc;
use std::sync::Condvar;
use std::sync::Mutex;
use std::sync::MutexGuard;
use std::sync::PoisonError;
use std::sync::atomic::AtomicBool;
use std::sync::atomic::Ordering;
use std::time::Duration;

pub const KIND_ANALYSIS: &str = "analysis";
pub const DEFAULT_BATCH_SIZE: usize = 5;
pub const MAX_BATCH_SIZE: usize = 10;
const KNOWN_LIMIT: usize = 200;
const WAIT_POLL: Duration = Duration::from_millis(50);
const CANDIDATES_DONE: u8 = 50;

type Candidates = Arc<HashMap<String, Vec<AnalysisEntity>>>;

#[derive(Clone)]
enum BatchFailure {
    Cancelled,
    Failed(String),
}

enum SlotState {
    Idle,
    Running,
    Done(Result<Candidates, BatchFailure>),
}

struct Batch {
    chapters: Vec<String>,
    state: Mutex<SlotState>,
    ready: Condvar,
}

impl Batch {
    fn new(chapters: Vec<String>) -> Self {
        Self {
            chapters,
            state: Mutex::new(SlotState::Idle),
            ready: Condvar::new(),
        }
    }

    fn finished(&self) -> Option<Candidates> {
        match &*self.state.lock().unwrap_or_else(PoisonError::into_inner) {
            SlotState::Done(Ok(found)) => Some(found.clone()),
            _ => None,
        }
    }

    fn candidates(
        &self,
        cancel: &AtomicBool,
        compute: &dyn Fn() -> Result<Candidates, BatchFailure>,
    ) -> (Result<Candidates, BatchFailure>, bool) {
        let mut state = self.state.lock().unwrap_or_else(PoisonError::into_inner);
        loop {
            match &*state {
                SlotState::Done(result) => return (result.clone(), false),
                SlotState::Idle => {
                    *state = SlotState::Running;
                    drop(state);
                    let result = std::panic::catch_unwind(AssertUnwindSafe(compute))
                        .unwrap_or_else(|_| {
                            Err(BatchFailure::Failed(
                                "candidate analysis panicked".to_string(),
                            ))
                        });
                    *self.state.lock().unwrap_or_else(PoisonError::into_inner) =
                        SlotState::Done(result.clone());
                    self.ready.notify_all();
                    return (result, true);
                }
                SlotState::Running => {
                    if cancel.load(Ordering::SeqCst) {
                        return (Err(BatchFailure::Cancelled), false);
                    }
                    state = wait(&self.ready, state);
                }
            }
        }
    }
}

pub struct AnalysisJob {
    workspace: KnowledgeWorkspace,
    novel_id: i64,
    lang: KnowledgeLang,
    analyzer: Arc<dyn Analyzer>,
    batch_size: usize,
    plan: Mutex<Vec<Arc<Batch>>>,
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
            batch_size: DEFAULT_BATCH_SIZE,
            plan: Mutex::new(Vec::new()),
        }
    }

    pub fn with_batch_size(mut self, batch_size: usize) -> Self {
        self.batch_size = batch_size.clamp(1, MAX_BATCH_SIZE);
        self
    }

    fn database(&self) -> PipelineResult<Database> {
        Ok(Database::open_read_write(
            &self.workspace.dir().join(WORKSPACE_DB_FILE),
        )?)
    }

    fn text_of(&self, chapter_id: &str) -> Result<Option<Vec<String>>, KnowledgeError> {
        ChapterText::load(self.workspace.dir(), self.novel_id, self.lang, chapter_id)
    }

    fn chapter(&self, chapter_id: &str) -> Result<CandidateChapter, TaskOutcome> {
        let db = self.database().map_err(failed)?;
        let chapter = NovelRepository::new(db.connection())
            .find_chapter(self.novel_id, chapter_id)
            .map_err(|error| TaskOutcome::Failed(error.to_string()))?
            .ok_or_else(|| TaskOutcome::Failed(format!("chapter {chapter_id} does not exist")))?;
        let paragraphs = self
            .text_of(chapter_id)
            .map_err(|error| TaskOutcome::Failed(error.detail))?
            .ok_or_else(|| TaskOutcome::Failed(format!("chapter {chapter_id} has no text")))?;
        Ok(CandidateChapter {
            seq: chapter.seq,
            title: chapter.title,
            paragraphs,
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

    fn batch_of(&self, chapter_id: &str) -> Option<(usize, Arc<Batch>)> {
        let plan = self.plan.lock().unwrap_or_else(PoisonError::into_inner);
        plan.iter()
            .position(|batch| batch.chapters.iter().any(|id| id == chapter_id))
            .map(|index| (index, plan[index].clone()))
    }

    fn known_before(&self, index: usize, first_seq: i64) -> Result<Vec<KnownEntity>, TaskOutcome> {
        let mut known = self
            .workspace
            .known_entities(self.novel_id, self.lang, first_seq, KNOWN_LIMIT)
            .map_err(|error| TaskOutcome::Failed(error.detail))?;
        let mut seen: HashSet<(String, String)> = known
            .iter()
            .map(|entity| (entity.kind.clone(), norm(&entity.name)))
            .collect();
        let earlier: Vec<Arc<Batch>> = self
            .plan
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .iter()
            .take(index)
            .cloned()
            .collect();
        for batch in earlier {
            let Some(found) = batch.finished() else {
                continue;
            };
            for id in &batch.chapters {
                for entity in found.get(id).into_iter().flatten() {
                    if known.len() >= KNOWN_LIMIT {
                        return Ok(known);
                    }
                    if seen.insert((entity.kind.clone(), norm(&entity.name))) {
                        known.push(KnownEntity {
                            kind: entity.kind.clone(),
                            name: entity.name.clone(),
                            titles: entity.titles.clone(),
                            aliases: entity.aliases.clone(),
                            character: None,
                        });
                    }
                }
            }
        }
        Ok(known)
    }

    fn find_candidates(
        &self,
        index: usize,
        chapter_ids: &[String],
        log: &TaskLog,
        progress: &dyn Fn(u8),
        cancel: &AtomicBool,
    ) -> Result<Candidates, BatchFailure> {
        let mut chapters = Vec::with_capacity(chapter_ids.len());
        for id in chapter_ids {
            chapters.push(self.chapter(id).map_err(failure_of)?);
        }
        let first_seq = chapters
            .iter()
            .map(|chapter| chapter.seq)
            .min()
            .unwrap_or(0);
        let known = self.known_before(index, first_seq).map_err(failure_of)?;
        log.line(&format!(
            "finding candidates for {} chapters (seq {}), {} known entities from earlier chapters, language {}",
            chapters.len(),
            chapters
                .iter()
                .map(|chapter| chapter.seq.to_string())
                .collect::<Vec<_>>()
                .join(", "),
            known.len(),
            self.lang.as_str()
        ));
        let job = CandidateJob {
            lang: self.lang.as_str().to_string(),
            chapters,
            known,
        };
        let found = self
            .analyzer
            .candidates(&job, log, &|value| progress(value / 2), cancel)
            .map_err(failure_of_analysis)?;
        log.line(&format!(
            "candidates found: {}",
            found
                .iter()
                .map(|entities| entities.len().to_string())
                .collect::<Vec<_>>()
                .join(" + ")
        ));
        Ok(Arc::new(chapter_ids.iter().cloned().zip(found).collect()))
    }

    fn entities_of(
        &self,
        task: &PipelineTask,
        log: &TaskLog,
        progress: &dyn Fn(u8),
        cancel: &AtomicBool,
    ) -> Result<Vec<AnalysisEntity>, TaskOutcome> {
        let (index, batch) = match self.batch_of(&task.chapter_id) {
            Some((index, batch)) => (index, batch),
            None => (0, Arc::new(Batch::new(vec![task.chapter_id.clone()]))),
        };
        let compute = || self.find_candidates(index, &batch.chapters, log, progress, cancel);
        let (result, leader) = batch.candidates(cancel, &compute);
        if !leader {
            log.line("the candidates of this chapter came from its batch");
        }
        let found = result.map_err(outcome_of)?;
        Ok(found.get(&task.chapter_id).cloned().unwrap_or_default())
    }

    fn find_facts(
        &self,
        chapter: CandidateChapter,
        entities: Vec<AnalysisEntity>,
        log: &TaskLog,
        progress: &dyn Fn(u8),
        cancel: &AtomicBool,
    ) -> Result<Vec<AnalysisFact>, TaskOutcome> {
        log.line(&format!(
            "finding facts of \"{}\": {} paragraphs, {} entities",
            chapter.title,
            chapter.paragraphs.len(),
            entities.len()
        ));
        let job = FactsJob {
            lang: self.lang.as_str().to_string(),
            title: chapter.title,
            paragraphs: chapter.paragraphs,
            entities,
        };
        self.analyzer
            .facts(
                &job,
                log,
                &|value| progress(CANDIDATES_DONE + value / 2),
                cancel,
            )
            .map_err(|error| outcome_of(failure_of_analysis(error)))
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
        let mut order = Vec::new();
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
            order.push((chapter.seq, task.chapter_id.clone()));
        }
        if !missing.is_empty() {
            missing.sort_unstable();
            return Err(self.missing_text(&missing));
        }
        order.sort();
        let batches = order
            .chunks(self.batch_size)
            .map(|group| Arc::new(Batch::new(group.iter().map(|(_, id)| id.clone()).collect())))
            .collect();
        *self.plan.lock().unwrap_or_else(PoisonError::into_inner) = batches;
        Ok(())
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
        let entities = self.entities_of(task, log, progress, cancel)?;
        if cancel.load(Ordering::SeqCst) {
            return Err(TaskOutcome::Cancelled);
        }
        progress(CANDIDATES_DONE);
        log.line(&format!(
            "{} entities found in this chapter",
            entities.len()
        ));
        let facts = if entities.is_empty() {
            Vec::new()
        } else {
            let chapter = self.chapter(&task.chapter_id)?;
            self.find_facts(chapter, entities.clone(), log, progress, cancel)?
        };
        if cancel.load(Ordering::SeqCst) {
            return Err(TaskOutcome::Cancelled);
        }
        let counts = (entities.len(), facts.len());
        let analysis = ChapterAnalysis {
            entities,
            facts,
            ..ChapterAnalysis::default()
        };
        self.workspace
            .save_analysis(self.novel_id, self.lang, &task.chapter_id, analysis)
            .map_err(|error| TaskOutcome::Failed(error.detail))?;
        progress(100);
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
        let size = params
            .get("batchSize")
            .and_then(serde_json::Value::as_u64)
            .map_or(DEFAULT_BATCH_SIZE, |value| value as usize);
        let job = AnalysisJob::new(workspace, novel_id, lang, self.analyzer.clone())
            .with_batch_size(size);
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

fn wait<'a>(ready: &Condvar, state: MutexGuard<'a, SlotState>) -> MutexGuard<'a, SlotState> {
    match ready.wait_timeout(state, WAIT_POLL) {
        Ok((guard, _)) => guard,
        Err(poisoned) => poisoned.into_inner().0,
    }
}

fn failure_of(outcome: TaskOutcome) -> BatchFailure {
    match outcome {
        TaskOutcome::Cancelled => BatchFailure::Cancelled,
        TaskOutcome::Failed(message) => BatchFailure::Failed(message),
    }
}

fn failure_of_analysis(error: AnalyzeError) -> BatchFailure {
    match error {
        AnalyzeError::Cancelled => BatchFailure::Cancelled,
        AnalyzeError::Failed(message) => BatchFailure::Failed(message),
    }
}

fn outcome_of(failure: BatchFailure) -> TaskOutcome {
    match failure {
        BatchFailure::Cancelled => TaskOutcome::Cancelled,
        BatchFailure::Failed(message) => TaskOutcome::Failed(message),
    }
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
