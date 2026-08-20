use crate::features::translation::models::DictEntry;
use crate::features::translation::service::TranslatedRun;
use std::sync::atomic::AtomicBool;

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
