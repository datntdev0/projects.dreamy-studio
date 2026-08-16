use super::*;
use crate::infra::storage::migrator::Migrator;
use crate::infra::storage::migrator::app_scripts;
use chrono::TimeZone;
use std::fs;
use std::sync::atomic::AtomicBool;
use tempfile::TempDir;

fn at(second: u32) -> DateTime<Utc> {
    Utc.with_ymd_and_hms(2026, 1, 1, 0, 0, second).unwrap()
}

fn prepared(dir: &TempDir) -> WorkspaceRepository {
    let path = dir.path().join("application.dreamydb");
    let mut db = Database::create(&path).unwrap();
    let cancel = AtomicBool::new(false);
    Migrator::migrate(db.connection_mut(), &app_scripts().unwrap(), &cancel).unwrap();
    WorkspaceRepository::new(path)
}

fn entry_path(entry: RecentWorkspace) -> String {
    entry.path
}

fn paths(repo: &WorkspaceRepository) -> Vec<String> {
    repo.list().into_iter().map(entry_path).collect()
}

#[test]
fn lists_newest_first() {
    let dir = TempDir::new().unwrap();
    let repo = prepared(&dir);
    repo.touch("D:\\A", at(1)).unwrap();
    repo.touch("D:\\B", at(3)).unwrap();
    repo.touch("D:\\C", at(2)).unwrap();
    assert_eq!(paths(&repo), vec!["D:\\B", "D:\\C", "D:\\A"]);
    let listed = repo.list();
    assert_eq!(listed.len(), 3);
    assert_eq!(listed[0].name, "B");
    assert_eq!(listed[0].last_opened_at, "2026-01-01T00:00:03.000Z");
}

#[test]
fn lists_at_most_five_workspaces() {
    let dir = TempDir::new().unwrap();
    let repo = prepared(&dir);
    for second in 1..=6 {
        repo.touch(&format!("D:\\Workspace{second}"), at(second))
            .unwrap();
    }
    assert_eq!(
        paths(&repo),
        vec![
            "D:\\Workspace6",
            "D:\\Workspace5",
            "D:\\Workspace4",
            "D:\\Workspace3",
            "D:\\Workspace2",
        ]
    );
}

#[test]
fn ties_are_broken_by_newest_row() {
    let dir = TempDir::new().unwrap();
    let repo = prepared(&dir);
    repo.touch("D:\\A", at(1)).unwrap();
    repo.touch("D:\\B", at(1)).unwrap();
    assert_eq!(paths(&repo), vec!["D:\\B", "D:\\A"]);
}

#[test]
fn duplicates_differing_by_case_reuse_one_entry() {
    let dir = TempDir::new().unwrap();
    let repo = prepared(&dir);
    repo.touch("D:\\Work\\Novels", at(1)).unwrap();
    repo.touch("d:/work/novels/", at(2)).unwrap();
    let entries = repo.list();
    assert_eq!(entries.len(), 1);
    assert_eq!(entries[0].path, "d:/work/novels");
    assert_eq!(entries[0].name, "novels");
    assert_eq!(entries[0].last_opened_at, "2026-01-01T00:00:02.000Z");
}

#[test]
fn touch_moves_entry_to_top() {
    let dir = TempDir::new().unwrap();
    let repo = prepared(&dir);
    repo.touch("D:\\A", at(1)).unwrap();
    repo.touch("D:\\B", at(2)).unwrap();
    repo.touch("D:\\A", at(3)).unwrap();
    assert_eq!(paths(&repo), vec!["D:\\A", "D:\\B"]);
}

#[test]
fn relocate_to_unused_path_updates_in_place() {
    let dir = TempDir::new().unwrap();
    let repo = prepared(&dir);
    repo.touch("D:\\Old", at(1)).unwrap();
    repo.relocate("d:\\old", "E:\\Moved\\New\\", at(5)).unwrap();
    let entries = repo.list();
    assert_eq!(entries.len(), 1);
    assert_eq!(entries[0].path, "E:\\Moved\\New");
    assert_eq!(entries[0].name, "New");
    assert_eq!(entries[0].last_opened_at, "2026-01-01T00:00:05.000Z");
}

#[test]
fn relocate_to_existing_entry_removes_old_and_updates_existing() {
    let dir = TempDir::new().unwrap();
    let repo = prepared(&dir);
    repo.touch("D:\\Old", at(1)).unwrap();
    repo.touch("E:\\Existing", at(2)).unwrap();
    repo.touch("F:\\Other", at(3)).unwrap();
    repo.relocate("D:\\Old", "e:\\existing", at(9)).unwrap();
    assert_eq!(paths(&repo), vec!["e:\\existing", "F:\\Other"]);
    assert_eq!(repo.list()[0].last_opened_at, "2026-01-01T00:00:09.000Z");
}

#[test]
fn relocate_without_old_entry_behaves_like_touch() {
    let dir = TempDir::new().unwrap();
    let repo = prepared(&dir);
    repo.relocate("D:\\Missing", "E:\\New", at(1)).unwrap();
    assert_eq!(paths(&repo), vec!["E:\\New"]);
}

#[test]
fn remove_deletes_only_the_entry() {
    let dir = TempDir::new().unwrap();
    let repo = prepared(&dir);
    let folder = dir.path().join("Novel");
    fs::create_dir(&folder).unwrap();
    fs::write(folder.join("keep.txt"), b"data").unwrap();
    let folder_text = folder.to_str().unwrap();
    repo.touch(folder_text, at(1)).unwrap();
    repo.touch("D:\\Other", at(2)).unwrap();
    repo.remove(folder_text).unwrap();
    assert_eq!(paths(&repo), vec!["D:\\Other"]);
    assert!(folder.join("keep.txt").is_file());
}

#[test]
fn list_is_empty_when_database_is_missing() {
    let dir = TempDir::new().unwrap();
    let missing = dir.path().join("missing.dreamydb");
    let repo = WorkspaceRepository::new(missing.clone());
    assert!(repo.list().is_empty());
    assert!(!missing.exists());
}

#[test]
fn list_is_empty_when_database_is_unreadable() {
    let dir = TempDir::new().unwrap();
    let path = dir.path().join("application.dreamydb");
    fs::write(&path, b"this is not a sqlite database at all, just text").unwrap();
    let repo = WorkspaceRepository::new(path);
    assert!(repo.list().is_empty());
}

#[test]
fn writes_fail_with_storage_error_when_database_is_missing() {
    let dir = TempDir::new().unwrap();
    let missing = dir.path().join("missing.dreamydb");
    let repo = WorkspaceRepository::new(missing.clone());
    assert!(repo.touch("D:\\A", at(1)).is_err());
    assert!(repo.relocate("D:\\A", "D:\\B", at(1)).is_err());
    assert!(repo.remove("D:\\A").is_err());
    assert!(!missing.exists());
}

#[test]
fn serializes_with_camel_case_keys() {
    let entry = RecentWorkspace {
        path: "D:\\A".to_string(),
        name: "A".to_string(),
        last_opened_at: "2026-01-01T00:00:00.000Z".to_string(),
    };
    let json = serde_json::to_string(&entry).unwrap();
    assert!(json.contains("\"lastOpenedAt\""));
}
