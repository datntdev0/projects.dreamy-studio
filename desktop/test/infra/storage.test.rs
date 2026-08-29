use super::*;
use rusqlite::ffi;
use std::error::Error;

fn sqlite_failure(code: i32) -> rusqlite::Error {
    rusqlite::Error::SqliteFailure(ffi::Error::new(code), None)
}

#[test]
fn errors_describe_themselves() {
    let migration = StorageError::Migration {
        version: "1".to_string(),
        seq: 2,
        name: "init".to_string(),
        source: rusqlite::Error::InvalidQuery,
    };

    assert_eq!(
        StorageError::NewerVersion.to_string(),
        "database was created by a newer version of the application"
    );
    assert_eq!(
        StorageError::Corrupt("bad".to_string()).to_string(),
        "database is corrupt: bad"
    );
    assert_eq!(
        StorageError::Cancelled.to_string(),
        "operation was cancelled"
    );
    assert_eq!(
        StorageError::InvalidScript("x".to_string()).to_string(),
        "invalid migration script: x"
    );
    assert!(
        migration
            .to_string()
            .starts_with("migration 1_2__init failed:")
    );
    assert!(
        StorageError::Io(std::io::Error::other("disk"))
            .to_string()
            .starts_with("io error:")
    );
    assert!(
        StorageError::Db(rusqlite::Error::InvalidQuery)
            .to_string()
            .starts_with("database error:")
    );
}

#[test]
fn only_wrapping_errors_expose_a_source() {
    let migration = StorageError::Migration {
        version: "1".to_string(),
        seq: 1,
        name: "init".to_string(),
        source: rusqlite::Error::InvalidQuery,
    };

    assert!(migration.source().is_some());
    assert!(
        StorageError::Io(std::io::Error::other("disk"))
            .source()
            .is_some()
    );
    assert!(
        StorageError::Db(rusqlite::Error::InvalidQuery)
            .source()
            .is_some()
    );
    assert!(StorageError::Cancelled.source().is_none());
    assert!(StorageError::NewerVersion.source().is_none());
}

#[test]
fn io_errors_convert_into_storage_errors() {
    let error: StorageError = std::io::Error::other("disk").into();

    assert!(matches!(error, StorageError::Io(_)));
}

#[test]
fn sqlite_errors_are_classified_as_corrupt_or_generic() {
    let not_a_database: StorageError = sqlite_failure(ffi::SQLITE_NOTADB).into();
    let corrupt: StorageError = sqlite_failure(ffi::SQLITE_CORRUPT).into();
    let busy: StorageError = sqlite_failure(ffi::SQLITE_BUSY).into();
    let other: StorageError = rusqlite::Error::InvalidQuery.into();

    assert!(matches!(not_a_database, StorageError::Corrupt(_)));
    assert!(matches!(corrupt, StorageError::Corrupt(_)));
    assert!(matches!(busy, StorageError::Db(_)));
    assert!(matches!(other, StorageError::Db(_)));
}
