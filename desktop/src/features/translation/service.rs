use crate::features::novel::files::NovelFiles;
use crate::features::novel::models::Paragraph;
use crate::features::novel::repository::NovelRepository;
use crate::features::novel::repository::NovelRow;
use crate::features::novel::service::normalize_paragraph;
use crate::features::translation::dictionary::DictionaryRepository;
use crate::features::translation::dictionary::is_duplicate;
use crate::features::translation::files::TranslationFiles;
use crate::features::translation::models::ChapterFile;
use crate::features::translation::models::DictEntry;
use crate::features::translation::models::DictInput;
use crate::features::translation::models::DictPatch;
use crate::features::translation::models::TranslatedParagraph;
use crate::features::translation::models::TranslationError;
use crate::features::translation::models::TranslationErrorCode;
use crate::features::translation::models::TranslationResult;
use crate::features::translation::models::TranslationTarget;
use crate::features::translation::warnings::TranslationWarning;
use crate::features::translation::warnings::WarningKind;
use crate::features::translation::warnings::chapter_warnings;
use crate::features::workspace::inspector::WORKSPACE_DB_FILE;
use crate::features::workspace::repository::format_timestamp;
use crate::features::workspace::session::WorkspaceSession;
use crate::infra::storage::database::Database;
use chrono::Utc;
use rusqlite::OptionalExtension;
use serde::Serialize;
use std::collections::BTreeMap;
use std::path::PathBuf;
use std::sync::Arc;
use std::sync::Mutex;
use std::sync::MutexGuard;

const DICT_TYPES: [&str; 5] = ["name", "place", "org", "title", "term"];

#[derive(Debug, Clone, Default)]
pub struct TranslationService {
    gate: Arc<Mutex<()>>,
}

impl TranslationService {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn open(&self, session: &WorkspaceSession) -> TranslationResult<TranslationWorkspace> {
        match session.current() {
            Some(current) => Ok(TranslationWorkspace::with_gate(
                PathBuf::from(current.path),
                self.gate.clone(),
            )),
            None => Err(TranslationError::new(
                TranslationErrorCode::NoWorkspace,
                "no workspace is open",
            )),
        }
    }
}

#[derive(Debug, Clone)]
pub struct TranslationWorkspace {
    dir: PathBuf,
    gate: Arc<Mutex<()>>,
}

impl TranslationWorkspace {
    #[cfg(test)]
    pub fn new(dir: PathBuf) -> Self {
        Self::with_gate(dir, Arc::new(Mutex::new(())))
    }

    pub fn with_gate(dir: PathBuf, gate: Arc<Mutex<()>>) -> Self {
        Self { dir, gate }
    }

    pub fn dir(&self) -> &std::path::Path {
        &self.dir
    }

    pub fn get(&self, novel_id: i64, target: &str) -> TranslationResult<NovelTranslation> {
        let target = self.target_for(novel_id, target)?;
        let db = self.database()?;
        let repo = NovelRepository::new(db.connection());
        let chapters = repo.list_chapters(novel_id)?;
        let dict = DictionaryRepository::new(db.connection()).list(novel_id, target)?;
        let files = self.files();
        let mut translated = BTreeMap::new();
        let mut warnings = Vec::new();
        for chapter in chapters {
            if let Some(file) = files.read_chapter(novel_id, target, &chapter.id)? {
                let original = self.read_original(novel_id, &chapter.id)?;
                warnings.extend(chapter_warnings(&chapter.id, &original, &file, &dict));
                translated.insert(chapter.id, chapter_translation(&file));
            }
        }
        Ok(NovelTranslation {
            guidelines: files.read_guidelines(novel_id, target)?,
            dict,
            chapters: translated,
            warnings,
        })
    }

    pub fn warnings(
        &self,
        novel_id: i64,
        target: &str,
    ) -> TranslationResult<Vec<TranslationWarning>> {
        Ok(self.get(novel_id, target)?.warnings)
    }

    pub fn guidelines_save(
        &self,
        novel_id: i64,
        target: &str,
        text: &str,
    ) -> TranslationResult<bool> {
        let _gate = lock(&self.gate);
        let target = self.target_for(novel_id, target)?;
        let files = self.files();
        let text = text.trim();
        if files.read_guidelines(novel_id, target)? == text {
            return Ok(false);
        }
        files.write_guidelines(novel_id, target, text)?;
        Ok(true)
    }

