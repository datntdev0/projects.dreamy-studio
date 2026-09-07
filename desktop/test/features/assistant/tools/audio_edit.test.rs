use crate::features::assistant::edits::EDIT_DISABLED;
use crate::features::assistant::models::AssistantChange;
use crate::features::assistant::models::AssistantScope;
use crate::features::assistant::models::ChangeTarget;
use crate::features::audiobook::models::MixSettings;
use crate::testing::assistant::FakeAudiobooks;
use crate::testing::assistant::ToolWorld;
use serde_json::Value;
use serde_json::json;

const PROJECT: i64 = 5;

fn scope() -> AssistantScope {
    AssistantScope::project(PROJECT)
}

fn mix(world: &ToolWorld, fields: Value) -> Result<Value, String> {
    let mut args = json!({ "projectId": PROJECT });
    args.as_object_mut()
        .unwrap()
        .extend(fields.as_object().unwrap().clone());
    world.run_editing("edit_audiobook_mix", args, &scope()).0
}

fn flag(world: &ToolWorld, block: &str, note: &str) -> Result<Value, String> {
    let args = json!({ "projectId": PROJECT, "unitId": "c1", "blockId": block, "flag": note });
    world.run_editing("flag_audio_segment", args, &scope()).0
}

#[test]
fn the_mix_changes_only_the_given_fields() {
    let world = ToolWorld::new();

    let value = mix(&world, json!({ "gap": 1.2, "vol": -3 })).unwrap();

    let defaults = MixSettings::default();
    let saved = world.audiobooks.saved_mixes();
    assert_eq!(saved.len(), 1);
    assert_eq!(saved[0].gap, 1.2);
    assert_eq!(saved[0].vol, -3.0);
    assert_eq!(saved[0].intro, defaults.intro);
    assert_eq!(saved[0].outro, defaults.outro);
    assert_eq!(saved[0].sentence, defaults.sentence);
    assert_eq!(value["mix"]["gap"], 1.2);
    assert_eq!(value["mix"]["vol"], -3.0);
    assert_eq!(value["adjusted"], json!([]));
}

#[test]
fn values_outside_the_range_are_clamped_and_listed() {
    let world = ToolWorld::new();

    let value = mix(&world, json!({ "gap": 99, "intro": 1, "vol": -40 })).unwrap();

    assert_eq!(value["mix"]["gap"], 5.0);
    assert_eq!(value["mix"]["intro"], 1.0);
    assert_eq!(value["mix"]["vol"], -12.0);
    assert_eq!(value["adjusted"], json!(["gap", "vol"]));
}

#[test]
fn a_project_without_an_audiobook_starts_from_the_default_mix() {
    let mut world = ToolWorld::new();
    world.audiobooks = FakeAudiobooks::default();

    mix(&world, json!({ "outro": 2 })).unwrap();

    let saved = world.audiobooks.saved_mixes();
    assert_eq!(saved[0].outro, 2.0);
    assert_eq!(saved[0].gap, MixSettings::default().gap);
}

#[test]
fn the_mix_needs_a_number_and_a_known_field() {
    let world = ToolWorld::new();

    let nothing = mix(&world, json!({})).unwrap_err();
    let text = mix(&world, json!({ "gap": "wide" })).unwrap_err();
    let field = mix(&world, json!({ "echo": 1 })).unwrap_err();

    assert!(nothing.contains("at least one of gap, intro, outro, vol, sentence"));
    assert!(text.contains("must be a number"));
    assert!(field.contains("at least one of"));
    assert!(world.audiobooks.saved_mixes().is_empty());
}

#[test]
fn a_mix_change_is_reported_for_the_audiobook() {
    let world = ToolWorld::new();

    let (result, sink) = world.run_editing(
        "edit_audiobook_mix",
        json!({ "projectId": PROJECT, "sentence": 0.5 }),
        &scope(),
    );

    result.unwrap();
    assert_eq!(
        sink.changes(),
        vec![AssistantChange::in_project(
            ChangeTarget::Audiobook,
            PROJECT,
            None
        )]
    );
}

#[test]
fn a_segment_with_audio_can_be_flagged_and_unflagged() {
    let world = ToolWorld::new();

    let flagged = flag(&world, "b2", "  too fast ").unwrap();
    let cleared = flag(&world, "b2", "").unwrap();

    assert_eq!(flagged["flag"], "too fast");
    assert_eq!(flagged["unitId"], "c1");
    assert_eq!(flagged["blockId"], "b2");
    assert_eq!(cleared["flag"], Value::Null);
    assert_eq!(
        world.audiobooks.flag_calls(),
        vec![
            ("c1".to_string(), "b2".to_string(), "too fast".to_string()),
            ("c1".to_string(), "b2".to_string(), String::new()),
        ]
    );
}

#[test]
fn a_flag_is_reported_for_the_unit() {
    let world = ToolWorld::new();

    let (result, sink) = world.run_editing(
        "flag_audio_segment",
        json!({ "projectId": PROJECT, "unitId": "c1", "blockId": "b2", "flag": "echo" }),
        &scope(),
    );

    result.unwrap();
    assert_eq!(
        sink.changes(),
        vec![AssistantChange::in_project(
            ChangeTarget::Audiobook,
            PROJECT,
            Some("c1".to_string())
        )]
    );
}

#[test]
fn a_block_without_audio_cannot_be_flagged() {
    let world = ToolWorld::new();

    let no_audio = flag(&world, "b1", "echo").unwrap_err();
    let (no_unit, _) = world.run_editing(
        "flag_audio_segment",
        json!({ "projectId": PROJECT, "unitId": "zz", "blockId": "b2", "flag": "echo" }),
        &scope(),
    );

    assert!(no_audio.contains("has no generated audio yet"));
    assert!(no_unit.unwrap_err().contains("has no generated audio yet"));
    assert!(world.audiobooks.flag_calls().is_empty());
}

#[test]
fn the_flag_note_is_required() {
    let world = ToolWorld::new();

    let (result, _) = world.run_editing(
        "flag_audio_segment",
        json!({ "projectId": PROJECT, "unitId": "c1", "blockId": "b2" }),
        &scope(),
    );

    assert!(
        result
            .unwrap_err()
            .contains("missing string argument 'flag'")
    );
}

#[test]
fn editing_and_the_scope_are_checked() {
    let world = ToolWorld::new();
    let mix_args = json!({ "projectId": PROJECT, "gap": 1 });
    let flag_args = json!({ "projectId": PROJECT, "unitId": "c1", "blockId": "b2", "flag": "x" });

    for (name, args) in [
        ("edit_audiobook_mix", mix_args),
        ("flag_audio_segment", flag_args),
    ] {
        let (disabled, _) = world.run(name, args.clone(), &scope());
        let mut other = args.clone();
        other["projectId"] = json!(6);
        let (outside, _) = world.run_editing(name, other, &scope());
        let (novel, _) = world.run_editing(name, args, &AssistantScope::novel(1));

        assert_eq!(disabled.unwrap_err(), EDIT_DISABLED, "{name}");
        assert!(
            outside.unwrap_err().contains("outside the current scope"),
            "{name}"
        );
        assert!(
            novel.unwrap_err().contains("not available in this scope"),
            "{name}"
        );
    }
    assert!(world.audiobooks.saved_mixes().is_empty());
    assert!(world.audiobooks.flag_calls().is_empty());
}
