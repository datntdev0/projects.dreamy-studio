use crate::features::assistant::edits::EDIT_DISABLED;
use crate::features::assistant::models::AssistantChange;
use crate::features::assistant::models::AssistantScope;
use crate::features::assistant::models::ChangeTarget;
use crate::features::scripting::models::ScriptBlock;
use crate::features::scripting::models::ScriptUnit;
use crate::testing::assistant::FakeScripts;
use crate::testing::assistant::ToolWorld;
use crate::testing::assistant::project_chapter_fixture;
use crate::testing::assistant::script_block;
use crate::testing::script::linked_unit;
use crate::testing::script::script;
use serde_json::Value;
use serde_json::json;

const PROJECT: i64 = 5;
const GATE: &str = "The gate opened at dawn.";
const WHO: &str = "Who goes there?";
const FRIEND: &str = "A friend.";

fn scope() -> AssistantScope {
    AssistantScope::project(PROJECT)
}

fn edit(world: &ToolWorld, ops: Value) -> Result<Value, String> {
    let args = json!({ "projectId": PROJECT, "unitId": "c1", "ops": ops });
    world.run_editing("edit_script_unit", args, &scope()).0
}

fn saved(world: &ToolWorld) -> (ScriptUnit, i64) {
    world.scripts.saved_units().pop().unwrap()
}

fn ids(unit: &ScriptUnit) -> Vec<&str> {
    unit.blocks
        .as_ref()
        .unwrap()
        .iter()
        .map(|block| block.id.as_str())
        .collect()
}

fn world_with_blocks(blocks: Vec<ScriptBlock>) -> ToolWorld {
    let unit = ScriptUnit {
        blocks: Some(blocks),
        ..linked_unit("c1")
    };
    let mut world = ToolWorld::new();
    world.scripts = FakeScripts::with_script(script(vec![unit]), vec![project_chapter_fixture()]);
    world
}

fn narration(id: &str, text: &str) -> ScriptBlock {
    script_block(id, "narration", text, "")
}

#[test]
fn set_changes_only_the_given_fields() {
    let world = ToolWorld::new();

    let value = edit(
        &world,
        json!([{ "k": "set", "id": "b1", "expected": GATE, "text": "The gate creaked open." }]),
    )
    .unwrap();

    assert_eq!(value["applied"], 1);
    assert_eq!(value["blocks"], 3);
    assert_eq!(value["staleAudio"], 0);
    assert_eq!(value["remap"], json!({}));
    assert_eq!(value["warnings"], json!([]));
    let (unit, seq) = saved(&world);
    let blocks = unit.blocks.as_ref().unwrap();
    assert_eq!(blocks[0].text, "The gate creaked open.");
    assert_eq!(blocks[0].kind, "narration");
    assert_eq!(blocks[1].text, WHO);
    assert_eq!(blocks[1].who, "kb-1");
    assert_eq!(seq, 4);
    assert!(unit.meta.is_none());
    assert_ne!(unit.updated, "2026-01-01T00:00:00Z");
}

#[test]
fn a_change_emits_a_script_change_for_the_unit() {
    let world = ToolWorld::new();

    let (result, sink) = world.run_editing(
        "edit_script_unit",
        json!({
            "projectId": PROJECT,
            "unitId": "c1",
            "ops": [{ "k": "set", "id": "b1", "expected": GATE, "beat": "opening" }]
        }),
        &scope(),
    );

    result.unwrap();
    assert_eq!(
        sink.changes(),
        vec![AssistantChange::in_project(
            ChangeTarget::Script,
            PROJECT,
            Some("c1".to_string())
        )]
    );
}

#[test]
fn changing_the_text_of_a_block_with_audio_makes_that_audio_outdated() {
    let world = ToolWorld::new();

    let value = edit(
        &world,
        json!([{ "k": "set", "id": "b2", "expected": WHO, "text": "Who is there?" }]),
    )
    .unwrap();

    assert_eq!(value["staleAudio"], 1);
}

