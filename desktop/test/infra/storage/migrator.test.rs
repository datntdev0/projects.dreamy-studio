use super::*;
use crate::infra::storage::database::Database;
use std::fs;
use std::path::Path;
use std::path::PathBuf;
use tempfile::TempDir;

fn script(version: &str, seq: i64, name: &str, sql: &str) -> Script {
    Script::new(version, seq, name, sql).unwrap()
}

fn history_script() -> Script {
    script(
        "0.0.0",
        0,
        "history",
        "CREATE TABLE sys_migration_history (version TEXT NOT NULL, seq INTEGER NOT NULL, \
         name TEXT NOT NULL, applied_at TEXT NOT NULL, PRIMARY KEY (version, seq));",
    )
}

fn open_new(dir: &TempDir) -> (PathBuf, Database) {
    let path = dir.path().join("test.dreamydb");
    let db = Database::create(&path).unwrap();
    (path, db)
}

fn table_exists(conn: &Connection, name: &str) -> bool {
    conn.query_row(
        "SELECT EXISTS (SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?1)",
        [name],
        |row| row.get(0),
    )
    .unwrap()
}

fn history_count(conn: &Connection) -> i64 {
    conn.query_row("SELECT COUNT(*) FROM sys_migration_history", [], |row| {
        row.get(0)
    })
    .unwrap()
}

fn applied_at_values(conn: &Connection) -> Vec<String> {
    conn.prepare("SELECT applied_at FROM sys_migration_history ORDER BY seq")
        .unwrap()
        .query_map([], |row| row.get(0))
        .unwrap()
        .map(|row| row.unwrap())
        .collect()
}

fn file_bytes(path: &Path) -> Vec<u8> {
    fs::read(path).unwrap()
}

#[test]
fn parses_script_file_names() {
    let parsed = Script::from_file("0.10.2_3__app_workspaces_table.sql", "SELECT 1;").unwrap();
    assert_eq!(parsed.version.to_string(), "0.10.2");
    assert_eq!(parsed.seq, 3);
    assert_eq!(parsed.name, "app_workspaces_table");
    assert!(Script::from_file("bad.sql", "").is_err());
    assert!(Script::from_file("1.0_1__x.sql", "").is_err());
    assert!(Script::from_file("1.0.0_x__x.sql", "").is_err());
}

#[test]
fn orders_by_numeric_version_then_seq() {
    let dir = TempDir::new().unwrap();
    let (_, mut db) = open_new(&dir);
    let scripts = vec![
        script("0.10.0", 0, "c", "CREATE TABLE c (x INTEGER);"),
        history_script(),
        script("0.2.0", 1, "b", "CREATE TABLE b (x INTEGER);"),
        script("0.2.0", 0, "a", "CREATE TABLE a (x INTEGER);"),
    ];
    let cancel = AtomicBool::new(false);
    Migrator::migrate(db.connection_mut(), &scripts, &cancel).unwrap();
    let mut statement = db
        .connection()
        .prepare("SELECT version, seq FROM sys_migration_history ORDER BY rowid")
        .unwrap();
    let rows: Vec<(String, i64)> = statement
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
        .unwrap()
        .map(|row| row.unwrap())
        .collect();
    assert_eq!(
        rows,
        vec![
            ("0.0.0".to_string(), 0),
            ("0.2.0".to_string(), 0),
            ("0.2.0".to_string(), 1),
            ("0.10.0".to_string(), 0),
        ]
    );
}

