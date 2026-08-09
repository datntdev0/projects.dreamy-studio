use crate::infra::storage::StorageError;
use crate::infra::storage::StorageResult;
use include_dir::Dir;
use include_dir::include_dir;
use rusqlite::Connection;
use rusqlite::ErrorCode;
use rusqlite::TransactionBehavior;
use std::fmt;
use std::sync::atomic::AtomicBool;
use std::sync::atomic::Ordering;

static APP_MIGRATIONS: Dir<'static> =
    include_dir!("$CARGO_MANIFEST_DIR/src/infra/storage/migrations/app");
static WS_MIGRATIONS: Dir<'static> =
    include_dir!("$CARGO_MANIFEST_DIR/src/infra/storage/migrations/ws");

const HISTORY_TABLE: &str = "sys_migration_history";

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub struct Version {
    major: u64,
    minor: u64,
    patch: u64,
}

impl Version {
    pub fn parse(text: &str) -> StorageResult<Self> {
        let invalid = || StorageError::InvalidScript(format!("invalid version '{text}'"));
        let mut parts = text.split('.');
        let mut next = || -> StorageResult<u64> {
            parts
                .next()
                .and_then(|part| part.parse::<u64>().ok())
                .ok_or_else(invalid)
        };
        let major = next()?;
        let minor = next()?;
        let patch = next()?;
        if parts.next().is_some() {
            return Err(invalid());
        }
        Ok(Self {
            major,
            minor,
            patch,
        })
    }
}

impl fmt::Display for Version {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}.{}.{}", self.major, self.minor, self.patch)
    }
}

#[derive(Debug, Clone)]
pub struct Script {
    pub version: Version,
    pub seq: i64,
    pub name: String,
    pub sql: String,
}

impl Script {
    pub fn new(version: &str, seq: i64, name: &str, sql: &str) -> StorageResult<Self> {
        Ok(Self {
            version: Version::parse(version)?,
            seq,
            name: name.to_string(),
            sql: sql.to_string(),
        })
    }

    pub fn from_file(file_name: &str, sql: &str) -> StorageResult<Self> {
        let invalid = || StorageError::InvalidScript(file_name.to_string());
        let stem = file_name.strip_suffix(".sql").ok_or_else(invalid)?;
        let (head, name) = stem.split_once("__").ok_or_else(invalid)?;
        let (version, seq) = head.split_once('_').ok_or_else(invalid)?;
        let seq = seq.parse::<i64>().map_err(|_| invalid())?;
        Self::new(version, seq, name, sql)
    }

    pub fn from_dir(dir: &Dir<'_>) -> StorageResult<Vec<Self>> {
        let mut scripts = Vec::new();
        for file in dir.files() {
            let file_name = file
                .path()
                .file_name()
                .and_then(|name| name.to_str())
                .ok_or_else(|| StorageError::InvalidScript(file.path().display().to_string()))?;
            let sql = file
                .contents_utf8()
                .ok_or_else(|| StorageError::InvalidScript(file_name.to_string()))?;
            scripts.push(Self::from_file(file_name, sql)?);
        }
        scripts.sort_by_key(|script| (script.version, script.seq));
        Ok(scripts)
    }
}

pub fn app_scripts() -> StorageResult<Vec<Script>> {
    Script::from_dir(&APP_MIGRATIONS)
}

pub fn workspace_scripts() -> StorageResult<Vec<Script>> {
    Script::from_dir(&WS_MIGRATIONS)
}

pub struct Migrator;

impl Migrator {
    pub fn migrate(
        conn: &mut Connection,
        scripts: &[Script],
        cancel: &AtomicBool,
    ) -> StorageResult<()> {
        Self::run(conn, scripts, cancel, |_| {})
    }

    fn run<F: FnMut(&Script)>(
        conn: &mut Connection,
        scripts: &[Script],
        cancel: &AtomicBool,
        mut after_script: F,
    ) -> StorageResult<()> {
        let mut ordered: Vec<&Script> = scripts.iter().collect();
        ordered.sort_by_key(|script| (script.version, script.seq));

        let tx = conn
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(|error| map_db(error, cancel))?;
        match Self::apply(&tx, &ordered, cancel, &mut after_script) {
            Ok(()) => tx.commit().map_err(|error| map_db(error, cancel)),
            Err(error) => {
                let _ = tx.rollback();
                Err(error)
            }
        }
    }

    fn apply<F: FnMut(&Script)>(
        conn: &Connection,
        ordered: &[&Script],
        cancel: &AtomicBool,
        after_script: &mut F,
    ) -> StorageResult<()> {
        let applied = read_history(conn).map_err(|error| map_db(error, cancel))?;
        let is_known = |version: &str, seq: i64| {
            ordered
                .iter()
                .any(|script| script.seq == seq && script.version.to_string() == version)
        };
        if applied
            .iter()
            .any(|(version, seq)| !is_known(version.as_str(), *seq))
        {
            return Err(StorageError::NewerVersion);
        }

        for script in ordered {
            let version = script.version.to_string();
            if applied
                .iter()
                .any(|(applied_version, seq)| *seq == script.seq && *applied_version == version)
            {
                continue;
            }
            if cancel.load(Ordering::SeqCst) {
                return Err(StorageError::Cancelled);
            }
            let failed = |source: rusqlite::Error| {
                if is_interrupt(&source) && cancel.load(Ordering::SeqCst) {
                    StorageError::Cancelled
                } else {
                    StorageError::Migration {
                        version: version.clone(),
                        seq: script.seq,
                        name: script.name.clone(),
                        source,
                    }
                }
            };
            conn.execute_batch(&script.sql).map_err(failed)?;
            conn.execute(
                "INSERT INTO sys_migration_history (version, seq, name, applied_at) \
                 VALUES (?1, ?2, ?3, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))",
                rusqlite::params![version, script.seq, script.name],
            )
            .map_err(failed)?;
            after_script(script);
        }

        if cancel.load(Ordering::SeqCst) {
            return Err(StorageError::Cancelled);
        }
        Ok(())
    }
}

fn is_interrupt(error: &rusqlite::Error) -> bool {
    error.sqlite_error_code() == Some(ErrorCode::OperationInterrupted)
}

fn map_db(error: rusqlite::Error, cancel: &AtomicBool) -> StorageError {
    if is_interrupt(&error) && cancel.load(Ordering::SeqCst) {
        StorageError::Cancelled
    } else {
        StorageError::from(error)
    }
}

fn read_history(conn: &Connection) -> rusqlite::Result<Vec<(String, i64)>> {
    let exists: bool = conn.query_row(
        "SELECT EXISTS (SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?1)",
        [HISTORY_TABLE],
        |row| row.get(0),
    )?;
    if !exists {
        return Ok(Vec::new());
    }
    let mut statement = conn.prepare("SELECT version, seq FROM sys_migration_history")?;
    let rows = statement.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
    })?;
    rows.collect()
}

#[cfg(test)]
mod tests {
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
        assert_eq!(history_count(db.connection()), 5);
        for table in ["ws_novels", "ws_novel_chapters", "ws_tags", "ws_projects"] {
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
}
