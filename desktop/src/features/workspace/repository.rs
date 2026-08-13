use crate::infra::storage::StorageResult;
use crate::infra::storage::database::Database;
use crate::shared::path::NormalizedPath;
use chrono::DateTime;
use chrono::SecondsFormat;
use chrono::Utc;
use rusqlite::Connection;
use rusqlite::OptionalExtension;
use rusqlite::Row;
use rusqlite::Transaction;
use serde::Serialize;
use std::path::PathBuf;

pub const RECENT_WORKSPACE_LIMIT: usize = 5;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentWorkspace {
    pub path: String,
    pub name: String,
    pub last_opened_at: String,
}

pub fn format_timestamp(now: DateTime<Utc>) -> String {
    now.to_rfc3339_opts(SecondsFormat::Millis, true)
}

#[derive(Debug, Clone)]
pub struct WorkspaceRepository {
    db_path: PathBuf,
}

impl WorkspaceRepository {
    pub fn new(db_path: PathBuf) -> Self {
        Self { db_path }
    }

    pub fn list(&self) -> Vec<RecentWorkspace> {
        if !self.db_path.is_file() {
            return Vec::new();
        }
        match Database::open_read_only(&self.db_path) {
            Ok(db) => list_entries(db.connection()).unwrap_or_default(),
            Err(_) => Vec::new(),
        }
    }

    pub fn touch(&self, path: &str, now: DateTime<Utc>) -> StorageResult<()> {
        let db = self.open_writable()?;
        let target = NormalizedPath::new(path);
        upsert(db.connection(), &target, &format_timestamp(now))?;
        Ok(())
    }

    pub fn relocate(
        &self,
        old_path: &str,
        new_path: &str,
        now: DateTime<Utc>,
    ) -> StorageResult<()> {
        let mut db = self.open_writable()?;
        let tx = db.connection_mut().transaction()?;
        relocate_in(&tx, old_path, new_path, &format_timestamp(now))?;
        tx.commit()?;
        Ok(())
    }

    pub fn remove(&self, path: &str) -> StorageResult<()> {
        let db = self.open_writable()?;
        let key = NormalizedPath::new(path).key;
        db.connection()
            .execute("DELETE FROM app_workspaces WHERE path_key = ?1", [key])?;
        Ok(())
    }

    fn open_writable(&self) -> StorageResult<Database> {
        Database::open_existing(&self.db_path)
    }
}

fn list_entries(conn: &Connection) -> StorageResult<Vec<RecentWorkspace>> {
    let mut statement = conn.prepare(
        "SELECT path, name, last_opened_at FROM app_workspaces \
         ORDER BY last_opened_at DESC, id DESC LIMIT ?1",
    )?;
    let rows = statement.query_map([RECENT_WORKSPACE_LIMIT as i64], row_to_entry)?;
    let entries = rows.collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(entries)
}

fn row_to_entry(row: &Row) -> rusqlite::Result<RecentWorkspace> {
    Ok(RecentWorkspace {
        path: row.get(0)?,
        name: row.get(1)?,
        last_opened_at: row.get(2)?,
    })
}

fn first_column(row: &Row) -> rusqlite::Result<i64> {
    row.get(0)
}

fn upsert(conn: &Connection, target: &NormalizedPath, now: &str) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT INTO app_workspaces (path, path_key, name, last_opened_at) \
         VALUES (?1, ?2, ?3, ?4) \
         ON CONFLICT(path_key) DO UPDATE SET \
         path = excluded.path, name = excluded.name, last_opened_at = excluded.last_opened_at",
        rusqlite::params![target.path, target.key, target.name, now],
    )?;
    Ok(())
}

fn find_id(conn: &Connection, key: &str) -> rusqlite::Result<Option<i64>> {
    conn.query_row(
        "SELECT id FROM app_workspaces WHERE path_key = ?1",
        [key],
        first_column,
    )
    .optional()
}

fn update_row(
    conn: &Connection,
    id: i64,
    target: &NormalizedPath,
    now: &str,
) -> rusqlite::Result<()> {
    conn.execute(
        "UPDATE app_workspaces SET path = ?1, path_key = ?2, name = ?3, last_opened_at = ?4 \
         WHERE id = ?5",
        rusqlite::params![target.path, target.key, target.name, now, id],
    )?;
    Ok(())
}

fn relocate_in(
    tx: &Transaction,
    old_path: &str,
    new_path: &str,
    now: &str,
) -> rusqlite::Result<()> {
    let old = NormalizedPath::new(old_path);
    let new = NormalizedPath::new(new_path);
    let Some(old_id) = find_id(tx, &old.key)? else {
        return upsert(tx, &new, now);
    };
    match find_id(tx, &new.key)? {
        Some(existing_id) if existing_id != old_id => {
            tx.execute("DELETE FROM app_workspaces WHERE id = ?1", [old_id])?;
            update_row(tx, existing_id, &new, now)
        }
        _ => update_row(tx, old_id, &new, now),
    }
}

#[cfg(test)]
mod tests {
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
}
