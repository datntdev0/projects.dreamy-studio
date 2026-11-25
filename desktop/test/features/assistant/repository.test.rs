use super::*;
use crate::features::assistant::models::AssistantSession;
use crate::infra::storage::database::Database;
use crate::infra::storage::migrator::Migrator;
use crate::infra::storage::migrator::workspace_scripts;
use rusqlite::params;
use serde_json::json;
use std::sync::atomic::AtomicBool;
use tempfile::TempDir;

struct Fixture {
    _dir: TempDir,
    database: Database,
}

fn fixture() -> Fixture {
    let dir = TempDir::new().unwrap();
    let path = dir.path().join("workspace.dreamydb");
    let mut database = Database::create(&path).unwrap();
    let cancel = AtomicBool::new(false);
    Migrator::migrate(
        database.connection_mut(),
        &workspace_scripts().unwrap(),
        &cancel,
    )
    .unwrap();
    Fixture {
        _dir: dir,
        database,
    }
}

fn record(id: &str, count: i64, updated_at: &str) -> SessionRecord {
    SessionRecord {
        summary: AssistantSessionSummary {
            id: id.to_string(),
            title: format!("title {id}"),
            scope: AssistantScope {
                kind: ScopeKind::Workspace,
                novel_id: None,
                project_id: None,
            },
            created_at: "2026-11-01T00:00:00+00:00".to_string(),
            updated_at: updated_at.to_string(),
            message_count: count,
            preview: format!("preview {id}"),
            edit_granted: false,
        },
        provider: None,
        cli_session: None,
        context: None,
    }
}

fn message(id: &str, role: Role) -> AssistantMessage {
    AssistantMessage {
        id: id.to_string(),
        role,
        text: format!("text {id}"),
        created_at: "2026-11-01T00:00:01+00:00".to_string(),
        activities: Vec::new(),
        citations: Vec::new(),
        attachments: Vec::new(),
    }
}

#[test]
fn round_trips_a_session_record() {
    let fixture = fixture();
    let repo = AssistantRepository::new(fixture.database.connection());
    let mut stored = record("s1", 0, "2026-11-01T00:00:00+00:00");
    stored.provider = Some("claude".to_string());
    stored.cli_session = Some("cli-1".to_string());
    stored.summary.scope = AssistantScope {
        kind: ScopeKind::Novel,
        novel_id: Some(7),
        project_id: None,
    };
    repo.insert_session(&stored).unwrap();
    assert_eq!(repo.find("s1").unwrap(), Some(stored.clone()));
    assert_eq!(repo.find("missing").unwrap(), None);
    stored.summary.title = "renamed".to_string();
    stored.summary.message_count = 2;
    stored.summary.preview = "latest".to_string();
    stored.summary.updated_at = "2026-11-02T00:00:00+00:00".to_string();
    stored.provider = Some("codex".to_string());
    stored.cli_session = None;
    repo.update_session(&stored).unwrap();
    assert_eq!(repo.find("s1").unwrap(), Some(stored));
}

#[test]
fn round_trips_the_project_scope_and_lists_it() {
    let fixture = fixture();
    let repo = AssistantRepository::new(fixture.database.connection());
    let mut stored = record("s1", 1, "2026-11-01T00:00:00+00:00");
    stored.summary.scope = AssistantScope::project(4);
    repo.insert_session(&stored).unwrap();
    assert_eq!(repo.find("s1").unwrap(), Some(stored.clone()));
    assert_eq!(repo.list().unwrap()[0].scope, AssistantScope::project(4));
    stored.summary.scope = AssistantScope::project(8);
    repo.update_session(&stored).unwrap();
    assert_eq!(
        repo.find("s1").unwrap().unwrap().summary.scope,
        AssistantScope::project(8)
    );
}

