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
#[path = "../../../test/features/workspace/inspector.test.rs"]
mod tests;
