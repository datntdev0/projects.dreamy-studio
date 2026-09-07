use crate::features::assistant::edits::EDIT_DISABLED;
use crate::features::assistant::models::AssistantChange;
use crate::features::assistant::models::AssistantScope;
use crate::features::assistant::models::ChangeTarget;
use crate::testing::assistant::FakeScripts;
use crate::testing::assistant::FakeVoices;
use crate::testing::assistant::ToolWorld;
use serde_json::Value;
use serde_json::json;

const PROJECT: i64 = 5;

fn scope() -> AssistantScope {
    AssistantScope::project(PROJECT)
}

fn assign(world: &ToolWorld, voices: Value) -> Result<Value, String> {
    let args = json!({ "projectId": PROJECT, "voices": voices });
    world.run_editing("edit_audiobook_voices", args, &scope()).0
}

#[test]
fn list_voice_describes_every_library_voice() {
    let world = ToolWorld::new();

    let (result, _) = world.run("list_voice", json!({}), &scope());

    let voices = result.unwrap();
    let voices = voices.as_array().unwrap();
    assert_eq!(voices.len(), 2);
    assert_eq!(voices[0]["voiceId"], 7);
    assert_eq!(voices[0]["name"], "Mai Anh");
    assert_eq!(voices[0]["gender"], "female");
    assert_eq!(voices[0]["language"], "vi");
    assert_eq!(voices[0]["engine"], "edge-read-aloud");
    assert_eq!(voices[0]["engineKind"], "cloud");
    assert_eq!(voices[0]["source"], "preset");
    assert_eq!(voices[1]["gender"], "male");
}

#[test]
fn list_voice_works_in_the_workspace_scope_and_an_empty_library_is_an_empty_list() {
    let mut world = ToolWorld::new();
    world.voices = FakeVoices::default();

    let (result, _) = world.run("list_voice", json!({}), &AssistantScope::workspace());
    let (novel, _) = world.run("list_voice", json!({}), &AssistantScope::novel(1));

    assert_eq!(result.unwrap(), json!([]));
    assert!(novel.unwrap_err().contains("not available in this scope"));
}

#[test]
fn a_new_voice_is_saved_next_to_the_existing_ones() {
    let world = ToolWorld::new();

    let value = assign(&world, json!([{ "speaker": "x1", "voice": 8 }])).unwrap();

    let saved = world.audiobooks.saved_configs();
    assert_eq!(saved.len(), 1);
    assert_eq!(saved[0].voices["kb-1"].voice, Some(7));
    assert_eq!(saved[0].voices["x1"].voice, Some(8));
    assert_eq!(saved[0].voices["x1"].speed, 1.0);
    assert_eq!(value["outdatedAudio"], 0);
    assert_eq!(value["voices"][0]["speaker"], "x1");
    assert_eq!(value["voices"][0]["name"], "Tea woman");
    assert_eq!(value["voices"][0]["voice"], 8);
    assert_eq!(value["voices"][0]["voiceName"], "Hai Dang");
}

#[test]
fn changing_a_voice_or_a_speed_reports_the_audio_that_becomes_outdated() {
    let world = ToolWorld::new();

    let voice = assign(&world, json!([{ "speaker": "kb-1", "voice": 8 }])).unwrap();
    let speed = assign(&world, json!([{ "speaker": "kb-1", "speed": 1.25 }])).unwrap();
    let same = assign(
        &world,
        json!([{ "speaker": "kb-1", "voice": 7, "speed": 1.0 }]),
    )
    .unwrap();

    assert_eq!(voice["outdatedAudio"], 1);
    assert_eq!(speed["outdatedAudio"], 1);
    assert_eq!(same["outdatedAudio"], 0);
    let saved = world.audiobooks.saved_configs();
    assert_eq!(saved[1].voices["kb-1"].voice, Some(7));
    assert_eq!(saved[1].voices["kb-1"].speed, 1.25);
}

#[test]
fn a_null_voice_removes_the_voice_of_a_speaker() {
    let world = ToolWorld::new();

    let value = assign(&world, json!([{ "speaker": "kb-1", "voice": null }])).unwrap();

    assert_eq!(
        world.audiobooks.saved_configs()[0].voices["kb-1"].voice,
        None
    );
    assert_eq!(value["voices"][0]["voice"], Value::Null);
    assert_eq!(value["voices"][0]["voiceName"], Value::Null);
    assert_eq!(value["outdatedAudio"], 1);
}

