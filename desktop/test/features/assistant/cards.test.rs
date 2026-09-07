use super::*;
use crate::features::assistant::models::AssistantErrorCode;
use serde_json::json;

fn card(id: &str, kind: &str, status: &str) -> Value {
    json!({ "kind": kind, "id": id, "status": status })
}

fn ids(values: &[&str]) -> Vec<String> {
    values.iter().map(|value| value.to_string()).collect()
}

#[test]
fn picked_selects_the_cards_of_one_kind_by_id() {
    let attachments = vec![
        card("a1", "pipeline_run", "pending"),
        card("a1", "script_draft", "pending"),
        card("a2", "script_draft", "pending"),
    ];

    assert_eq!(
        picked(&attachments, "script_draft", &ids(&["a1", "a2"])),
        vec![1, 2]
    );
    assert_eq!(
        picked(&attachments, "pipeline_run", &ids(&["a2"])),
        Vec::<usize>::new()
    );
}

#[test]
fn a_card_must_be_pending_to_be_resolved() {
    assert!(require_pending(&card("a1", "x", PENDING)).is_ok());

    let error = require_pending(&card("a1", "x", "applied")).unwrap_err();

    assert_eq!(error.code, AssistantErrorCode::Conflict);
    assert_eq!(error.detail, "card a1 is already applied");
}

#[test]
fn a_card_without_status_is_reported_as_resolved() {
    let error = require_pending(&json!({ "kind": "x", "id": "a1" })).unwrap_err();

    assert_eq!(error.detail, "card a1 is already resolved");
}

#[test]
fn unknown_cards_are_reported_by_require_cards() {
    let attachments = vec![
        card("pr1", "pipeline_run", "pending"),
        card("sd1", "script_draft", "pending"),
        json!({ "kind": "translation_review", "id": "pr2" }),
    ];
    let kinds = ["pipeline_run", "script_draft"];

    assert!(require_cards(&attachments, &ids(&["pr1", "sd1"]), &kinds).is_ok());

    let error = require_cards(&attachments, &ids(&["pr1", "pr2", "x"]), &kinds).unwrap_err();

    assert_eq!(error.code, AssistantErrorCode::NotFound);
    assert_eq!(error.detail, "no confirmation card matches: pr2, x");
}

#[test]
fn require_cards_checks_only_the_listed_kinds() {
    let attachments = vec![card("sd1", "script_draft", "pending")];

    let error = require_cards(&attachments, &ids(&["sd1"]), &["pipeline_run"]).unwrap_err();

    assert_eq!(error.code, AssistantErrorCode::NotFound);
}