#[test]
fn retyping_a_dialogue_into_narration_clears_its_speaker() {
    let world = ToolWorld::new();

    let value = edit(
        &world,
        json!([{ "k": "set", "id": "b2", "expected": WHO, "type": "narration" }]),
    )
    .unwrap();

    let (unit, _) = saved(&world);
    let block = &unit.blocks.as_ref().unwrap()[1];
    assert_eq!(block.kind, "narration");
    assert_eq!(block.who, "");
    assert_eq!(value["staleAudio"], 1);
}

#[test]
fn set_keeps_the_references_and_characters_of_the_block() {
    let block = ScriptBlock {
        reference: Some("1.1".to_string()),
        refs: vec!["1.1".to_string()],
        chars: vec!["kb-1".to_string()],
        ..narration("r1", "Old line")
    };
    let world = world_with_blocks(vec![block]);

    edit(
        &world,
        json!([{ "k": "set", "id": "r1", "expected": "Old line", "text": "New line" }]),
    )
    .unwrap();

    let (unit, _) = saved(&world);
    let kept = &unit.blocks.as_ref().unwrap()[0];
    assert_eq!(kept.text, "New line");
    assert_eq!(kept.reference.as_deref(), Some("1.1"));
    assert_eq!(kept.refs, vec!["1.1".to_string()]);
    assert_eq!(kept.chars, vec!["kb-1".to_string()]);
}

#[test]
fn a_mismatching_expected_text_names_the_block_and_writes_nothing() {
    let world = ToolWorld::new();

    let error = edit(
        &world,
        json!([
            { "k": "set", "id": "b3", "expected": FRIEND, "text": "A traveller." },
            { "k": "set", "id": "b1", "expected": "stale text", "text": "x" }
        ]),
    )
    .unwrap_err();

    assert!(error.contains("ops[1]"));
    assert!(error.contains("block b1 (p 1)"));
    assert!(error.contains("does not match `expected`"));
    assert!(error.contains(&format!("Current text: {GATE}")));
    assert!(error.contains("nothing was written"));
    assert!(world.scripts.saved_units().is_empty());
}

#[test]
fn insert_adds_blocks_with_fresh_ids_and_a_ref_that_later_ops_can_use() {
    let world = ToolWorld::new();

    let value = edit(
        &world,
        json!([
            {
                "k": "insert",
                "after": "b1",
                "ref": "mist",
                "block": { "type": "narration", "text": "Mist rolled in." }
            },
            { "k": "set", "id": "mist", "expected": "Mist rolled in.", "text": "Mist rolled in slowly." }
        ]),
    )
    .unwrap();

    assert_eq!(value["remap"], json!({ "mist": "B5" }));
    assert_eq!(value["blocks"], 4);
    let (unit, seq) = saved(&world);
    assert_eq!(ids(&unit), vec!["b1", "B5", "b2", "b3"]);
    assert_eq!(
        unit.blocks.as_ref().unwrap()[1].text,
        "Mist rolled in slowly."
    );
    assert_eq!(seq, 5);
}

#[test]
fn insert_can_put_a_block_first_but_needs_the_after_key() {
    let world = ToolWorld::new();

    edit(
        &world,
        json!([{ "k": "insert", "after": null, "block": { "type": "narration", "text": "Prologue." } }]),
    )
    .unwrap();
    let missing = edit(
        &world,
        json!([{ "k": "insert", "block": { "type": "narration", "text": "Prologue." } }]),
    )
    .unwrap_err();

    let (unit, _) = saved(&world);
    assert_eq!(ids(&unit), vec!["B5", "b1", "b2", "b3"]);
    assert!(missing.contains("`after` is required"));
    assert_eq!(world.scripts.saved_units().len(), 1);
}

#[test]
fn a_ref_must_not_reuse_a_block_id_or_another_ref() {
    let world = ToolWorld::new();
    let block = json!({ "type": "narration", "text": "Text." });

    let id = edit(
        &world,
        json!([{ "k": "insert", "after": null, "ref": "b1", "block": block }]),
    )
    .unwrap_err();
    let twice = edit(
        &world,
        json!([
            { "k": "insert", "after": null, "ref": "n", "block": block },
            { "k": "insert", "after": null, "ref": "n", "block": block }
        ]),
    )
    .unwrap_err();

    assert!(id.contains("already used"));
    assert!(twice.contains("already used"));
    assert!(world.scripts.saved_units().is_empty());
}

