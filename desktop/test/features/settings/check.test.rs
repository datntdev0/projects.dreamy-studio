use super::*;
use crate::features::settings::repository::SETTINGS_FILE;
use tempfile::TempDir;

fn checker(dir: &TempDir, status: &LlmStatus) -> LlmCheck {
    let repository = SettingsRepository::new(dir.path().join(SETTINGS_FILE));
    LlmCheck::new(repository, dir.path().to_path_buf(), status.clone())
}

fn point_every_cli_at_a_missing_file(dir: &TempDir) {
    let missing = dir.path().join("missing").join("cli.cmd");
    let path = missing.to_string_lossy().replace('\\', "/");
    let provider = format!(r#"{{"path":"{path}"}}"#);
    let text = format!(
        r#"{{"llm":{{"providers":{{"claude":{provider},"antigravity":{provider},"codex":{provider}}}}}}}"#
    );
    std::fs::write(dir.path().join(SETTINGS_FILE), text).unwrap();
}

#[test]
fn starts_without_any_saved_state() {
    assert!(LlmStatus::default().snapshot().is_empty());
}

#[test]
fn keeps_the_latest_probe_of_each_cli() {
    let status = LlmStatus::default();
    let mut first = probe_of("claude");
    first.version = "1.0.0".to_string();
    let mut second = probe_of("claude");
    second.version = "2.0.0".to_string();
    status.store(first);
    status.store(second);
    status.store(probe_of("codex"));
    let saved = status.snapshot();
    assert_eq!(saved.len(), 2);
    assert_eq!(saved["claude"].version, "2.0.0");
}

#[test]
fn shares_the_saved_state_between_clones() {
    let status = LlmStatus::default();
    let other = status.clone();
    other.store(probe_of("codex"));
    assert!(status.snapshot().contains_key("codex"));
}

#[test]
fn checks_every_cli_and_saves_what_it_found() {
    let dir = TempDir::new().unwrap();
    point_every_cli_at_a_missing_file(&dir);
    let status = LlmStatus::default();
    let cancel = AtomicBool::new(false);
    assert!(checker(&dir, &status).check(&cancel));
    let saved = status.snapshot();
    let ids: Vec<_> = saved.keys().map(String::as_str).collect();
    assert_eq!(ids, ["antigravity", "claude", "codex"]);
    assert!(saved.values().all(|probe| !probe.found && !probe.ok));
    assert!(saved.values().all(|probe| probe.checked_at_ms > 0));
}

#[test]
fn saves_nothing_when_it_is_cancelled_before_it_starts() {
    let dir = TempDir::new().unwrap();
    point_every_cli_at_a_missing_file(&dir);
    let status = LlmStatus::default();
    let cancel = AtomicBool::new(true);
    assert!(!checker(&dir, &status).check(&cancel));
    assert!(status.snapshot().is_empty());
}

#[test]
fn the_no_op_checker_only_reports_cancellation() {
    assert!(NoLlmCheck.check(&AtomicBool::new(false)));
    assert!(!NoLlmCheck.check(&AtomicBool::new(true)));
}

fn probe_of(id: &str) -> CliProbe {
    CliProbe {
        id: id.to_string(),
        found: true,
        path: String::new(),
        version: String::new(),
        ok: true,
        signed_in: None,
        account: String::new(),
        error: String::new(),
        latency_ms: 0,
        checked_at_ms: 1,
    }
}
