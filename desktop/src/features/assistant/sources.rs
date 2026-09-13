use crate::features::assistant::models::AssistantScope;
use crate::features::assistant::models::ScopeKind;
use crate::features::audiobook::models::AudioRecord;
use crate::features::audiobook::models::Audiobook;
use crate::features::audiobook::models::AudiobookConfig;
use crate::features::audiobook::models::MixSettings;
use crate::features::audiobook::service::AudiobookWorkspace;
use crate::features::knowledge::models::KnowledgeEdit;
use crate::features::knowledge::models::KnowledgeEditResult;
use crate::features::knowledge::models::WireKnowledge;
use crate::features::knowledge::service::KnowledgeWorkspace;
use crate::features::library::models::LibraryVoice;
use crate::features::library::service::LibraryWorkspace;
use crate::features::novel::models::ChapterRow;
use crate::features::novel::models::NovelPatch;
use crate::features::novel::models::NovelSummary;
use crate::features::novel::models::ParagraphRow;
use crate::features::novel::service::NovelWorkspace;
use crate::features::pipeline::executor::PipelineExecutor;
use crate::features::pipeline::models::JobOwner;
use crate::features::pipeline::models::PipelineSnapshot;
use crate::features::pipeline::repository::PipelineRepository;
use crate::features::project::models::ProjectModuleState;
use crate::features::project::models::ProjectPatch;
use crate::features::project::models::ProjectSummary;
use crate::features::project::service::ProjectWorkspace;
use crate::features::scripting::chapters::ProjectChapter;
use crate::features::scripting::chapters::project_chapters;
use crate::features::scripting::models::CastMember;
use crate::features::scripting::models::Script;
use crate::features::scripting::models::ScriptUnit;
use crate::features::scripting::service::ScriptingWorkspace;
use crate::features::translation::models::DictInput;
use crate::features::translation::models::DictPatch;
use crate::features::translation::service::ChapterTranslation;
use crate::features::translation::service::DictChange;
use crate::features::translation::service::NovelTranslation;
use crate::features::translation::service::TranslationWorkspace;
use crate::features::workspace::inspector::WORKSPACE_DB_FILE;
use crate::infra::storage::database::Database;
use std::path::PathBuf;

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
    fn analyzed_chapters(&self, novel_id: i64, lang: &str) -> Result<Vec<String>, String>;
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
    fn translated_chapters(&self, novel_id: i64, target: &str) -> Result<Vec<String>, String>;
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

    fn update(&self, project_id: i64, patch: ProjectPatch) -> Result<ProjectSummary, String>;
}

pub trait ScriptSource {
    fn chapters(&self, project_id: i64) -> Result<Vec<ProjectChapter>, String>;
    fn script(&self, project_id: i64) -> Result<Option<Script>, String>;
    fn modules(&self, project_id: i64) -> Result<Vec<ProjectModuleState>, String>;
    fn unit_save(&self, project_id: i64, unit: ScriptUnit, seq: i64) -> Result<(), String>;
    fn cast_save(&self, project_id: i64, extra_cast: Vec<CastMember>) -> Result<(), String>;
}

pub trait AudiobookSource {
    fn book(&self, project_id: i64) -> Result<Option<Audiobook>, String>;
    fn config_save(&self, project_id: i64, config: AudiobookConfig) -> Result<(), String>;
    fn mix_save(&self, project_id: i64, mix: MixSettings) -> Result<MixSettings, String>;
    fn flag_set(
        &self,
        project_id: i64,
        unit_id: &str,
        block_id: &str,
        flag: &str,
    ) -> Result<AudioRecord, String>;
}

pub trait VoiceSource {
    fn list(&self) -> Result<Vec<LibraryVoice>, String>;
}

pub trait PipelineSource {
    fn history(&self, owner: Option<JobOwner>, limit: i64)
    -> Result<Vec<PipelineSnapshot>, String>;
    fn snapshot(&self, pipeline_id: i64) -> Result<Option<PipelineSnapshot>, String>;
    fn cancel(&self, pipeline_id: i64) -> bool;
}

pub struct Sources {
    pub novels: Box<dyn NovelSource>,
    pub knowledge: Box<dyn KnowledgeSource>,
    pub translation: Box<dyn TranslationSource>,
    pub projects: Box<dyn ProjectSource>,
    pub scripts: Box<dyn ScriptSource>,
    pub audiobooks: Box<dyn AudiobookSource>,
    pub voices: Box<dyn VoiceSource>,
    pub pipelines: Box<dyn PipelineSource>,
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

