use super::*;
use crate::features::novel::models::NovelInput;
use crate::features::novel::service::NovelWorkspace;
use crate::infra::storage::database::Database;
use crate::infra::storage::migrator::Migrator;
use crate::infra::storage::migrator::workspace_scripts;
use std::sync::atomic::AtomicBool;
use tempfile::TempDir;

struct Fixture {
    _dir: TempDir,
    novel: NovelWorkspace,
    translation: TranslationWorkspace,
}

fn fixture() -> Fixture {
    let dir = TempDir::new().unwrap();
    let mut db = Database::create(&dir.path().join(WORKSPACE_DB_FILE)).unwrap();
    Migrator::migrate(
        db.connection_mut(),
        &workspace_scripts().unwrap(),
        &AtomicBool::new(false),
    )
    .unwrap();
    Fixture {
        novel: NovelWorkspace::new(dir.path().to_path_buf()),
        translation: TranslationWorkspace::new(dir.path().to_path_buf()),
        _dir: dir,
    }
}

fn novel_input() -> NovelInput {
    NovelInput {
        title: "Book".to_string(),
        name: String::new(),
        author: String::new(),
        lang: "ZH".to_string(),
        description: String::new(),
        tags: Vec::new(),
    }
}

#[test]
fn first_load_and_guidelines_are_target_scoped() {
    let fixture = fixture();
    let novel = fixture.novel.create(novel_input()).unwrap();

    let first = fixture.translation.get(novel.id, "VI").unwrap();
    assert!(first.guidelines.is_empty());
    assert!(first.dict.is_empty());
    assert!(first.chapters.is_empty());
    assert!(
        fixture
            .translation
            .guidelines_save(novel.id, "VI", "  Translate naturally  ")
            .unwrap()
    );
    assert!(
        !fixture
            .translation
            .guidelines_save(novel.id, "VI", "Translate naturally")
            .unwrap()
    );
    assert_eq!(
        fixture.translation.get(novel.id, "VI").unwrap().guidelines,
        "Translate naturally"
    );
    assert!(
        fixture
            .translation
            .get(novel.id, "EN")
            .unwrap()
            .guidelines
            .is_empty()
    );
}

#[test]
fn saves_runs_without_changing_translation_status() {
    let fixture = fixture();
    let novel = fixture.novel.create(novel_input()).unwrap();
    let chapter = fixture.novel.chapter_add(novel.id, "One").unwrap();
    fixture
        .novel
        .paragraph_add(novel.id, &chapter.id, "source")
        .unwrap();

    fixture
        .translation
        .save_run(
            novel.id,
            "VI",
            &chapter.id,
            None,
            TranslatedRun {
                title: "Translated title".to_string(),
                paragraphs: vec!["target".to_string()],
            },
        )
        .unwrap();

    let result = fixture.translation.get(novel.id, "VI").unwrap();
    assert_eq!(result.chapters[&chapter.id].title, "Translated title");
    assert_eq!(result.chapters[&chapter.id].paragraphs[0].text, "target");
    assert_eq!(
        fixture.novel.chapters(novel.id).unwrap()[0].translation_status,
        "none"
    );
}

#[test]
fn rejects_bad_targets_and_unknown_novels() {
    let fixture = fixture();
    let novel = fixture.novel.create(novel_input()).unwrap();

    assert_eq!(
        fixture.translation.get(novel.id, "FR").unwrap_err().code,
        TranslationErrorCode::InvalidInput
    );
    assert_eq!(
        fixture.translation.get(404, "VI").unwrap_err().code,
        TranslationErrorCode::NotFound
    );
}

#[test]
fn dictionary_changes_validate_duplicates_and_report_flags() {
    let fixture = fixture();
    let novel = fixture.novel.create(novel_input()).unwrap();
    let chapter = fixture.novel.chapter_add(novel.id, "One").unwrap();
    fixture
        .novel
        .paragraph_add(novel.id, &chapter.id, "source text")
        .unwrap();
    fixture
        .translation
        .save_run(
            novel.id,
            "VI",
            &chapter.id,
            None,
            TranslatedRun {
                title: String::new(),
                paragraphs: vec!["translated".to_string()],
            },
        )
        .unwrap();

    let added = fixture
        .translation
        .dict_add(
            novel.id,
            "VI",
            DictInput {
                src: "  source ".to_string(),
                dst: " target ".to_string(),
                kind: "term".to_string(),
                note: " note ".to_string(),
            },
        )
        .unwrap();
    assert_eq!(added.entry.src, "source");
    assert_eq!(added.flagged, 1);
    assert_eq!(
        fixture
            .translation
            .dict_add(
                novel.id,
                "VI",
                DictInput {
                    src: "source".to_string(),
                    dst: "other".to_string(),
                    kind: "term".to_string(),
                    note: String::new(),
                },
            )
            .unwrap_err()
            .code,
        TranslationErrorCode::DictionaryDuplicate
    );
    let updated = fixture
        .translation
        .dict_update(
            novel.id,
            added.entry.id,
            DictPatch {
                dst: Some("translated".to_string()),
                ..DictPatch::default()
            },
        )
        .unwrap();
    assert_eq!(updated.flagged, 0);
    fixture
        .translation
        .dict_delete(novel.id, added.entry.id)
        .unwrap();
    assert_eq!(
        fixture
            .translation
            .dict_delete(novel.id, added.entry.id)
            .unwrap_err()
            .code,
        TranslationErrorCode::NotFound
    );
}

#[test]
fn manual_edits_keep_the_original_hashcheck_and_notes_can_clear() {
    let fixture = fixture();
    let novel = fixture.novel.create(novel_input()).unwrap();
    let chapter = fixture.novel.chapter_add(novel.id, "One").unwrap();
    fixture
        .novel
        .paragraph_add(novel.id, &chapter.id, "source")
        .unwrap();
    fixture
        .translation
        .save_run(
            novel.id,
            "VI",
            &chapter.id,
            None,
            TranslatedRun {
                title: "Title".to_string(),
                paragraphs: vec!["target".to_string()],
            },
        )
        .unwrap();
    let before = fixture.translation.get(novel.id, "VI").unwrap().chapters[&chapter.id].paragraphs
        [0]
    .original_hashcheck
    .clone();
    fixture
        .novel
        .paragraph_update(novel.id, &chapter.id, 1, "changed source")
        .unwrap();
    let saved = fixture
        .translation
        .passage_save(novel.id, "VI", &chapter.id, 1, "edited target")
        .unwrap();
    assert_eq!(saved.paragraphs[0].original_hashcheck, before);
    assert_eq!(
        fixture.translation.warnings(novel.id, "VI").unwrap().len(),
        1
    );
    assert_eq!(
        fixture
            .translation
            .note_save(novel.id, "VI", &chapter.id, 1, "  review  ")
            .unwrap()
            .paragraphs[0]
            .note,
        "review"
    );
    assert!(
        fixture
            .translation
            .note_save(novel.id, "VI", &chapter.id, 1, " ")
            .unwrap()
            .paragraphs[0]
            .note
            .is_empty()
    );
}
