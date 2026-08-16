use super::*;
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
        range_from: Some(1),
        range_to: Some(2),
        archived: false,
        created_at: "a".to_string(),
        updated_at: "b".to_string(),
        opened_at: "c".to_string(),
    };
    let entry = DirEntry {
        name: "cover.png".to_string(),
        kind: "file".to_string(),
        size: 12,
    };
    let serialized = serde_json::to_value(summary).unwrap();
    assert_eq!(serialized["novelId"], json!(8));
    assert_eq!(serialized["novelMissing"], json!(true));
    assert_eq!(serialized["rangeFrom"], json!(1));
    let serialized_entry = serde_json::to_value(entry).unwrap();
    assert_eq!(
        serialized_entry,
        json!({"name":"cover.png","kind":"file","size":12})
    );
}

#[test]
fn commands_report_no_workspace() {
    let error = list_projects(&ProjectService::new(), &WorkspaceSession::new()).unwrap_err();
    assert_eq!(error.code, ProjectErrorCode::NoWorkspace);
}