#[test]
fn delete_removes_a_block_after_checking_its_text() {
    let world = ToolWorld::new();

    let value = edit(
        &world,
        json!([{ "k": "delete", "id": "b2", "expected": WHO }]),
    )
    .unwrap();

    let (unit, seq) = saved(&world);
    assert_eq!(ids(&unit), vec!["b1", "b3"]);
    assert_eq!(value["blocks"], 2);
    assert_eq!(value["staleAudio"], 1);
    assert_eq!(seq, 4);
    let wrong = edit(
        &world,
        json!([{ "k": "delete", "id": "b2", "expected": "nope" }]),
    );
    assert!(wrong.unwrap_err().contains("does not match"));
}

#[test]
fn move_places_a_block_after_another_or_first() {
    let world = ToolWorld::new();

    edit(&world, json!([{ "k": "move", "id": "b3", "after": null }])).unwrap();
    assert_eq!(ids(&saved(&world).0), vec!["b3", "b1", "b2"]);

    edit(&world, json!([{ "k": "move", "id": "b1", "after": "b3" }])).unwrap();
    assert_eq!(ids(&saved(&world).0), vec!["b2", "b3", "b1"]);

    edit(&world, json!([{ "k": "move", "id": "b1", "after": "b1" }])).unwrap_err();
    let unknown = edit(&world, json!([{ "k": "move", "id": "b1", "after": "zz" }])).unwrap_err();
    assert!(unknown.contains("block 'zz' not found"));
    assert_eq!(world.scripts.saved_units().len(), 2);
}

#[test]
fn a_failing_op_writes_nothing_even_after_valid_ones() {
    let world = ToolWorld::new();

    let error = edit(
        &world,
        json!([
            { "k": "delete", "id": "b3", "expected": FRIEND },
            { "k": "set", "id": "ghost", "expected": "", "text": "x" }
        ]),
    )
    .unwrap_err();

    assert!(error.contains("ops[1]"));
    assert!(error.contains("block 'ghost' not found"));
    assert!(world.scripts.saved_units().is_empty());
}

#[test]
fn blocks_follow_the_same_rules_as_a_draft() {
    let world = ToolWorld::new();
    let cases = [
        (
            json!({ "type": "dialogue", "text": "Hi.", "who": "nobody" }),
            "unknown speaker",
        ),
        (json!({ "type": "scene", "loc": "Gate" }), "not allowed"),
        (json!({ "type": "narration", "text": "  " }), "needs text"),
        (json!({ "type": "poem", "text": "x" }), "unknown block type"),
    ];

    for (block, reason) in cases {
        let error = edit(
            &world,
            json!([{ "k": "insert", "after": null, "block": block }]),
        )
        .unwrap_err();
        assert!(error.contains("ops[0]"), "{error}");
        assert!(error.contains(reason), "{error}");
    }
    assert!(world.scripts.saved_units().is_empty());
}

#[test]
fn a_set_that_breaks_a_rule_is_refused() {
    let world = ToolWorld::new();

    let speaker = edit(
        &world,
        json!([{ "k": "set", "id": "b2", "expected": WHO, "who": "nobody" }]),
    )
    .unwrap_err();
    let blank = edit(
        &world,
        json!([{ "k": "set", "id": "b1", "expected": GATE, "text": " " }]),
    )
    .unwrap_err();

    assert!(speaker.contains("unknown speaker"));
    assert!(blank.contains("needs text"));
    assert!(world.scripts.saved_units().is_empty());
}