#[test]
fn applies_embedded_app_scripts_from_empty() {
    let dir = TempDir::new().unwrap();
    let (_, mut db) = open_new(&dir);
    let cancel = AtomicBool::new(false);
    Migrator::migrate(db.connection_mut(), &app_scripts().unwrap(), &cancel).unwrap();
    let conn = db.connection();
    assert!(table_exists(conn, "sys_migration_history"));
    assert!(table_exists(conn, "app_workspaces"));
    assert_eq!(history_count(conn), 2);
    let applied_at = applied_at_values(conn);
    assert_eq!(applied_at[0].len(), 20);
    assert!(applied_at[0].ends_with('Z'));
    let index_exists: bool = conn
        .query_row(
            "SELECT EXISTS (SELECT 1 FROM sqlite_master WHERE type = 'index' \
             AND name = 'idx_app_workspaces_last_opened_at')",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert!(index_exists);
}

#[test]
fn applies_embedded_workspace_scripts_from_empty() {
    let dir = TempDir::new().unwrap();
    let (_, mut db) = open_new(&dir);
    let cancel = AtomicBool::new(false);
    Migrator::migrate(db.connection_mut(), &workspace_scripts().unwrap(), &cancel).unwrap();
    assert!(table_exists(db.connection(), "sys_migration_history"));
    assert_eq!(history_count(db.connection()), 10);
    for table in [
        "ws_novels",
        "ws_novel_chapters",
        "ws_tags",
        "ws_projects",
        "ws_library_collections",
        "ws_library_sounds",
        "ws_library_videos",
        "ws_library_prompts",
    ] {
        assert!(table_exists(db.connection(), table), "{table}");
    }
}

#[test]
fn rerun_changes_nothing() {
    let dir = TempDir::new().unwrap();
    let (_, mut db) = open_new(&dir);
    let scripts = app_scripts().unwrap();
    let cancel = AtomicBool::new(false);
    Migrator::migrate(db.connection_mut(), &scripts, &cancel).unwrap();
    db.connection()
        .execute(
            "INSERT INTO app_workspaces (path, path_key, name, last_opened_at) \
             VALUES ('C:\\a', 'c:\\a', 'a', '2026-01-01T00:00:00Z')",
            [],
        )
        .unwrap();
    let before = applied_at_values(db.connection());
    Migrator::migrate(db.connection_mut(), &scripts, &cancel).unwrap();
    assert_eq!(before, applied_at_values(db.connection()));
    assert_eq!(history_count(db.connection()), 2);
    let rows: i64 = db
        .connection()
        .query_row("SELECT COUNT(*) FROM app_workspaces", [], |row| row.get(0))
        .unwrap();
    assert_eq!(rows, 1);
}

#[test]
fn incremental_upgrade_applies_only_new_scripts() {
    let dir = TempDir::new().unwrap();
    let (_, mut db) = open_new(&dir);
    let cancel = AtomicBool::new(false);
    let mut scripts = vec![history_script()];
    Migrator::migrate(db.connection_mut(), &scripts, &cancel).unwrap();
    scripts.push(script("0.1.0", 0, "t", "CREATE TABLE t (x INTEGER);"));
    Migrator::migrate(db.connection_mut(), &scripts, &cancel).unwrap();
    assert!(table_exists(db.connection(), "t"));
    assert_eq!(history_count(db.connection()), 2);
}

#[test]
fn detects_newer_version_and_changes_nothing() {
    let dir = TempDir::new().unwrap();
    let (path, mut db) = open_new(&dir);
    let cancel = AtomicBool::new(false);
    let newer = vec![
        history_script(),
        script("0.1.0", 0, "future", "CREATE TABLE future (x INTEGER);"),
    ];
    Migrator::migrate(db.connection_mut(), &newer, &cancel).unwrap();
    drop(db);
    let before = file_bytes(&path);

    let mut db = Database::open_existing(&path).unwrap();
    let older = vec![
        history_script(),
        script("0.0.0", 1, "extra", "CREATE TABLE extra (x INTEGER);"),
    ];
    let result = Migrator::migrate(db.connection_mut(), &older, &cancel);
    assert!(matches!(result, Err(StorageError::NewerVersion)));
    assert!(!table_exists(db.connection(), "extra"));
    assert_eq!(history_count(db.connection()), 2);
    drop(db);
    assert_eq!(before, file_bytes(&path));
}

#[test]
fn script_failure_rolls_back_everything_from_empty() {
    let dir = TempDir::new().unwrap();
    let (_, mut db) = open_new(&dir);
    let cancel = AtomicBool::new(false);
    let scripts = vec![
        history_script(),
        script("0.0.0", 1, "ok", "CREATE TABLE ok_table (x INTEGER);"),
        script(
            "0.0.0",
            2,
            "bad",
            "CREATE TABLE bad_table (x INTEGER); NOT VALID SQL;",
        ),
    ];
    let result = Migrator::migrate(db.connection_mut(), &scripts, &cancel);
    match result {
        Err(StorageError::Migration {
            version, seq, name, ..
        }) => {
            assert_eq!(version, "0.0.0");
            assert_eq!(seq, 2);
            assert_eq!(name, "bad");
        }
        other => panic!("unexpected result: {other:?}"),
    }
    assert!(!table_exists(db.connection(), "sys_migration_history"));
    assert!(!table_exists(db.connection(), "ok_table"));
    assert!(!table_exists(db.connection(), "bad_table"));
}

#[test]
fn script_failure_keeps_existing_data() {
    let dir = TempDir::new().unwrap();
    let (_, mut db) = open_new(&dir);
    let cancel = AtomicBool::new(false);
    let base = vec![
        history_script(),
        script(
            "0.0.0",
            1,
            "data",
            "CREATE TABLE data (x INTEGER); INSERT INTO data VALUES (42);",
        ),
    ];
    Migrator::migrate(db.connection_mut(), &base, &cancel).unwrap();

    let mut upgrade = base.clone();
    upgrade.push(script(
        "0.1.0",
        0,
        "new_table",
        "CREATE TABLE new_table (x INTEGER); UPDATE data SET x = 0;",
    ));
    upgrade.push(script(
        "0.1.0",
        1,
        "bad",
        "INSERT INTO missing_table VALUES (1);",
    ));
    let result = Migrator::migrate(db.connection_mut(), &upgrade, &cancel);
    assert!(matches!(result, Err(StorageError::Migration { .. })));
    let value: i64 = db
        .connection()
        .query_row("SELECT x FROM data", [], |row| row.get(0))
        .unwrap();
    assert_eq!(value, 42);
    assert!(!table_exists(db.connection(), "new_table"));
    assert_eq!(history_count(db.connection()), 2);
}

#[test]
fn cancel_mid_run_rolls_back_and_keeps_data() {
    let dir = TempDir::new().unwrap();
    let (_, mut db) = open_new(&dir);
    let cancel = AtomicBool::new(false);
    let base = vec![
        history_script(),
        script(
            "0.0.0",
            1,
            "data",
            "CREATE TABLE data (x INTEGER); INSERT INTO data VALUES (7);",
        ),
    ];
    Migrator::migrate(db.connection_mut(), &base, &cancel).unwrap();

    let mut upgrade = base.clone();
    upgrade.push(script(
        "0.1.0",
        0,
        "first",
        "CREATE TABLE first_table (x INTEGER); UPDATE data SET x = 1;",
    ));
    upgrade.push(script(
        "0.1.0",
        1,
        "second",
        "CREATE TABLE second_table (x INTEGER);",
    ));
    let result = Migrator::run(db.connection_mut(), &upgrade, &cancel, |applied| {
        if applied.name == "first" {
            cancel.store(true, Ordering::SeqCst);
        }
    });
    assert!(matches!(result, Err(StorageError::Cancelled)));
    let value: i64 = db
        .connection()
        .query_row("SELECT x FROM data", [], |row| row.get(0))
        .unwrap();
    assert_eq!(value, 7);
    assert!(!table_exists(db.connection(), "first_table"));
    assert!(!table_exists(db.connection(), "second_table"));
    assert_eq!(history_count(db.connection()), 2);
}

#[test]
fn cancel_after_last_script_still_rolls_back() {
    let dir = TempDir::new().unwrap();
    let (_, mut db) = open_new(&dir);
    let cancel = AtomicBool::new(false);
    let scripts = vec![history_script()];
    let result = Migrator::run(db.connection_mut(), &scripts, &cancel, |_| {
        cancel.store(true, Ordering::SeqCst);
    });
    assert!(matches!(result, Err(StorageError::Cancelled)));
    assert!(!table_exists(db.connection(), "sys_migration_history"));
}

#[test]
fn cancelled_before_start_changes_nothing() {
    let dir = TempDir::new().unwrap();
    let (_, mut db) = open_new(&dir);
    let cancel = AtomicBool::new(true);
    let result = Migrator::migrate(db.connection_mut(), &app_scripts().unwrap(), &cancel);
    assert!(matches!(result, Err(StorageError::Cancelled)));
    assert!(!table_exists(db.connection(), "sys_migration_history"));
}

#[test]
fn corrupt_file_reports_corrupt_and_is_untouched() {
    let dir = TempDir::new().unwrap();
    let path = dir.path().join("corrupt.dreamydb");
    let garbage: Vec<u8> = (0..8192u32)
        .map(|i| ((i.wrapping_mul(2654435761) >> 13) as u8) | 0x80)
        .collect();
    fs::write(&path, &garbage).unwrap();

    let result = Database::open_existing(&path);
    assert!(matches!(result, Err(StorageError::Corrupt(_))));
    assert!(path.exists());
    assert_eq!(file_bytes(&path), garbage);
}

#[test]
fn open_existing_rejects_missing_file_without_creating_it() {
    let dir = TempDir::new().unwrap();
    let path = dir.path().join("missing.dreamydb");
    assert!(Database::open_existing(&path).is_err());
    assert!(!path.exists());
}

#[test]
fn open_existing_accepts_valid_database_with_single_file() {
    let dir = TempDir::new().unwrap();
    let (path, mut db) = open_new(&dir);
    let cancel = AtomicBool::new(false);
    Migrator::migrate(db.connection_mut(), &app_scripts().unwrap(), &cancel).unwrap();
    drop(db);
    let db = Database::open_existing(&path).unwrap();
    assert!(table_exists(db.connection(), "app_workspaces"));
    drop(db);
    assert_eq!(fs::read_dir(dir.path()).unwrap().count(), 1);
}

#[test]
fn open_read_only_rejects_writes() {
    let dir = TempDir::new().unwrap();
    let (path, mut db) = open_new(&dir);
    let cancel = AtomicBool::new(false);
    Migrator::migrate(db.connection_mut(), &workspace_scripts().unwrap(), &cancel).unwrap();
    drop(db);
    let db = Database::open_read_only(&path).unwrap();
    assert!(
        db.connection()
            .execute("CREATE TABLE x (y INTEGER)", [])
            .is_err()
    );
    let _handle = db.interrupt_handle();
}
