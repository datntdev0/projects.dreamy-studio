use crate::features::knowledge::models::KnowledgeError;
use crate::features::knowledge::models::KnowledgeErrorCode;
use crate::features::knowledge::models::KnowledgeLang;
use crate::features::knowledge::models::KnowledgeResult;
use crate::features::novel::files::NovelFiles;
use crate::features::novel::models::NovelError;
use crate::features::novel::models::NovelErrorCode;
use crate::features::translation::files::TranslationFiles;
use crate::features::translation::models::TranslationError;
use crate::features::translation::models::TranslationErrorCode;
use crate::features::translation::models::TranslationTarget;
use sha2::Digest;
use sha2::Sha256;
use std::path::Path;
use unicode_normalization::UnicodeNormalization;

pub struct ChapterText;

impl ChapterText {
    pub fn load(
        root: &Path,
        novel_id: i64,
        lang: KnowledgeLang,
        chapter_id: &str,
    ) -> KnowledgeResult<Option<Vec<String>>> {
        match lang {
            KnowledgeLang::Src => load_source(root, novel_id, chapter_id),
            KnowledgeLang::Vi => {
                load_translation(root, novel_id, TranslationTarget::Vi, chapter_id)
            }
            KnowledgeLang::En => {
                load_translation(root, novel_id, TranslationTarget::En, chapter_id)
            }
        }
    }
}

pub fn text_hash(paragraphs: &[String]) -> String {
    Sha256::digest(paragraphs.join("\n").as_bytes())
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

pub fn norm(text: &str) -> String {
    text.nfc()
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .to_lowercase()
}

pub fn contains(paragraphs: &[String], p: usize, q: &str) -> bool {
    let query = norm(q);
    if query.is_empty() {
        return false;
    }
    match p.checked_sub(1).and_then(|index| paragraphs.get(index)) {
        Some(paragraph) => norm(paragraph).contains(&query),
        None => false,
    }
}

pub fn locate(paragraphs: &[String], hint: usize, q: &str) -> Option<usize> {
    if contains(paragraphs, hint, q) {
        return Some(hint);
    }
    (1..=paragraphs.len()).find(|p| contains(paragraphs, *p, q))
}

fn load_source(
    root: &Path,
    novel_id: i64,
    chapter_id: &str,
) -> KnowledgeResult<Option<Vec<String>>> {
    match NovelFiles::new(root.to_path_buf()).read_chapter(novel_id, chapter_id) {
        Ok(paragraphs) => Ok(Some(
            paragraphs
                .into_iter()
                .map(|paragraph| paragraph.text)
                .collect(),
        )),
        Err(error) if error.code == NovelErrorCode::ChapterFileMissing => Ok(None),
        Err(error) => Err(novel_error(error)),
    }
}

fn load_translation(
    root: &Path,
    novel_id: i64,
    target: TranslationTarget,
    chapter_id: &str,
) -> KnowledgeResult<Option<Vec<String>>> {
    let chapter = TranslationFiles::new(root.to_path_buf())
        .read_chapter(novel_id, target, chapter_id)
        .map_err(translation_error)?;
    Ok(chapter.map(|file| {
        file.paragraphs
            .into_iter()
            .map(|paragraph| paragraph.text)
            .collect()
    }))
}

fn novel_error(error: NovelError) -> KnowledgeError {
    let code = match error.code {
        NovelErrorCode::InvalidInput => KnowledgeErrorCode::InvalidInput,
        NovelErrorCode::NotFound | NovelErrorCode::ChapterFileMissing => {
            KnowledgeErrorCode::NotFound
        }
        _ => KnowledgeErrorCode::Io,
    };
    KnowledgeError::new(code, error.detail)
}

fn translation_error(error: TranslationError) -> KnowledgeError {
    let code = match error.code {
        TranslationErrorCode::InvalidInput => KnowledgeErrorCode::InvalidInput,
        TranslationErrorCode::NotFound => KnowledgeErrorCode::NotFound,
        _ => KnowledgeErrorCode::Io,
    };
    KnowledgeError::new(code, error.detail)
}
