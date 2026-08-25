use crate::features::knowledge::models::KnowledgeEdit;
use crate::features::knowledge::models::KnowledgeEditResult;
use crate::features::knowledge::models::WireKnowledge;
use crate::features::knowledge::service::KnowledgeWorkspace;
use crate::features::novel::models::ChapterRow;
use crate::features::novel::models::NovelPatch;
use crate::features::novel::models::NovelSummary;
use crate::features::novel::models::ParagraphRow;
use crate::features::novel::service::NovelWorkspace;

pub trait NovelSource {
    fn list(&self) -> Result<Vec<NovelSummary>, String>;
    fn chapters(&self, novel_id: i64) -> Result<Vec<ChapterRow>, String>;
    fn chapter_read(&self, novel_id: i64, chapter_id: &str) -> Result<Vec<ParagraphRow>, String>;
    fn update(&self, novel_id: i64, patch: NovelPatch) -> Result<NovelSummary, String>;
    fn paragraph_update(
        &self,
        novel_id: i64,
        chapter_id: &str,
        n: usize,
        text: &str,
    ) -> Result<ChapterRow, String>;
    fn chapter_rename(
        &self,
        novel_id: i64,
        chapter_id: &str,
        title: &str,
    ) -> Result<ChapterRow, String>;
}

pub trait KnowledgeSource {
    fn get(&self, novel_id: i64, lang: &str) -> Result<WireKnowledge, String>;
    fn edit(
        &self,
        novel_id: i64,
        lang: &str,
        edits: Vec<KnowledgeEdit>,
    ) -> Result<KnowledgeEditResult, String>;
}

pub struct Sources {
    pub novels: Box<dyn NovelSource>,
    pub knowledge: Box<dyn KnowledgeSource>,
}

impl NovelSource for NovelWorkspace {
    fn list(&self) -> Result<Vec<NovelSummary>, String> {
        NovelWorkspace::list(self).map_err(|error| error.to_string())
    }

    fn chapters(&self, novel_id: i64) -> Result<Vec<ChapterRow>, String> {
        NovelWorkspace::chapters(self, novel_id).map_err(|error| error.to_string())
    }

    fn chapter_read(&self, novel_id: i64, chapter_id: &str) -> Result<Vec<ParagraphRow>, String> {
        NovelWorkspace::chapter_read(self, novel_id, chapter_id).map_err(|error| error.to_string())
    }

    fn update(&self, novel_id: i64, patch: NovelPatch) -> Result<NovelSummary, String> {
        NovelWorkspace::update(self, novel_id, patch).map_err(|error| error.to_string())
    }

    fn paragraph_update(
        &self,
        novel_id: i64,
        chapter_id: &str,
        n: usize,
        text: &str,
    ) -> Result<ChapterRow, String> {
        NovelWorkspace::paragraph_update(self, novel_id, chapter_id, n, text)
            .map_err(|error| error.to_string())
    }

    fn chapter_rename(
        &self,
        novel_id: i64,
        chapter_id: &str,
        title: &str,
    ) -> Result<ChapterRow, String> {
        NovelWorkspace::chapter_rename(self, novel_id, chapter_id, title)
            .map_err(|error| error.to_string())
    }
}

impl KnowledgeSource for KnowledgeWorkspace {
    fn get(&self, novel_id: i64, lang: &str) -> Result<WireKnowledge, String> {
        KnowledgeWorkspace::get(self, novel_id, lang).map_err(|error| error.to_string())
    }

    fn edit(
        &self,
        novel_id: i64,
        lang: &str,
        edits: Vec<KnowledgeEdit>,
    ) -> Result<KnowledgeEditResult, String> {
        KnowledgeWorkspace::edit(self, novel_id, lang, edits).map_err(|error| error.to_string())
    }
}

#[cfg(test)]
#[path = "../../../test/features/assistant/sources.test.rs"]
mod tests;