    pub fn dict_add(
        &self,
        novel_id: i64,
        target: &str,
        input: DictInput,
    ) -> TranslationResult<DictChange> {
        let _gate = lock(&self.gate);
        let target = self.target_for(novel_id, target)?;
        let input = clean_input(input)?;
        let db = self.database()?;
        let repo = DictionaryRepository::new(db.connection());
        let id = repo
            .insert(novel_id, target, &input, &now())
            .map_err(map_dictionary_error)?;
        let entry = repo
            .find(novel_id, id)?
            .ok_or_else(|| TranslationError::not_found("dictionary entry does not exist"))?;
        let flagged = self.flagged(novel_id, target, &entry)?;
        Ok(DictChange { entry, flagged })
    }

    pub fn dict_update(
        &self,
        novel_id: i64,
        id: i64,
        patch: DictPatch,
    ) -> TranslationResult<DictChange> {
        let _gate = lock(&self.gate);
        let db = self.database()?;
        require_novel(&NovelRepository::new(db.connection()), novel_id)?;
        let repo = DictionaryRepository::new(db.connection());
        let old = repo.find(novel_id, id)?.ok_or_else(|| {
            TranslationError::not_found(format!("dictionary entry {id} does not exist"))
        })?;
        let target = entry_target(db.connection(), id)?.ok_or_else(|| {
            TranslationError::not_found(format!("dictionary entry {id} does not exist"))
        })?;
        let target = TranslationTarget::parse(&target)
            .ok_or_else(|| TranslationError::invalid("dictionary target is invalid"))?;
        let entry = apply_patch(old, patch)?;
        repo.update(novel_id, &entry, &now())
            .map_err(map_dictionary_error)?;
        let flagged = self.flagged(novel_id, target, &entry)?;
        Ok(DictChange { entry, flagged })
    }

    pub fn dict_delete(&self, novel_id: i64, id: i64) -> TranslationResult<()> {
        let _gate = lock(&self.gate);
        let db = self.database()?;
        require_novel(&NovelRepository::new(db.connection()), novel_id)?;
        if !DictionaryRepository::new(db.connection()).delete(novel_id, id)? {
            return Err(TranslationError::not_found(format!(
                "dictionary entry {id} does not exist"
            )));
        }
        Ok(())
    }

    pub fn passage_save(
        &self,
        novel_id: i64,
        target: &str,
        chapter_id: &str,
        n: usize,
        text: &str,
    ) -> TranslationResult<ChapterTranslation> {
        let _gate = lock(&self.gate);
        let target = self.target_for(novel_id, target)?;
        let text =
            normalize_paragraph(text).map_err(|error| TranslationError::invalid(error.detail))?;
        let mut chapter = self.translation_chapter(novel_id, target, chapter_id)?;
        let paragraph = nth_mut(&mut chapter.paragraphs, n)?;
        paragraph.text = text;
        self.files()
            .write_chapter(novel_id, target, chapter_id, &chapter)?;
        Ok(chapter_translation(&chapter))
    }

    pub fn note_save(
        &self,
        novel_id: i64,
        target: &str,
        chapter_id: &str,
        n: usize,
        text: &str,
    ) -> TranslationResult<ChapterTranslation> {
        let _gate = lock(&self.gate);
        let target = self.target_for(novel_id, target)?;
        let mut chapter = self.translation_chapter(novel_id, target, chapter_id)?;
        let paragraph = nth_mut(&mut chapter.paragraphs, n)?;
        paragraph.note = text.trim().to_string();
        self.files()
            .write_chapter(novel_id, target, chapter_id, &chapter)?;
        Ok(chapter_translation(&chapter))
    }

