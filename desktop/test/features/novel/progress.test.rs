use super::*;
use crate::features::novel::files::NovelFiles;
use std::fs;
use tempfile::tempdir;

const ONE: &str = "0123456789abcdef0123456789abcdef";
const TWO: &str = "fedcba9876543210fedcba9876543210";
const GONE: &str = "00000000000000000000000000000000";

fn chapter(id: &str, seq: i64) -> ChapterRow {
    ChapterRow {
        id: id.to_string(),
        novel_id: 7,
        seq,
        title: format!("Chapter {seq}"),
        word_count: 1,
        created_at: "2026-01-01T00:00:00Z".to_string(),
        updated_at: "2026-01-01T00:00:00Z".to_string(),
    }
}

fn summary(lang: &str) -> NovelSummary {
    NovelSummary {
        id: 7,
        title: "Novel".to_string(),
        name: String::new(),
        author: String::new(),
        lang: lang.to_string(),
        description: String::new(),
        origin: "created".to_string(),
        created_at: "2026-01-01T00:00:00Z".to_string(),
        updated_at: "2026-01-01T00:00:00Z".to_string(),
        chapter_count: 2,
        word_count: 2,
        translated: BTreeMap::new(),
        analyzed: BTreeMap::new(),
        tags: Vec::new(),
    }
}

fn touch(root: &Path, folder: &str, ids: &[&str]) {
    let dir = NovelFiles::new(root.to_path_buf())
        .novel_dir(7)
        .join(folder);
    fs::create_dir_all(&dir).unwrap();
    for id in ids {
        fs::write(dir.join(format!("chapter_{id}.json")), "{}").unwrap();
    }
}

#[test]
fn counts_the_chapters_with_files_per_language() {
    let dir = tempdir().unwrap();
    touch(dir.path(), "translation_vi", &[ONE, TWO, GONE]);
    touch(dir.path(), "knowledgebase_src", &[TWO]);
    let mut novel = summary("ZH");

    attach_progress(dir.path(), &mut novel, &[chapter(ONE, 1), chapter(TWO, 2)]).unwrap();

    let translated: Vec<(&str, usize)> = novel
        .translated
        .iter()
        .map(|(lang, count)| (lang.as_str(), *count))
        .collect();
    assert_eq!(translated, vec![("EN", 0), ("VI", 2)]);
    let analyzed: Vec<(&str, usize)> = novel
        .analyzed
        .iter()
        .map(|(lang, count)| (lang.as_str(), *count))
        .collect();
    assert_eq!(analyzed, vec![("EN", 0), ("VI", 0), ("src", 1)]);
}

#[test]
fn skips_the_language_of_the_novel() {
    let dir = tempdir().unwrap();
    let mut novel = summary("vi");

    attach_progress(dir.path(), &mut novel, &[chapter(ONE, 1)]).unwrap();

    assert_eq!(novel.translated.keys().collect::<Vec<_>>(), vec!["EN"]);
    assert_eq!(novel.analyzed.keys().collect::<Vec<_>>(), vec!["EN", "src"]);
}

#[test]
fn ids_are_listed_by_language() {
    let dir = tempdir().unwrap();
    touch(dir.path(), "translation_en", &[ONE]);
    touch(dir.path(), "knowledgebase_vi", &[TWO]);

    assert_eq!(
        translated_ids(dir.path(), 7, TranslationTarget::En).unwrap(),
        vec![ONE.to_string()]
    );
    assert!(
        translated_ids(dir.path(), 7, TranslationTarget::Vi)
            .unwrap()
            .is_empty()
    );
    assert_eq!(
        analyzed_ids(dir.path(), 7, KnowledgeLang::Vi).unwrap(),
        vec![TWO.to_string()]
    );
}
