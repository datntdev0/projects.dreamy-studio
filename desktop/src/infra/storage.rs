pub mod database;
pub mod migrator;

use rusqlite::ErrorCode;
use std::fmt;

#[derive(Debug)]
pub enum StorageError {
    NewerVersion,
    Corrupt(String),
    Cancelled,
    InvalidScript(String),
    Migration {
        version: String,
        seq: i64,
        name: String,
        source: rusqlite::Error,
    },
    Io(std::io::Error),
    Db(rusqlite::Error),
}

pub type StorageResult<T> = Result<T, StorageError>;

impl fmt::Display for StorageError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            StorageError::NewerVersion => {
                write!(
                    f,
                    "database was created by a newer version of the application"
                )
            }
            StorageError::Corrupt(detail) => write!(f, "database is corrupt: {detail}"),
            StorageError::Cancelled => write!(f, "operation was cancelled"),
            StorageError::InvalidScript(detail) => write!(f, "invalid migration script: {detail}"),
            StorageError::Migration {
                version,
                seq,
                name,
                source,
            } => write!(f, "migration {version}_{seq}__{name} failed: {source}"),
            StorageError::Io(source) => write!(f, "io error: {source}"),
            StorageError::Db(source) => write!(f, "database error: {source}"),
        }
    }
}

impl std::error::Error for StorageError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            StorageError::Migration { source, .. } => Some(source),
            StorageError::Io(source) => Some(source),
            StorageError::Db(source) => Some(source),
            _ => None,
        }
    }
}

impl From<std::io::Error> for StorageError {
    fn from(source: std::io::Error) -> Self {
        StorageError::Io(source)
    }
}

impl From<rusqlite::Error> for StorageError {
    fn from(source: rusqlite::Error) -> Self {
        match source.sqlite_error_code() {
            Some(ErrorCode::NotADatabase) | Some(ErrorCode::DatabaseCorrupt) => {
                StorageError::Corrupt(source.to_string())
            }
            _ => StorageError::Db(source),
        }
    }
}

#[cfg(test)]
#[path = "../../test/infra/storage.test.rs"]
mod tests;
