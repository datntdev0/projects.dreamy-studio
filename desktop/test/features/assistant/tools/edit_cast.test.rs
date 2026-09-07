use crate::features::assistant::edits::EDIT_DISABLED;
use crate::features::assistant::models::AssistantChange;
use crate::features::assistant::models::AssistantScope;
use crate::features::assistant::models::ChangeTarget;
use crate::features::scripting::models::CastMember;
use crate::testing::assistant::FakeScripts;
use crate::testing::assistant::ToolWorld;
use crate::testing::assistant::project_chapter_fixture;
use crate::testing::assistant::script_fixture;
use serde_json::Value;
use serde_json::json;

const PROJECT: i64 = 5;

fn scope() -> AssistantScope {
    AssistantScope::project(PROJECT)
}

fn cast_edit(world: &ToolWorld, edit: Value) -> Result<Value, String> {
    let mut args = json!({ "projectId": PROJECT });
    args.as_object_mut()
        .unwrap()
        .extend(edit.as_object().unwrap().clone());
    world.run_editing("edit_script_cast", args, &scope()).0
}

fn world_with_unused_member() -> ToolWorld {
    let mut script = script_fixture();
    script.extra_cast.push(CastMember {
        id: "x2".to_string(),
        name: "Old monk".to_string(),
        kind: "extra".to_string(),
        c: 1,
    });
    let mut world = ToolWorld::new();
    world.scripts = FakeScripts::with_script(script, vec![project_chapter_fixture()]);
    world
}

fn saved_ids(world: &ToolWorld) -> Vec<Vec<String>> {
    world
        .scripts
        .saved_casts()
        .iter()
        .map(|cast| cast.iter().map(|member| member.id.clone()).collect())
        .collect()
}

#[test]
fn adding_a_member_gives_it_an_id_and_the_next_color() {
    let world = ToolWorld::new();

    let (result, sink) = world.run_editing(
        "edit_script_cast",
        json!({ "projectId": PROJECT, "add": ["  Old man "] }),
        &scope(),
    );

    let value = result.unwrap();
    let added = &value["added"][0];
    assert_eq!(added["name"], "Old man");
    assert!(added["id"].as_str().unwrap().starts_with("spk"));
    assert_eq!(value["extraCast"].as_array().unwrap().len(), 2);
    let saved = world.scripts.saved_casts();
    assert_eq!(saved.len(), 1);
    assert_eq!(saved[0][0].id, "x1");
    assert_eq!(saved[0][1].kind, "extra");
    assert_eq!(saved[0][1].c, 3);
    assert_eq!(
        sink.changes(),
        vec![AssistantChange::in_project(
            ChangeTarget::Script,
            PROJECT,
            None
        )]
    );
}

#[test]
fn several_additions_get_distinct_ids() {
    let world = ToolWorld::new();

    let value = cast_edit(&world, json!({ "add": ["Old man", "Old woman"] })).unwrap();

    let first = value["added"][0]["id"].as_str().unwrap();
    let second = value["added"][1]["id"].as_str().unwrap();
    assert_ne!(first, second);
    assert_eq!(world.scripts.saved_casts()[0].len(), 3);
}

#[test]
fn empty_and_duplicate_names_are_refused_ignoring_case() {
    let world = ToolWorld::new();

    let empty = cast_edit(&world, json!({ "add": ["  "] })).unwrap_err();
    let duplicate = cast_edit(&world, json!({ "add": ["tea WOMAN"] })).unwrap_err();
    let knowledge = cast_edit(&world, json!({ "add": ["lin mo"] })).unwrap_err();
    let narrator = cast_edit(&world, json!({ "add": ["narrator"] })).unwrap_err();
    let twice = cast_edit(&world, json!({ "add": ["Monk", "monk"] })).unwrap_err();

    assert!(empty.contains("must not be empty"));
    assert!(duplicate.contains("already exists in the cast"));
    assert!(knowledge.contains("already exists in the cast"));
    assert!(narrator.contains("already exists in the cast"));
    assert!(twice.contains("already exists in the cast"));
    assert!(world.scripts.saved_casts().is_empty());
}

#[test]
fn renaming_changes_only_extra_members() {
    let world = ToolWorld::new();

    let value = cast_edit(
        &world,
        json!({ "rename": [{ "id": "x1", "name": " Tea seller " }] }),
    )
    .unwrap();

    assert_eq!(value["renamed"][0]["name"], "Tea seller");
    let saved = world.scripts.saved_casts();
    assert_eq!(saved[0][0].name, "Tea seller");
    assert_eq!(saved[0][0].id, "x1");
}

