use super::*;
use crate::infra::storage::migrator::Migrator;
use crate::infra::storage::migrator::workspace_scripts;
use std::sync::atomic::AtomicBool;
use tempfile::TempDir;

fn workspace() -> (TempDir, ProjectWorkspace) {
    let dir = TempDir::new().unwrap();
    let db_path = dir.path().join(WORKSPACE_DB_FILE);
    let mut db = Database::create(&db_path).unwrap();
    Migrator::migrate(
        db.connection_mut(),
        &workspace_scripts().unwrap(),
        &AtomicBool::new(false),
    )
    .unwrap();
    let workspace = ProjectWorkspace::new(dir.path().to_path_buf());
    (dir, workspace)
}

fn input(name: &str) -> ProjectInput {
    ProjectInput {
        name: name.to_string(),
        template: "audiobook".to_string(),
        description: String::new(),
        novel_id: None,
        src_kind: None,
        range_from: None,
        range_to: None,
    }
}

fn insert_novel(dir: &TempDir, chapters: i64) -> i64 {
    let conn = rusqlite::Connection::open(dir.path().join(WORKSPACE_DB_FILE)).unwrap();
    conn.execute(
        "INSERT INTO ws_novels (title, lang, origin, created_at, updated_at) VALUES ('Book', 'ZH', 'created', 'now', 'now')",
        [],
    ).unwrap();
    let id = conn.last_insert_rowid();
    for seq in 1..=chapters {
        conn.execute(
            "INSERT INTO ws_novel_chapters (id, novel_id, seq, title, word_count, created_at, updated_at) VALUES (?1, ?2, ?3, 'Chapter', 1, 'now', 'now')",
            rusqlite::params![format!("chapter-{seq}"), id, seq],
        ).unwrap();
    }
    id
}

#[test]
fn accepts_free_text_names_and_rejects_blank_ones() {
    let (_dir, service) = workspace();
    assert_eq!(
        service.create(input("  ")).unwrap_err().code,
        ProjectErrorCode::InvalidInput
    );
    let mut unsupported = input("Name");
    unsupported.template = "other".to_string();
    assert_eq!(
        service.create(unsupported).unwrap_err().code,
        ProjectErrorCode::InvalidInput
    );
    let first = service
        .create(input("Tập 1: \"Mở đầu\" / <draft>?"))
        .unwrap();
    let second = service
        .create(input("Tập 1: \"Mở đầu\" / <draft>?"))
        .unwrap();
    assert_eq!(first.name, "Tập 1: \"Mở đầu\" / <draft>?");
    assert_eq!(second.name, first.name);
    assert_ne!(first.id, second.id);
}

#[test]
fn creates_the_project_folder_named_after_the_incremental_id() {
    let (dir, service) = workspace();
    let first = service.create(input("My Project")).unwrap();
    let second = service.create(input("My Project")).unwrap();
    assert_eq!(first.folder, format!("projects/{}", first.id));
    assert_eq!(second.id, first.id + 1);
    assert!(dir.path().join(&first.folder).is_dir());
    assert!(dir.path().join(&second.folder).is_dir());
    assert_eq!(service.list().unwrap(), vec![first, second]);
}

#[test]
fn update_archive_open_and_delete_update_rows_and_files() {
    let (dir, service) = workspace();
    let project = service.create(input("One")).unwrap();
    let updated = service
        .update(
            project.id,
            ProjectPatch {
                name: Some(" Two ".to_string()),
                description: Some(" text ".to_string()),
            },
        )
        .unwrap();
    assert_eq!(updated.name, "Two");
    assert_eq!(updated.description, "text");
    service.archive(&[project.id], true).unwrap();
    assert!(service.list().unwrap()[0].archived);
    let opened = service.open_project(project.id).unwrap();
    assert!(opened.opened_at >= project.opened_at);
    assert_eq!(service.delete(&[project.id, project.id]).unwrap(), 1);
    assert!(!dir.path().join(project.folder).exists());
}

