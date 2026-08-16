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
#[path = "../../../test/features/workspace/repository.test.rs"]
mod tests;