    pub fn save_run(
        &self,
        novel_id: i64,
        target: &str,
        chapter_id: &str,
        passage: Option<usize>,
        mut run: TranslatedRun,
    ) -> TranslationResult<()> {
        let _gate = lock(&self.gate);
        let target = self.target_for(novel_id, target)?;
        self.require_chapter(novel_id, chapter_id)?;
        let originals = self.read_original(novel_id, chapter_id)?;
        let files = self.files();
        match passage {
            Some(n) => {
                if run.paragraphs.len() != 1 {
                    return Err(TranslationError::invalid(
                        "a passage run must have one paragraph",
                    ));
                }
                let mut chapter = files
                    .read_chapter(novel_id, target, chapter_id)?
                    .ok_or_else(|| {
                        TranslationError::not_found(format!(
                            "translation for chapter {chapter_id} does not exist"
                        ))
                    })?;
                let original = nth(&originals, n)?;
                let paragraph = nth_mut(&mut chapter.paragraphs, n)?;
                paragraph.text = run.paragraphs.remove(0);
                paragraph.original_hashcheck = original.hashcheck.clone();
                files.write_chapter(novel_id, target, chapter_id, &chapter)?;
            }
            None => {
                if run.paragraphs.len() > originals.len() {
                    return Err(TranslationError::invalid(
                        "the run has more paragraphs than the original chapter",
                    ));
                }
                let old = files.read_chapter(novel_id, target, chapter_id)?;
                let paragraphs = run
                    .paragraphs
                    .into_iter()
                    .enumerate()
                    .map(|(index, text)| TranslatedParagraph {
                        original_hashcheck: originals[index].hashcheck.clone(),
                        text,
                        note: old
                            .as_ref()
                            .and_then(|chapter| chapter.paragraphs.get(index))
                            .map(|paragraph| paragraph.note.clone())
                            .unwrap_or_default(),
                    })
                    .collect();
                files.write_chapter(
                    novel_id,
                    target,
                    chapter_id,
                    &ChapterFile {
                        title: run.title,
                        paragraphs,
                    },
                )?;
            }
        }
        Ok(())
    }

    fn flagged(
        &self,
        novel_id: i64,
        target: TranslationTarget,
        entry: &DictEntry,
    ) -> TranslationResult<usize> {
        Ok(self
            .warnings_for_target(novel_id, target)?
            .into_iter()
            .filter(|warning| {
                matches!(warning.kind, WarningKind::Dict) && warning.entry_id == Some(entry.id)
            })
            .count())
    }

    fn warnings_for_target(
        &self,
        novel_id: i64,
        target: TranslationTarget,
    ) -> TranslationResult<Vec<TranslationWarning>> {
        self.warnings(novel_id, target.as_str())
    }

    pub fn target_for(&self, novel_id: i64, raw: &str) -> TranslationResult<TranslationTarget> {
        let target = TranslationTarget::parse(raw)
            .ok_or_else(|| TranslationError::invalid(format!("unsupported target '{raw}'")))?;
        let db = self.database()?;
        let novel = require_novel(&NovelRepository::new(db.connection()), novel_id)?;
        if novel.lang.eq_ignore_ascii_case(target.as_str()) {
            return Err(TranslationError::invalid(
                "target must differ from the novel language",
            ));
        }
        Ok(target)
    }

    fn translation_chapter(
        &self,
        novel_id: i64,
        target: TranslationTarget,
        chapter_id: &str,
    ) -> TranslationResult<ChapterFile> {
        self.require_chapter(novel_id, chapter_id)?;
        self.files()
            .read_chapter(novel_id, target, chapter_id)?
            .ok_or_else(|| {
                TranslationError::not_found(format!(
                    "translation for chapter {chapter_id} does not exist"
                ))
            })
    }

    fn require_chapter(&self, novel_id: i64, chapter_id: &str) -> TranslationResult<()> {
        let db = self.database()?;
        if NovelRepository::new(db.connection())
            .find_chapter(novel_id, chapter_id)?
            .is_none()
        {
            return Err(TranslationError::not_found(format!(
                "chapter {chapter_id} does not exist in novel {novel_id}"
            )));
        }
        Ok(())
    }

    fn database(&self) -> TranslationResult<Database> {
        Ok(Database::open_read_write(
            &self.dir.join(WORKSPACE_DB_FILE),
        )?)
    }

    fn files(&self) -> TranslationFiles {
        TranslationFiles::new(self.dir.clone())
    }

