use crate::features::knowledge::models::AnalysisEntity;
use crate::features::knowledge::models::AnalysisEvidence;
use crate::features::knowledge::models::AnalysisFact;
use crate::features::knowledge::models::ChapterDraft;
use crate::features::pipeline::analyzer::AnalyzeError;
use crate::features::pipeline::analyzer::Analyzer;
use crate::features::pipeline::analyzer::CandidateJob;
use crate::features::pipeline::analyzer::FactsJob;
use crate::features::pipeline::log::TaskLog;
use std::collections::HashMap;
use std::sync::Mutex;
use std::sync::atomic::AtomicBool;
use std::sync::atomic::Ordering;
use std::thread;
use std::time::Duration;
use std::time::Instant;

#[derive(Debug, Default)]
pub struct FakeAnalyzer {
    delay: Duration,
    drafts: HashMap<String, ChapterDraft>,
    facts: HashMap<String, Vec<AnalysisFact>>,
    failing_facts: Vec<String>,
    failing_candidates: Vec<String>,
    candidate_calls: Mutex<Vec<CandidateJob>>,
    fact_calls: Mutex<Vec<FactsJob>>,
}

impl FakeAnalyzer {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn with_delay(mut self, delay: Duration) -> Self {
        self.delay = delay;
        self
    }

    pub fn with_entities(self, title: &str, entities: Vec<AnalysisEntity>) -> Self {
        self.with_draft(
            title,
            ChapterDraft {
                entities,
                facts: Vec::new(),
            },
        )
    }

    pub fn with_draft(mut self, title: &str, draft: ChapterDraft) -> Self {
        self.drafts.insert(title.to_string(), draft);
        self
    }

    pub fn with_facts(mut self, title: &str, facts: Vec<AnalysisFact>) -> Self {
        self.facts.insert(title.to_string(), facts);
        self
    }

    pub fn failing_title(mut self, title: &str) -> Self {
        self.failing_facts.push(title.to_string());
        self
    }

    pub fn failing_candidates(mut self, title: &str) -> Self {
        self.failing_candidates.push(title.to_string());
        self
    }

    pub fn candidate_calls(&self) -> Vec<CandidateJob> {
        self.candidate_calls
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .clone()
    }

    pub fn fact_calls(&self) -> Vec<FactsJob> {
        self.fact_calls
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .clone()
    }

    pub fn facts_for(&self, title: &str) -> Option<FactsJob> {
        self.fact_calls().into_iter().find(|job| job.title == title)
    }

    pub fn candidates_with(&self, title: &str) -> Option<CandidateJob> {
        self.candidate_calls()
            .into_iter()
            .find(|job| job.chapters.iter().any(|chapter| chapter.title == title))
    }

    fn wait(&self, cancel: &AtomicBool) -> Result<(), AnalyzeError> {
        let started = Instant::now();
        while started.elapsed() < self.delay {
            if cancel.load(Ordering::SeqCst) {
                return Err(AnalyzeError::Cancelled);
            }
            thread::sleep(Duration::from_millis(1));
        }
        if cancel.load(Ordering::SeqCst) {
            return Err(AnalyzeError::Cancelled);
        }
        Ok(())
    }
}

pub fn default_entities(title: &str, paragraphs: &[String]) -> Vec<AnalysisEntity> {
    let quote = paragraphs.first().cloned().unwrap_or_default();
    vec![AnalysisEntity {
        id: "E1".to_string(),
        kind: "persona".to_string(),
        name: title.to_string(),
        titles: Vec::new(),
        aliases: Vec::new(),
        ev: vec![AnalysisEvidence { p: 1, q: quote }],
    }]
}

pub fn default_facts(entities: &[AnalysisEntity], paragraphs: &[String]) -> Vec<AnalysisFact> {
    let quote = paragraphs.first().cloned().unwrap_or_default();
    entities
        .first()
        .map(|entity| AnalysisFact {
            id: "F1".to_string(),
            pred: "occupation".to_string(),
            subject: entity.id.clone(),
            object: None,
            ev: vec![AnalysisEvidence { p: 1, q: quote }],
        })
        .into_iter()
        .collect()
}

impl Analyzer for FakeAnalyzer {
    fn candidates(
        &self,
        job: &CandidateJob,
        _log: &TaskLog,
        progress: &dyn Fn(u8),
        cancel: &AtomicBool,
    ) -> Result<Vec<ChapterDraft>, AnalyzeError> {
        self.candidate_calls
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .push(job.clone());
        self.wait(cancel)?;
        if job
            .chapters
            .iter()
            .any(|chapter| self.failing_candidates.contains(&chapter.title))
        {
            return Err(AnalyzeError::Failed("candidates refused".to_string()));
        }
        progress(100);
        Ok(job
            .chapters
            .iter()
            .map(|chapter| {
                self.drafts
                    .get(&chapter.title)
                    .cloned()
                    .unwrap_or_else(|| ChapterDraft {
                        entities: default_entities(&chapter.title, &chapter.paragraphs),
                        facts: Vec::new(),
                    })
            })
            .collect())
    }

    fn facts(
        &self,
        job: &FactsJob,
        _log: &TaskLog,
        progress: &dyn Fn(u8),
        cancel: &AtomicBool,
    ) -> Result<Vec<AnalysisFact>, AnalyzeError> {
        self.fact_calls
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .push(job.clone());
        self.wait(cancel)?;
        if self.failing_facts.contains(&job.title) {
            return Err(AnalyzeError::Failed("provider refused".to_string()));
        }
        progress(100);
        Ok(self
            .facts
            .get(&job.title)
            .cloned()
            .unwrap_or_else(|| default_facts(&job.entities, &job.paragraphs)))
    }
}
