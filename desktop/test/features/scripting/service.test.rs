use super::*;
use crate::features::project::models::ProjectErrorCode;
use crate::testing::project::create_project;
use crate::testing::project::project_workspace;
use crate::testing::script::linked_unit;
use crate::testing::script::script;
use crate::testing::script::unit;
use crate::testing::script::written_linked_unit;
use crate::testing::script::written_unit;
use std::fs;
use std::path::PathBuf;

fn scripting_dir(dir: &Path, id: i64) -> PathBuf {
    dir.join("projects").join(id.to_string()).join("scripting")
}

#[test]
fn returns_none_before_a_script_is_saved() {
    let (_dir, projects) = project_workspace();
    let id = create_project(&projects);
    let scripting = ScriptingWorkspace::new(projects);

    assert_eq!(scripting.get(id).unwrap(), None);
}

#[test]
fn round_trips_a_saved_script_across_files() {
    let (dir, projects) = project_workspace();
    let id = create_project(&projects);
    let scripting = ScriptingWorkspace::new(projects);
    let saved = script(vec![written_unit("U01", 1), unit("U02", 2)]);

    scripting.save(id, saved.clone()).unwrap();

    assert_eq!(scripting.get(id).unwrap(), Some(saved));
    let root = scripting_dir(dir.path(), id);
    let head = fs::read_to_string(root.join("script.json")).unwrap();
    assert!(!head.contains("blocks"));
    assert!(root.join("units").join("U01.json").exists());
    assert!(root.join("units").join("U02.json").exists());
}

#[test]
fn removes_unit_files_dropped_from_the_script() {
    let (dir, projects) = project_workspace();
    let id = create_project(&projects);
    let scripting = ScriptingWorkspace::new(projects);
    scripting
        .save(id, script(vec![unit("U01", 1), unit("U02", 2)]))
        .unwrap();

    scripting.save(id, script(vec![unit("U02", 2)])).unwrap();

    let units = scripting_dir(dir.path(), id).join("units");
    assert!(!units.join("U01.json").exists());
    assert!(units.join("U02.json").exists());
}

#[test]
fn rejects_unsafe_or_duplicate_unit_ids() {
    let (dir, projects) = project_workspace();
    let id = create_project(&projects);
    let scripting = ScriptingWorkspace::new(projects);

    let unsafe_id = scripting.save(id, script(vec![unit("../evil", 1)]));
    let duplicate = scripting.save(id, script(vec![unit("U01", 1), unit("U01", 2)]));
    let unsafe_unit = scripting.unit_save(id, unit("..\\evil", 1), 1);

    assert_eq!(unsafe_id.unwrap_err().code, ProjectErrorCode::InvalidInput);
    assert_eq!(duplicate.unwrap_err().code, ProjectErrorCode::InvalidInput);
    assert_eq!(
        unsafe_unit.unwrap_err().code,
        ProjectErrorCode::InvalidInput
    );
    assert!(!scripting_dir(dir.path(), id).exists());
}

#[test]
fn saves_a_unit_and_the_block_sequence() {
    let (_dir, projects) = project_workspace();
    let id = create_project(&projects);
    let scripting = ScriptingWorkspace::new(projects);
    scripting
        .save(id, script(vec![unit("U01", 1), unit("U02", 2)]))
        .unwrap();
    let mut edited = written_unit("U02", 2);
    edited.title = "Renamed".to_string();

    scripting.unit_save(id, edited.clone(), 9).unwrap();

    let stored = scripting.get(id).unwrap().unwrap();
    assert_eq!(stored.seq, 9);
    assert_eq!(stored.units[0], unit("U01", 1));
    assert_eq!(stored.units[1], edited);
}

#[test]
fn reports_missing_scripts_and_projects_as_not_found() {
    let (_dir, projects) = project_workspace();
    let id = create_project(&projects);
    let scripting = ScriptingWorkspace::new(projects);

    let no_script = scripting.unit_save(id, unit("U01", 1), 1).unwrap_err();
    let no_cast = scripting.cast_save(id, Vec::new()).unwrap_err();
    let no_project = scripting.get(id + 1).unwrap_err();

    assert_eq!(no_script.code, ProjectErrorCode::NotFound);
    assert_eq!(no_cast.code, ProjectErrorCode::NotFound);
    assert_eq!(no_project.code, ProjectErrorCode::NotFound);
}

