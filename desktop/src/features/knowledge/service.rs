use crate::features::knowledge::edit::apply;
use crate::features::knowledge::files::KnowledgeFiles;
use crate::features::knowledge::merge::LoadedChapter;
use crate::features::knowledge::merge::merge;
use crate::features::knowledge::models::ChapterAnalysis;
use crate::features::knowledge::models::KnowledgeEdit;
use crate::features::knowledge::models::KnowledgeEditResult;
use crate::features::knowledge::models::KnowledgeEntity;
use crate::features::knowledge::models::KnowledgeError;
use crate::features::knowledge::models::KnowledgeErrorCode;
use crate::features::knowledge::models::KnowledgeItem;
use crate::features::knowledge::models::KnowledgeLang;
use crate::features::knowledge::models::KnowledgeResult;
use crate::features::knowledge::models::KnownEntity;
use crate::features::knowledge::models::WireKnowledge;
use crate::features::knowledge::ontology::Ontology;
use crate::features::knowledge::text::ChapterText;
use crate::features::knowledge::text::text_hash;
use crate::features::novel::repository::NovelRepository;
use crate::features::workspace::inspector::WORKSPACE_DB_FILE;
use crate::features::workspace::repository::format_timestamp;
use crate::features::workspace::session::WorkspaceSession;
use crate::infra::storage::database::Database;
use chrono::Utc;
use std::collections::BTreeMap;
use std::collections::HashMap;
use std::path::Path;
use std::path::PathBuf;
use std::sync::Arc;
use std::sync::Mutex;
use std::sync::MutexGuard;

#[derive(Debug, Clone, Default)]
pub struct KnowledgeService {
    gate: Arc<Mutex<()>>,
}

impl KnowledgeService {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn open(&self, session: &WorkspaceSession) -> KnowledgeResult<KnowledgeWorkspace> {
        match session.current() {
            Some(current) => Ok(KnowledgeWorkspace::with_gate(
                PathBuf::from(current.path),
                self.gate.clone(),
            )),
            None => Err(KnowledgeError::new(
                KnowledgeErrorCode::NoWorkspace,
                "no workspace is open",
            )),
        }
    }
}

#[derive(Debug, Clone)]
pub struct KnowledgeWorkspace {
    dir: PathBuf,
    gate: Arc<Mutex<()>>,
}

impl KnowledgeWorkspace {
    #[cfg(test)]
    pub fn new(dir: PathBuf) -> Self {
        Self::with_gate(dir, Arc::new(Mutex::new(())))
    }

    pub fn with_gate(dir: PathBuf, gate: Arc<Mutex<()>>) -> Self {
        Self { dir, gate }
    }

    pub fn dir(&self) -> &Path {
        &self.dir
    }

    pub fn get(&self, novel_id: i64, lang: &str) -> KnowledgeResult<WireKnowledge> {
        let _gate = lock(&self.gate);
        let lang = parse_lang(lang)?;
        let chapters = self.load_chapters(novel_id, lang)?;
        Ok(merge(lang, &chapters))
    }

    pub fn edit(
        &self,
        novel_id: i64,
        lang: &str,
        edits: Vec<KnowledgeEdit>,
    ) -> KnowledgeResult<KnowledgeEditResult> {
        let _gate = lock(&self.gate);
        let lang = parse_lang(lang)?;
        if edits.is_empty() {
            return Err(KnowledgeError::invalid("no edits were given"));
        }
        let mut chapters = self.load_chapters(novel_id, lang)?;
        let remap = apply(&mut chapters, &edits)?;
        let files = KnowledgeFiles::new(self.dir.clone());
        for chapter in chapters.iter().filter(|chapter| chapter.dirty) {
            files.write(novel_id, lang, &chapter.id, &chapter.file)?;
        }
        Ok(KnowledgeEditResult {
            knowledge: merge(lang, &chapters),
            remap: remap.into_iter().collect::<BTreeMap<_, _>>(),
        })
    }

    pub fn stale_accept(
        &self,
        novel_id: i64,
        lang: &str,
        chapters: &[i64],
    ) -> KnowledgeResult<WireKnowledge> {
        let _gate = lock(&self.gate);
        let lang = parse_lang(lang)?;
        if chapters.is_empty() {
            return Err(KnowledgeError::invalid("no chapters were given"));
        }
        let mut loaded = self.load_chapters(novel_id, lang)?;
        let mut changed = Vec::new();
        for seq in chapters {
            let Some(index) = loaded.iter().position(|chapter| chapter.seq == *seq) else {
                return Err(KnowledgeError::not_found(format!(
                    "chapter {seq} has no analysis in this language"
                )));
            };
            let Some(text) = &loaded[index].text else {
                return Err(KnowledgeError::not_found(format!(
                    "chapter has no text for this language ({seq})"
                )));
            };
            let hash = text_hash(text);
            if hash != loaded[index].file.source_hash {
                loaded[index].file.source_hash = hash;
                changed.push(index);
            }
        }
        let files = KnowledgeFiles::new(self.dir.clone());
        for index in changed {
            let chapter = &loaded[index];
            files.write(novel_id, lang, &chapter.id, &chapter.file)?;
        }
        Ok(merge(lang, &loaded))
    }