#[test]
fn round_trips_the_edit_grant() {
    let fixture = fixture();
    let repo = AssistantRepository::new(fixture.database.connection());
    let mut granted = record("s1", 1, "2026-11-01T00:00:00+00:00");
    granted.summary.edit_granted = true;
    repo.insert_session(&granted).unwrap();
    repo.insert_session(&record("s2", 1, "2026-11-02T00:00:00+00:00"))
        .unwrap();
    assert!(repo.find("s1").unwrap().unwrap().summary.edit_granted);
    assert!(!repo.find("s2").unwrap().unwrap().summary.edit_granted);
    let listed: Vec<bool> = repo
        .list()
        .unwrap()
        .into_iter()
        .map(|item| item.edit_granted)
        .collect();
    assert_eq!(listed, vec![false, true]);
    granted.summary.edit_granted = false;
    repo.update_session(&granted).unwrap();
    assert!(!repo.find("s1").unwrap().unwrap().summary.edit_granted);
}

#[test]
fn round_trips_messages_with_json_columns() {
    let fixture = fixture();
    let repo = AssistantRepository::new(fixture.database.connection());
    repo.insert_session(&record("s1", 0, "2026-11-01T00:00:00+00:00"))
        .unwrap();
    let mut reply = message("m2", Role::Assistant);
    reply.activities = vec!["list_novel() → 2".to_string()];
    reply.citations = vec![AssistantCitation {
        novel_id: 1,
        chapter: 3,
        p: 6,
        quote: "quote".to_string(),
    }];
    reply.attachments = vec![json!({"kind": "translation_review", "chapter": 1})];
    repo.append("s1", &message("m1", Role::User)).unwrap();
    repo.append("s1", &reply).unwrap();
    let loaded = repo.messages("s1").unwrap();
    assert_eq!(loaded.len(), 2);
    assert_eq!(loaded[0], message("m1", Role::User));
    assert_eq!(loaded[1], reply);
}

#[test]
fn append_assigns_increasing_seq_per_session() {
    let fixture = fixture();
    let repo = AssistantRepository::new(fixture.database.connection());
    assert_eq!(repo.append("s1", &message("a", Role::User)).unwrap(), 1);
    assert_eq!(
        repo.append("s1", &message("b", Role::Assistant)).unwrap(),
        2
    );
    assert_eq!(repo.append("s1", &message("c", Role::User)).unwrap(), 3);
    assert_eq!(repo.append("s2", &message("d", Role::User)).unwrap(), 1);
    let ids: Vec<String> = repo
        .messages("s1")
        .unwrap()
        .into_iter()
        .map(|item| item.id)
        .collect();
    assert_eq!(ids, vec!["a", "b", "c"]);
}

#[test]
fn list_skips_empty_sessions_and_orders_newest_first() {
    let fixture = fixture();
    let repo = AssistantRepository::new(fixture.database.connection());
    repo.insert_session(&record("old", 2, "2026-11-01T00:00:00+00:00"))
        .unwrap();
    repo.insert_session(&record("empty", 0, "2026-11-09T00:00:00+00:00"))
        .unwrap();
    repo.insert_session(&record("new", 1, "2026-11-05T00:00:00+00:00"))
        .unwrap();
    let ids: Vec<String> = repo
        .list()
        .unwrap()
        .into_iter()
        .map(|item| item.id)
        .collect();
    assert_eq!(ids, vec!["new", "old"]);
}

#[test]
fn remove_message_drops_only_that_message() {
    let fixture = fixture();
    let repo = AssistantRepository::new(fixture.database.connection());
    repo.append("s1", &message("a", Role::User)).unwrap();
    repo.append("s1", &message("b", Role::Assistant)).unwrap();
    repo.remove_message("b").unwrap();
    let ids: Vec<String> = repo
        .messages("s1")
        .unwrap()
        .into_iter()
        .map(|item| item.id)
        .collect();
    assert_eq!(ids, vec!["a"]);
    assert_eq!(repo.append("s1", &message("c", Role::User)).unwrap(), 2);
}

