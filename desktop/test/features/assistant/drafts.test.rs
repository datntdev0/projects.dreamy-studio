use super::card::DraftBlock;
use super::card::DraftMember;
use super::card::DraftStats;
use super::card::Speaker;
use super::*;
use crate::features::assistant::models::AssistantErrorCode;
use crate::features::assistant::models::ChangeTarget;
use crate::testing::assistant::FakeAudiobooks;
use crate::testing::assistant::FakeKnowledge;
use crate::testing::assistant::FakeNovels;
use crate::testing::assistant::FakeProjects;
use crate::testing::assistant::FakeScripts;
use crate::testing::assistant::FakeTranslation;
use crate::testing::assistant::RecordingSink;
use crate::testing::assistant::project_chapter_fixture;
use crate::testing::assistant::project_summary;
use crate::testing::assistant::script_fixture;
use crate::testing::assistant::sources_with_project_data;
use crate::testing::script::chapter;
use crate::testing::script::script;

const PROJECT: i64 = 5;

fn sources_for(scripts: &FakeScripts) -> Sources {
    sources_with_project_data(
        &FakeNovels::new(),
        &FakeKnowledge::new(),
        &FakeTranslation::new(),
        &FakeProjects::with(vec![project_summary(PROJECT, Some(1))]),
        scripts,
        &FakeAudiobooks::default(),
    )
}

fn block(id: Option<&str>, text: &str) -> DraftBlock {
    DraftBlock {
        id: id.map(str::to_string),
        kind: "narration".to_string(),
        text: text.to_string(),
        who: String::new(),
        paren: String::new(),
        ms: 0,
        loc: String::new(),
        time: "MORNING".to_string(),
        beat: String::new(),
        refs: Vec::new(),
        chars: Vec::new(),
        kept: id.is_some(),
    }
}

fn card(id: &str, unit_id: &str, base: &str) -> DraftCard {
    DraftCard {
        kind: DRAFT_KIND.to_string(),
        id: id.to_string(),
        project_id: PROJECT,
        title: "Project 5".to_string(),
        unit_id: unit_id.to_string(),
        unit_title: "Title 1".to_string(),
        chapter: Some(1),
        summary: "Short".to_string(),
        base_rev: base.to_string(),
        current: vec![CurrentBlock {
            id: "b1".to_string(),
            kind: "narration".to_string(),
            text: "old".to_string(),
            who: String::new(),
            paren: String::new(),
        }],
        current_truncated: false,
        blocks: vec![block(Some("b1"), "kept"), block(None, "new")],
        extra_cast: vec![DraftMember {
            id: "new1".to_string(),
            name: "Gatekeeper".to_string(),
        }],
        speakers: vec![Speaker {
            id: "new1".to_string(),
            name: "Gatekeeper".to_string(),
            blocks: 1,
        }],
        stats: DraftStats {
            blocks: 2,
            voiced: 2,
            words: 2,
            narration: 2,
            dialogue: 0,
            kept: 1,
            stale_audio: 0,
        },
        unresolved: 0,
        warnings: vec!["careful".to_string()],
        status: "pending".to_string(),
    }
}

fn rev_of(script: &crate::features::scripting::models::Script, unit_id: &str) -> String {
    let blocks = script
        .units
        .iter()
        .find(|unit| unit.id == unit_id)
        .and_then(|unit| unit.blocks.clone())
        .unwrap_or_default();
    base_rev(&blocks, &script.extra_cast)
}

fn ids(values: &[&str]) -> Vec<String> {
    values.iter().map(|value| value.to_string()).collect()
}

fn keys(value: &Value) -> Vec<&str> {
    let mut names: Vec<&str> = value
        .as_object()
        .unwrap()
        .keys()
        .map(String::as_str)
        .collect();
    names.sort_unstable();
    names
}

#[test]
fn attach_numbers_the_cards_and_stores_them_on_the_sink() {
    let sink = RecordingSink::new();

    let first = attach(card("", "c1", "r"), &sink).unwrap();
    let second = attach(card("", "c2", "r"), &sink).unwrap();

    assert_eq!(first.id, "sd1");
    assert_eq!(second.id, "sd2");
    let stored = sink.attachments();
    assert_eq!(stored.len(), 2);
    assert_eq!(stored[1]["id"], "sd2");
    assert_eq!(stored[1]["kind"], "script_draft");
}

#[test]
fn attach_skips_the_numbers_of_other_card_kinds() {
    let sink = RecordingSink::new();
    sink.attach(json!({ "kind": "pipeline_run", "id": "pr1" }));

    let attached = attach(card("", "c1", "r"), &sink).unwrap();

    assert_eq!(attached.id, "sd1");
}

#[test]
fn the_stored_card_follows_the_wire_contract() {
    let value = serde_json::to_value(card("sd1", "c1", "abc")).unwrap();

    assert_eq!(
        keys(&value),
        [
            "baseRev",
            "blocks",
            "chapter",
            "current",
            "currentTruncated",
            "extraCast",
            "id",
            "kind",
            "projectId",
            "speakers",
            "stats",
            "status",
            "summary",
            "title",
            "unitId",
            "unitTitle",
            "unresolved",
            "warnings",
        ]
    );
    assert_eq!(value["kind"], "script_draft");
    assert_eq!(
        keys(&value["blocks"][0]),
        [
            "beat", "chars", "id", "kept", "loc", "ms", "paren", "refs", "text", "time", "type",
            "who"
        ]
    );
    assert_eq!(value["blocks"][1]["id"], Value::Null);
    assert_eq!(
        keys(&value["current"][0]),
        ["id", "paren", "text", "type", "who"]
    );
    assert_eq!(keys(&value["extraCast"][0]), ["id", "name"]);
    assert_eq!(keys(&value["speakers"][0]), ["blocks", "id", "name"]);
    assert_eq!(
        keys(&value["stats"]),
        [
            "blocks",
            "dialogue",
            "kept",
            "narration",
            "staleAudio",
            "voiced",
            "words"
        ]
    );
}

