use crate::features::pipeline::log::TaskLog;
use crate::features::pipeline::translator::TranslateError;
use crate::features::pipeline::translator::TranslateJob;
use crate::features::pipeline::translator::Translator;
use crate::features::translation::service::TranslatedRun;
use std::sync::atomic::AtomicBool;
use std::sync::atomic::Ordering;
use std::thread;
use std::time::Duration;
use std::time::Instant;

#[derive(Debug, Clone)]
pub struct FakeTranslator {
    delay: Duration,
}

impl FakeTranslator {
    pub fn with_delay(delay: Duration) -> Self {
        Self { delay }
    }
}

impl Translator for FakeTranslator {
    fn translate(
        &self,
        job: &TranslateJob,
        _log: &TaskLog,
        progress: &dyn Fn(u8),
        cancel: &AtomicBool,
    ) -> Result<TranslatedRun, TranslateError> {
        let started = Instant::now();
        while started.elapsed() < self.delay {
            if cancel.load(Ordering::SeqCst) {
                return Err(TranslateError::Cancelled);
            }
            thread::sleep(Duration::from_millis(1));
        }
        if cancel.load(Ordering::SeqCst) {
            return Err(TranslateError::Cancelled);
        }
        progress(100);
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
