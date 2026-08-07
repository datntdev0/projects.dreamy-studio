use crate::infra::storage::StorageError;
use crate::infra::storage::StorageResult;
use rusqlite::Connection;
use rusqlite::InterruptHandle;
use rusqlite::OpenFlags;
use std::path::Path;
use std::time::Duration;

const BUSY_TIMEOUT: Duration = Duration::from_secs(5);

pub struct Database {
    conn: Connection,
}

impl Database {
    pub fn create(path: &Path) -> StorageResult<Self> {
        let flags = OpenFlags::SQLITE_OPEN_READ_WRITE
            | OpenFlags::SQLITE_OPEN_CREATE
            | OpenFlags::SQLITE_OPEN_NO_MUTEX;
        let conn = Connection::open_with_flags(path, flags)?;
        configure(&conn)?;
        Ok(Self { conn })
    }

    pub fn open_existing(path: &Path) -> StorageResult<Self> {
        let flags = OpenFlags::SQLITE_OPEN_READ_WRITE | OpenFlags::SQLITE_OPEN_NO_MUTEX;
        let conn = Connection::open_with_flags(path, flags)?;
        let result: String = conn.query_row("PRAGMA quick_check", [], |row| row.get(0))?;
        if result != "ok" {
            return Err(StorageError::Corrupt(result));
        }
        configure(&conn)?;
        Ok(Self { conn })
    }

    pub fn open_read_write(path: &Path) -> StorageResult<Self> {
        let flags = OpenFlags::SQLITE_OPEN_READ_WRITE | OpenFlags::SQLITE_OPEN_NO_MUTEX;
        let conn = Connection::open_with_flags(path, flags)?;
        configure(&conn)?;
        Ok(Self { conn })
    }

    pub fn open_read_only(path: &Path) -> StorageResult<Self> {
        let flags = OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX;
        let conn = Connection::open_with_flags(path, flags)?;
        configure(&conn)?;
        Ok(Self { conn })
    }

    pub fn interrupt_handle(&self) -> InterruptHandle {
        self.conn.get_interrupt_handle()
    }

    pub fn connection(&self) -> &Connection {
        &self.conn
    }

    pub fn connection_mut(&mut self) -> &mut Connection {
        &mut self.conn
    }
}

fn configure(conn: &Connection) -> StorageResult<()> {
    conn.pragma_update(None, "foreign_keys", true)?;
    conn.busy_timeout(BUSY_TIMEOUT)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    const PARENT_CHILD: &str = "CREATE TABLE parent (id INTEGER PRIMARY KEY);         CREATE TABLE child (id INTEGER PRIMARY KEY, parent_id INTEGER NOT NULL         REFERENCES parent(id) ON DELETE CASCADE);";

    fn foreign_keys_flag(db: &Database) -> i64 {
        db.connection()
            .query_row("PRAGMA foreign_keys", [], |row| row.get(0))
            .unwrap()
    }

    fn count(db: &Database, table: &str) -> i64 {
        db.connection()
            .query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |row| {
                row.get(0)
            })
            .unwrap()
    }

    #[test]
    fn create_enables_foreign_keys_and_cascades_deletes() {
        let dir = TempDir::new().unwrap();
        let db = Database::create(&dir.path().join("a.db")).unwrap();
        db.connection().execute_batch(PARENT_CHILD).unwrap();
        db.connection()
            .execute_batch("INSERT INTO parent (id) VALUES (1); INSERT INTO child (id, parent_id) VALUES (1, 1);")
            .unwrap();

        db.connection()
            .execute("DELETE FROM parent WHERE id = 1", [])
            .unwrap();

        assert_eq!(foreign_keys_flag(&db), 1);
        assert_eq!(count(&db, "child"), 0);
    }

    #[test]
    fn create_rejects_rows_with_a_missing_parent() {
        let dir = TempDir::new().unwrap();
        let db = Database::create(&dir.path().join("a.db")).unwrap();
        db.connection().execute_batch(PARENT_CHILD).unwrap();

        let result = db
            .connection()
            .execute("INSERT INTO child (id, parent_id) VALUES (1, 99)", []);

        assert!(result.is_err());
    }

    #[test]
    fn open_existing_and_read_only_enable_foreign_keys() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("a.db");
        drop(Database::create(&path).unwrap());

        let existing = Database::open_existing(&path).unwrap();
        let read_only = Database::open_read_only(&path).unwrap();

        assert_eq!(foreign_keys_flag(&existing), 1);
        assert_eq!(foreign_keys_flag(&read_only), 1);
    }
}