    fn read_original(&self, novel_id: i64, chapter_id: &str) -> TranslationResult<Vec<Paragraph>> {
        NovelFiles::new(self.dir.clone())
            .read_chapter(novel_id, chapter_id)
            .map_err(|error| TranslationError::new(TranslationErrorCode::Io, error.detail))
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NovelTranslation {
    pub guidelines: String,
    pub dict: Vec<DictEntry>,
    pub chapters: BTreeMap<String, ChapterTranslation>,
    pub warnings: Vec<TranslationWarning>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChapterTranslation {
    pub title: String,
    pub paragraphs: Vec<PassageTranslation>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PassageTranslation {
    pub n: usize,
    pub original_hashcheck: String,
    pub text: String,
    pub note: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DictChange {
    pub entry: DictEntry,
    pub flagged: usize,
}

#[derive(Debug, Clone)]
pub struct TranslatedRun {
    pub title: String,
    pub paragraphs: Vec<String>,
}

fn lock(mutex: &Mutex<()>) -> MutexGuard<'_, ()> {
    match mutex.lock() {
        Ok(guard) => guard,
        Err(poisoned) => poisoned.into_inner(),
    }
}

fn now() -> String {
    format_timestamp(Utc::now())
}

fn require_novel(repo: &NovelRepository, id: i64) -> TranslationResult<NovelRow> {
    repo.find_novel(id)?
        .ok_or_else(|| TranslationError::not_found(format!("novel {id} does not exist")))
}

fn clean_input(mut input: DictInput) -> TranslationResult<DictInput> {
    input.src = input.src.trim().to_string();
    input.dst = input.dst.trim().to_string();
    input.note = input.note.trim().to_string();
    validate_input(&input)?;
    Ok(input)
}

fn validate_input(input: &DictInput) -> TranslationResult<()> {
    if input.src.is_empty() || input.dst.is_empty() {
        return Err(TranslationError::invalid(
            "dictionary source and destination must not be empty",
        ));
    }
    if !DICT_TYPES.contains(&input.kind.as_str()) {
        return Err(TranslationError::invalid("dictionary type is invalid"));
    }
    Ok(())
}

fn apply_patch(mut entry: DictEntry, patch: DictPatch) -> TranslationResult<DictEntry> {
    if let Some(src) = patch.src {
        entry.src = src.trim().to_string();
    }
    if let Some(dst) = patch.dst {
        entry.dst = dst.trim().to_string();
    }
    if let Some(kind) = patch.kind {
        entry.kind = kind.trim().to_string();
    }
    if let Some(note) = patch.note {
        entry.note = note.trim().to_string();
    }
    validate_input(&DictInput {
        src: entry.src.clone(),
        dst: entry.dst.clone(),
        kind: entry.kind.clone(),
        note: entry.note.clone(),
    })?;
    Ok(entry)
}

fn map_dictionary_error(error: rusqlite::Error) -> TranslationError {
    if is_duplicate(&error) {
        TranslationError::new(
            TranslationErrorCode::DictionaryDuplicate,
            "a dictionary entry with this source already exists",
        )
    } else {
        error.into()
    }
}

fn entry_target(conn: &rusqlite::Connection, id: i64) -> TranslationResult<Option<String>> {
    Ok(conn
        .query_row(
            "SELECT target FROM ws_novel_translation_dictionary WHERE id = ?1",
            [id],
            |row| row.get(0),
        )
        .optional()?)
}

fn nth<T>(items: &[T], n: usize) -> TranslationResult<&T> {
    if n == 0 {
        return Err(TranslationError::invalid(
            "paragraph number must be positive",
        ));
    }
    items
        .get(n - 1)
        .ok_or_else(|| TranslationError::invalid(format!("paragraph {n} is out of range")))
}

fn nth_mut<T>(items: &mut [T], n: usize) -> TranslationResult<&mut T> {
    if n == 0 {
        return Err(TranslationError::invalid(
            "paragraph number must be positive",
        ));
    }
    items
        .get_mut(n - 1)
        .ok_or_else(|| TranslationError::invalid(format!("paragraph {n} is out of range")))
}

fn chapter_translation(chapter: &ChapterFile) -> ChapterTranslation {
    ChapterTranslation {
        title: chapter.title.clone(),
        paragraphs: chapter
            .paragraphs
            .iter()
            .enumerate()
            .map(|(index, paragraph)| PassageTranslation {
                n: index + 1,
                original_hashcheck: paragraph.original_hashcheck.clone(),
                text: paragraph.text.clone(),
                note: paragraph.note.clone(),
            })
            .collect(),
    }
}

#[cfg(test)]
#[path = "../../../test/features/translation/service.test.rs"]
mod tests;
