use crate::infra::storage::database::Database;
use rusqlite::Connection;
use serde::Serialize;
use std::fs;
use std::io::ErrorKind;
use std::path::Path;

pub const WORKSPACE_DB_FILE: &str = "workspace.dreamydb";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum StatusKind {
    Ok,
    NotFound,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum NotFoundReason {
    Missing,
    NotADirectory,
    NoAccess,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderStatus {
    pub status: StatusKind,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<NotFoundReason>,
}

impl FolderStatus {
    pub fn ok() -> Self {
        Self {
            status: StatusKind::Ok,
            reason: None,
        }
    }

    pub fn not_found(reason: NotFoundReason) -> Self {
        Self {
            status: StatusKind::NotFound,
            reason: Some(reason),
        }
    }
}

#[derive(Debug, Clone, Copy, Default)]
pub struct WorkspaceInspector;

impl WorkspaceInspector {
    pub fn status(&self, path: &Path) -> FolderStatus {
        folder_status(path)
    }

    pub fn project_count(&self, workspace_dir: &Path) -> u64 {
        count_workspace_projects(workspace_dir)
    }

    pub fn directory_size(&self, path: &Path) -> u64 {
        total_size(path)
    }
}

fn folder_status(path: &Path) -> FolderStatus {
    let metadata = match fs::metadata(path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == ErrorKind::NotFound => {
            return FolderStatus::not_found(NotFoundReason::Missing);
        }
        Err(_) => return FolderStatus::not_found(NotFoundReason::NoAccess),
    };
    if !metadata.is_dir() {
        return FolderStatus::not_found(NotFoundReason::NotADirectory);
    }
    match fs::read_dir(path) {
        Ok(_) => FolderStatus::ok(),
        Err(_) => FolderStatus::not_found(NotFoundReason::NoAccess),
    }
}

fn count_workspace_projects(workspace_dir: &Path) -> u64 {
    let db_path = workspace_dir.join(WORKSPACE_DB_FILE);
    if !db_path.is_file() {
        return 0;
    }
    let Ok(db) = Database::open_read_only(&db_path) else {
        return 0;
    };
    count_projects(db.connection()).unwrap_or(0)
}

fn count_projects(conn: &Connection) -> rusqlite::Result<u64> {
    let exists: bool = conn.query_row(
        "SELECT EXISTS (SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'ws_projects')",
        [],
        first_bool,
    )?;
    if !exists {
        return Ok(0);
    }
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM ws_projects", [], first_int)?;
    Ok(u64::try_from(count).unwrap_or(0))
}

fn first_bool(row: &rusqlite::Row) -> rusqlite::Result<bool> {
    row.get(0)
}

fn first_int(row: &rusqlite::Row) -> rusqlite::Result<i64> {
    row.get(0)
}

fn total_size(path: &Path) -> u64 {
    let Ok(entries) = fs::read_dir(path) else {
        return 0;
    };
    let mut total = 0u64;
    for entry in entries.flatten() {
        total = total.saturating_add(entry_size(&entry));
    }
    total
}

fn entry_size(entry: &fs::DirEntry) -> u64 {
    let Ok(file_type) = entry.file_type() else {
        return 0;
    };
    if file_type.is_symlink() {
        return 0;
    }
    if file_type.is_dir() {
        return total_size(&entry.path());
    }
    match entry.metadata() {
        Ok(metadata) => metadata.len(),
        Err(_) => 0,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn make_workspace_db(dir: &Path, with_projects: bool, rows: u32) {
        let conn = Connection::open(dir.join(WORKSPACE_DB_FILE)).unwrap();
        conn.execute_batch("CREATE TABLE other (id INTEGER);")
            .unwrap();
        if with_projects {
            conn.execute_batch("CREATE TABLE ws_projects (id INTEGER PRIMARY KEY);")
                .unwrap();
            for _ in 0..rows {
                conn.execute("INSERT INTO ws_projects DEFAULT VALUES", [])
                    .unwrap();
            }
        }
    }

    #[cfg(unix)]
    fn try_symlink_dir(target: &Path, link: &Path) -> bool {
        std::os::unix::fs::symlink(target, link).is_ok()
    }

    #[cfg(windows)]
    fn try_symlink_dir(target: &Path, link: &Path) -> bool {
        std::os::windows::fs::symlink_dir(target, link).is_ok()
    }

    #[test]
    fn status_missing() {
        let dir = TempDir::new().unwrap();
        let result = WorkspaceInspector.status(&dir.path().join("nope"));
        assert_eq!(result, FolderStatus::not_found(NotFoundReason::Missing));
    }

    #[test]
    fn status_file_is_not_a_directory() {
        let dir = TempDir::new().unwrap();
        let file = dir.path().join("file.txt");
        fs::write(&file, b"x").unwrap();
        assert_eq!(
            WorkspaceInspector.status(&file),
            FolderStatus::not_found(NotFoundReason::NotADirectory)
        );
    }

    #[test]
    fn status_ok_for_directory() {
        let dir = TempDir::new().unwrap();
        assert_eq!(WorkspaceInspector.status(dir.path()), FolderStatus::ok());
    }

    #[cfg(unix)]
    #[test]
    fn status_no_access_for_unreadable_directory() {
        use std::os::unix::fs::PermissionsExt;
        let dir = TempDir::new().unwrap();
        let locked = dir.path().join("locked");
        fs::create_dir(&locked).unwrap();
        fs::set_permissions(&locked, fs::Permissions::from_mode(0o000)).unwrap();
        let result = WorkspaceInspector.status(&locked);
        fs::set_permissions(&locked, fs::Permissions::from_mode(0o755)).unwrap();
        let running_as_root = fs::read_dir(&locked).is_ok() && result == FolderStatus::ok();
        if !running_as_root {
            assert_eq!(result, FolderStatus::not_found(NotFoundReason::NoAccess));
        }
    }

    #[test]
    fn status_serializes_to_contract_values() {
        let ok = serde_json::to_string(&FolderStatus::ok()).unwrap();
        assert_eq!(ok, "{\"status\":\"ok\"}");
        let missing = serde_json::to_string(&FolderStatus::not_found(NotFoundReason::Missing));
        assert_eq!(
            missing.unwrap(),
            "{\"status\":\"not_found\",\"reason\":\"missing\"}"
        );
        let not_dir =
            serde_json::to_string(&FolderStatus::not_found(NotFoundReason::NotADirectory));
        assert!(not_dir.unwrap().contains("\"not_a_directory\""));
        let no_access = serde_json::to_string(&FolderStatus::not_found(NotFoundReason::NoAccess));
        assert!(no_access.unwrap().contains("\"no_access\""));
    }

    #[test]
    fn project_count_is_zero_without_database() {
        let dir = TempDir::new().unwrap();
        assert_eq!(WorkspaceInspector.project_count(dir.path()), 0);
        assert!(!dir.path().join(WORKSPACE_DB_FILE).exists());
    }

    #[test]
    fn project_count_is_zero_for_unreadable_database() {
        let dir = TempDir::new().unwrap();
        fs::write(
            dir.path().join(WORKSPACE_DB_FILE),
            b"definitely not sqlite data",
        )
        .unwrap();
        assert_eq!(WorkspaceInspector.project_count(dir.path()), 0);
    }

    #[test]
    fn project_count_is_zero_without_projects_table() {
        let dir = TempDir::new().unwrap();
        make_workspace_db(dir.path(), false, 0);
        assert_eq!(WorkspaceInspector.project_count(dir.path()), 0);
    }

    #[test]
    fn project_count_counts_rows() {
        let dir = TempDir::new().unwrap();
        make_workspace_db(dir.path(), true, 3);
        assert_eq!(WorkspaceInspector.project_count(dir.path()), 3);
    }

    #[test]
    fn directory_size_sums_nested_files() {
        let dir = TempDir::new().unwrap();
        fs::write(dir.path().join("a.txt"), vec![0u8; 10]).unwrap();
        let nested = dir.path().join("sub").join("deeper");
        fs::create_dir_all(&nested).unwrap();
        fs::write(nested.join("b.txt"), vec![0u8; 25]).unwrap();
        fs::write(dir.path().join("sub").join("c.txt"), vec![0u8; 5]).unwrap();
        assert_eq!(WorkspaceInspector.directory_size(dir.path()), 40);
    }

    #[test]
    fn directory_size_of_missing_path_is_zero() {
        let dir = TempDir::new().unwrap();
        assert_eq!(
            WorkspaceInspector.directory_size(&dir.path().join("nope")),
            0
        );
    }

    #[test]
    fn directory_size_skips_symlinks() {
        let dir = TempDir::new().unwrap();
        let outside = TempDir::new().unwrap();
        fs::write(outside.path().join("big.bin"), vec![0u8; 1000]).unwrap();
        fs::write(dir.path().join("a.txt"), vec![0u8; 7]).unwrap();
        if try_symlink_dir(outside.path(), &dir.path().join("link")) {
            assert_eq!(WorkspaceInspector.directory_size(dir.path()), 7);
        }
    }

    #[cfg(unix)]
    #[test]
    fn directory_size_skips_unreadable_children() {
        use std::os::unix::fs::PermissionsExt;
        let dir = TempDir::new().unwrap();
        fs::write(dir.path().join("a.txt"), vec![0u8; 7]).unwrap();
        let locked = dir.path().join("locked");
        fs::create_dir(&locked).unwrap();
        fs::write(locked.join("hidden.bin"), vec![0u8; 100]).unwrap();
        fs::set_permissions(&locked, fs::Permissions::from_mode(0o000)).unwrap();
        let size = WorkspaceInspector.directory_size(dir.path());
        fs::set_permissions(&locked, fs::Permissions::from_mode(0o755)).unwrap();
        assert!(size == 7 || size == 107);
    }
}
