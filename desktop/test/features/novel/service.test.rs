use super::*;
use crate::infra::storage::migrator::Migrator;
use crate::infra::storage::migrator::workspace_scripts;
use crate::shared::tags::normalize_tag;
use crate::testing::package::manifest_json;
use crate::testing::package::sample_package;
use crate::testing::package::zip_bytes;
use std::fs;
use std::sync::atomic::AtomicBool;
use tempfile::TempDir;

const JPEG: [u8; 6] = [0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10];
const PNG: [u8; 8] = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];

struct Fixture {
    dir: TempDir,
    workspace: NovelWorkspace,
}

fn fixture() -> Fixture {
    let dir = TempDir::new().unwrap();
    let db_path = dir.path().join(WORKSPACE_DB_FILE);
    let mut db = Database::create(&db_path).unwrap();
    let cancel = AtomicBool::new(false);
    Migrator::migrate(db.connection_mut(), &workspace_scripts().unwrap(), &cancel).unwrap();
    drop(db);
    let workspace = NovelWorkspace::new(dir.path().to_path_buf());
    Fixture { dir, workspace }
}

fn input(title: &str) -> NovelInput {
    NovelInput {
        title: title.to_string(),
        name: String::new(),
        author: "Author".to_string(),
        lang: "zh".to_string(),
        description: String::new(),
        tags: Vec::new(),
    }
}

fn tags(items: &[&str]) -> Vec<String> {
    items.iter().map(|item| item.to_string()).collect()
}

fn write_package_file(fixture: &Fixture, name: &str, bytes: &[u8]) -> PathBuf {
    let path = fixture.dir.path().join(name);
    fs::write(&path, bytes).unwrap();
    path
}

fn imported(fixture: &Fixture, chapters: usize) -> NovelSummary {
    let path = write_package_file(fixture, "book.dsnovel", &sample_package(chapters));
    fixture
        .workspace
        .import_package(&path, input("Imported"))
        .unwrap()
}

fn data_url(mime: &str, bytes: &[u8]) -> String {
    format!("data:{mime};base64,{}", STANDARD.encode(bytes))
}

fn chapter_file(fixture: &Fixture, novel_id: i64, chapter_id: &str) -> PathBuf {
    fixture
        .dir
        .path()
        .join("novels")
        .join(novel_id.to_string())
        .join(format!("chapter_{chapter_id}.json"))
}

fn set_chapter_status(
    fixture: &Fixture,
    chapter_id: &str,
    translation_status: &str,
    analysis_status: &str,
) {
    let db = Database::open_read_write(&fixture.dir.path().join(WORKSPACE_DB_FILE)).unwrap();
    db.connection()
        .execute(
            "UPDATE ws_novel_chapters SET translation_status = ?2, analysis_status = ?3 WHERE id = ?1",
            rusqlite::params![chapter_id, translation_status, analysis_status],
        )
        .unwrap();
}

#[test]
fn normalizes_tags_like_the_prototype() {
    assert_eq!(
        normalize_tag("  Slow Burn, #Romance  "),
        "slow-burn-romance"
    );
    assert_eq!(normalize_tag("A,B"), "a-b");
    assert_eq!(normalize_tag("#"), "");
    assert_eq!(normalize_tag(&"x".repeat(40)), "x".repeat(24));
    assert_eq!(
        normalize_tag("\u{4F60}\u{597D} World"),
        "\u{4F60}\u{597D}-world"
    );
}

#[test]
fn dedupes_tags_and_enforces_the_cap() {
    let tags_in = tags(&["B", "a", "b", " ", "#"]);
    assert_eq!(normalize_tags(&tags_in).unwrap(), vec!["b", "a"]);

    let many: Vec<String> = (0..13).map(|index| format!("tag{index}")).collect();
    let error = normalize_tags(&many).unwrap_err();
    assert_eq!(error.code, NovelErrorCode::TagLimit);
    assert_eq!(normalize_tags(&many[..12]).unwrap().len(), 12);
}

#[test]
fn counts_cjk_characters_and_whitespace_tokens() {
    assert_eq!(
        word_count("\u{4F60}\u{597D}\u{FF0C}\u{4E16}\u{754C}\u{3002}"),
        4
    );
    assert_eq!(word_count("Hello brave  new\nworld"), 4);
    assert_eq!(word_count("Hello\u{4E16}\u{754C}"), 3);
    assert_eq!(word_count("\u{3053}\u{3093}\u{306B}\u{3061}\u{306F}"), 5);
    assert_eq!(word_count("\u{D55C}\u{AE00} \u{D14C}\u{C2A4}\u{D2B8}"), 2);
    assert_eq!(word_count("-- ... \u{201C}\u{201D}"), 0);
    assert_eq!(word_count(""), 0);
}