    fn analyzed_chapters(&self, novel_id: i64, lang: &str) -> Result<Vec<String>, String> {
        KnowledgeWorkspace::analyzed_chapters(self, novel_id, lang)
            .map_err(|error| error.to_string())
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

    fn translated_chapters(&self, novel_id: i64, target: &str) -> Result<Vec<String>, String> {
        TranslationWorkspace::translated_chapters(self, novel_id, target)
            .map_err(|error| error.to_string())
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

    fn update(&self, project_id: i64, patch: ProjectPatch) -> Result<ProjectSummary, String> {
        ProjectWorkspace::update(self, project_id, patch).map_err(|error| error.to_string())
    }
}

pub struct ProjectScripts {
    projects: ProjectWorkspace,
    scripting: ScriptingWorkspace,
}

impl ProjectScripts {
    pub fn new(projects: ProjectWorkspace) -> Self {
        let scripting = ScriptingWorkspace::new(projects.clone());
        Self {
            projects,
            scripting,
        }
    }
}

impl ScriptSource for ProjectScripts {
    fn chapters(&self, project_id: i64) -> Result<Vec<ProjectChapter>, String> {
        let root = self.projects.dir().to_path_buf();
        self.projects
            .with_project(project_id, |project, _| project_chapters(&root, project))
            .map_err(|error| error.to_string())
    }

    fn script(&self, project_id: i64) -> Result<Option<Script>, String> {
        self.scripting
            .get(project_id)
            .map_err(|error| error.to_string())
    }

    fn modules(&self, project_id: i64) -> Result<Vec<ProjectModuleState>, String> {
        self.scripting
            .modules(project_id)
            .map_err(|error| error.to_string())
    }

    fn unit_save(&self, project_id: i64, unit: ScriptUnit, seq: i64) -> Result<(), String> {
        self.scripting
            .unit_save(project_id, unit, seq)
            .map_err(|error| error.to_string())
    }

    fn cast_save(&self, project_id: i64, extra_cast: Vec<CastMember>) -> Result<(), String> {
        self.scripting
            .cast_save(project_id, extra_cast)
            .map_err(|error| error.to_string())
    }
}

impl AudiobookSource for AudiobookWorkspace {
    fn book(&self, project_id: i64) -> Result<Option<Audiobook>, String> {
        AudiobookWorkspace::get(self, project_id).map_err(|error| error.to_string())
    }

    fn config_save(&self, project_id: i64, config: AudiobookConfig) -> Result<(), String> {
        AudiobookWorkspace::config_save(self, project_id, config).map_err(|error| error.to_string())
    }

    fn mix_save(&self, project_id: i64, mix: MixSettings) -> Result<MixSettings, String> {
        AudiobookWorkspace::mix_save(self, project_id, mix).map_err(|error| error.to_string())
    }

    fn flag_set(
        &self,
        project_id: i64,
        unit_id: &str,
        block_id: &str,
        flag: &str,
    ) -> Result<AudioRecord, String> {
        AudiobookWorkspace::flag_set(self, project_id, unit_id, block_id, flag)
            .map_err(|error| error.to_string())
    }
}

impl VoiceSource for LibraryWorkspace {
    fn list(&self) -> Result<Vec<LibraryVoice>, String> {
        LibraryWorkspace::voice_list(self).map_err(|error| error.to_string())
    }
}

pub struct WorkspacePipelines {
    dir: PathBuf,
    executor: PipelineExecutor,
}

impl WorkspacePipelines {
    pub fn new(dir: PathBuf, executor: PipelineExecutor) -> Self {
        Self { dir, executor }
    }

    fn read<T>(
        &self,
        query: impl FnOnce(&PipelineRepository) -> rusqlite::Result<T>,
    ) -> Result<T, String> {
        let database = Database::open_read_only(&self.dir.join(WORKSPACE_DB_FILE))
            .map_err(|error| error.to_string())?;
        query(&PipelineRepository::new(database.connection())).map_err(|error| error.to_string())
    }
}

impl PipelineSource for WorkspacePipelines {
    fn history(
        &self,
        owner: Option<JobOwner>,
        limit: i64,
    ) -> Result<Vec<PipelineSnapshot>, String> {
        self.read(|repository| repository.list_history(owner, limit))
    }

    fn snapshot(&self, pipeline_id: i64) -> Result<Option<PipelineSnapshot>, String> {
        self.read(|repository| repository.snapshot(pipeline_id))
    }

    fn cancel(&self, pipeline_id: i64) -> bool {
        self.executor.cancel_pipeline(pipeline_id)
    }
}
