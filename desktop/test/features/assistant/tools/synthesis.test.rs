use super::run::MAX_RUN_CHAPTERS;
use super::*;
use crate::features::audiobook::models::AudioRecord;
use crate::features::audiobook::models::SpeakerVoice;
use crate::features::scripting::models::ScriptUnit;
use crate::testing::assistant::ToolWorld;
use crate::testing::script::unit;
use serde_json::json;

const PROJECT: i64 = 5;

fn voiced_world() -> ToolWorld {
    let mut world = ToolWorld::new();
    let book = world.audiobooks.book.as_mut().unwrap();
    for (speaker, voice) in [("narr", 3), ("kb-1", 7), ("x1", 8)] {
        book.voices.insert(
            speaker.to_string(),
            SpeakerVoice {
                voice: Some(voice),
                speed: 1.0,
            },
        );
    }
    world
}

fn record(text: &str, speaker: &str, voice: i64, flag: &str) -> AudioRecord {
    AudioRecord {
        text: text.to_string(),
        speaker: Some(speaker.to_string()),
        voice: Some(voice),
        speed: 1.0,
        paren: String::new(),
        dur: 1.0,
        at: "2026-01-01T00:00:00Z".to_string(),
        flag: flag.to_string(),
    }
}

fn set_audio(world: &mut ToolWorld, block_id: &str, audio: AudioRecord) {
    let book = world.audiobooks.book.as_mut().unwrap();
    book.units
        .get_mut("c1")
        .unwrap()
        .audio
        .insert(block_id.to_string(), audio);
}

fn synthesize(world: &ToolWorld, args: Value, scope: &AssistantScope) -> Result<Value, String> {
    world.run("start_synthesis", args, scope).0
}

fn block_ids(item: &Value) -> Vec<&str> {
    item["blockIds"]
        .as_array()
        .unwrap()
        .iter()
        .map(|id| id.as_str().unwrap())
        .collect()
}

#[test]
fn missing_mode_attaches_a_card_for_the_blocks_without_up_to_date_audio() {
    let world = voiced_world();
    let args = json!({ "projectId": PROJECT, "units": ["c1"] });

    let (result, sink) = world.run("start_synthesis", args, &AssistantScope::project(PROJECT));

    let result = result.unwrap();
    assert_eq!(result["cardId"], "pr1");
    assert_eq!(result["job"], "synthesis");
    assert_eq!(result["totalTasks"], 2);
    assert_eq!(result["status"], "pending");
    assert_eq!(
        sink.attachments(),
        vec![json!({
            "kind": "pipeline_run",
            "id": "pr1",
            "job": "synthesis",
            "owner": { "novelId": null, "projectId": 5 },
            "title": "Project 5",
            "target": null,
            "mode": "missing",
            "overwrite": false,
            "items": [{
                "id": "c1",
                "seq": 1,
                "title": "Title 1",
                "tasks": 2,
                "note": "2 new",
                "blockIds": ["b1", "b3"]
            }],
            "skipped": [],
            "warnings": [],
            "totalTasks": 2,
            "status": "pending",
            "pipelineId": null
        })]
    );
}

#[test]
fn all_mode_generates_every_voiced_block_and_warns_about_regeneration() {
    let world = voiced_world();

    let (result, sink) = world.run(
        "start_synthesis",
        json!({ "projectId": PROJECT, "units": ["c1"], "mode": "all" }),
        &AssistantScope::workspace(),
    );

    let result = result.unwrap();
    assert_eq!(result["totalTasks"], 3);
    assert_eq!(block_ids(&result["items"][0]), ["b1", "b2", "b3"]);
    assert_eq!(
        result["items"][0]["note"],
        "2 new, 1 up to date, generated again"
    );
    assert_eq!(result["warnings"].as_array().unwrap().len(), 1);
    let card = &sink.attachments()[0];
    assert_eq!(card["overwrite"], true);
    assert_eq!(card["mode"], "all");
}

#[test]
fn missing_mode_takes_new_outdated_and_flagged_audio_without_overwrite() {
    let mut world = voiced_world();
    set_audio(&mut world, "b3", record("An old line.", "x1", 8, ""));
    set_audio(
        &mut world,
        "b2",
        record("Who goes there?", "kb-1", 7, "bad pace"),
    );

    let (result, sink) = world.run(
        "start_synthesis",
        json!({ "projectId": PROJECT, "units": ["c1"] }),
        &AssistantScope::project(PROJECT),
    );

    let result = result.unwrap();
    assert_eq!(block_ids(&result["items"][0]), ["b1", "b2", "b3"]);
    assert_eq!(result["items"][0]["note"], "1 new, 2 outdated");
    let card = &sink.attachments()[0];
    assert_eq!(card["mode"], "missing");
    assert_eq!(card["overwrite"], false);
}

