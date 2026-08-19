use super::*;
use crate::features::novel::models::Paragraph;
use crate::features::translation::models::ChapterFile;
use crate::features::translation::models::DictEntry;
use crate::features::translation::models::TranslatedParagraph;

const CHAPTER: &str = "0123456789abcdef0123456789abcdef";

fn original(text: &str, hashcheck: &str) -> Paragraph {
    Paragraph {
        text: text.to_string(),
        hashcheck: hashcheck.to_string(),
    }
}

fn translated(text: &str, original_hashcheck: &str) -> TranslatedParagraph {
    TranslatedParagraph {
        original_hashcheck: original_hashcheck.to_string(),
        text: text.to_string(),
        note: String::new(),
    }
}

fn chapter(paragraphs: Vec<TranslatedParagraph>) -> ChapterFile {
    ChapterFile {
        title: String::new(),
        paragraphs,
    }
}

fn entry(id: i64, src: &str, dst: &str) -> DictEntry {
    DictEntry {
        id,
        src: src.to_string(),
        dst: dst.to_string(),
        kind: "term".to_string(),
        note: String::new(),
    }
}

fn warnings(
    original: Vec<Paragraph>,
    translated: Vec<TranslatedParagraph>,
    dict: Vec<DictEntry>,
) -> Vec<TranslationWarning> {
    chapter_warnings(CHAPTER, &original, &chapter(translated), &dict)
}

#[test]
fn unchanged_hash_gives_no_warning() {
    assert!(
        warnings(
            vec![original("Source", "hash")],
            vec![translated("Translated", "hash")],
            Vec::new(),
        )
        .is_empty()
    );
}

#[test]
fn changed_hash_gives_source_warning() {
    assert_eq!(
        warnings(
            vec![original("Source", "current")],
            vec![translated("Translated", "old")],
            Vec::new(),
        ),
        vec![TranslationWarning {
            kind: WarningKind::Source,
            chapter_id: CHAPTER.to_string(),
            n: 1,
            entry_id: None,
        }]
    );
}

#[test]
fn matching_dictionary_destination_gives_no_warning() {
    assert!(
        warnings(
            vec![original("The hero arrives", "hash")],
            vec![translated("Nguoi hung arrives", "hash")],
            vec![entry(7, "hero", "Nguoi hung")],
        )
        .is_empty()
    );
}

#[test]
fn missing_dictionary_destination_gives_warning_with_entry_id() {
    assert_eq!(
        warnings(
            vec![original("The hero arrives", "hash")],
            vec![translated("The warrior arrives", "hash")],
            vec![entry(7, "hero", "nguoi hung")],
        ),
        vec![TranslationWarning {
            kind: WarningKind::Dict,
            chapter_id: CHAPTER.to_string(),
            n: 1,
            entry_id: Some(7),
        }]
    );
}

#[test]
fn two_dictionary_entries_keep_entry_order() {
    let result = warnings(
        vec![original("The hero enters the castle", "hash")],
        vec![translated("Translated", "hash")],
        vec![entry(9, "hero", "anh hung"), entry(3, "castle", "lau dai")],
    );

    assert_eq!(
        result
            .into_iter()
            .map(|warning| warning.entry_id)
            .collect::<Vec<_>>(),
        vec![Some(9), Some(3)]
    );
}

#[test]
fn dictionary_matching_is_case_insensitive() {
    assert!(
        warnings(
            vec![original("THE HERO arrives", "hash")],
            vec![translated("the anh hung arrives", "hash")],
            vec![entry(7, "hero", "ANH HUNG")],
        )
        .is_empty()
    );
}

#[test]
fn dictionary_matching_supports_cjk_source_text() {
    assert_eq!(
        warnings(
            vec![original("他看见了龙", "hash")],
            vec![translated("He saw it", "hash")],
            vec![entry(8, "龙", "rong")],
        ),
        vec![TranslationWarning {
            kind: WarningKind::Dict,
            chapter_id: CHAPTER.to_string(),
            n: 1,
            entry_id: Some(8),
        }]
    );
}

#[test]
fn empty_dictionary_source_is_skipped() {
    assert!(
        warnings(
            vec![original("Source", "hash")],
            vec![translated("Translated", "hash")],
            vec![entry(7, "  ", "destination")],
        )
        .is_empty()
    );
}

#[test]
fn extra_original_paragraphs_are_ignored() {
    assert!(
        warnings(
            vec![original("First", "hash"), original("Second", "changed")],
            vec![translated("Translated", "hash")],
            Vec::new(),
        )
        .is_empty()
    );
}

#[test]
fn extra_translated_paragraphs_are_ignored() {
    assert!(
        warnings(
            vec![original("First", "hash")],
            vec![translated("Translated", "hash"), translated("Extra", "old")],
            Vec::new(),
        )
        .is_empty()
    );
}

#[test]
fn warnings_are_ordered_by_paragraph_then_source_then_dictionary() {
    let result = warnings(
        vec![original("hero", "new"), original("castle", "current")],
        vec![translated("none", "old"), translated("none", "old")],
        vec![entry(2, "hero", "anh hung"), entry(1, "castle", "lau dai")],
    );

    assert_eq!(
        result,
        vec![
            TranslationWarning {
                kind: WarningKind::Source,
                chapter_id: CHAPTER.to_string(),
                n: 1,
                entry_id: None,
            },
            TranslationWarning {
                kind: WarningKind::Dict,
                chapter_id: CHAPTER.to_string(),
                n: 1,
                entry_id: Some(2),
            },
            TranslationWarning {
                kind: WarningKind::Source,
                chapter_id: CHAPTER.to_string(),
                n: 2,
                entry_id: None,
            },
            TranslationWarning {
                kind: WarningKind::Dict,
                chapter_id: CHAPTER.to_string(),
                n: 2,
                entry_id: Some(1),
            },
        ]
    );
}

#[test]
fn warning_json_uses_the_wire_shape() {
    let warning = TranslationWarning {
        kind: WarningKind::Source,
        chapter_id: CHAPTER.to_string(),
        n: 1,
        entry_id: None,
    };

    assert_eq!(
        serde_json::to_string(&warning).unwrap(),
        format!(r#"{{"kind":"source","chapterId":"{CHAPTER}","n":1,"entryId":null}}"#)
    );
}
