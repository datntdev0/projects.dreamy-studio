use crate::features::novel::files::NovelFiles;
use crate::features::novel::files::list_chapter_ids;
use crate::features::novel::files::write_atomic;
use crate::features::translation::models::ChapterFile;
use crate::features::translation::models::TranslationError;
use crate::features::translation::models::TranslationErrorCode;
use crate::features::translation::models::TranslationResult;
use crate::features::translation::models::TranslationTarget;
use serde::Deserialize;
use serde::Serialize;
use std::collections::BTreeMap;
use std::fs;
use std::io::ErrorKind;
use std::path::Path;
use std::path::PathBuf;

const GUIDELINES_FILE: &str = "translation.json";

#[derive(Debug, Clone)]
pub struct TranslationFiles {
    root: PathBuf,
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct GuidelinesFile {
    #[serde(default)]
    guidelines: BTreeMap<String, String>,
}

impl TranslationFiles {
    pub fn new(root: PathBuf) -> Self {
        Self { root }
    }

    pub fn read_guidelines(
        &self,
        novel_id: i64,
        target: TranslationTarget,
    ) -> TranslationResult<String> {
        let path = self.guidelines_path(novel_id);
        match fs::read(&path) {
            Ok(bytes) => Ok(decode_guidelines(&path, &bytes)?
                .guidelines
                .remove(target.as_str())
                .unwrap_or_default()),
            Err(error) if error.kind() == ErrorKind::NotFound => Ok(String::new()),
            Err(error) => Err(error.into()),
        }
    }

    pub fn write_guidelines(
        &self,
        novel_id: i64,
        target: TranslationTarget,
        text: &str,
    ) -> TranslationResult<()> {
        let path = self.guidelines_path(novel_id);
        let mut guidelines = match fs::read(&path) {
            Ok(bytes) => decode_guidelines(&path, &bytes)?,
            Err(error) if error.kind() == ErrorKind::NotFound => GuidelinesFile::default(),
            Err(error) => return Err(error.into()),
        };
        guidelines
            .guidelines
            .insert(target.as_str().to_string(), text.to_string());
        let bytes = serde_json::to_vec_pretty(&guidelines).map_err(encode_error)?;
        fs::create_dir_all(self.novel_dir(novel_id))?;
        write_atomic(&path, &bytes)?;
        Ok(())
    }

    pub fn read_chapter(
        &self,
        novel_id: i64,
        target: TranslationTarget,
        chapter_id: &str,
    ) -> TranslationResult<Option<ChapterFile>> {
        let path = self.chapter_path(novel_id, target, chapter_id)?;
        match fs::read(&path) {
            Ok(bytes) => Ok(Some(decode_chapter(&path, &bytes)?)),
            Err(error) if error.kind() == ErrorKind::NotFound => Ok(None),
            Err(error) => Err(error.into()),
        }
    }

    pub fn write_chapter(
        &self,
        novel_id: i64,
        target: TranslationTarget,
        chapter_id: &str,
        chapter: &ChapterFile,
    ) -> TranslationResult<()> {
        let path = self.chapter_path(novel_id, target, chapter_id)?;
        let bytes = serde_json::to_vec_pretty(chapter).map_err(encode_error)?;
        let dir = self.translation_dir(novel_id, target);
        fs::create_dir_all(dir)?;
        write_atomic(&path, &bytes)?;
        Ok(())
    }

    pub fn list_chapters(
        &self,
        novel_id: i64,
        target: TranslationTarget,
    ) -> TranslationResult<Vec<String>> {
        Ok(list_chapter_ids(&self.translation_dir(novel_id, target))?)
    }

    fn novel_dir(&self, novel_id: i64) -> PathBuf {
        NovelFiles::new(self.root.clone()).novel_dir(novel_id)
    }

    fn guidelines_path(&self, novel_id: i64) -> PathBuf {
        self.novel_dir(novel_id).join(GUIDELINES_FILE)
    }

    pub(crate) fn translation_dir(&self, novel_id: i64, target: TranslationTarget) -> PathBuf {
        self.novel_dir(novel_id)
            .join(format!("translation_{}", target.dir_name()))
    }

    fn chapter_path(
        &self,
        novel_id: i64,
        target: TranslationTarget,
        chapter_id: &str,
    ) -> TranslationResult<PathBuf> {
        Ok(self
            .translation_dir(novel_id, target)
            .join(chapter_name(chapter_id)?))
    }
}

fn decode_guidelines(path: &Path, bytes: &[u8]) -> TranslationResult<GuidelinesFile> {
    serde_json::from_slice(bytes).map_err(|error| invalid_file(path, error))
}

fn decode_chapter(path: &Path, bytes: &[u8]) -> TranslationResult<ChapterFile> {
    serde_json::from_slice(bytes).map_err(|error| invalid_file(path, error))
}

pub(crate) fn invalid_file(path: &Path, error: serde_json::Error) -> TranslationError {
    TranslationError::new(
        TranslationErrorCode::Io,
        format!("file {} is not valid: {error}", path.display()),
    )
}

pub(crate) fn encode_error(error: serde_json::Error) -> TranslationError {
    TranslationError::new(
        TranslationErrorCode::Io,
        format!("cannot encode translation file: {error}"),
    )
}

fn chapter_name(chapter_id: &str) -> TranslationResult<String> {
    if !is_chapter_id(chapter_id) {
        return Err(TranslationError::invalid("chapter id is malformed"));
    }
    Ok(format!("chapter_{chapter_id}.json"))
}

fn is_chapter_id(value: &str) -> bool {
    value.len() == 32
        && value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}

#[cfg(test)]
#[path = "../../../test/features/translation/files.test.rs"]
mod tests;
