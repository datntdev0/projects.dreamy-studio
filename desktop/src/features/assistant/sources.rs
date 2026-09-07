use crate::features::assistant::models::AssistantScope;
use crate::features::assistant::models::ScopeKind;
use crate::features::knowledge::models::KnowledgeEdit;
use crate::features::knowledge::models::KnowledgeEditResult;
use crate::features::knowledge::models::WireKnowledge;
use crate::features::knowledge::service::KnowledgeWorkspace;
use crate::features::novel::models::ChapterRow;
use crate::features::novel::models::NovelPatch;
use crate::features::novel::models::NovelSummary;
use crate::features::novel::models::ParagraphRow;
use crate::features::novel::service::NovelWorkspace;
use crate::features::project::models::ProjectSummary;
use crate::features::project::service::ProjectWorkspace;
use crate::features::translation::models::DictInput;
use crate::features::translation::models::DictPatch;
use crate::features::translation::service::ChapterTranslation;
use crate::features::translation::service::DictChange;
use crate::features::translation::service::NovelTranslation;
use crate::features::translation::service::TranslationWorkspace;

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
    fn preview(
        &self,
        novel_id: i64,
        lang: &str,
        edits: Vec<KnowledgeEdit>,
    ) -> Result<WireKnowledge, String>;
}

pub trait TranslationSource {
    fn get(&self, novel_id: i64, target: &str) -> Result<NovelTranslation, String>;
    fn passage_save(
        &self,
        novel_id: i64,
        target: &str,
        chapter_id: &str,
        n: usize,
        text: &str,
    ) -> Result<ChapterTranslation, String>;
    fn dict_add(&self, novel_id: i64, target: &str, input: DictInput)
    -> Result<DictChange, String>;
    fn dict_update(&self, novel_id: i64, id: i64, patch: DictPatch) -> Result<DictChange, String>;
    fn dict_delete(&self, novel_id: i64, id: i64) -> Result<(), String>;
}

pub trait ProjectSource {
    fn list(&self) -> Result<Vec<ProjectSummary>, String>;

    fn get(&self, project_id: i64) -> Result<Option<ProjectSummary>, String> {
        Ok(self
            .list()?
            .into_iter()
            .find(|project| project.id == project_id))
    }
}

pub struct Sources {
    pub novels: Box<dyn NovelSource>,
    pub knowledge: Box<dyn KnowledgeSource>,
    pub translation: Box<dyn TranslationSource>,
    pub projects: Box<dyn ProjectSource>,
}

pub fn linked_novel(
    scope: &AssistantScope,
    projects: &dyn ProjectSource,
) -> Result<Option<i64>, String> {
    let (ScopeKind::Project, Some(project_id)) = (scope.kind, scope.project_id) else {
        return Ok(None);
    };
    let project = projects
        .get(project_id)?
        .ok_or_else(|| format!("project {project_id} not found"))?;
    Ok(project.novel_id)
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

    fn preview(
        &self,
        novel_id: i64,
        lang: &str,
        edits: Vec<KnowledgeEdit>,
    ) -> Result<WireKnowledge, String> {
        KnowledgeWorkspace::preview(self, novel_id, lang, edits).map_err(|error| error.to_string())
    }
}

impl TranslationSource for TranslationWorkspace {
    fn get(&self, novel_id: i64, target: &str) -> Result<NovelTranslation, String> {
        TranslationWorkspace::get(self, novel_id, target).map_err(|error| error.to_string())
    }

    fn passage_save(
        &self,
        novel_id: i64,
        target: &str,
        chapter_id: &str,
        n: usize,
        text: &str,
    ) -> Result<ChapterTranslation, String> {
        TranslationWorkspace::passage_save(self, novel_id, target, chapter_id, n, text)
            .map_err(|error| error.to_string())
    }

    fn dict_add(
        &self,
        novel_id: i64,
        target: &str,
        input: DictInput,
    ) -> Result<DictChange, String> {
        TranslationWorkspace::dict_add(self, novel_id, target, input)
            .map_err(|error| error.to_string())
    }

    fn dict_update(&self, novel_id: i64, id: i64, patch: DictPatch) -> Result<DictChange, String> {
        TranslationWorkspace::dict_update(self, novel_id, id, patch)
            .map_err(|error| error.to_string())
    }

    fn dict_delete(&self, novel_id: i64, id: i64) -> Result<(), String> {
        TranslationWorkspace::dict_delete(self, novel_id, id).map_err(|error| error.to_string())
    }
}

impl ProjectSource for ProjectWorkspace {
    fn list(&self) -> Result<Vec<ProjectSummary>, String> {
        ProjectWorkspace::list(self).map_err(|error| error.to_string())
    }
}

#[cfg(test)]
#[path = "../../../test/features/assistant/sources.test.rs"]
mod tests;