#[test]
fn units_without_work_are_skipped_with_a_reason() {
    let mut world = voiced_world();
    let script = world.scripts.script.as_mut().unwrap();
    script.units.push(unit("c2", 2));
    script.units.push(ScriptUnit {
        blocks: Some(vec![]),
        ..unit("c3", 3)
    });

    let result = synthesize(
        &world,
        json!({ "projectId": PROJECT, "units": ["c1", "c2", "c3"] }),
        &AssistantScope::project(PROJECT),
    )
    .unwrap();

    assert_eq!(result["items"].as_array().unwrap().len(), 1);
    assert_eq!(result["skipped"][0]["id"], "c2");
    assert_eq!(result["skipped"][0]["seq"], 2);
    assert_eq!(result["skipped"][0]["title"], "Chapter 2");
    assert_eq!(
        result["skipped"][0]["reason"],
        "the unit has no voiced blocks"
    );
    assert_eq!(result["skipped"][1]["id"], "c3");
}

#[test]
fn a_unit_that_is_already_up_to_date_is_skipped() {
    let mut world = voiced_world();
    set_audio(
        &mut world,
        "b1",
        record("The gate opened at dawn.", "narr", 3, ""),
    );
    set_audio(&mut world, "b3", record("A friend.", "x1", 8, ""));

    let error = synthesize(
        &world,
        json!({ "projectId": PROJECT, "units": ["c1"] }),
        &AssistantScope::project(PROJECT),
    )
    .unwrap_err();

    assert!(error.contains("every voiced block already has up-to-date audio"));
}

#[test]
fn speakers_without_a_voice_are_listed_and_block_the_card() {
    let world = ToolWorld::new();
    let args = json!({ "projectId": PROJECT, "units": ["c1"] });

    let (result, sink) = world.run("start_synthesis", args, &AssistantScope::project(PROJECT));

    let error = result.unwrap_err();
    assert!(error.starts_with("cannot generate audio yet: no voice is assigned to "));
    assert!(error.contains("(narr)"));
    assert!(error.contains("Tea woman (x1)"));
    assert!(!error.contains("Lin Mo"));
    assert!(error.contains("assign the voices in the audiobook module"));
    assert!(sink.attachments().is_empty());
}

#[test]
fn dialogue_from_outside_the_cast_blocks_the_card() {
    let world = voiced_world();

    let error = synthesize(
        &world,
        json!({ "projectId": 6, "units": ["c1"], "mode": "all" }),
        &AssistantScope::workspace(),
    )
    .unwrap_err();

    assert!(error.contains("1 dialogue block(s) have no speaker from the cast"));
    assert!(!error.contains("no voice is assigned"));
}

#[test]
fn start_synthesis_validates_its_arguments() {
    let world = voiced_world();
    let scope = AssistantScope::project(PROJECT);
    let too_many: Vec<String> = (0..=MAX_RUN_CHAPTERS).map(|n| format!("u{n}")).collect();
    let cases = [
        (
            json!({ "projectId": PROJECT, "units": ["zzz"] }),
            "unit zzz not found in project 5",
        ),
        (
            json!({ "projectId": PROJECT, "units": ["c1"], "mode": "some" }),
            "unsupported mode 'some'",
        ),
        (
            json!({ "projectId": PROJECT, "units": ["c1"], "mode": "stale" }),
            "unsupported mode 'stale'; use missing or all",
        ),
        (
            json!({ "projectId": PROJECT, "units": [] }),
            "must list at least one item",
        ),
        (
            json!({ "projectId": PROJECT }),
            "missing array argument 'units'",
        ),
        (
            json!({ "units": ["c1"] }),
            "missing integer argument 'projectId'",
        ),
        (
            json!({ "projectId": PROJECT, "units": too_many }),
            "select at most 100 units",
        ),
        (
            json!({ "projectId": PROJECT, "units": [1] }),
            "must be an array of strings",
        ),
    ];
    for (args, expected) in cases {
        let error = synthesize(&world, args, &scope).unwrap_err();
        assert!(error.contains(expected), "{expected}: {error}");
    }
}

#[test]
fn start_synthesis_respects_the_scope() {
    let world = voiced_world();
    let args = json!({ "projectId": PROJECT, "units": ["c1"] });

    let novel = synthesize(&world, args.clone(), &AssistantScope::novel(1)).unwrap_err();
    assert!(novel.contains("not available in this scope"));

    let foreign = json!({ "projectId": 6, "units": ["c1"] });
    let other = synthesize(&world, foreign, &AssistantScope::project(PROJECT)).unwrap_err();
    assert!(other.contains("outside the current scope"));

    let missing = json!({ "projectId": 99, "units": ["c1"] });
    let unknown = synthesize(&world, missing, &AssistantScope::workspace()).unwrap_err();
    assert!(unknown.contains("project 99 not found"));

    assert!(synthesize(&world, args, &AssistantScope::workspace()).is_ok());
}

#[test]
fn a_project_without_a_script_cannot_be_synthesized() {
    let mut world = voiced_world();
    world.scripts.script = None;

    let error = synthesize(
        &world,
        json!({ "projectId": PROJECT, "units": ["c1"] }),
        &AssistantScope::project(PROJECT),
    )
    .unwrap_err();

    assert!(error.contains("has no script yet"));
}
