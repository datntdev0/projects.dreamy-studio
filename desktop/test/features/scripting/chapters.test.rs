use super::*;
use crate::features::project::models::ProjectInput;
use crate::features::project::service::ProjectWorkspace;
use crate::features::scripting::service::ScriptingWorkspace;
use crate::features::translation::models::TranslatedParagraph;
use crate::testing::project::project_workspace;
use crate::testing::script::chapter;
use crate::testing::script::linked_unit;
use tempfile::TempDir;

fn chapter_id(seq: i64) -> String {
    format!("{seq:032x}")
}

fn insert_novel(dir: &TempDir, chapters: &[(i64, &str)]) -> i64 {
    let conn = rusqlite::Connection::open(dir.path().join(WORKSPACE_DB_FILE)).unwrap();
    conn.execute(
        "INSERT INTO ws_novels (title, lang, origin, created_at, updated_at) VALUES ('Book', 'ZH', 'created', 'now', 'now')",
        [],
    )
    .unwrap();
    let novel_id = conn.last_insert_rowid();
    for (seq, title) in chapters {
        conn.execute(
            "INSERT INTO ws_novel_chapters (id, novel_id, seq, title, word_count, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, 1, 'now', 'now')",
            rusqlite::params![chapter_id(*seq), novel_id, seq, title],
        )
        .unwrap();
    }
    novel_id
}

fn translate(dir: &TempDir, novel_id: i64, target: TranslationTarget, seq: i64, title: &str) {
    let translation = ChapterFile {
        title: title.to_string(),
        paragraphs: vec![TranslatedParagraph {
            original_hashcheck: "hash".to_string(),
            text: "text".to_string(),
            note: String::new(),
        }],
    };
    TranslationFiles::new(dir.path().to_path_buf())
        .write_chapter(novel_id, target, &chapter_id(seq), &translation)
        .unwrap();
}

fn linked_project(
    workspace: &ProjectWorkspace,
    novel_id: Option<i64>,
    src_kind: Option<&str>,
    src_lang: Option<&str>,
) -> ProjectSummary {
    workspace
        .create(ProjectInput {
            name: "Book".to_string(),
            template: "audiobook".to_string(),
            description: String::new(),
            novel_id,
            src_kind: src_kind.map(str::to_string),
            src_lang: src_lang.map(str::to_string),
        })
        .unwrap()
}

fn seqs(chapters: &[ProjectChapter]) -> Vec<i64> {
    chapters.iter().map(|chapter| chapter.seq).collect()
}

#[test]
fn a_project_without_a_novel_has_no_chapters() {
    let (dir, workspace) = project_workspace();
    let project = linked_project(&workspace, None, None, None);

    assert!(project_chapters(dir.path(), &project).unwrap().is_empty());
}

#[test]
fn an_original_source_lists_every_novel_chapter_in_order() {
    let (dir, workspace) = project_workspace();
    let novel_id = insert_novel(&dir, &[(3, "Three"), (1, "One"), (2, "")]);
    let project = linked_project(&workspace, Some(novel_id), Some("original"), None);

    let chapters = project_chapters(dir.path(), &project).unwrap();

    assert_eq!(seqs(&chapters), vec![1, 2, 3]);
    assert_eq!(chapters[0].id, chapter_id(1));
    assert_eq!(chapters[0].title, "One");
    assert_eq!(chapters[1].title, "Chapter 2");
}

#[test]
fn a_translated_source_lists_only_translated_chapters() {
    let (dir, workspace) = project_workspace();
    let all: Vec<(i64, &str)> = (1..=100).map(|seq| (seq, "Original")).collect();
    let novel_id = insert_novel(&dir, &all);
    let project = linked_project(&workspace, Some(novel_id), Some("translation"), Some("VI"));
    for seq in [9, 2, 40, 1, 7, 12, 3, 88, 5, 60, 31, 20] {
        translate(
            &dir,
            novel_id,
            TranslationTarget::Vi,
            seq,
            &format!("Dich {seq}"),
        );
    }

    let twelve = project_chapters(dir.path(), &project).unwrap();
    for seq in [4, 100, 17] {
        translate(&dir, novel_id, TranslationTarget::Vi, seq, "");
    }
    let fifteen = project_chapters(dir.path(), &project).unwrap();

    assert_eq!(twelve.len(), 12);
    assert_eq!(
        seqs(&twelve),
        vec![1, 2, 3, 5, 7, 9, 12, 20, 31, 40, 60, 88]
    );
    assert_eq!(fifteen.len(), 15);
    assert_eq!(
        seqs(&fifteen),
        vec![1, 2, 3, 4, 5, 7, 9, 12, 17, 20, 31, 40, 60, 88, 100]
    );
}

#[test]
fn translated_titles_win_and_fall_back_to_the_original_title() {
    let (dir, workspace) = project_workspace();
    let novel_id = insert_novel(&dir, &[(1, "Goc"), (2, "Goc hai")]);
    let project = linked_project(&workspace, Some(novel_id), Some("translation"), Some("EN"));
    translate(&dir, novel_id, TranslationTarget::En, 1, "  Translated ");
    translate(&dir, novel_id, TranslationTarget::En, 2, "");

    let chapters = project_chapters(dir.path(), &project).unwrap();

    assert_eq!(chapters[0].title, "Translated");
    assert_eq!(chapters[1].title, "Goc hai");
}

#[test]
fn translations_in_another_language_do_not_count() {
    let (dir, workspace) = project_workspace();
    let novel_id = insert_novel(&dir, &[(1, "One"), (2, "Two")]);
    let project = linked_project(&workspace, Some(novel_id), Some("translation"), Some("VI"));
    translate(&dir, novel_id, TranslationTarget::En, 1, "English");

    assert!(project_chapters(dir.path(), &project).unwrap().is_empty());
}

#[test]
fn resolving_a_unit_applies_the_chapter_number_and_title() {
    let chapters = [chapter("c1", 4)];
    let mut linked = linked_unit("c1");
    let mut orphan = linked_unit("gone");
    let mut free = ScriptUnit {
        no: 2,
        title: "Free".to_string(),
        ..ScriptUnit::default()
    };

    resolve_unit(&mut linked, &chapters);
    resolve_unit(&mut orphan, &chapters);
    resolve_unit(&mut free, &chapters);

    assert_eq!((linked.no, linked.ch), (4, Some(4)));
    assert_eq!(linked.title, "Title 4");
    assert_eq!((orphan.no, orphan.ch, orphan.title.as_str()), (0, None, ""));
    assert_eq!((free.no, free.title.as_str()), (2, "Free"));
}

#[test]
fn module_totals_follow_the_translated_chapters() {
    let (dir, workspace) = project_workspace();
    let all: Vec<(i64, &str)> = (1..=100).map(|seq| (seq, "Original")).collect();
    let novel_id = insert_novel(&dir, &all);
    let project = linked_project(&workspace, Some(novel_id), Some("translation"), Some("VI"));
    let scripting = ScriptingWorkspace::new(workspace);
    for seq in 1..=12 {
        translate(&dir, novel_id, TranslationTarget::Vi, seq * 3, "Dich");
    }

    let twelve = scripting.modules(project.id).unwrap();
    for seq in [1, 2, 4] {
        translate(&dir, novel_id, TranslationTarget::Vi, seq, "Dich");
    }
    let fifteen = scripting.modules(project.id).unwrap();

    assert_eq!((twelve[0].done, twelve[0].total), (0, 12));
    assert_eq!((fifteen[0].done, fifteen[0].total), (0, 15));
    assert_eq!(fifteen[1].total, 15);
}