#[test]
fn splits_paragraphs_trimming_and_dropping_empty_lines() {
    let text = "\u{feff} one \r\n\r\n two\r\n\r\n  \n three\r";
    assert_eq!(split_paragraphs(text), vec!["one", "two", "three"]);
    assert_eq!(normalize_chapter_text(text), "one\ntwo\nthree\n");
    assert_eq!(normalize_chapter_text("  \n"), "");
}

#[test]
fn paragraph_hash_is_the_sha256_hex_of_the_text() {
    assert_eq!(
        paragraph_hash("abc"),
        "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    );
    assert_eq!(paragraph_hash("a"), paragraph_hash("a"));
    assert_ne!(paragraph_hash("a"), paragraph_hash("b"));
}

#[test]
fn paragraphs_carry_a_hashcheck_of_their_text() {
    let paragraphs = paragraphs_from_text("a\n\n b \n");

    assert_eq!(
        paragraphs,
        vec![
            Paragraph {
                text: "a".to_string(),
                hashcheck: paragraph_hash("a")
            },
            Paragraph {
                text: "b".to_string(),
                hashcheck: paragraph_hash("b")
            },
        ]
    );
    assert_eq!(paragraphs_text(&paragraphs), "a\nb\n");
    assert_eq!(paragraphs_text(&[]), "");
}

#[test]
fn paragraph_rows_are_one_based() {
    let rows = paragraph_rows(&paragraphs_from_text("a\nb\n"));
    assert_eq!(
        rows[0],
        ParagraphRow {
            n: 1,
            text: "a".to_string(),
            hashcheck: paragraph_hash("a")
        }
    );
    assert_eq!(
        rows[1],
        ParagraphRow {
            n: 2,
            text: "b".to_string(),
            hashcheck: paragraph_hash("b")
        }
    );
}

#[test]
fn paragraph_edit_keeps_numbering_stable() {
    assert_eq!(normalize_paragraph("  a\n\nb \r\n c ").unwrap(), "a b c");
    assert_eq!(
        normalize_paragraph(" \n ").unwrap_err().code,
        NovelErrorCode::InvalidInput
    );
    let mut paragraphs = paragraphs_from_text("a\nb\nc\n");
    replace_paragraph(&mut paragraphs, 2, "x\ny").unwrap();
    assert_eq!(paragraphs_text(&paragraphs), "a\nx y\nc\n");
    assert_eq!(paragraphs[1].hashcheck, paragraph_hash("x y"));
    assert_eq!(paragraphs[0].hashcheck, paragraph_hash("a"));
    assert_eq!(paragraphs[2].hashcheck, paragraph_hash("c"));
    let mut single = paragraphs_from_text("a\n");
    assert_eq!(
        replace_paragraph(&mut single, 2, "x").unwrap_err().code,
        NovelErrorCode::ParagraphOutOfRange
    );
    assert_eq!(
        replace_paragraph(&mut single, 0, "x").unwrap_err().code,
        NovelErrorCode::ParagraphOutOfRange
    );
}

#[test]
fn chapter_ids_are_32_lowercase_hex_chars() {
    let id = new_chapter_id();
    assert_eq!(id.len(), 32);
    assert!(
        id.bytes()
            .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
    );
    assert_ne!(id, new_chapter_id());
}

#[test]
fn parses_cover_data_urls() {
    let (kind, bytes) = parse_cover_data_url(&data_url("image/jpeg", &JPEG)).unwrap();
    assert_eq!(kind, CoverKind::Jpeg);
    assert_eq!(bytes, JPEG);
    let (kind, _) = parse_cover_data_url(&data_url("image/png", &PNG)).unwrap();
    assert_eq!(kind, CoverKind::Png);

    let gif = parse_cover_data_url(&data_url("image/gif", b"GIF89a")).unwrap_err();
    assert_eq!(gif.code, NovelErrorCode::CoverInvalid);
    let mismatch = parse_cover_data_url(&data_url("image/png", &JPEG)).unwrap_err();
    assert_eq!(mismatch.code, NovelErrorCode::CoverInvalid);
    let plain = parse_cover_data_url("not a data url").unwrap_err();
    assert_eq!(plain.code, NovelErrorCode::CoverInvalid);
    let broken = parse_cover_data_url("data:image/png;base64,@@@").unwrap_err();
    assert_eq!(broken.code, NovelErrorCode::CoverInvalid);
}

#[test]
fn rejects_covers_over_eight_mib() {
    let mut big = PNG.to_vec();
    big.resize(COVER_MAX_BYTES + 1, 0);

    let error = parse_cover_data_url(&data_url("image/png", &big)).unwrap_err();

    assert_eq!(error.code, NovelErrorCode::CoverTooLarge);
}

#[test]
fn opening_without_a_workspace_is_a_typed_error() {
    let session = WorkspaceSession::new();

    let error = NovelService::new().open(&session).unwrap_err();

    assert_eq!(error.code, NovelErrorCode::NoWorkspace);
}

#[test]
fn creates_and_lists_novels_with_duplicates_allowed() {
    let fixture = fixture();
    let mut first = input("  Same Title ");
    first.tags = tags(&["Zeta", "alpha"]);

    let created = fixture.workspace.create(first).unwrap();
    let again = fixture.workspace.create(input("Same Title")).unwrap();

    assert_eq!(created.title, "Same Title");
    assert_eq!(created.lang, "ZH");
    assert_eq!(created.origin, "created");
    assert_eq!(created.tags, vec!["alpha", "zeta"]);
    assert_eq!(created.chapter_count, 0);
    assert_eq!(created.created_at, created.updated_at);
    assert_ne!(created.id, again.id);
    let listed = fixture.workspace.list().unwrap();
    assert_eq!(listed.len(), 2);
    assert_eq!(listed[0], created);
}

#[test]
fn create_rejects_bad_input_and_too_many_tags() {
    let fixture = fixture();
    let mut bad_title = input("  ");
    let error = fixture.workspace.create(bad_title.clone()).unwrap_err();
    assert_eq!(error.code, NovelErrorCode::InvalidInput);
    bad_title.title = "ok".to_string();
    bad_title.lang = "FR".to_string();
    let error = fixture.workspace.create(bad_title).unwrap_err();
    assert_eq!(error.code, NovelErrorCode::InvalidInput);
    let mut crowded = input("ok");
    crowded.tags = (0..13).map(|index| format!("t{index}")).collect();
    let error = fixture.workspace.create(crowded).unwrap_err();
    assert_eq!(error.code, NovelErrorCode::TagLimit);
    assert!(fixture.workspace.list().unwrap().is_empty());
}

#[test]
fn updates_only_the_patched_fields_and_replaces_tags() {
    let fixture = fixture();
    let mut seed = input("Title");
    seed.tags = tags(&["one", "two"]);
    let created = fixture.workspace.create(seed).unwrap();

    let patch = NovelPatch {
        name: Some(" Display ".to_string()),
        lang: Some("vi".to_string()),
        tags: Some(tags(&["Three"])),
        ..NovelPatch::default()
    };
    let updated = fixture.workspace.update(created.id, patch).unwrap();

    assert_eq!(updated.title, "Title");
    assert_eq!(updated.name, "Display");
    assert_eq!(updated.lang, "VI");
    assert_eq!(updated.author, "Author");
    assert_eq!(updated.tags, vec!["three"]);
    assert!(updated.updated_at >= created.updated_at);

    let untouched = fixture
        .workspace
        .update(created.id, NovelPatch::default())
        .unwrap();
    assert_eq!(untouched.tags, vec!["three"]);
}

#[test]
fn update_validates_and_reports_missing_novels() {
    let fixture = fixture();
    let created = fixture.workspace.create(input("Title")).unwrap();

    let empty_title = NovelPatch {
        title: Some(" ".to_string()),
        ..NovelPatch::default()
    };
    let error = fixture
        .workspace
        .update(created.id, empty_title)
        .unwrap_err();
    assert_eq!(error.code, NovelErrorCode::InvalidInput);
    let error = fixture
        .workspace
        .update(999, NovelPatch::default())
        .unwrap_err();
    assert_eq!(error.code, NovelErrorCode::NotFound);
    let crowded = NovelPatch {
        tags: Some((0..13).map(|index| format!("t{index}")).collect()),
        ..NovelPatch::default()
    };
    let error = fixture.workspace.update(created.id, crowded).unwrap_err();
    assert_eq!(error.code, NovelErrorCode::TagLimit);
}

#[test]
fn sets_replaces_and_clears_the_cover() {
    let fixture = fixture();
    let created = fixture.workspace.create(input("Title")).unwrap();
    assert_eq!(fixture.workspace.cover_get(created.id).unwrap(), None);

    let jpeg = data_url("image/jpeg", &JPEG);
    let after_set = fixture.workspace.cover_set(created.id, &jpeg).unwrap();
    assert_eq!(fixture.workspace.cover_get(created.id).unwrap(), Some(jpeg));
    assert!(after_set.updated_at >= created.updated_at);

    let png = data_url("image/png", &PNG);
    fixture.workspace.cover_set(created.id, &png).unwrap();
    assert_eq!(fixture.workspace.cover_get(created.id).unwrap(), Some(png));
    let novel_dir = fixture
        .dir
        .path()
        .join("novels")
        .join(created.id.to_string());
    assert!(!novel_dir.join("cover.jpg").exists());
    assert!(novel_dir.join("cover.png").is_file());

    fixture.workspace.cover_clear(created.id).unwrap();
    assert_eq!(fixture.workspace.cover_get(created.id).unwrap(), None);
    let error = fixture.workspace.cover_get(404).unwrap_err();
    assert_eq!(error.code, NovelErrorCode::NotFound);
}

#[test]
fn delete_cascades_chapters_tags_and_folders() {
    let fixture = fixture();
    let mut tagged = input("Tagged");
    tagged.tags = tags(&["keep"]);
    let kept = fixture.workspace.create(tagged).unwrap();
    let book = imported(&fixture, 3);
    let novel_dir = fixture.dir.path().join("novels").join(book.id.to_string());
    assert!(novel_dir.is_dir());

    let removed = fixture
        .workspace
        .delete(&[book.id, book.id, 12345])
        .unwrap();

    assert_eq!(removed, 1);
    assert!(!novel_dir.exists());
    let ids: Vec<i64> = fixture
        .workspace
        .list()
        .unwrap()
        .iter()
        .map(|n| n.id)
        .collect();
    assert_eq!(ids, vec![kept.id]);
    let conn = Database::open_read_write(&fixture.dir.path().join(WORKSPACE_DB_FILE)).unwrap();
    let chapters: i64 = conn
        .connection()
        .query_row("SELECT COUNT(*) FROM ws_novel_chapters", [], |row| {
            row.get(0)
        })
        .unwrap();
    let tag_rows: i64 = conn
        .connection()
        .query_row("SELECT COUNT(*) FROM ws_tags", [], |row| row.get(0))
        .unwrap();
    assert_eq!(chapters, 0);
    assert_eq!(tag_rows, 1);
}

#[test]
fn reads_chapters_and_edits_a_paragraph() {
    let fixture = fixture();
    let book = imported(&fixture, 2);
    let chapters = fixture.workspace.chapters(book.id).unwrap();
    assert_eq!(chapters.len(), 2);
    assert_eq!(chapters[0].seq, 1);
    assert_eq!(chapters[0].translation_status, "none");
    let first = &chapters[0];

    let paragraphs = fixture.workspace.chapter_read(book.id, &first.id).unwrap();
    assert_eq!(paragraphs.len(), 3);
    assert_eq!(paragraphs[0].n, 1);

    let edited = fixture
        .workspace
        .paragraph_update(book.id, &first.id, 2, "  brand new\n line  ")
        .unwrap();

    let reread = fixture.workspace.chapter_read(book.id, &first.id).unwrap();
    assert_eq!(reread.len(), 3);
    assert_eq!(reread[1].text, "brand new line");
    assert_eq!(reread[0], paragraphs[0]);
    assert_eq!(reread[2], paragraphs[2]);
    assert_eq!(
        edited.word_count,
        word_count(&join_paragraphs(&[
            reread[0].text.clone(),
            reread[1].text.clone(),
            reread[2].text.clone(),
        ]))
    );
    assert!(edited.updated_at >= first.updated_at);
    let novel = fixture.workspace.list().unwrap().remove(0);
    assert!(novel.updated_at >= book.updated_at);
    assert_eq!(novel.word_count, edited.word_count + chapters[1].word_count);
}

#[test]
fn adds_chapters_with_empty_files_and_default_titles() {
    let fixture = fixture();
    let novel = fixture.workspace.create(input("Title")).unwrap();

    let first = fixture.workspace.chapter_add(novel.id, "  One  ").unwrap();
    let second = fixture.workspace.chapter_add(novel.id, " ").unwrap();
    let chapters = fixture.workspace.chapters(novel.id).unwrap();

    assert_eq!(
        (first.seq, first.title.as_str(), first.word_count),
        (1, "One", 0)
    );
    assert_eq!((second.seq, second.title.as_str()), (2, "Chapter 2"));
    assert_eq!(
        chapters
            .iter()
            .map(|chapter| chapter.seq)
            .collect::<Vec<_>>(),
        [1, 2]
    );
    let stored = fs::read(chapter_file(&fixture, novel.id, &second.id)).unwrap();
    assert_eq!(
        serde_json::from_slice::<serde_json::Value>(&stored).unwrap(),
        serde_json::json!({ "paragraphs": [] })
    );
    assert!(
        fixture
            .workspace
            .chapter_read(novel.id, &second.id)
            .unwrap()
            .is_empty()
    );
}

#[test]
fn renames_chapters_with_the_same_title_validation_as_novels() {
    let fixture = fixture();
    let novel = imported(&fixture, 1);
    let chapter = fixture.workspace.chapters(novel.id).unwrap().remove(0);

    let renamed = fixture
        .workspace
        .chapter_rename(novel.id, &chapter.id, "  Renamed  ")
        .unwrap();
    let empty = fixture
        .workspace
        .chapter_rename(novel.id, &chapter.id, " ")
        .unwrap_err();
    let long = fixture
        .workspace
        .chapter_rename(novel.id, &chapter.id, &"x".repeat(MAX_TITLE_CHARS + 1))
        .unwrap_err();

    assert_eq!(renamed.title, "Renamed");
    assert_eq!(empty.code, NovelErrorCode::InvalidInput);
    assert_eq!(long.code, NovelErrorCode::InvalidInput);
}

#[test]
fn deletes_chapters_and_resequences_the_remaining_files() {
    let fixture = fixture();
    let novel = imported(&fixture, 3);
    let chapters = fixture.workspace.chapters(novel.id).unwrap();
    let deleted = &chapters[1];

    let remaining = fixture
        .workspace
        .chapter_delete(novel.id, &deleted.id)
        .unwrap();

    assert_eq!(
        remaining
            .iter()
            .map(|chapter| chapter.seq)
            .collect::<Vec<_>>(),
        [1, 2]
    );
    assert_eq!(
        remaining
            .iter()
            .map(|chapter| chapter.title.as_str())
            .collect::<Vec<_>>(),
        ["Chapter 1", "Chapter 3"]
    );
    assert!(!chapter_file(&fixture, novel.id, &deleted.id).exists());
}

#[test]
fn moves_chapters_up_down_same_position_and_rejects_bad_positions() {
    let fixture = fixture();
    let novel = imported(&fixture, 4);
    let original = fixture.workspace.chapters(novel.id).unwrap();

    let moved_up = fixture
        .workspace
        .chapter_move(novel.id, &original[3].id, 1)
        .unwrap();
    let moved_down = fixture
        .workspace
        .chapter_move(novel.id, &original[0].id, 3)
        .unwrap();
    let same = fixture
        .workspace
        .chapter_move(novel.id, &original[0].id, 3)
        .unwrap();
    let before = fixture.workspace.chapters(novel.id).unwrap();
    let low = fixture
        .workspace
        .chapter_move(novel.id, &original[0].id, 0)
        .unwrap_err();
    let high = fixture
        .workspace
        .chapter_move(novel.id, &original[0].id, 5)
        .unwrap_err();

    assert_eq!(
        moved_up
            .iter()
            .map(|chapter| chapter.title.as_str())
            .collect::<Vec<_>>(),
        ["Chapter 4", "Chapter 1", "Chapter 2", "Chapter 3"]
    );
    assert_eq!(
        moved_down
            .iter()
            .map(|chapter| chapter.title.as_str())
            .collect::<Vec<_>>(),
        ["Chapter 4", "Chapter 2", "Chapter 1", "Chapter 3"]
    );
    assert_eq!(same, before);
    assert_eq!(low.code, NovelErrorCode::InvalidInput);
    assert_eq!(high.code, NovelErrorCode::InvalidInput);
}

#[test]
fn rejects_changes_to_locked_chapters_and_moves_onto_locked_positions() {
    let fixture = fixture();
    let novel = imported(&fixture, 3);
    let chapters = fixture.workspace.chapters(novel.id).unwrap();
    set_chapter_status(&fixture, &chapters[0].id, "draft", "none");
    set_chapter_status(&fixture, &chapters[1].id, "none", "done");

    let delete = fixture
        .workspace
        .chapter_delete(novel.id, &chapters[0].id)
        .unwrap_err();
    let move_locked = fixture
        .workspace
        .chapter_move(novel.id, &chapters[0].id, 2)
        .unwrap_err();
    let add = fixture
        .workspace
        .paragraph_add(novel.id, &chapters[0].id, "new paragraph")
        .unwrap_err();
    let move_onto_locked = fixture
        .workspace
        .chapter_move(novel.id, &chapters[2].id, 2)
        .unwrap_err();

    assert_eq!(delete.code, NovelErrorCode::ChapterLocked);
    assert_eq!(move_locked.code, NovelErrorCode::ChapterLocked);
    assert_eq!(add.code, NovelErrorCode::ChapterLocked);
    assert_eq!(move_onto_locked.code, NovelErrorCode::ChapterLocked);
}

#[test]
fn adds_normalized_paragraphs_and_exports_in_sequence_order() {
    let fixture = fixture();
    let novel = imported(&fixture, 3);
    let chapters = fixture.workspace.chapters(novel.id).unwrap();
    let added = fixture
        .workspace
        .paragraph_add(novel.id, &chapters[0].id, "  new\n paragraph ")
        .unwrap();
    let read = fixture
        .workspace
        .chapter_read(novel.id, &chapters[0].id)
        .unwrap();
    fixture
        .workspace
        .chapter_move(novel.id, &chapters[2].id, 1)
        .unwrap();
    let destination = fixture.dir.path().join("ordered");
    let exported = fixture
        .workspace
        .export_package(novel.id, &destination)
        .unwrap();
    let copy = fixture
        .workspace
        .import_package(Path::new(&exported.path), input("Copy"))
        .unwrap();
    let copied = fixture.workspace.chapters(copy.id).unwrap();

    assert_eq!(read.last().unwrap().text, "new paragraph");
    assert_eq!(
        added.word_count,
        word_count(&join_paragraphs(
            &read.iter().map(|row| row.text.clone()).collect::<Vec<_>>()
        ))
    );
    assert_eq!(
        copied
            .iter()
            .map(|chapter| chapter.title.as_str())
            .collect::<Vec<_>>(),
        ["Chapter 3", "Chapter 1", "Chapter 2"]
    );
}

#[test]
fn writes_full_chapter_text_and_splits_it_into_paragraphs() {
    let fixture = fixture();
    let novel = imported(&fixture, 1);
    let chapter = fixture.workspace.chapters(novel.id).unwrap().remove(0);

    let written = fixture
        .workspace
        .chapter_write(novel.id, &chapter.id, "\n  first line \r\n\r\n second\n\n\nthird  \n")
        .unwrap();
    let read = fixture.workspace.chapter_read(novel.id, &chapter.id).unwrap();
    let empty = fixture
        .workspace
        .chapter_write(novel.id, &chapter.id, " \n\n ")
        .unwrap_err();

    let texts: Vec<&str> = read.iter().map(|row| row.text.as_str()).collect();
    assert_eq!(texts, ["first line", "second", "third"]);
    assert_eq!(written.word_count, word_count("first line\nsecond\nthird\n"));
    assert_eq!(empty.code, NovelErrorCode::InvalidInput);
}

#[test]
fn writing_a_translated_chapter_replaces_its_paragraphs() {
    let fixture = fixture();
    let novel = imported(&fixture, 1);
    let chapter = fixture.workspace.chapters(novel.id).unwrap().remove(0);
    set_chapter_status(&fixture, &chapter.id, "draft", "none");

    fixture
        .workspace
        .chapter_write(novel.id, &chapter.id, "only one\n\nand two")
        .unwrap();
    let read = fixture.workspace.chapter_read(novel.id, &chapter.id).unwrap();

    assert_eq!(read.len(), 2);
}

#[test]
fn paragraph_edit_rejects_bad_requests() {
    let fixture = fixture();
    let book = imported(&fixture, 1);
    let chapter = fixture.workspace.chapters(book.id).unwrap().remove(0);

    let empty = fixture
        .workspace
        .paragraph_update(book.id, &chapter.id, 1, "  ")
        .unwrap_err();
    let range = fixture
        .workspace
        .paragraph_update(book.id, &chapter.id, 99, "x")
        .unwrap_err();
    let unknown = fixture
        .workspace
        .paragraph_update(book.id, "ffffffffffffffffffffffffffffffff", 1, "x")
        .unwrap_err();
    let missing = fixture.workspace.chapters(404).unwrap_err();

    assert_eq!(empty.code, NovelErrorCode::InvalidInput);
    assert_eq!(range.code, NovelErrorCode::ParagraphOutOfRange);
    assert_eq!(unknown.code, NovelErrorCode::NotFound);
    assert_eq!(missing.code, NovelErrorCode::NotFound);
}

#[test]
fn missing_chapter_file_is_reported_for_that_chapter() {
    let fixture = fixture();
    let book = imported(&fixture, 2);
    let chapters = fixture.workspace.chapters(book.id).unwrap();
    let path = fixture
        .dir
        .path()
        .join("novels")
        .join(book.id.to_string())
        .join(format!("chapter_{}.json", chapters[0].id));
    fs::remove_file(path).unwrap();

    let read = fixture
        .workspace
        .chapter_read(book.id, &chapters[0].id)
        .unwrap_err();
    let edit = fixture
        .workspace
        .paragraph_update(book.id, &chapters[0].id, 1, "x")
        .unwrap_err();

    assert_eq!(read.code, NovelErrorCode::ChapterFileMissing);
    assert_eq!(edit.code, NovelErrorCode::ChapterFileMissing);
    assert!(
        fixture
            .workspace
            .chapter_read(book.id, &chapters[1].id)
            .is_ok()
    );
}

#[test]
fn imports_a_package_with_edited_metadata() {
    let fixture = fixture();
    let path = write_package_file(&fixture, "book.zip", &sample_package(3));
    let mut meta = input("My Title");
    meta.lang = "en".to_string();
    meta.tags = tags(&["Imported"]);

    let summary = fixture.workspace.import_package(&path, meta).unwrap();

    assert_eq!(summary.title, "My Title");
    assert_eq!(summary.lang, "EN");
    assert_eq!(summary.origin, "imported");
    assert_eq!(summary.chapter_count, 3);
    assert_eq!(summary.tags, vec!["imported"]);
    assert!(summary.word_count > 0);
    let cover = fixture.workspace.cover_get(summary.id).unwrap().unwrap();
    assert!(cover.starts_with("data:image/jpeg;base64,"));
    let chapters = fixture.workspace.chapters(summary.id).unwrap();
    assert_eq!(chapters[2].title, "Chapter 3");
    assert_eq!(chapters[0].created_at, chapters[0].updated_at);
    let paragraphs = fixture
        .workspace
        .chapter_read(summary.id, &chapters[0].id)
        .unwrap();
    assert_eq!(paragraphs.len(), 3);
    assert_eq!(
        chapters[0].word_count,
        word_count(&join_paragraphs(&[
            paragraphs[0].text.clone(),
            paragraphs[1].text.clone(),
            paragraphs[2].text.clone(),
        ]))
    );
}

#[test]
fn imports_several_hundred_chapters() {
    let fixture = fixture();

    let summary = imported(&fixture, 600);

    assert_eq!(summary.chapter_count, 600);
    let chapters = fixture.workspace.chapters(summary.id).unwrap();
    assert_eq!(chapters.len(), 600);
    assert_eq!(chapters[599].seq, 600);
    let files = fs::read_dir(
        fixture
            .dir
            .path()
            .join("novels")
            .join(summary.id.to_string()),
    )
    .unwrap()
    .count();
    assert_eq!(files, 601);
}

#[test]
fn failed_validation_imports_nothing() {
    let fixture = fixture();
    let manifest = manifest_json(&["chapters/001.txt", "chapters/002.txt"]);
    let bytes = zip_bytes(&[
        ("manifest.json", manifest.as_bytes()),
        ("chapters/001.txt", b"a"),
    ]);
    let path = write_package_file(&fixture, "bad.dsnovel", &bytes);

    let error = fixture
        .workspace
        .import_package(&path, input("Bad"))
        .unwrap_err();

    assert_eq!(error.code, NovelErrorCode::PackageChapters);
    assert!(fixture.workspace.list().unwrap().is_empty());
    assert!(!fixture.dir.path().join("novels").exists());
}

#[test]
fn mid_import_failure_rolls_back_rows_and_removes_the_folder() {
    let fixture = fixture();
    let path = write_package_file(&fixture, "book.dsnovel", &sample_package(4));
    let (mut reader, package) = inspect_path(&path, &NullSink).unwrap();
    let mut broken = package.clone();
    broken.chapters[2].file = "chapters/gone.txt".to_string();
    let mut db = fixture.workspace.database().unwrap();
    let tx = db.connection_mut().transaction().unwrap();
    let id = insert_novel(
        &tx,
        &clean_input(input("Half")).unwrap(),
        "imported",
        &now_text(),
    )
    .unwrap();

    let result = fixture
        .workspace
        .write_package(&tx, &mut reader, &broken, id);
    drop(tx);
    let _ = fixture.workspace.files().remove_novel_dir(id);

    assert_eq!(result.unwrap_err().code, NovelErrorCode::PackageChapters);
    assert!(fixture.workspace.list().unwrap().is_empty());
    assert!(
        !fixture
            .dir
            .path()
            .join("novels")
            .join(id.to_string())
            .exists()
    );
}

#[test]
fn invalid_utf8_chapter_fails_validation_and_imports_nothing() {
    let fixture = fixture();
    let manifest = manifest_json(&["chapters/001.txt", "chapters/002.txt"]);
    let bytes = zip_bytes(&[
        ("manifest.json", manifest.as_bytes()),
        ("chapters/001.txt", b"a\nb"),
        ("chapters/002.txt", &[0xFF, 0xFE, 0xFD]),
    ]);
    let path = write_package_file(&fixture, "bad-utf8.dsnovel", &bytes);

    let error = fixture
        .workspace
        .import_package(&path, input("Bad"))
        .unwrap_err();

    assert_eq!(error.code, NovelErrorCode::PackageChapters);
    assert!(fixture.workspace.list().unwrap().is_empty());
}

#[test]
fn export_round_trips_through_import() {
    let fixture = fixture();
    let book = imported(&fixture, 3);
    fixture
        .workspace
        .paragraph_update(
            book.id,
            &fixture.workspace.chapters(book.id).unwrap()[1].id,
            1,
            "edited line",
        )
        .unwrap();
    let dest = fixture.dir.path().join("out").join("Exported");
    fs::create_dir(dest.parent().unwrap()).unwrap();

    let summary = fixture.workspace.export_package(book.id, &dest).unwrap();

    let written = fixture.dir.path().join("out").join("Exported.dsnovel");
    assert_eq!(summary.chapter_count, 3);
    assert_eq!(PathBuf::from(&summary.path), written);
    assert!(
        !fixture
            .dir
            .path()
            .join("out")
            .join("Exported.dsnovel.part")
            .exists()
    );
    let mut meta = input("Copy");
    meta.lang = "zh".to_string();
    let copy = fixture.workspace.import_package(&written, meta).unwrap();
    assert_eq!(copy.chapter_count, 3);
    let original = fixture.workspace.list().unwrap().remove(0);
    assert_eq!(original.id, book.id);
    assert_eq!(copy.word_count, original.word_count);
    let source = fixture.workspace.chapters(book.id).unwrap();
    let target = fixture.workspace.chapters(copy.id).unwrap();
    for (before, after) in source.iter().zip(&target) {
        assert_eq!(before.title, after.title);
        let old = fixture.workspace.chapter_read(book.id, &before.id).unwrap();
        let new = fixture.workspace.chapter_read(copy.id, &after.id).unwrap();
        assert_eq!(old, new);
    }
    assert_eq!(
        fixture.workspace.cover_get(copy.id).unwrap(),
        fixture.workspace.cover_get(book.id).unwrap()
    );
}

#[test]
fn export_writes_the_display_name_into_the_manifest() {
    let fixture = fixture();
    let book = imported(&fixture, 1);
    fixture
        .workspace
        .update(
            book.id,
            NovelPatch {
                name: Some("  Display Name  ".to_string()),
                ..NovelPatch::default()
            },
        )
        .unwrap();
    let dest = fixture.dir.path().join("named");

    let summary = fixture.workspace.export_package(book.id, &dest).unwrap();

    let file = fs::File::open(&summary.path).unwrap();
    let mut archive = zip::ZipArchive::new(file).unwrap();
    let manifest: serde_json::Value =
        serde_json::from_reader(archive.by_name("manifest.json").unwrap()).unwrap();
    assert_eq!(manifest["name"], "Display Name");
    assert_eq!(manifest["title"], "Imported");
    let (_, package) = inspect_path(Path::new(&summary.path), &NullSink).unwrap();
    assert_eq!(package.name, "Display Name");
    assert_eq!(package.summary().name, "Display Name");
}

#[test]
fn a_package_without_a_name_imports_with_an_empty_display_name() {
    let fixture = fixture();
    let path = write_package_file(&fixture, "plain.dsnovel", &sample_package(1));

    let (_, package) = inspect_path(&path, &NullSink).unwrap();

    assert_eq!(package.name, "");
}

#[test]
fn export_without_chapters_or_novel_is_rejected() {
    let fixture = fixture();
    let empty = fixture.workspace.create(input("Empty")).unwrap();
    let dest = fixture.dir.path().join("empty.dsnovel");

    let none = fixture
        .workspace
        .export_package(empty.id, &dest)
        .unwrap_err();
    let missing = fixture.workspace.export_package(404, &dest).unwrap_err();

    assert_eq!(none.code, NovelErrorCode::InvalidInput);
    assert_eq!(missing.code, NovelErrorCode::NotFound);
    assert!(!dest.exists());
}

#[test]
fn failed_export_leaves_no_partial_file() {
    let fixture = fixture();
    let book = imported(&fixture, 2);
    let chapters = fixture.workspace.chapters(book.id).unwrap();
    fs::remove_file(
        fixture
            .dir
            .path()
            .join("novels")
            .join(book.id.to_string())
            .join(format!("chapter_{}.json", chapters[1].id)),
    )
    .unwrap();
    let dest = fixture.dir.path().join("broken.dsnovel");

    let error = fixture
        .workspace
        .export_package(book.id, &dest)
        .unwrap_err();

    assert_eq!(error.code, NovelErrorCode::ChapterFileMissing);
    assert!(!dest.exists());
    assert!(!fixture.dir.path().join("broken.dsnovel.part").exists());
}

#[test]
fn export_replaces_an_existing_file() {
    let fixture = fixture();
    let book = imported(&fixture, 1);
    let dest = fixture.dir.path().join("again.dsnovel");
    fs::write(&dest, b"old").unwrap();

    fixture.workspace.export_package(book.id, &dest).unwrap();

    assert!(fs::metadata(&dest).unwrap().len() > 3);
    assert!(
        fixture
            .workspace
            .import_package(&dest, input("Back"))
            .is_ok()
    );
}

#[test]
#[ignore = "measures the real samples in _output, run with --ignored --nocapture"]
fn measures_import_time_of_the_sample_packages() {
    let samples = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("_output");
    let fixture = fixture();
    for name in ["shuse-wushuang", "wanmei-nvpei", "xiayan-shenyi"] {
        let path = samples.join(format!("{name}.dsnovel"));
        let started = std::time::Instant::now();
        let summary = fixture
            .workspace
            .import_package(&path, input(name))
            .unwrap();
        println!(
            "import {name}: {:?} chapters={} words={}",
            started.elapsed(),
            summary.chapter_count,
            summary.word_count
        );
        assert!(fixture.workspace.cover_get(summary.id).unwrap().is_some());
    }
}
