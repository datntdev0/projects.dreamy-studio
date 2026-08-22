use super::*;
use crate::features::novel::models::Paragraph;
use crate::features::translation::models::ChapterFile;
use crate::features::translation::models::TranslatedParagraph;
use tempfile::tempdir;

const CHAPTER: &str = "0123456789abcdef0123456789abcdef";

fn lines(values: &[&str]) -> Vec<String> {
    values.iter().map(|value| value.to_string()).collect()
}

fn paragraph(text: &str) -> Paragraph {
    Paragraph {
        text: text.to_string(),
        hashcheck: "hash".to_string(),
    }
}

fn translated(text: &str) -> TranslatedParagraph {
    TranslatedParagraph {
        original_hashcheck: "hash".to_string(),
        text: text.to_string(),
        note: String::new(),
    }
}

#[test]
fn loads_source_paragraphs() {
    let dir = tempdir().unwrap();
    NovelFiles::new(dir.path().to_path_buf())
        .write_chapter(7, CHAPTER, &[paragraph("one"), paragraph("two")])
        .unwrap();

    let text = ChapterText::load(dir.path(), 7, KnowledgeLang::Src, CHAPTER).unwrap();

    assert_eq!(text, Some(lines(&["one", "two"])));
}

#[test]
fn loads_translated_paragraphs() {
    let dir = tempdir().unwrap();
    let chapter = ChapterFile {
        title: "Tiêu đề".to_string(),
        paragraphs: vec![translated("Phu nhân"), translated("xin chào")],
    };
    TranslationFiles::new(dir.path().to_path_buf())
        .write_chapter(7, TranslationTarget::Vi, CHAPTER, &chapter)
        .unwrap();

    let vi = ChapterText::load(dir.path(), 7, KnowledgeLang::Vi, CHAPTER).unwrap();
    let en = ChapterText::load(dir.path(), 7, KnowledgeLang::En, CHAPTER).unwrap();

    assert_eq!(vi, Some(lines(&["Phu nhân", "xin chào"])));
    assert_eq!(en, None);
}

#[test]
fn missing_text_is_none() {
    let dir = tempdir().unwrap();

    for lang in [KnowledgeLang::Src, KnowledgeLang::Vi, KnowledgeLang::En] {
        assert_eq!(
            ChapterText::load(dir.path(), 7, lang, CHAPTER).unwrap(),
            None
        );
    }
}

#[test]
fn malformed_chapter_id_is_invalid_input() {
    let dir = tempdir().unwrap();

    for lang in [KnowledgeLang::Src, KnowledgeLang::Vi] {
        let error = ChapterText::load(dir.path(), 7, lang, "chapter_name").unwrap_err();

        assert_eq!(error.code, KnowledgeErrorCode::InvalidInput);
    }
}

#[test]
fn invalid_source_file_is_an_io_error() {
    let dir = tempdir().unwrap();
    let novel = NovelFiles::new(dir.path().to_path_buf()).novel_dir(7);
    std::fs::create_dir_all(&novel).unwrap();
    std::fs::write(novel.join(format!("chapter_{CHAPTER}.json")), "{ nope").unwrap();

    let error = ChapterText::load(dir.path(), 7, KnowledgeLang::Src, CHAPTER).unwrap_err();

    assert_eq!(error.code, KnowledgeErrorCode::Io);
}

#[test]
fn norm_unifies_composed_and_decomposed_vietnamese() {
    let composed = "Phu nh\u{00E2}n";
    let decomposed = "Phu nha\u{0302}n";

    assert_ne!(composed, decomposed);
    assert_eq!(norm(composed), norm(decomposed));
    assert_eq!(norm(decomposed), "phu nhân");
    assert_eq!(norm("Đại Nhân Ế"), norm("đại nhân ế"));
}

#[test]
fn norm_trims_and_collapses_whitespace() {
    assert_eq!(norm("  Phu \t nhân \n\n Wren  "), "phu nhân wren");
    assert_eq!(norm("   "), "");
}

#[test]
fn text_hash_is_stable_lowercase_hex() {
    let paragraphs = lines(&["one", "two"]);
    let expected: String = Sha256::digest(b"one\ntwo")
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect();

    assert_eq!(text_hash(&paragraphs), expected);
    assert_eq!(text_hash(&paragraphs), text_hash(&paragraphs.clone()));
    assert_eq!(text_hash(&paragraphs).len(), 64);
    assert_eq!(
        text_hash(&[]),
        "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    );
}

#[test]
fn text_hash_changes_with_any_paragraph() {
    let base = text_hash(&lines(&["one", "two", "three"]));

    assert_ne!(base, text_hash(&lines(&["One", "two", "three"])));
    assert_ne!(base, text_hash(&lines(&["one", "two", "thre"])));
    assert_ne!(base, text_hash(&lines(&["one", "two"])));
    assert_ne!(base, text_hash(&lines(&["one", "two", "three", ""])));
}

#[test]
fn contains_matches_normalized_substrings() {
    let paragraphs = lines(&["Hello  World", "Phu nha\u{0302}n đến rồi"]);

    assert!(contains(&paragraphs, 1, "hello world"));
    assert!(contains(&paragraphs, 1, "  WORLD "));
    assert!(contains(&paragraphs, 2, "phu nh\u{00E2}n"));
    assert!(!contains(&paragraphs, 1, "phu nhân"));
    assert!(!contains(&paragraphs, 2, "hello"));
}

#[test]
fn contains_rejects_out_of_range_and_empty() {
    let paragraphs = lines(&["one", "two"]);

    assert!(!contains(&paragraphs, 0, "one"));
    assert!(!contains(&paragraphs, 3, "one"));
    assert!(!contains(&paragraphs, 1, ""));
    assert!(!contains(&paragraphs, 1, "   "));
    assert!(!contains(&[], 1, "one"));
}

#[test]
fn locate_prefers_the_hinted_paragraph_and_falls_back_to_the_first_match() {
    let paragraphs = vec![
        "Wren lit the lamp.".to_string(),
        "The Guild met. Wren left.".to_string(),
    ];

    assert_eq!(locate(&paragraphs, 2, "wren"), Some(2));
    assert_eq!(locate(&paragraphs, 1, "Wren"), Some(1));
    assert_eq!(locate(&paragraphs, 9, "the guild"), Some(2));
    assert_eq!(locate(&paragraphs, 0, "lit the  lamp"), Some(1));
    assert_eq!(locate(&paragraphs, 1, "nobody"), None);
    assert_eq!(locate(&paragraphs, 1, "  "), None);
}
