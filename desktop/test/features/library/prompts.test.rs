use super::*;
use crate::infra::storage::migrator::Migrator;
use crate::infra::storage::migrator::workspace_scripts;
use std::sync::atomic::AtomicBool;
use tempfile::TempDir;

fn test_connection() -> Connection {
    let mut conn = Connection::open_in_memory().unwrap();
    Migrator::migrate(
        &mut conn,
        &workspace_scripts().unwrap(),
        &AtomicBool::new(false),
    )
    .unwrap();
    conn
}

fn new_prompt(name: &str, text: &str) -> NewPrompt {
    NewPrompt {
        name: name.to_string(),
        kind: PromptKind::General,
        text: text.to_string(),
        rights: AssetRights::Own,
        collection_id: None,
        tags: vec!["Example".to_string()],
    }
}

#[test]
fn stores_reads_overwrites_and_removes_prompt_files() {
    let directory = TempDir::new().unwrap();
    let files = PromptFiles::new(directory.path().to_path_buf());
    files.write(7, "first").unwrap();
    assert_eq!(files.read(7).unwrap(), "first");
    assert!(
        directory
            .path()
            .join("library")
            .join("prompts")
            .join("7.txt")
            .exists()
    );
    assert!(
        !directory
            .path()
            .join("library")
            .join("prompts")
            .join(".7.txt.tmp")
            .exists()
    );
    files.write(7, "second").unwrap();
    assert_eq!(files.read(7).unwrap(), "second");
    assert_eq!(files.read_or_empty(8), "");
    fs::write(
        directory
            .path()
            .join("library")
            .join("prompts")
            .join("8.txt"),
        [0xff],
    )
    .unwrap();
    assert_eq!(files.read_or_empty(8), "");
    fs::write(
        directory
            .path()
            .join("library")
            .join("prompts")
            .join(".7.txt.tmp"),
        "stray",
    )
    .unwrap();
    files.remove(7).unwrap();
    files.remove(7).unwrap();
    assert!(
        !directory
            .path()
            .join("library")
            .join("prompts")
            .join("7.txt")
            .exists()
    );
    assert!(
        !directory
            .path()
            .join("library")
            .join("prompts")
            .join(".7.txt.tmp")
            .exists()
    );
}

#[test]
fn normalizes_prompt_text_and_names() {
    assert_eq!(
        decode_file(b"\xef\xbb\xbf  hello\r\nworld  ").unwrap(),
        "hello\nworld"
    );
    assert_eq!(
        decode_file("đây là prompt".as_bytes()).unwrap(),
        "đây là prompt"
    );
    assert_eq!(
        decode_file(&[0xff]).unwrap_err().code,
        LibraryErrorCode::PromptUnreadable
    );
    assert_eq!(
        normalize_text(" \r\n ").unwrap_err().code,
        LibraryErrorCode::PromptEmpty
    );
    assert_eq!(
        normalize_text(&"x".repeat(PROMPT_MAX_BYTES + 1))
            .unwrap_err()
            .code,
        LibraryErrorCode::PromptTooLarge
    );
    assert_eq!(
        normalize_name(" ").unwrap_err().code,
        LibraryErrorCode::PromptNameInvalid
    );
    assert_eq!(normalize_name(&"x".repeat(120)).unwrap().len(), 120);
    assert_eq!(
        normalize_name(&"x".repeat(121)).unwrap_err().code,
        LibraryErrorCode::PromptNameInvalid
    );
}

#[test]
fn stores_updates_and_deletes_prompt_rows() {
    let directory = TempDir::new().unwrap();
    let files = PromptFiles::new(directory.path().to_path_buf());
    let conn = test_connection();
    let id = insert(
        &conn,
        &new_prompt("Harbor v1.2", "đây"),
        "2026-01-01T00:00:00Z",
    )
    .unwrap();
    files.write(id, "đây").unwrap();
    let prompts = list(&conn, &files).unwrap();
    assert_eq!(prompts[0].text, "đây");
    assert_eq!(prompts[0].tags, vec!["example"]);
    assert_eq!(prompts[0].size, "đây".len() as i64);
    assert_eq!(
        unique_name(&conn, "harbor v1.2", None).unwrap(),
        "harbor v1.2 (2)"
    );
    let patch = normalize_patch(&PromptPatch {
        name: Some("renamed".to_string()),
        kind: Some(PromptKind::Image),
        text: Some("next".to_string()),
        rights: Some(AssetRights::Licensed),
        collection_id: None,
        tags: Some((0..12).map(|index| format!("tag-{index}")).collect()),
    })
    .unwrap();
    update(&conn, id, &patch, "2026-01-02T00:00:00Z").unwrap();
    files.write(id, patch.text.as_deref().unwrap()).unwrap();
    let updated = get(&conn, &files, id).unwrap();
    assert_eq!(updated.name, "renamed");
    assert_eq!(updated.kind, PromptKind::Image);
    assert_eq!(updated.size, 4);
    assert_eq!(updated.rights, AssetRights::Licensed);
    assert_eq!(updated.tags.len(), 12);
    assert_eq!(
        normalize_patch(&PromptPatch {
            text: Some(" ".to_string()),
            ..PromptPatch::default()
        })
        .unwrap_err()
        .code,
        LibraryErrorCode::PromptEmpty
    );
    assert!(PromptKind::parse("invalid").is_none());
    assert!(serde_json::from_str::<PromptPatch>(r#"{"kind":"invalid"}"#).is_err());
    let too_many = PromptPatch {
        tags: Some((0..13).map(|index| format!("tag-{index}")).collect()),
        ..PromptPatch::default()
    };
    assert_eq!(
        update(&conn, id, &too_many, "2026-01-02T00:00:00Z")
            .unwrap_err()
            .code,
        LibraryErrorCode::TagLimit
    );
    let missing_collection = PromptPatch {
        collection_id: Some(Some(99)),
        ..PromptPatch::default()
    };
    assert_eq!(
        update(&conn, id, &missing_collection, "2026-01-02T00:00:00Z")
            .unwrap_err()
            .code,
        LibraryErrorCode::CollectionNotFound
    );
    assert_eq!(delete(&conn, &[id]).unwrap(), vec![id]);
    assert_eq!(
        conn.query_row(
            "SELECT COUNT(*) FROM ws_tags WHERE type = 'library_prompt'",
            [],
            |row| row.get::<_, i64>(0)
        )
        .unwrap(),
        0
    );
}
