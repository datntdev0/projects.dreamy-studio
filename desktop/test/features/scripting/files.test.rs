use super::*;
use crate::features::scripting::models::UnitBody;
use tempfile::TempDir;

#[test]
fn accepts_safe_unit_ids_only() {
    for id in ["U01", "ch-1", "unit_2", &"a".repeat(64)] {
        assert!(require_unit_id(id).is_ok(), "{id}");
    }
    for id in ["", "../x", "a/b", "a\\b", "a.b", "C:", &"a".repeat(65)] {
        let error = require_unit_id(id).unwrap_err();
        assert_eq!(error.code.as_str(), "invalid_input", "{id}");
    }
}

#[test]
fn reads_missing_files_as_empty() {
    let dir = TempDir::new().unwrap();
    let files = ScriptFiles::new(dir.path());
    assert_eq!(files.read_script().unwrap(), None);
    assert_eq!(files.read_unit("U01").unwrap(), UnitBody::default());
    files.remove_orphans(&BTreeSet::new()).unwrap();
}

#[test]
fn removes_only_unlisted_unit_files() {
    let dir = TempDir::new().unwrap();
    let files = ScriptFiles::new(dir.path());
    files.write_unit("U01", &UnitBody::default()).unwrap();
    files.write_unit("U02", &UnitBody::default()).unwrap();
    let units = dir.path().join("scripting").join("units");
    fs::write(units.join("notes.txt"), b"keep").unwrap();

    files
        .remove_orphans(&BTreeSet::from(["U01".to_string()]))
        .unwrap();

    assert!(units.join("U01.json").exists());
    assert!(!units.join("U02.json").exists());
    assert!(units.join("notes.txt").exists());
}
