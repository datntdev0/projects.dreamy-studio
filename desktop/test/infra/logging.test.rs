use super::Logger;
use chrono::DateTime;
use chrono::Local;
use chrono::TimeZone;
use std::fs;
use std::sync::Arc;
use std::sync::Mutex;
use tempfile::tempdir;

fn at(day: u32) -> DateTime<Local> {
    Local.with_ymd_and_hms(2026, 3, day, 12, 0, 0).unwrap()
}

fn logger_with_shared_clock(
    logs: std::path::PathBuf,
    start: DateTime<Local>,
) -> (Logger, Arc<Mutex<DateTime<Local>>>) {
    let clock = Arc::new(Mutex::new(start));
    let shared = clock.clone();
    let logger = Logger::with_clock(logs, move || *shared.lock().unwrap());
    (logger, clock)
}

#[test]
fn file_name_follows_local_date() {
    let dir = tempdir().unwrap();
    let logs = dir.path().join("logs");
    let (logger, _) = logger_with_shared_clock(logs.clone(), at(5));

    logger.prepare().unwrap();
    logger.info("app", "hello");

    let content = fs::read_to_string(logs.join("2026-03-05.log")).unwrap();
    assert!(content.contains(" INFO app hello"));
    assert!(content.starts_with(&at(5).to_rfc3339()));
    assert!(content.ends_with('\n'));
}

#[test]
fn log_appends_to_existing_file() {
    let dir = tempdir().unwrap();
    let logs = dir.path().join("logs");
    let (logger, _) = logger_with_shared_clock(logs.clone(), at(5));

    logger.prepare().unwrap();
    logger.info("app", "one");
    logger.error("app", "two");

    let content = fs::read_to_string(logs.join("2026-03-05.log")).unwrap();
    let lines: Vec<&str> = content.lines().collect();
    assert_eq!(lines.len(), 2);
    assert!(lines[0].ends_with(" INFO app one"));
    assert!(lines[1].ends_with(" ERROR app two"));
}

#[test]
fn date_change_switches_file_and_keeps_old_unchanged() {
    let dir = tempdir().unwrap();
    let logs = dir.path().join("logs");
    let (logger, clock) = logger_with_shared_clock(logs.clone(), at(5));

    logger.prepare().unwrap();
    logger.info("app", "before");
    let old_path = logs.join("2026-03-05.log");
    let old_content = fs::read_to_string(&old_path).unwrap();

    *clock.lock().unwrap() = at(6);
    logger.info("app", "after");

    let new_path = logs.join("2026-03-06.log");
    assert_ne!(old_path, new_path);
    assert_eq!(fs::read_to_string(&old_path).unwrap(), old_content);
    let new_content = fs::read_to_string(&new_path).unwrap();
    assert!(new_content.contains(" INFO app after"));
    assert!(!new_content.contains("before"));
}

#[test]
fn prepare_creates_directory_and_todays_file() {
    let dir = tempdir().unwrap();
    let logs = dir.path().join("a").join("logs");
    let (logger, _) = logger_with_shared_clock(logs.clone(), at(5));

    logger.prepare().unwrap();

    assert!(logs.is_dir());
    assert!(logs.join("2026-03-05.log").is_file());
}

#[test]
fn prepare_fails_when_logs_path_is_a_file() {
    let dir = tempdir().unwrap();
    let logs = dir.path().join("logs");
    fs::write(&logs, b"occupied").unwrap();
    let (logger, _) = logger_with_shared_clock(logs, at(5));

    assert!(logger.prepare().is_err());
}

#[test]
fn log_never_panics_when_directory_is_missing_or_blocked() {
    let dir = tempdir().unwrap();
    let missing = dir.path().join("missing").join("logs");
    let (logger, _) = logger_with_shared_clock(missing.clone(), at(5));
    logger.info("app", "ignored");
    logger.error("app", "ignored");
    assert!(!missing.exists());

    let blocked = dir.path().join("blocked");
    fs::write(&blocked, b"occupied").unwrap();
    let (logger, _) = logger_with_shared_clock(blocked, at(5));
    logger.info("app", "ignored");
}

#[test]
fn logger_is_cloneable_and_shares_clock() {
    let dir = tempdir().unwrap();
    let logs = dir.path().join("logs");
    let (logger, _) = logger_with_shared_clock(logs.clone(), at(5));
    let cloned = logger.clone();

    logger.prepare().unwrap();
    cloned.info("app", "from clone");

    let content = fs::read_to_string(logs.join("2026-03-05.log")).unwrap();
    assert!(content.contains("from clone"));
}
