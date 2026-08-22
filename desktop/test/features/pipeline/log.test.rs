use super::*;
use chrono::TimeZone;
use tempfile::TempDir;

fn started() -> DateTime<Local> {
    Local.with_ymd_and_hms(2026, 11, 18, 10, 45, 12).unwrap()
}

#[test]
fn creates_one_folder_per_run_named_by_time_kind_and_id() {
    let root = TempDir::new().unwrap();

    let log = RunLog::create(root.path(), started(), "analysis", 7);

    let dir = log.dir().unwrap();
    assert_eq!(dir, root.path().join("20261118-104512-analysis-7"));
    assert!(dir.is_dir());
}

#[test]
fn appends_timestamped_lines_with_their_scope() {
    let root = TempDir::new().unwrap();
    let log = RunLog::create(root.path(), started(), "analysis", 1);

    log.line("pipeline", "started");
    log.line("task 2 chp0001", "running");

    let text = std::fs::read_to_string(log.dir().unwrap().join(RUN_LOG_FILE)).unwrap();
    let lines: Vec<&str> = text.lines().collect();
    assert_eq!(lines.len(), 2);
    assert!(lines[0].ends_with("[pipeline] started"));
    assert!(lines[1].ends_with("[task 2 chp0001] running"));
    assert!(DateTime::parse_from_rfc3339(lines[0].split(' ').next().unwrap()).is_ok());
}

#[test]
fn task_files_are_prefixed_with_the_task_and_chapter() {
    let root = TempDir::new().unwrap();
    let log = RunLog::create(root.path(), started(), "analysis", 1);
    let task = log.task(12, "chp0003");

    let name = task.attach("exchange-1-prompt.txt", "hello").unwrap();

    assert_eq!(name, "t12-chp0003-exchange-1-prompt.txt");
    let stored = std::fs::read_to_string(log.dir().unwrap().join(&name)).unwrap();
    assert_eq!(stored, "hello");
}

#[test]
fn task_lines_carry_the_task_scope() {
    let root = TempDir::new().unwrap();
    let log = RunLog::create(root.path(), started(), "analysis", 1);
    let task = log.task(3, "chp0002-p4");

    task.line("sent the prompt");

    let text = std::fs::read_to_string(log.dir().unwrap().join(RUN_LOG_FILE)).unwrap();
    assert!(
        text.trim_end()
            .ends_with("[task 3 chp0002-p4] sent the prompt")
    );
}

#[test]
fn exchanges_are_numbered_per_task_from_one() {
    let log = RunLog::none();
    let first = log.task(1, "a");
    let second = log.task(2, "b");

    assert_eq!(first.next_exchange(), 1);
    assert_eq!(first.next_exchange(), 2);
    assert_eq!(second.next_exchange(), 1);
}

#[test]
fn unsafe_characters_never_reach_a_file_name() {
    let root = TempDir::new().unwrap();
    let log = RunLog::create(root.path(), started(), "a/b c", 1);
    let task = log.task(1, "../chp 1");

    let name = task.attach("x.txt", "1").unwrap();

    assert_eq!(name, "t1-___chp_1-x.txt");
    assert!(log.dir().unwrap().ends_with("20261118-104512-a_b_c-1"));
}

#[test]
fn a_disabled_log_writes_nothing_and_reports_no_file() {
    let log = RunLog::none();
    let task = TaskLog::none();

    log.line("pipeline", "ignored");
    task.line("ignored");

    assert!(log.dir().is_none());
    assert!(log.attach("a.txt", "x").is_none());
    assert!(task.attach("a.txt", "x").is_none());
}

#[test]
fn lines_from_many_threads_stay_whole() {
    let root = TempDir::new().unwrap();
    let log = RunLog::create(root.path(), started(), "analysis", 1);
    let mut handles = Vec::new();
    for worker in 0..8 {
        let log = log.clone();
        handles.push(std::thread::spawn(move || {
            for number in 0..25 {
                log.line("pipeline", &format!("worker {worker} line {number}"));
            }
        }));
    }
    for handle in handles {
        handle.join().unwrap();
    }

    let text = std::fs::read_to_string(log.dir().unwrap().join(RUN_LOG_FILE)).unwrap();
    assert_eq!(text.lines().count(), 200);
    assert!(text.lines().all(|line| line.contains("[pipeline] worker ")));
}
