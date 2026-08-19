use super::*;
use crate::features::translation::models::TranslatedParagraph;
use std::fs;
use tempfile::tempdir;

const CHAPTER: &str = "0123456789abcdef0123456789abcdef";

fn chapter(title: &str, text: &str) -> ChapterFile {
    ChapterFile {
        title: title.to_string(),
        paragraphs: vec![TranslatedParagraph {
            original_hashcheck: "hash".to_string(),
            text: text.to_string(),
            note: String::new(),
        }],
    }
}

#[test]
fn guidelines_and_chapters_round_trip() {
    let dir = tempdir().unwrap();
    let files = TranslationFiles::new(dir.path().to_path_buf());
    let expected = chapter("Translated", "Hello");

    files
        .write_guidelines(7, TranslationTarget::Vi, "Keep names")
        .unwrap();
    files
        .write_chapter(7, TranslationTarget::Vi, CHAPTER, &expected)
        .unwrap();

    assert_eq!(
        files.read_guidelines(7, TranslationTarget::Vi).unwrap(),
        "Keep names"
    );
    assert_eq!(
        files
            .read_chapter(7, TranslationTarget::Vi, CHAPTER)
            .unwrap(),
        Some(expected)
    );
    assert_eq!(
        files.list_chapters(7, TranslationTarget::Vi).unwrap(),
        vec![CHAPTER]
    );
}

#[test]
fn reads_the_legacy_orignal_hashcheck_alias() {
    let dir = tempdir().unwrap();
    let files = TranslationFiles::new(dir.path().to_path_buf());
    let path = files
        .translation_dir(7, TranslationTarget::Vi)
        .join(format!("chapter_{CHAPTER}.json"));
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(
        &path,
        r#"{"paragraphs":[{"orignalHashcheck":"old","text":"translated"}]}"#,
    )
    .unwrap();

    let chapter = files
        .read_chapter(7, TranslationTarget::Vi, CHAPTER)
        .unwrap()
        .unwrap();

    assert_eq!(chapter.title, "");
    assert_eq!(chapter.paragraphs[0].original_hashcheck, "old");
    assert_eq!(chapter.paragraphs[0].note, "");
}

#[test]
fn missing_translation_files_are_empty() {
    let dir = tempdir().unwrap();
    let files = TranslationFiles::new(dir.path().to_path_buf());

    assert_eq!(files.read_guidelines(7, TranslationTarget::En).unwrap(), "");
    assert_eq!(
        files
            .read_chapter(7, TranslationTarget::En, CHAPTER)
            .unwrap(),
        None
    );
    assert!(
        files
            .list_chapters(7, TranslationTarget::En)
            .unwrap()
            .is_empty()
    );
}

#[test]
fn targets_are_isolated_and_guidelines_preserve_other_targets() {
    let dir = tempdir().unwrap();
    let files = TranslationFiles::new(dir.path().to_path_buf());

    files
        .write_guidelines(7, TranslationTarget::Vi, "Vietnamese rules")
        .unwrap();
    files
        .write_guidelines(7, TranslationTarget::En, "English rules")
        .unwrap();
    files
        .write_chapter(
            7,
            TranslationTarget::Vi,
            CHAPTER,
            &chapter("VI", "xin chao"),
        )
        .unwrap();
    files
        .write_chapter(7, TranslationTarget::En, CHAPTER, &chapter("EN", "hello"))
        .unwrap();

    assert_eq!(
        files.read_guidelines(7, TranslationTarget::Vi).unwrap(),
        "Vietnamese rules"
    );
    assert_eq!(
        files.read_guidelines(7, TranslationTarget::En).unwrap(),
        "English rules"
    );
    assert_eq!(
        files
            .read_chapter(7, TranslationTarget::Vi, CHAPTER)
            .unwrap()
            .unwrap()
            .title,
        "VI"
    );
    assert_eq!(
        files
            .read_chapter(7, TranslationTarget::En, CHAPTER)
            .unwrap()
            .unwrap()
            .title,
        "EN"
    );
}

#[test]
fn rejects_malformed_chapter_ids() {
    let dir = tempdir().unwrap();
    let files = TranslationFiles::new(dir.path().to_path_buf());

    let error = files
        .read_chapter(7, TranslationTarget::Vi, "../escape")
        .unwrap_err();

    assert_eq!(error.code, TranslationErrorCode::InvalidInput);
}