#[test]
fn resolving_applied_writes_the_unit_and_marks_the_card() {
    let script = script_fixture();
    let scripts = FakeScripts::with_script(script.clone(), vec![project_chapter_fixture()]);
    let mut attachments =
        vec![serde_json::to_value(card("sd1", "c1", &rev_of(&script, "c1"))).unwrap()];

    let changes = resolve(
        &mut attachments,
        &ids(&["sd1"]),
        Decision::Applied,
        &sources_for(&scripts),
    )
    .unwrap();

    assert_eq!(attachments[0]["status"], "applied");
    assert_eq!(changes.len(), 1);
    assert_eq!(changes[0].target, ChangeTarget::Script);
    assert_eq!(changes[0].project_id, Some(PROJECT));
    assert_eq!(scripts.saved_units().len(), 1);
    assert_eq!(scripts.saved_casts().len(), 1);
}

#[test]
fn resolving_rejected_only_marks_the_card() {
    let script = script_fixture();
    let scripts = FakeScripts::with_script(script.clone(), vec![project_chapter_fixture()]);
    let mut attachments =
        vec![serde_json::to_value(card("sd1", "c1", &rev_of(&script, "c1"))).unwrap()];

    let changes = resolve(
        &mut attachments,
        &ids(&["sd1"]),
        Decision::Rejected,
        &sources_for(&scripts),
    )
    .unwrap();

    assert!(changes.is_empty());
    assert_eq!(attachments[0]["status"], "rejected");
    assert!(scripts.saved_units().is_empty());
}

#[test]
fn a_resolved_card_cannot_be_applied_twice() {
    let script = script_fixture();
    let scripts = FakeScripts::with_script(script.clone(), vec![project_chapter_fixture()]);
    let mut attachments =
        vec![serde_json::to_value(card("sd1", "c1", &rev_of(&script, "c1"))).unwrap()];
    let sources = sources_for(&scripts);
    resolve(
        &mut attachments,
        &ids(&["sd1"]),
        Decision::Applied,
        &sources,
    )
    .unwrap();

    let error = resolve(
        &mut attachments,
        &ids(&["sd1"]),
        Decision::Applied,
        &sources,
    )
    .unwrap_err();

    assert_eq!(error.code, AssistantErrorCode::Conflict);
    assert_eq!(scripts.saved_units().len(), 1);
}

#[test]
fn other_cards_and_kinds_are_left_alone() {
    let script = script_fixture();
    let scripts = FakeScripts::with_script(script.clone(), vec![project_chapter_fixture()]);
    let mut attachments = vec![
        serde_json::to_value(card("sd1", "c1", &rev_of(&script, "c1"))).unwrap(),
        serde_json::to_value(card("sd2", "c2", "r")).unwrap(),
        json!({ "kind": "pipeline_run", "id": "sd1", "status": "pending" }),
    ];

    resolve(
        &mut attachments,
        &ids(&["sd1"]),
        Decision::Applied,
        &sources_for(&scripts),
    )
    .unwrap();

    assert_eq!(attachments[0]["status"], "applied");
    assert_eq!(attachments[1]["status"], "pending");
    assert_eq!(attachments[2]["status"], "pending");
}

#[test]
fn a_failing_card_keeps_the_progress_of_the_cards_applied_before_it() {
    let script = script_fixture();
    let chapters = vec![project_chapter_fixture(), chapter("c2", 2)];
    let scripts = FakeScripts::with_script(script.clone(), chapters);
    let mut attachments = vec![
        serde_json::to_value(card("sd1", "c1", &rev_of(&script, "c1"))).unwrap(),
        serde_json::to_value(card("sd2", "c2", "stale")).unwrap(),
    ];

    let error = resolve(
        &mut attachments,
        &ids(&["sd1", "sd2"]),
        Decision::Applied,
        &sources_for(&scripts),
    )
    .unwrap_err();

    assert_eq!(error.code, AssistantErrorCode::Conflict);
    assert_eq!(attachments[0]["status"], "applied");
    assert_eq!(attachments[1]["status"], "pending");
    assert_eq!(scripts.saved_units().len(), 1);
}

#[test]
fn a_malformed_card_is_reported_instead_of_applied() {
    let scripts = FakeScripts::with_script(script(Vec::new()), vec![project_chapter_fixture()]);
    let mut attachments = vec![json!({ "kind": "script_draft", "id": "sd1", "status": "pending" })];

    let error = resolve(
        &mut attachments,
        &ids(&["sd1"]),
        Decision::Applied,
        &sources_for(&scripts),
    )
    .unwrap_err();

    assert_eq!(error.code, AssistantErrorCode::Invalid);
    assert!(error.detail.starts_with("the draft card is malformed"));
}