#[test]
fn find_message_is_scoped_to_its_session() {
    let fixture = fixture();
    let repo = AssistantRepository::new(fixture.database.connection());
    let mut reply = message("m1", Role::Assistant);
    reply.attachments = vec![json!({"kind": "translation_review"})];
    repo.append("s1", &reply).unwrap();
    repo.append("s2", &message("m2", Role::User)).unwrap();
    assert_eq!(repo.find_message("s1", "m1").unwrap(), Some(reply));
    assert_eq!(repo.find_message("s2", "m1").unwrap(), None);
    assert_eq!(repo.find_message("s1", "missing").unwrap(), None);
}

#[test]
fn update_attachments_replaces_only_that_message() {
    let fixture = fixture();
    let repo = AssistantRepository::new(fixture.database.connection());
    repo.append("s1", &message("m1", Role::Assistant)).unwrap();
    repo.append("s1", &message("m2", Role::Assistant)).unwrap();
    let attachments = vec![
        json!({"kind": "translation_review", "checked": 3}),
        json!(1),
    ];
    repo.update_attachments("m1", &attachments).unwrap();
    assert_eq!(
        repo.find_message("s1", "m1").unwrap().unwrap().attachments,
        attachments
    );
    assert!(
        repo.find_message("s1", "m2")
            .unwrap()
            .unwrap()
            .attachments
            .is_empty()
    );
    repo.update_attachments("m1", &[]).unwrap();
    assert!(
        repo.find_message("s1", "m1")
            .unwrap()
            .unwrap()
            .attachments
            .is_empty()
    );
    repo.update_attachments("missing", &attachments).unwrap();
}

#[test]
fn delete_removes_session_and_its_messages() {
    let fixture = fixture();
    let repo = AssistantRepository::new(fixture.database.connection());
    repo.insert_session(&record("s1", 1, "2026-11-01T00:00:00+00:00"))
        .unwrap();
    repo.insert_session(&record("s2", 1, "2026-11-02T00:00:00+00:00"))
        .unwrap();
    repo.append("s1", &message("a", Role::User)).unwrap();
    repo.append("s2", &message("b", Role::User)).unwrap();
    assert!(repo.delete("s1").unwrap());
    assert!(!repo.delete("s1").unwrap());
    assert_eq!(repo.find("s1").unwrap(), None);
    assert!(repo.messages("s1").unwrap().is_empty());
    assert_eq!(repo.messages("s2").unwrap().len(), 1);
}

#[test]
fn corrupt_json_columns_load_as_empty_lists() {
    let fixture = fixture();
    let conn = fixture.database.connection();
    let repo = AssistantRepository::new(conn);
    repo.append("s1", &message("a", Role::Assistant)).unwrap();
    conn.execute(
        "UPDATE ws_assistant_messages SET activities = ?1, citations = ?2, attachments = ?3 \
         WHERE id = ?4",
        params!["not json", "{\"x\":1}", "[1,", "a"],
    )
    .unwrap();
    let loaded = repo.messages("s1").unwrap();
    assert_eq!(loaded.len(), 1);
    assert!(loaded[0].activities.is_empty());
    assert!(loaded[0].citations.is_empty());
    assert!(loaded[0].attachments.is_empty());
}

#[test]
fn serializes_session_in_wire_format() {
    let session = AssistantSession {
        summary: record("s1", 1, "2026-11-01T00:00:00+00:00").summary,
        messages: vec![message("m1", Role::User)],
        context: None,
    };
    let value = serde_json::to_value(&session).unwrap();
    assert_eq!(value["messageCount"], 1);
    assert_eq!(value["editGranted"], false);
    assert_eq!(
        value["scope"],
        json!({"kind": "workspace", "novelId": null, "projectId": null})
    );
    assert_eq!(value["messages"][0]["role"], "user");
    assert_eq!(
        value["messages"][0]["createdAt"],
        "2026-11-01T00:00:01+00:00"
    );
}