#[test]
fn validates_novel_range_and_marks_deleted_novels_missing() {
    let (dir, service) = workspace();
    let novel_id = insert_novel(&dir, 3);
    let mut request = input("Linked");
    request.novel_id = Some(novel_id);
    request.range_from = Some(1);
    request.range_to = Some(4);
    assert_eq!(
        service.create(request.clone()).unwrap_err().code,
        ProjectErrorCode::RangeInvalid
    );
    request.range_to = Some(3);
    let linked = service.create(request).unwrap();
    assert_eq!(linked.src_kind.as_deref(), Some("original"));
    assert_eq!(linked.src_lang.as_deref(), Some("ZH"));
    let conn = rusqlite::Connection::open(dir.path().join(WORKSPACE_DB_FILE)).unwrap();
    conn.execute("DELETE FROM ws_novels WHERE id = ?1", [novel_id])
        .unwrap();
    assert!(service.list().unwrap()[0].novel_missing);
    let mut nonexistent = input("Missing source");
    nonexistent.novel_id = Some(999);
    assert_eq!(
        service.create(nonexistent).unwrap_err().code,
        ProjectErrorCode::NovelNotFound
    );
}

#[test]
fn cover_is_stored_outside_the_project_folder_and_removed_with_the_project() {
    let (dir, service) = workspace();
    let project = service.create(input("Covered")).unwrap();
    assert_eq!(service.cover_get(project.id).unwrap(), None);
    let cover = "data:image/png;base64,iVBORw0KGgo=";
    let updated = service.cover_set(project.id, cover).unwrap();
    assert!(updated.updated_at >= project.updated_at);
    assert_eq!(
        service.cover_get(project.id).unwrap().as_deref(),
        Some(cover)
    );
    assert!(service.dir_list(project.id, "").unwrap().is_empty());
    assert_eq!(
        service
            .cover_set(project.id, "data:image/gif;base64,AAAA")
            .unwrap_err()
            .code,
        ProjectErrorCode::CoverInvalid
    );
    service.cover_clear(project.id).unwrap();
    assert_eq!(service.cover_get(project.id).unwrap(), None);
    service.cover_set(project.id, cover).unwrap();
    service.delete(&[project.id]).unwrap();
    let leftover = dir
        .path()
        .join("project-covers")
        .join(format!("{}.png", project.id));
    assert!(!leftover.exists());
}

#[test]
fn lists_one_directory_level_in_sorted_order_and_rejects_unsafe_paths() {
    let (dir, service) = workspace();
    let project = service.create(input("Files")).unwrap();
    let root = dir.path().join(&project.folder);
    std::fs::create_dir(root.join("Z folder")).unwrap();
    std::fs::write(root.join("b.txt"), b"12").unwrap();
    std::fs::write(root.join("A.txt"), b"1").unwrap();
    let entries = service.dir_list(project.id, "").unwrap();
    assert_eq!(
        entries
            .iter()
            .map(|entry| entry.name.as_str())
            .collect::<Vec<_>>(),
        vec!["Z folder", "A.txt", "b.txt"]
    );
    assert_eq!(entries[1].size, 1);
    assert_eq!(
        service.dir_list(project.id, "Z folder").unwrap(),
        Vec::new()
    );
    assert_eq!(
        service.dir_list(project.id, "../").unwrap_err().code,
        ProjectErrorCode::PathInvalid
    );
    assert_eq!(
        service
            .dir_list(project.id, root.to_str().unwrap())
            .unwrap_err()
            .code,
        ProjectErrorCode::PathInvalid
    );
}

#[cfg(unix)]
#[test]
fn rejects_a_directory_path_through_an_external_symlink() {
    use std::os::unix::fs::symlink;
    let (dir, service) = workspace();
    let project = service.create(input("Files")).unwrap();
    let outside = TempDir::new().unwrap();
    std::fs::write(outside.path().join("secret.txt"), b"secret").unwrap();
    let link = dir.path().join(&project.folder).join("outside");
    if symlink(outside.path(), &link).is_ok() {
        assert_eq!(
            service.dir_list(project.id, "outside").unwrap_err().code,
            ProjectErrorCode::PathInvalid
        );
        assert_eq!(service.dir_list(project.id, "").unwrap()[0].name, "outside");
    }
}

#[test]
fn opening_without_workspace_returns_typed_error() {
    let error = ProjectService::new()
        .open(&WorkspaceSession::new())
        .unwrap_err();
    assert_eq!(error.code, ProjectErrorCode::NoWorkspace);
}
