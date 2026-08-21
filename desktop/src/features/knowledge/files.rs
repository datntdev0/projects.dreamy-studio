use crate::features::knowledge::models::ChapterAnalysis;
use crate::features::knowledge::models::KnowledgeError;
use crate::features::knowledge::models::KnowledgeErrorCode;
use crate::features::knowledge::models::KnowledgeLang;
use crate::features::knowledge::models::KnowledgeResult;
use crate::features::novel::files::NovelFiles;
use crate::features::novel::files::write_atomic;
use std::fs;
use std::io::ErrorKind;
use std::path::Path;
use std::path::PathBuf;

const CHAPTER_PREFIX: &str = "chapter_";
const CHAPTER_SUFFIX: &str = ".json";

#[derive(Debug, Clone)]
pub struct KnowledgeFiles {
    root: PathBuf,
}

impl KnowledgeFiles {
    pub fn new(root: PathBuf) -> Self {
        Self { root }
    }

    pub fn read(
        &self,
        novel_id: i64,
        lang: KnowledgeLang,
        chapter_id: &str,
    ) -> KnowledgeResult<Option<ChapterAnalysis>> {
        let path = self.chapter_path(novel_id, lang, chapter_id)?;
        match fs::read(&path) {
            Ok(bytes) => Ok(Some(decode_analysis(&path, &bytes)?)),
            Err(error) if error.kind() == ErrorKind::NotFound => Ok(None),
            Err(error) => Err(error.into()),
        }
    }

    pub fn write(
        &self,
        novel_id: i64,
        lang: KnowledgeLang,
        chapter_id: &str,
        analysis: &ChapterAnalysis,
    ) -> KnowledgeResult<()> {
        let path = self.chapter_path(novel_id, lang, chapter_id)?;
        let bytes = serde_json::to_vec_pretty(analysis).map_err(encode_error)?;
        fs::create_dir_all(self.knowledge_dir(novel_id, lang))?;
        write_atomic(&path, &bytes)?;
        Ok(())
    }

    pub fn list(&self, novel_id: i64, lang: KnowledgeLang) -> KnowledgeResult<Vec<String>> {
        let entries = match fs::read_dir(self.knowledge_dir(novel_id, lang)) {
            Ok(entries) => entries,
            Err(error) if error.kind() == ErrorKind::NotFound => return Ok(Vec::new()),
            Err(error) => return Err(error.into()),
        };
        let mut ids = Vec::new();
        for entry in entries {
            let name = entry?.file_name().to_string_lossy().into_owned();
            if let Some(id) = chapter_id_of(&name) {
                ids.push(id.to_string());
            }
        }
        ids.sort();
        Ok(ids)
    }

    fn knowledge_dir(&self, novel_id: i64, lang: KnowledgeLang) -> PathBuf {
        NovelFiles::new(self.root.clone())
            .novel_dir(novel_id)
            .join(format!("knowledgebase_{}", lang.dir_name()))
    }

    fn chapter_path(
        &self,
        novel_id: i64,
        lang: KnowledgeLang,
        chapter_id: &str,
    ) -> KnowledgeResult<PathBuf> {
        Ok(self
            .knowledge_dir(novel_id, lang)
            .join(chapter_name(chapter_id)?))
    }
}

fn decode_analysis(path: &Path, bytes: &[u8]) -> KnowledgeResult<ChapterAnalysis> {
    serde_json::from_slice(bytes).map_err(|error| invalid_file(path, error))
}

fn invalid_file(path: &Path, error: serde_json::Error) -> KnowledgeError {
    KnowledgeError::new(
        KnowledgeErrorCode::Io,
        format!("file {} is not valid: {error}", path.display()),
    )
}

fn encode_error(error: serde_json::Error) -> KnowledgeError {
    KnowledgeError::new(
        KnowledgeErrorCode::Io,
        format!("cannot encode knowledge file: {error}"),
    )
}

fn chapter_name(chapter_id: &str) -> KnowledgeResult<String> {
    if !is_chapter_id(chapter_id) {
        return Err(KnowledgeError::invalid("chapter id is malformed"));
    }
    Ok(format!("{CHAPTER_PREFIX}{chapter_id}{CHAPTER_SUFFIX}"))
}

fn chapter_id_of(name: &str) -> Option<&str> {
    let id = name
        .strip_prefix(CHAPTER_PREFIX)?
        .strip_suffix(CHAPTER_SUFFIX)?;
    is_chapter_id(id).then_some(id)
}

fn is_chapter_id(value: &str) -> bool {
    value.len() == 32
        && value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}

#[cfg(test)]
#[path = "../../../test/features/knowledge/files.test.rs"]
mod tests;
