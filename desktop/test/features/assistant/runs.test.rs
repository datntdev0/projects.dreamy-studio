use super::*;
use crate::features::assistant::models::AssistantErrorCode;
use crate::testing::assistant::RecordingSink;
use serde_json::json;

fn plan() -> RunPlan {
    RunPlan {
        job: RunJob::Translation,
        owner: RunOwner::novel(3),
        title: "Novel".to_string(),
        target: Some("VI".to_string()),
        mode: None,
        overwrite: false,
        items: vec![
            RunItem {
                id: "c1".to_string(),
                seq: Some(1),
                title: "One".to_string(),
                tasks: 1,
                note: None,
                block_ids: None,
            },
            RunItem {
                id: "c2".to_string(),
                seq: Some(2),
                title: "Two".to_string(),
                tasks: 2,
                note: Some("note".to_string()),
                block_ids: Some(vec!["b1".to_string()]),
            },
        ],
        skipped: vec![RunSkip {
            id: "c3".to_string(),
            seq: None,
            title: "Three".to_string(),
            reason: "why".to_string(),
        }],
        warnings: vec!["careful".to_string()],
    }
}

fn card(id: &str, status: &str) -> Value {
    json!({ "kind": RUN_KIND, "id": id, "status": status, "pipelineId": null })
}

fn ids(values: &[&str]) -> Vec<String> {
    values.iter().map(|value| value.to_string()).collect()
}

#[test]
fn submit_attaches_the_card_and_answers_with_a_summary() {
    let sink = RecordingSink::new();

    let output = submit(&plan(), "start_translation(novel 3, VI)", &sink).unwrap();

    let value: Value = serde_json::from_str(&output.text).unwrap();
    assert_eq!(value["cardId"], "pr1");
    assert_eq!(value["job"], "translation");
    assert_eq!(value["totalTasks"], 3);
    assert_eq!(value["status"], "pending");
    assert_eq!(value["warnings"], json!(["careful"]));
    assert_eq!(value["skipped"][0]["reason"], "why");
    assert_eq!(
        output.label,
        "start_translation(novel 3, VI) → 3 tác vụ, chờ xác nhận"
    );
    let card = &sink.attachments()[0];
    assert_eq!(card["kind"], "pipeline_run");
    assert_eq!(card["owner"], json!({ "novelId": 3, "projectId": null }));
    assert_eq!(card["items"][1]["blockIds"], json!(["b1"]));
    assert_eq!(card["items"][0]["blockIds"], Value::Null);
    assert_eq!(card["pipelineId"], Value::Null);
}

#[test]
fn card_ids_count_up_within_the_message() {
    let sink = RecordingSink::new();

    let first = submit(&plan(), "a", &sink).unwrap();
    let second = submit(&plan(), "b", &sink).unwrap();

    assert!(first.text.contains("\"cardId\":\"pr1\""));
    assert!(second.text.contains("\"cardId\":\"pr2\""));
}

#[test]
fn a_plan_without_items_reports_why_nothing_runs() {
    let mut empty = plan();
    empty.items.clear();

    let error = empty.require_work().unwrap_err();

    assert_eq!(error, "nothing is left to run. Skipped: Three: why");
    assert!(plan().require_work().is_ok());
}

#[test]
fn resolving_applied_stores_the_status_and_the_pipeline_id() {
    let mut attachments = vec![card("pr1", "pending"), card("pr2", "pending")];

    resolve(
        &mut attachments,
        &ids(&["pr2"]),
        Decision::Applied,
        Some(41),
    )
    .unwrap();

    assert_eq!(attachments[0]["status"], "pending");
    assert_eq!(attachments[1]["status"], "applied");
    assert_eq!(attachments[1]["pipelineId"], 41);
}

#[test]
fn resolving_applied_without_a_pipeline_id_keeps_it_null() {
    let mut attachments = vec![card("pr1", "pending")];

    resolve(&mut attachments, &ids(&["pr1"]), Decision::Applied, None).unwrap();

    assert_eq!(attachments[0]["status"], "applied");
    assert_eq!(attachments[0]["pipelineId"], Value::Null);
}

#[test]
fn resolving_rejected_only_changes_the_status() {
    let mut attachments = vec![card("pr1", "pending")];

    resolve(
        &mut attachments,
        &ids(&["pr1"]),
        Decision::Rejected,
        Some(9),
    )
    .unwrap();

    assert_eq!(attachments[0]["status"], "rejected");
    assert_eq!(attachments[0]["pipelineId"], Value::Null);
}

#[test]
fn a_resolved_card_cannot_be_resolved_twice() {
    let mut attachments = vec![card("pr1", "pending"), card("pr2", "applied")];

    let error = resolve(
        &mut attachments,
        &ids(&["pr1", "pr2"]),
        Decision::Rejected,
        None,
    )
    .unwrap_err();

    assert_eq!(error.code, AssistantErrorCode::Conflict);
    assert_eq!(error.detail, "card pr2 is already applied");
    assert_eq!(attachments[0]["status"], "pending");
}

#[test]
fn other_attachments_and_unknown_ids_are_left_alone() {
    let mut attachments = vec![
        json!({ "kind": "translation_review", "id": "pr1", "status": "pending" }),
        card("pr2", "pending"),
    ];

    resolve(
        &mut attachments,
        &ids(&["pr1", "f1"]),
        Decision::Applied,
        None,
    )
    .unwrap();

    assert_eq!(attachments[0]["status"], "pending");
    assert_eq!(attachments[1]["status"], "pending");
}

#[test]
fn unknown_cards_are_reported_by_require_cards() {
    let attachments = vec![
        card("pr1", "pending"),
        json!({ "kind": "translation_review", "id": "pr2" }),
    ];

    assert!(require_cards(&attachments, &ids(&["pr1"])).is_ok());

    let error = require_cards(&attachments, &ids(&["pr1", "pr2", "x"])).unwrap_err();

    assert_eq!(error.code, AssistantErrorCode::NotFound);
    assert_eq!(error.detail, "no confirmation card matches: pr2, x");
}
