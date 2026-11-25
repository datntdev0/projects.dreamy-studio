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
        let mut parts = text.split('.');
        let major = next_part(&mut parts, text)?;
        let minor = next_part(&mut parts, text)?;
        let patch = next_part(&mut parts, text)?;
        if parts.next().is_some() {
            return Err(invalid_version(text));
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
        let (version, seq, name) = parse_file_name(file_name)
            .ok_or_else(|| StorageError::InvalidScript(file_name.to_string()))?;
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
        if applied
            .iter()
            .any(|(version, seq)| !is_known(ordered, version.as_str(), *seq))
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
            let failed = |source| migration_error(source, script, &version, cancel);
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

fn invalid_version(text: &str) -> StorageError {
    StorageError::InvalidScript(format!("invalid version '{text}'"))
}

fn next_part(parts: &mut std::str::Split<'_, char>, text: &str) -> StorageResult<u64> {
    parts
        .next()
        .and_then(|part| part.parse::<u64>().ok())
        .ok_or_else(|| invalid_version(text))
}

fn parse_file_name(file_name: &str) -> Option<(&str, i64, &str)> {
    let stem = file_name.strip_suffix(".sql")?;
    let (head, name) = stem.split_once("__")?;
    let (version, seq) = head.split_once('_')?;
    Some((version, seq.parse().ok()?, name))
}

fn is_known(ordered: &[&Script], version: &str, seq: i64) -> bool {
    ordered
        .iter()
        .any(|script| script.seq == seq && script.version.to_string() == version)
}

fn migration_error(
    source: rusqlite::Error,
    script: &Script,
    version: &str,
    cancel: &AtomicBool,
) -> StorageError {
    if is_interrupt(&source) && cancel.load(Ordering::SeqCst) {
        StorageError::Cancelled
    } else {
        StorageError::Migration {
            version: version.to_string(),
            seq: script.seq,
            name: script.name.clone(),
            source,
        }
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
