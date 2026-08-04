use crate::infra::storage::StorageError;
use crate::infra::storage::StorageResult;
use rusqlite::Connection;
use rusqlite::InterruptHandle;
use rusqlite::OpenFlags;
use std::path::Path;

pub struct Database {
    conn: Connection,
}

impl Database {
    pub fn create(path: &Path) -> StorageResult<Self> {
        let flags = OpenFlags::SQLITE_OPEN_READ_WRITE
            | OpenFlags::SQLITE_OPEN_CREATE
            | OpenFlags::SQLITE_OPEN_NO_MUTEX;
        let conn = Connection::open_with_flags(path, flags)?;
        Ok(Self { conn })
    }

    pub fn open_existing(path: &Path) -> StorageResult<Self> {
        let flags = OpenFlags::SQLITE_OPEN_READ_WRITE | OpenFlags::SQLITE_OPEN_NO_MUTEX;
        let conn = Connection::open_with_flags(path, flags)?;
        let result: String = conn.query_row("PRAGMA quick_check", [], |row| row.get(0))?;
        if result != "ok" {
            return Err(StorageError::Corrupt(result));
        }
        Ok(Self { conn })
    }

    pub fn open_read_only(path: &Path) -> StorageResult<Self> {
        let flags = OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX;
        let conn = Connection::open_with_flags(path, flags)?;
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

    pub fn into_connection(self) -> Connection {
        self.conn
    }
}
