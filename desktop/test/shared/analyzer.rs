use crate::features::knowledge::models::AnalysisEntity;
use crate::features::knowledge::models::AnalysisEvidence;
use crate::features::knowledge::models::AnalysisFact;
use crate::features::knowledge::models::ChapterAnalysis;
use crate::features::pipeline::analyzer::AnalyzeError;
use crate::features::pipeline::analyzer::AnalyzeJob;
use crate::features::pipeline::analyzer::Analyzer;
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
    canned: HashMap<String, ChapterAnalysis>,
    failing: Vec<String>,
    received: Mutex<Vec<AnalyzeJob>>,
}

impl FakeAnalyzer {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn with_delay(mut self, delay: Duration) -> Self {
        self.delay = delay;
        self
    }

    pub fn with_analysis(mut self, title: &str, analysis: ChapterAnalysis) -> Self {
        self.canned.insert(title.to_string(), analysis);
        self
    }

    pub fn failing_title(mut self, title: &str) -> Self {
        self.failing.push(title.to_string());
        self
    }

    pub fn received(&self) -> Vec<AnalyzeJob> {
        self.received
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .clone()
    }

    pub fn received_for(&self, title: &str) -> Option<AnalyzeJob> {
        self.received().into_iter().find(|job| job.title == title)
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

pub fn default_analysis(title: &str, paragraphs: &[String]) -> ChapterAnalysis {
    let quote = paragraphs.first().cloned().unwrap_or_default();
    ChapterAnalysis {
        entities: vec![AnalysisEntity {
            id: "E1".to_string(),
            kind: "persona".to_string(),
            name: title.to_string(),
            titles: Vec::new(),
            aliases: Vec::new(),
            ev: vec![AnalysisEvidence {
                p: 1,
                q: quote.clone(),
            }],
        }],
        facts: vec![AnalysisFact {
            id: "F1".to_string(),
            pred: "occupation".to_string(),
            subject: "E1".to_string(),
            object: None,
            ev: vec![AnalysisEvidence { p: 1, q: quote }],
        }],
        ..ChapterAnalysis::default()
    }
}

impl Analyzer for FakeAnalyzer {
    fn analyze(
        &self,
        job: &AnalyzeJob,
        progress: &dyn Fn(u8),
        cancel: &AtomicBool,
    ) -> Result<ChapterAnalysis, AnalyzeError> {
        self.received
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .push(job.clone());
        self.wait(cancel)?;
        if self.failing.contains(&job.title) {
            return Err(AnalyzeError::Failed("provider refused".to_string()));
        }
        progress(100);
        Ok(self
            .canned
            .get(&job.title)
            .cloned()
            .unwrap_or_else(|| default_analysis(&job.title, &job.paragraphs)))
    }
}
