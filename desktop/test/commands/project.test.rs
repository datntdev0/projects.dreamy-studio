use super::*;
use crate::testing::app::MockHost;
use serde_json::json;

#[test]
fn project_payloads_serialize_as_camel_case() {
    let summary = ProjectSummary {
        id: 3,
        name: "Book".to_string(),
        folder: "projects/book".to_string(),
        template: "audiobook".to_string(),
        description: String::new(),
        novel_id: Some(8),
        novel_missing: true,
        src_kind: Some("original".to_string()),
        src_lang: Some("ZH".to_string()),
        archived: false,
        modules: Vec::new(),
        created_at: "a".to_string(),
        updated_at: "b".to_string(),
        opened_at: "c".to_string(),
    };
    let serialized = serde_json::to_value(summary).unwrap();
    assert_eq!(serialized["novelId"], json!(8));
    assert_eq!(serialized["novelMissing"], json!(true));
    assert!(serialized.get("rangeFrom").is_none());
}

#[test]
fn commands_report_no_workspace() {
    let error = list_projects(&ProjectService::new(), &WorkspaceSession::new()).unwrap_err();
    assert_eq!(error.code, ProjectErrorCode::NoWorkspace);
}

fn project_input() -> serde_json::Value {
    json!({ "name": "Book", "template": "audiobook" })
}

#[test]
fn every_project_command_reports_no_workspace_through_ipc() {
    let host = MockHost::new();

    host.expect_code(
        &[
            ("project_list", json!({})),
            ("project_create", json!({ "input": project_input() })),
            ("project_update", json!({ "id": 1, "patch": {} })),
            ("project_archive", json!({ "ids": [1], "archived": true })),
            ("project_delete", json!({ "ids": [1] })),
            ("project_open", json!({ "id": 1 })),
            ("project_cover_get", json!({ "id": 1 })),
            (
                "project_cover_set",
                json!({ "id": 1, "dataUrl": "data:image/png;base64,AA==" }),
            ),
            ("project_cover_clear", json!({ "id": 1 })),
        ],
        "no_workspace",
    );
}

#[test]
fn projects_are_created_listed_updated_archived_and_deleted_through_ipc() {
    let host = MockHost::new();
    host.open_workspace();

    let created = host
        .invoke("project_create", json!({ "input": project_input() }))
        .unwrap();
    let id = created["id"].as_i64().unwrap();
    let updated = host
        .invoke(
            "project_update",
            json!({ "id": id, "patch": { "name": "Renamed" } }),
        )
        .unwrap();
    let listed = host.invoke("project_list", json!({})).unwrap();
    let opened = host.invoke("project_open", json!({ "id": id })).unwrap();
    let cover = host
        .invoke("project_cover_get", json!({ "id": id }))
        .unwrap();
    host.invoke("project_archive", json!({ "ids": [id], "archived": true }))
        .unwrap();
    let deleted = host
        .invoke("project_delete", json!({ "ids": [id] }))
        .unwrap();

    assert_eq!(created["name"], "Book");
    assert_eq!(updated["name"], "Renamed");
    assert_eq!(listed.as_array().unwrap().len(), 1);
    assert_eq!(opened["id"], id);
    assert!(cover.is_null());
    assert_eq!(deleted, 1);
    assert!(
        host.invoke("project_list", json!({}))
            .unwrap()
            .as_array()
            .unwrap()
            .is_empty()
    );
}

#[test]
fn project_covers_are_set_and_cleared_through_ipc() {
    let host = MockHost::new();
    host.open_workspace();
    let created = host
        .invoke("project_create", json!({ "input": project_input() }))
        .unwrap();
    let id = created["id"].as_i64().unwrap();
    let png = "data:image/png;base64,iVBORw0KGgo=";

    host.invoke("project_cover_set", json!({ "id": id, "dataUrl": png }))
        .unwrap();
    let stored = host
        .invoke("project_cover_get", json!({ "id": id }))
        .unwrap();
    host.invoke("project_cover_clear", json!({ "id": id }))
        .unwrap();
    let cleared = host
        .invoke("project_cover_get", json!({ "id": id }))
        .unwrap();

    assert_eq!(stored, png);
    assert!(cleared.is_null());
}
