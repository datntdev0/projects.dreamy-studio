use crate::features::knowledge::files::KnowledgeFiles;
use crate::features::knowledge::models::KnowledgeLang;
use crate::features::novel::models::ChapterRow;
use crate::features::novel::models::NovelError;
use crate::features::novel::models::NovelErrorCode;
use crate::features::novel::models::NovelResult;
use crate::features::novel::models::NovelSummary;
use crate::features::translation::files::TranslationFiles;
use crate::features::translation::models::TranslationTarget;
use std::collections::BTreeMap;
use std::collections::HashSet;
use std::path::Path;

pub fn translation_langs(novel_lang: &str) -> Vec<TranslationTarget> {
    TranslationTarget::ALL
        .into_iter()
        .filter(|target| !novel_lang.eq_ignore_ascii_case(target.as_str()))
        .collect()
}

pub fn knowledge_langs(novel_lang: &str) -> Vec<KnowledgeLang> {
    KnowledgeLang::ALL
        .into_iter()
        .filter(|lang| !novel_lang.eq_ignore_ascii_case(lang.as_str()))
        .collect()
}

pub fn translated_ids(
    root: &Path,
    novel_id: i64,
    target: TranslationTarget,
) -> NovelResult<Vec<String>> {
    TranslationFiles::new(root.to_path_buf())
        .list_chapters(novel_id, target)
        .map_err(|error| io_error(error.detail))
}

pub fn analyzed_ids(root: &Path, novel_id: i64, lang: KnowledgeLang) -> NovelResult<Vec<String>> {
    KnowledgeFiles::new(root.to_path_buf())
        .list(novel_id, lang)
        .map_err(|error| io_error(error.detail))
}

pub fn attach_progress(
    root: &Path,
    summary: &mut NovelSummary,
    chapters: &[ChapterRow],
) -> NovelResult<()> {
    let known: HashSet<&str> = chapters.iter().map(|chapter| chapter.id.as_str()).collect();
    let mut translated = BTreeMap::new();
    for target in translation_langs(&summary.lang) {
        let ids = translated_ids(root, summary.id, target)?;
        translated.insert(target.as_str().to_string(), count_known(&known, &ids));
    }
    let mut analyzed = BTreeMap::new();
    for lang in knowledge_langs(&summary.lang) {
        let ids = analyzed_ids(root, summary.id, lang)?;
        analyzed.insert(lang.as_str().to_string(), count_known(&known, &ids));
    }
    summary.translated = translated;
    summary.analyzed = analyzed;
    Ok(())
}

fn count_known(known: &HashSet<&str>, ids: &[String]) -> usize {
    ids.iter().filter(|id| known.contains(id.as_str())).count()
}

fn io_error(detail: String) -> NovelError {
    NovelError::new(NovelErrorCode::Io, detail)
}