#[test]
fn saving_an_unknown_unit_appends_it() {
    let (_dir, projects) = project_workspace();
    let id = create_project(&projects);
    let scripting = ScriptingWorkspace::new(projects);
    scripting.save(id, script(vec![unit("U01", 1)])).unwrap();

    scripting.unit_save(id, unit("U09", 9), 3).unwrap();

    let stored = scripting.get(id).unwrap().unwrap();
    assert_eq!(stored.seq, 3);
    assert_eq!(stored.units, vec![unit("U01", 1), unit("U09", 9)]);
}

#[test]
fn chapter_units_persist_only_their_reference_and_content() {
    let (dir, projects) = project_workspace();
    let id = create_project(&projects);
    let scripting = ScriptingWorkspace::new(projects);
    let mut written = written_linked_unit("c1");
    written.no = 4;
    written.ch = Some(4);
    written.title = "Derived".to_string();

    scripting
        .save(id, script(vec![written, linked_unit("c2"), unit("U01", 1)]))
        .unwrap();

    let stored = scripting.get(id).unwrap().unwrap();
    assert_eq!(stored.units.len(), 2);
    assert_eq!(stored.units[0], written_linked_unit("c1"));
    assert_eq!(stored.units[1], unit("U01", 1));
    let root = scripting_dir(dir.path(), id);
    let head = fs::read_to_string(root.join("script.json")).unwrap();
    assert!(head.contains("\"chapterId\": \"c1\""));
    assert!(!head.contains("Derived"));
    assert!(root.join("units").join("c1.json").exists());
    assert!(!root.join("units").join("c2.json").exists());
}

#[test]
fn a_chapter_unit_saved_without_content_is_dropped() {
    let (dir, projects) = project_workspace();
    let id = create_project(&projects);
    let scripting = ScriptingWorkspace::new(projects);
    scripting.save(id, script(Vec::new())).unwrap();

    scripting
        .unit_save(id, written_linked_unit("c1"), 1)
        .unwrap();
    let appended = scripting.get(id).unwrap().unwrap().units;
    scripting.unit_save(id, linked_unit("c1"), 2).unwrap();
    let cleared = scripting.get(id).unwrap().unwrap();

    assert_eq!(appended, vec![written_linked_unit("c1")]);
    assert!(cleared.units.is_empty());
    assert_eq!(cleared.seq, 2);
    assert!(
        !scripting_dir(dir.path(), id)
            .join("units")
            .join("c1.json")
            .exists()
    );
}

#[test]
fn a_chapter_unit_id_must_equal_its_chapter_id() {
    let (_dir, projects) = project_workspace();
    let id = create_project(&projects);
    let scripting = ScriptingWorkspace::new(projects);
    let mut mismatched = written_linked_unit("c1");
    mismatched.chapter_id = Some("c2".to_string());

    let saved = scripting.save(id, script(vec![mismatched.clone()]));
    scripting.save(id, script(Vec::new())).unwrap();
    let unit = scripting.unit_save(id, mismatched, 1);

    assert_eq!(saved.unwrap_err().code, ProjectErrorCode::InvalidInput);
    assert_eq!(unit.unwrap_err().code, ProjectErrorCode::InvalidInput);
}

#[test]
fn replaces_the_extra_cast_only() {
    let (_dir, projects) = project_workspace();
    let id = create_project(&projects);
    let scripting = ScriptingWorkspace::new(projects);
    let saved = script(vec![written_unit("U01", 1)]);
    scripting.save(id, saved.clone()).unwrap();

    scripting.cast_save(id, Vec::new()).unwrap();

    let stored = scripting.get(id).unwrap().unwrap();
    assert!(stored.extra_cast.is_empty());
    assert_eq!(stored.units, saved.units);
}

#[test]
fn computes_module_states_from_the_stored_script() {
    let (_dir, projects) = project_workspace();
    let id = create_project(&projects);
    let scripting = ScriptingWorkspace::new(projects);
    let before = scripting.modules(id).unwrap();
    scripting
        .save(id, script(vec![written_unit("U01", 1), unit("U02", 2)]))
        .unwrap();

    let after = scripting.modules(id).unwrap();

    assert_eq!(before[0].state, "idle");
    assert_eq!(after[0].state, "doing");
    assert_eq!(after[0].note, "1/2 chapters");
    assert_eq!(after[1].total, 2);
}

#[test]
fn deleting_the_project_removes_its_scripting_data() {
    let (dir, projects) = project_workspace();
    let id = create_project(&projects);
    let scripting = ScriptingWorkspace::new(projects.clone());
    scripting
        .save(id, script(vec![written_unit("U01", 1)]))
        .unwrap();
    assert!(scripting_dir(dir.path(), id).exists());

    projects.delete(&[id]).unwrap();

    assert!(!scripting_dir(dir.path(), id).exists());
}
