use super::*;
use crate::features::assistant::models::ScopeKind;
use crate::testing::assistant::RecordingActivities;

fn grant(workspace: &str, sink: Arc<RecordingActivities>) -> Grant {
    Grant {
        workspace: workspace.to_string(),
        scope: AssistantScope {
            kind: ScopeKind::Workspace,
            novel_id: None,
        },
        activities: sink,
    }
}

#[test]
fn issue_returns_a_uuid_token_that_resolves_to_the_grant() {
    let grants = McpGrants::new();
    let token = grants.issue(grant("ws-1", Arc::new(RecordingActivities::new())));
    assert!(Uuid::parse_str(&token).is_ok());
    let found = grants.get(&token).unwrap();
    assert_eq!(found.workspace, "ws-1");
    assert_eq!(found.scope.kind, ScopeKind::Workspace);
}

#[test]
fn every_issue_gives_a_distinct_token() {
    let grants = McpGrants::new();
    let sink = Arc::new(RecordingActivities::new());
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
    let sink = Arc::new(RecordingActivities::new());
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
    let token = grants.issue(grant("ws-1", Arc::new(RecordingActivities::new())));
    assert!(clone.get(&token).is_some());
    clone.revoke(&token);
    assert!(grants.get(&token).is_none());
}

#[test]
fn grant_activities_reach_the_sink() {
    let grants = McpGrants::new();
    let sink = Arc::new(RecordingActivities::new());
    let token = grants.issue(grant("ws-1", sink.clone()));
    grants
        .get(&token)
        .unwrap()
        .activities
        .record("label".to_string());
    assert_eq!(sink.labels(), vec!["label".to_string()]);
}
