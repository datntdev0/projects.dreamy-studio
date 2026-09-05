use super::*;
use crate::testing::project::create_project;
use crate::testing::project::project_workspace;
use serde_json::json;
use std::fs;

#[test]
fn returns_none_without_a_stored_audiobook() {
    let (_dir, projects) = project_workspace();
    let id = create_project(&projects);

    assert_eq!(AudiobookWorkspace::new(projects).get(id).unwrap(), None);
}

#[test]
fn returns_the_stored_audiobook_as_is() {
    let (dir, projects) = project_workspace();
    let id = create_project(&projects);
    let path = audiobook_path(&dir.path().join("projects").join(id.to_string()));
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(&path, br#"{"units":{}}"#).unwrap();

    let stored = AudiobookWorkspace::new(projects).get(id).unwrap();

    assert_eq!(stored, Some(json!({ "units": {} })));
}
