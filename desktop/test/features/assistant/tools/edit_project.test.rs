use crate::features::assistant::edits::EDIT_DISABLED;
use crate::features::assistant::models::AssistantChange;
use crate::features::assistant::models::AssistantScope;
use crate::features::assistant::models::ChangeTarget;
use crate::testing::assistant::ToolWorld;
use serde_json::json;

const PROJECT: i64 = 5;

fn scope() -> AssistantScope {
    AssistantScope::project(PROJECT)
}

#[test]
fn renames_the_project_and_changes_its_description() {
    let world = ToolWorld::new();

    let (result, sink) = world.run_editing(
        "edit_project",
        json!({ "projectId": PROJECT, "name": "  New name ", "description": "About it" }),
        &scope(),
    );

    let value = result.unwrap();
    assert_eq!(value["projectId"], PROJECT);
    assert_eq!(value["name"], "New name");
    assert_eq!(value["description"], "About it");
    assert_eq!(value["changed"], json!(["name", "description"]));
    let updates = world.projects.updates();
    assert_eq!(updates.len(), 1);
    assert_eq!(updates[0].0, PROJECT);
    assert_eq!(updates[0].1.modules, None);
    assert_eq!(
        sink.changes(),
        vec![AssistantChange::in_project(
            ChangeTarget::Project,
            PROJECT,
            None
        )]
    );
}

#[test]
fn only_the_given_field_changes() {
    let world = ToolWorld::new();

    let (result, _) = world.run_editing(
        "edit_project",
        json!({ "projectId": PROJECT, "description": "Only this" }),
        &scope(),
    );

    let value = result.unwrap();
    assert_eq!(value["name"], "Project 5");
    assert_eq!(value["description"], "Only this");
    assert_eq!(value["changed"], json!(["description"]));
}

#[test]
fn nothing_to_change_and_an_empty_name_are_errors() {
    let world = ToolWorld::new();

    let (nothing, _) = world.run_editing("edit_project", json!({ "projectId": PROJECT }), &scope());
    let (empty, sink) = world.run_editing(
        "edit_project",
        json!({ "projectId": PROJECT, "name": "   " }),
        &scope(),
    );

    assert!(nothing.unwrap_err().contains("name or a description"));
    assert!(empty.unwrap_err().contains("must not be empty"));
    assert!(world.projects.updates().is_empty());
    assert!(sink.changes().is_empty());
}

#[test]
fn editing_must_be_enabled() {
    let world = ToolWorld::new();

    let (result, sink) = world.run(
        "edit_project",
        json!({ "projectId": PROJECT, "name": "New" }),
        &scope(),
    );

    assert_eq!(result.unwrap_err(), EDIT_DISABLED);
    assert!(world.projects.updates().is_empty());
    assert!(sink.changes().is_empty());
}

#[test]
fn a_project_scope_cannot_edit_another_project() {
    let world = ToolWorld::new();

    let (result, _) = world.run_editing(
        "edit_project",
        json!({ "projectId": 6, "name": "New" }),
        &scope(),
    );

    assert!(result.unwrap_err().contains("outside the current scope"));
    assert!(world.projects.updates().is_empty());
}

#[test]
fn the_workspace_scope_reports_an_unknown_project_and_a_novel_scope_has_no_tool() {
    let world = ToolWorld::new();

    let (unknown, _) = world.run_editing(
        "edit_project",
        json!({ "projectId": 99, "name": "New" }),
        &AssistantScope::workspace(),
    );
    let (novel, _) = world.run_editing(
        "edit_project",
        json!({ "projectId": PROJECT, "name": "New" }),
        &AssistantScope::novel(1),
    );

    assert!(unknown.unwrap_err().contains("project 99 not found"));
    assert!(novel.unwrap_err().contains("not available in this scope"));
}