#[test]
fn the_narrator_and_knowledge_characters_cannot_be_changed() {
    let world = ToolWorld::new();

    let narrator = cast_edit(
        &world,
        json!({ "rename": [{ "id": "narr", "name": "Voice" }] }),
    )
    .unwrap_err();
    let character = cast_edit(&world, json!({ "remove": ["kb-1"] })).unwrap_err();
    let unknown = cast_edit(&world, json!({ "remove": ["nobody"] })).unwrap_err();

    assert!(narrator.contains("the narrator"));
    assert!(character.contains("a character of the novel knowledge"));
    assert!(unknown.contains("not found"));
    assert!(world.scripts.saved_casts().is_empty());
}

#[test]
fn renaming_to_an_existing_name_or_an_empty_name_is_refused() {
    let world = world_with_unused_member();

    let taken = cast_edit(
        &world,
        json!({ "rename": [{ "id": "x2", "name": "tea woman" }] }),
    )
    .unwrap_err();
    let empty = cast_edit(&world, json!({ "rename": [{ "id": "x2", "name": " " }] })).unwrap_err();
    let same = cast_edit(
        &world,
        json!({ "rename": [{ "id": "x2", "name": "OLD MONK" }] }),
    );

    assert!(taken.contains("already exists"));
    assert!(empty.contains("must not be empty"));
    assert!(same.is_ok());
}

#[test]
fn a_member_in_use_cannot_be_removed_but_an_unused_one_can() {
    let world = world_with_unused_member();

    let used = cast_edit(&world, json!({ "remove": ["x1"] })).unwrap_err();
    assert!(used.contains("speaker of 1 block(s)"));
    assert!(used.contains("edit_script_unit"));
    assert!(world.scripts.saved_casts().is_empty());

    let value = cast_edit(&world, json!({ "remove": ["x2"] })).unwrap();

    assert_eq!(value["removed"], json!(["x2"]));
    assert_eq!(saved_ids(&world), vec![vec!["x1".to_string()]]);
}

#[test]
fn removals_run_first_so_a_name_can_be_reused() {
    let world = world_with_unused_member();

    let value = cast_edit(&world, json!({ "add": ["Old monk"], "remove": ["x2"] })).unwrap();

    assert_eq!(value["added"][0]["name"], "Old monk");
    assert_eq!(value["removed"], json!(["x2"]));
    assert_eq!(world.scripts.saved_casts()[0].len(), 2);
}

#[test]
fn one_invalid_change_writes_nothing() {
    let world = world_with_unused_member();

    let error = cast_edit(&world, json!({ "add": ["Fresh"], "remove": ["x1"] })).unwrap_err();

    assert!(error.contains("speaker of 1 block(s)"));
    assert!(world.scripts.saved_casts().is_empty());
}

#[test]
fn an_empty_request_and_bad_arguments_are_errors() {
    let world = ToolWorld::new();

    let empty = cast_edit(&world, json!({})).unwrap_err();
    let unknown = cast_edit(&world, json!({ "kill": ["x1"] })).unwrap_err();
    let shape = cast_edit(&world, json!({ "rename": [{ "id": "x1" }] })).unwrap_err();

    assert!(empty.contains("at least one of add, rename or remove"));
    assert!(unknown.contains("invalid arguments"));
    assert!(shape.contains("invalid arguments"));
}

#[test]
fn a_project_without_a_script_cannot_be_edited() {
    let mut world = ToolWorld::new();
    world.scripts = FakeScripts::default();

    let error = cast_edit(&world, json!({ "add": ["Monk"] })).unwrap_err();

    assert!(error.contains("has no script yet"));
}

#[test]
fn editing_and_the_scope_are_checked() {
    let world = ToolWorld::new();
    let args = json!({ "projectId": PROJECT, "add": ["Monk"] });

    let (disabled, _) = world.run("edit_script_cast", args.clone(), &scope());
    let (other, _) = world.run_editing(
        "edit_script_cast",
        json!({ "projectId": 6, "add": ["Monk"] }),
        &scope(),
    );
    let (novel, _) = world.run_editing("edit_script_cast", args, &AssistantScope::novel(1));

    assert_eq!(disabled.unwrap_err(), EDIT_DISABLED);
    assert!(other.unwrap_err().contains("outside the current scope"));
    assert!(novel.unwrap_err().contains("not available in this scope"));
    assert!(world.scripts.saved_casts().is_empty());
}
