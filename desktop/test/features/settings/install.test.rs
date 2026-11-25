use super::*;
use crate::infra::startup::install::InstallMarker;
use crate::infra::startup::install::MARKER_FILE;
use std::path::Path;
use tempfile::TempDir;

const MANIFEST: &str = r#"{"items":[
  {"id":"python","group":"runtime","version":"3.12","build":"b","file":"py.tar.gz","urls":[],"sha256":"aa","size":10,"format":"tar.gz","root":"python","entry":"python.exe"},
  {"id":"claude","group":"toolbox","version":"2.1","build":"win","file":"claude.exe","urls":[],"sha256":"bb","size":400,"format":"raw","root":"","entry":"claude.exe","onDemand":true}
]}"#;

fn config(root: &Path) -> AppConfig {
    AppConfig {
        app_data_dir: root.join("data"),
        runtime_dir: root.join("runtime"),
        toolbox_dir: root.join("toolbox"),
        portable: true,
        source: None,
    }
}

fn installer(root: &Path) -> CliInstaller {
    CliInstaller::new(
        config(root),
        SetupManifest::parse(MANIFEST).unwrap(),
        Logger::new(root.join("logs")),
    )
}

fn mark_installed(root: &Path, manifest: &SetupManifest) {
    let item = manifest.item("claude").unwrap();
    let dir = item.install_dir(&config(root));
    std::fs::create_dir_all(&dir).unwrap();
    std::fs::write(dir.join("claude.exe"), b"exe").unwrap();
    let marker = serde_json::to_string(&InstallMarker::of(item)).unwrap();
    std::fs::write(dir.join(MARKER_FILE), marker).unwrap();
}

#[test]
fn the_startup_manifest_leaves_out_on_demand_clis() {
    let manifest = SetupManifest::parse(MANIFEST).unwrap();

    let ids: Vec<String> = manifest
        .startup()
        .items
        .into_iter()
        .map(|item| item.id)
        .collect();

    assert_eq!(ids, vec!["python".to_string()]);
}

#[test]
fn a_missing_cli_reports_its_version_and_size() {
    let dir = TempDir::new().unwrap();

    let view = installer(dir.path()).view("claude");

    assert_eq!(view.state, InstallState::None);
    assert_eq!(view.version, "2.1");
    assert_eq!(view.total_bytes, 400);
    assert_eq!(view.received_bytes, 0);
}

#[test]
fn an_installed_cli_is_reported_as_installed() {
    let dir = TempDir::new().unwrap();
    mark_installed(dir.path(), &SetupManifest::parse(MANIFEST).unwrap());

    let view = installer(dir.path()).view("claude");

    assert_eq!(view.state, InstallState::Installed);
    assert_eq!(view.received_bytes, 400);
}

#[test]
fn only_on_demand_items_can_be_installed_from_settings() {
    let dir = TempDir::new().unwrap();
    let installer = installer(dir.path());

    assert_eq!(installer.view("python").state, InstallState::Error);
    assert!(installer.install("python", &|_| {}).is_err());
    assert!(installer.install("gemini", &|_| {}).is_err());
}

#[test]
fn an_install_without_a_source_fails_and_frees_the_slot() {
    let dir = TempDir::new().unwrap();
    let installer = installer(dir.path());

    assert!(installer.install("claude", &|_| {}).is_err());
    assert_eq!(installer.view("claude").state, InstallState::None);
}