#[test]
fn source_references_are_checked_against_the_novel() {
    let world = ToolWorld::new();

    let value = edit(
        &world,
        json!([{
            "k": "insert",
            "after": "b3",
            "block": { "type": "narration", "text": "Echo.", "refs": ["1.2", "1.9"] }
        }]),
    )
    .unwrap();

    let (unit, _) = saved(&world);
    assert_eq!(
        unit.blocks.as_ref().unwrap()[3].refs,
        vec!["1.2".to_string()]
    );
    let warnings = value["warnings"].as_array().unwrap();
    assert_eq!(warnings.len(), 1);
    assert!(warnings[0].as_str().unwrap().contains("were removed"));
}

#[test]
fn bad_operations_are_refused_before_anything_runs() {
    let world = ToolWorld::new();
    let too_many: Vec<Value> = (0..201)
        .map(|_| json!({ "k": "delete", "id": "b1", "expected": GATE }))
        .collect();

    let kind = edit(&world, json!([{ "k": "rewrite", "id": "b1" }])).unwrap_err();
    let field = edit(
        &world,
        json!([{ "k": "set", "id": "b1", "expected": GATE, "textt": "typo" }]),
    )
    .unwrap_err();
    let empty = edit(&world, json!([])).unwrap_err();
    let many = edit(&world, Value::Array(too_many)).unwrap_err();
    let missing = edit(&world, json!([{ "k": "set", "id": "b1", "text": "x" }])).unwrap_err();

    assert!(kind.contains("ops[0] is invalid"));
    assert!(field.contains("ops[0] is invalid"));
    assert!(empty.contains("at least one operation"));
    assert!(many.contains("at most 200 operations"));
    assert!(missing.contains("ops[0] is invalid"));
    assert!(world.scripts.saved_units().is_empty());
}

#[test]
fn a_unit_never_grows_past_the_block_limit() {
    let blocks: Vec<ScriptBlock> = (0..400)
        .map(|index| narration(&format!("n{index}"), "Line."))
        .collect();
    let world = world_with_blocks(blocks);

    let error = edit(
        &world,
        json!([{ "k": "insert", "after": null, "block": { "type": "narration", "text": "One more." } }]),
    )
    .unwrap_err();

    assert!(error.contains("at most 400 blocks"));
    assert!(world.scripts.saved_units().is_empty());
}

#[test]
fn the_unit_must_exist_and_already_have_blocks() {
    let empty = {
        let mut world = ToolWorld::new();
        world.scripts = FakeScripts::with_script(
            script(vec![linked_unit("c1")]),
            vec![project_chapter_fixture()],
        );
        world
    };
    let missing_script = {
        let mut world = ToolWorld::new();
        world.scripts = FakeScripts::default();
        world
    };
    let ops = json!([{ "k": "delete", "id": "b1", "expected": GATE }]);

    let no_blocks = edit(&empty, ops.clone()).unwrap_err();
    let no_script = edit(&missing_script, ops.clone()).unwrap_err();
    let (unknown, _) = ToolWorld::new().run_editing(
        "edit_script_unit",
        json!({ "projectId": PROJECT, "unitId": "zz", "ops": ops }),
        &scope(),
    );

    assert!(no_blocks.contains("has no blocks yet"));
    assert!(no_blocks.contains("submit_script_draft"));
    assert!(no_script.contains("has no script yet"));
    assert!(unknown.unwrap_err().contains("unit zz not found"));
}

#[test]
fn editing_and_the_scope_are_checked() {
    let world = ToolWorld::new();
    let ops = json!([{ "k": "set", "id": "b1", "expected": GATE, "beat": "x" }]);
    let args = json!({ "projectId": PROJECT, "unitId": "c1", "ops": ops });

    let (disabled, _) = world.run("edit_script_unit", args.clone(), &scope());
    let (other, _) = world.run_editing(
        "edit_script_unit",
        json!({ "projectId": 6, "unitId": "c1", "ops": ops }),
        &scope(),
    );
    let (novel, _) = world.run_editing("edit_script_unit", args, &AssistantScope::novel(1));

    assert_eq!(disabled.unwrap_err(), EDIT_DISABLED);
    assert!(other.unwrap_err().contains("outside the current scope"));
    assert!(novel.unwrap_err().contains("not available in this scope"));
    assert!(world.scripts.saved_units().is_empty());
}