    pub fn save_analysis(
        &self,
        novel_id: i64,
        lang: KnowledgeLang,
        chapter_id: &str,
        mut analysis: ChapterAnalysis,
    ) -> KnowledgeResult<()> {
        let _gate = lock(&self.gate);
        self.require_chapter(novel_id, chapter_id)?;
        let text = ChapterText::load(&self.dir, novel_id, lang, chapter_id)?
            .ok_or_else(|| KnowledgeError::not_found("chapter has no text for this language"))?;
        analysis.ontology = Ontology::get().version;
        analysis.source_hash = text_hash(&text);
        analysis.analyzed_at = format_timestamp(Utc::now());
        KnowledgeFiles::new(self.dir.clone()).write(novel_id, lang, chapter_id, &analysis)
    }

    pub fn known_entities(
        &self,
        novel_id: i64,
        lang: KnowledgeLang,
        before_seq: i64,
        limit: usize,
    ) -> KnowledgeResult<Vec<KnownEntity>> {
        let mut chapters = self.load_chapters(novel_id, lang)?;
        chapters.retain(|chapter| chapter.seq < before_seq);
        Ok(known_from(&merge(lang, &chapters), limit))
    }

    pub fn load_chapters(
        &self,
        novel_id: i64,
        lang: KnowledgeLang,
    ) -> KnowledgeResult<Vec<LoadedChapter>> {
        let db = self.database()?;
        let repo = NovelRepository::new(db.connection());
        if repo.find_novel(novel_id)?.is_none() {
            return Err(KnowledgeError::not_found(format!(
                "novel {novel_id} does not exist"
            )));
        }
        let files = KnowledgeFiles::new(self.dir.clone());
        let mut loaded = Vec::new();
        for chapter in repo.list_chapters(novel_id)? {
            if let Some(file) = files.read(novel_id, lang, &chapter.id)? {
                let text = ChapterText::load(&self.dir, novel_id, lang, &chapter.id)?;
                loaded.push(LoadedChapter {
                    seq: chapter.seq,
                    id: chapter.id,
                    file,
                    text,
                    dirty: false,
                });
            }
        }
        Ok(loaded)
    }

    fn require_chapter(&self, novel_id: i64, chapter_id: &str) -> KnowledgeResult<()> {
        let db = self.database()?;
        let repo = NovelRepository::new(db.connection());
        if repo.find_novel(novel_id)?.is_none() {
            return Err(KnowledgeError::not_found(format!(
                "novel {novel_id} does not exist"
            )));
        }
        if repo.find_chapter(novel_id, chapter_id)?.is_none() {
            return Err(KnowledgeError::not_found(format!(
                "chapter {chapter_id} does not exist in novel {novel_id}"
            )));
        }
        Ok(())
    }

    fn database(&self) -> KnowledgeResult<Database> {
        Ok(Database::open_read_write(
            &self.dir.join(WORKSPACE_DB_FILE),
        )?)
    }
}

pub fn parse_lang(raw: &str) -> KnowledgeResult<KnowledgeLang> {
    KnowledgeLang::parse(raw)
        .ok_or_else(|| KnowledgeError::invalid(format!("unsupported lang '{raw}'")))
}

fn known_from(knowledge: &WireKnowledge, limit: usize) -> Vec<KnownEntity> {
    let mut entities: Vec<&KnowledgeEntity> = knowledge
        .items
        .iter()
        .filter_map(|item| match item {
            KnowledgeItem::Entity(entity) if entity.entity_type != "character" => Some(entity),
            _ => None,
        })
        .collect();
    entities.sort_by_key(|entity| std::cmp::Reverse(entity.ev.len()));
    let characters = character_names(knowledge);
    entities
        .into_iter()
        .take(limit)
        .map(|entity| KnownEntity {
            kind: entity.entity_type.clone(),
            name: entity.name.clone(),
            titles: entity.titles.clone(),
            aliases: entity.aliases.clone(),
            character: characters.get(&entity.id).cloned(),
        })
        .collect()
}

fn character_names(knowledge: &WireKnowledge) -> HashMap<String, String> {
    let names: HashMap<&str, &KnowledgeEntity> = knowledge
        .items
        .iter()
        .filter_map(|item| match item {
            KnowledgeItem::Entity(entity) if entity.entity_type == "character" => {
                Some((entity.id.as_str(), entity))
            }
            _ => None,
        })
        .collect();
    let mut links = HashMap::new();
    for item in &knowledge.items {
        if let KnowledgeItem::Fact(fact) = item
            && fact.pred == "persona_of"
            && let Some(character) = fact.object.as_deref().and_then(|id| names.get(id))
        {
            links
                .entry(fact.subject.clone())
                .or_insert_with(|| character.name.clone());
        }
    }
    links
}

fn lock(mutex: &Mutex<()>) -> MutexGuard<'_, ()> {
    match mutex.lock() {
        Ok(guard) => guard,
        Err(poisoned) => poisoned.into_inner(),
    }
}

#[cfg(test)]
#[path = "../../../test/features/knowledge/service.test.rs"]
mod tests;
