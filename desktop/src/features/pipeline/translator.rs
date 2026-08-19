use crate::features::translation::models::DictEntry;
use crate::features::translation::service::TranslatedRun;
use std::sync::atomic::AtomicBool;
use std::sync::atomic::Ordering;
use std::thread;
use std::time::Duration;
use std::time::Instant;

pub const PLACEHOLDER_DELAY: Duration = Duration::from_secs(5);

#[derive(Debug, Clone)]
pub struct TranslateJob {
    pub novel_id: i64,
    pub target: String,
    pub chapter_id: String,
    pub passage: Option<usize>,
    pub title: String,
    pub paragraphs: Vec<String>,
    pub guidelines: String,
    pub dict: Vec<DictEntry>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TranslateError {
    Cancelled,
    Failed(String),
}

pub trait Translator: Send + Sync {
    fn translate(
        &self,
        job: &TranslateJob,
        progress: &dyn Fn(u8),
        cancel: &AtomicBool,
    ) -> Result<TranslatedRun, TranslateError>;
}

#[derive(Debug, Clone)]
pub struct PlaceholderTranslator {
    delay: Duration,
}

impl Default for PlaceholderTranslator {
    fn default() -> Self {
        Self {
            delay: PLACEHOLDER_DELAY,
        }
    }
}

impl PlaceholderTranslator {
    pub fn with_delay(delay: Duration) -> Self {
        Self { delay }
    }
}

impl Translator for PlaceholderTranslator {
    fn translate(
        &self,
        job: &TranslateJob,
        progress: &dyn Fn(u8),
        cancel: &AtomicBool,
    ) -> Result<TranslatedRun, TranslateError> {
        if is_cancelled(cancel) {
            return Err(TranslateError::Cancelled);
        }

        let slice = self.delay / 5;
        for value in [20, 40, 60, 80, 100] {
            wait_for_slice(slice, cancel)?;
            progress(value);
            if is_cancelled(cancel) {
                return Err(TranslateError::Cancelled);
            }
        }

        Ok(TranslatedRun {
            title: format!("[translated] {}", job.title),
            paragraphs: job
                .paragraphs
                .iter()
                .map(|paragraph| format!("[translated] {paragraph}"))
                .collect(),
        })
    }
}

fn is_cancelled(cancel: &AtomicBool) -> bool {
    cancel.load(Ordering::SeqCst)
}

fn wait_for_slice(delay: Duration, cancel: &AtomicBool) -> Result<(), TranslateError> {
    let started = Instant::now();
    while started.elapsed() < delay {
        if is_cancelled(cancel) {
            return Err(TranslateError::Cancelled);
        }
        let remaining = delay.saturating_sub(started.elapsed());
        thread::sleep(remaining.min(Duration::from_millis(100)));
    }
    if is_cancelled(cancel) {
        return Err(TranslateError::Cancelled);
    }
    Ok(())
}

#[cfg(test)]
#[path = "../../../test/features/pipeline/translator.test.rs"]
mod tests;
