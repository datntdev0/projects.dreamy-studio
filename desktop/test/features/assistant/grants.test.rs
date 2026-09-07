use super::*;
use crate::features::assistant::models::AssistantChange;
use crate::features::assistant::models::ChangeTarget;
use crate::features::assistant::models::ScopeKind;
use crate::testing::assistant::RecordingSink;

fn grant(workspace: &str, sink: Arc<RecordingSink>) -> Grant {
    Grant {
        workspace: workspace.to_string(),
        scope: AssistantScope {
            kind: ScopeKind::Workspace,
            novel_id: None,
            project_id: None,
        },
        can_edit: false,
        sink,
    }
}

#[test]
fn issue_returns_a_uuid_token_that_resolves_to_the_grant() {
    let grants = McpGrants::new();
    let token = grants.issue(grant("ws-1", Arc::new(RecordingSink::new())));
    assert!(Uuid::parse_str(&token).is_ok());
    let found = grants.get(&token).unwrap();
    assert_eq!(found.workspace, "ws-1");
    assert_eq!(found.scope.kind, ScopeKind::Workspace);
}

#[test]
fn every_issue_gives_a_distinct_token() {
    let grants = McpGrants::new();
    let sink = Arc::new(RecordingSink::new());
    let first = grants.issue(grant("ws-1", sink.clone()));
    let second = grants.issue(grant("ws-1", sink));
    assert_ne!(first, second);
}

#[test]
fn unknown_token_has_no_grant() {
    let grants = McpGrants::new();
    assert!(grants.get("missing").is_none());
}

#[test]
fn revoke_removes_only_that_token() {
    let grants = McpGrants::new();
    let sink = Arc::new(RecordingSink::new());
    let first = grants.issue(grant("ws-1", sink.clone()));
    let second = grants.issue(grant("ws-2", sink));
    grants.revoke(&first);
    assert!(grants.get(&first).is_none());
    assert_eq!(grants.get(&second).unwrap().workspace, "ws-2");
    grants.revoke(&first);
}

#[test]
fn clones_share_the_same_grants() {
    let grants = McpGrants::new();
    let clone = grants.clone();
    let token = grants.issue(grant("ws-1", Arc::new(RecordingSink::new())));
    assert!(clone.get(&token).is_some());
    clone.revoke(&token);
    assert!(grants.get(&token).is_none());
}

#[test]
fn grant_sink_receives_labels_and_changes() {
    let grants = McpGrants::new();
    let sink = Arc::new(RecordingSink::new());
    let token = grants.issue(grant("ws-1", sink.clone()));
    grants.get(&token).unwrap().sink.record("label".to_string());
    assert_eq!(sink.labels(), vec!["label".to_string()]);
}

#[test]
fn grant_sink_receives_changes() {
    let grants = McpGrants::new();
    let sink = Arc::new(RecordingSink::new());
    let token = grants.issue(grant("ws-1", sink.clone()));
    let change = AssistantChange {
        target: ChangeTarget::Novel,
        novel_id: Some(3),
        project_id: None,
        chapter_id: None,
        lang: None,
        translation_target: None,
    };
    grants.get(&token).unwrap().sink.changed(change.clone());
    assert_eq!(sink.changes(), vec![change]);
}

#[test]
fn grant_keeps_the_edit_flag() {
    let grants = McpGrants::new();
    let mut editable = grant("ws-1", Arc::new(RecordingSink::new()));
    editable.can_edit = true;
    let on = grants.issue(editable);
    let off = grants.issue(grant("ws-1", Arc::new(RecordingSink::new())));
    assert!(grants.get(&on).unwrap().can_edit);
    assert!(!grants.get(&off).unwrap().can_edit);
}

fn card(kind: &str, id: &str) -> serde_json::Value {
    serde_json::json!({ "kind": kind, "id": id })
}

#[test]
fn card_numbers_start_at_one() {
    assert_eq!(next_card_number(&[], "script_draft"), 1);
    assert_eq!(
        next_card_number(&[card("pipeline_run", "pr4")], "script_draft"),
        1
    );
}

#[test]
fn card_numbers_follow_the_highest_number_of_the_kind() {
    let cards = [
        card("script_draft", "sd1"),
        card("script_draft", "sd7"),
        card("script_draft", "sd3"),
        card("pipeline_run", "pr9"),
    ];

    assert_eq!(next_card_number(&cards, "script_draft"), 8);
    assert_eq!(next_card_number(&cards, "pipeline_run"), 10);
}

#[test]
fn card_ids_without_a_number_are_ignored() {
    let cards = [card("script_draft", "sd"), card("script_draft", "sd2")];

    assert_eq!(next_card_number(&cards, "script_draft"), 3);
    assert_eq!(
        next_card_number(&[card("script_draft", "draft")], "script_draft"),
        1
    );
}