#[test]
fn the_narrator_can_get_a_voice_in_an_audiobook() {
    let world = ToolWorld::new();

    assign(&world, json!([{ "speaker": "narr", "voice": 7 }])).unwrap();

    assert_eq!(
        world.audiobooks.saved_configs()[0].voices["narr"].voice,
        Some(7)
    );
}

#[test]
fn unknown_speakers_voices_and_speeds_are_refused() {
    let world = ToolWorld::new();

    let speaker = assign(&world, json!([{ "speaker": "nobody", "voice": 7 }])).unwrap_err();
    let voice = assign(&world, json!([{ "speaker": "x1", "voice": 99 }])).unwrap_err();
    let slow = assign(&world, json!([{ "speaker": "x1", "speed": 0.1 }])).unwrap_err();
    let fast = assign(&world, json!([{ "speaker": "x1", "speed": 3 }])).unwrap_err();
    let text = assign(&world, json!([{ "speaker": "x1", "speed": "fast" }])).unwrap_err();
    let kind = assign(&world, json!([{ "speaker": "x1", "voice": "seven" }])).unwrap_err();

    assert!(speaker.contains("not in the cast"));
    assert!(voice.contains("not in the voice library"));
    assert!(voice.contains("list_voice"));
    assert!(slow.contains("speed must be between"));
    assert!(fast.contains("speed must be between"));
    assert!(text.contains("voices[0]"));
    assert!(kind.contains("voices[0]"));
    assert!(world.audiobooks.saved_configs().is_empty());
}

#[test]
fn an_entry_must_change_something_and_speakers_are_unique() {
    let world = ToolWorld::new();

    let nothing = assign(&world, json!([{ "speaker": "x1" }])).unwrap_err();
    let twice = assign(
        &world,
        json!([{ "speaker": "x1", "voice": 7 }, { "speaker": "x1", "voice": 8 }]),
    )
    .unwrap_err();
    let empty = assign(&world, json!([])).unwrap_err();
    let blank = assign(&world, json!([{ "speaker": " ", "voice": 7 }])).unwrap_err();
    let field = assign(&world, json!([{ "speaker": "x1", "voice": 7, "pitch": 2 }])).unwrap_err();

    assert!(nothing.contains("pass a `voice` or a `speed`"));
    assert!(twice.contains("listed twice"));
    assert!(empty.contains("at least one speaker"));
    assert!(blank.contains("must not be empty"));
    assert!(field.contains("voices[0]"));
    assert!(world.audiobooks.saved_configs().is_empty());
}

#[test]
fn one_invalid_entry_writes_nothing() {
    let world = ToolWorld::new();

    let error = assign(
        &world,
        json!([{ "speaker": "x1", "voice": 8 }, { "speaker": "x1b", "voice": 8 }]),
    )
    .unwrap_err();

    assert!(error.contains("not in the cast"));
    assert!(world.audiobooks.saved_configs().is_empty());
}

#[test]
fn a_project_without_a_script_has_no_cast_to_voice() {
    let mut world = ToolWorld::new();
    world.scripts = FakeScripts::default();

    let error = assign(&world, json!([{ "speaker": "x1", "voice": 7 }])).unwrap_err();

    assert!(error.contains("has no script yet"));
}

#[test]
fn a_change_is_reported_for_the_audiobook() {
    let world = ToolWorld::new();

    let (result, sink) = world.run_editing(
        "edit_audiobook_voices",
        json!({ "projectId": PROJECT, "voices": [{ "speaker": "x1", "speed": 1.5 }] }),
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
fn editing_and_the_scope_are_checked() {
    let world = ToolWorld::new();
    let args = json!({ "projectId": PROJECT, "voices": [{ "speaker": "x1", "voice": 7 }] });

    let (disabled, _) = world.run("edit_audiobook_voices", args.clone(), &scope());
    let (other, _) = world.run_editing(
        "edit_audiobook_voices",
        json!({ "projectId": 6, "voices": [{ "speaker": "x1", "voice": 7 }] }),
        &scope(),
    );
    let (novel, _) = world.run_editing("edit_audiobook_voices", args, &AssistantScope::novel(1));

    assert_eq!(disabled.unwrap_err(), EDIT_DISABLED);
    assert!(other.unwrap_err().contains("outside the current scope"));
    assert!(novel.unwrap_err().contains("not available in this scope"));
    assert!(world.audiobooks.saved_configs().is_empty());
}
