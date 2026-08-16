use super::*;
use crate::features::library::models::AssetRights;
use crate::features::library::models::KindCounts;
use serde_json::json;

#[test]
fn library_payloads_serialize_as_camel_case() {
    let collection = LibraryCollection {
        id: 2,
        name: "Folder".into(),
        description: "Text".into(),
        created_at: "a".into(),
        updated_at: "b".into(),
        counts: KindCounts::default(),
    };
    let value = serde_json::to_value(collection).unwrap();
    assert_eq!(value["createdAt"], json!("a"));
    assert!(value.get("created_at").is_none());
    assert_eq!(value["counts"]["image"], json!(0));
    assert_eq!(
        serde_json::to_value(LibraryError::new(LibraryErrorCode::NoWorkspace, "closed")).unwrap(),
        json!({"code":"no_workspace","detail":"closed"})
    );

    let image = LibraryImage {
        id: 3,
        name: "Sky.png".into(),
        ext: "png".into(),
        size: 12,
        width: 2,
        height: 3,
        rights: AssetRights::Own,
        origin: "upload".into(),
        collection_id: Some(4),
        tags: vec!["sky".into()],
        created_at: "c".into(),
        updated_at: "d".into(),
    };
    let value = serde_json::to_value(image).unwrap();
    assert_eq!(value["collectionId"], json!(4));
    assert_eq!(value["createdAt"], json!("c"));
    assert!(value.get("collection_id").is_none());

    let sound = LibrarySound {
        id: 4,
        name: "Rain.wav".into(),
        ext: "wav".into(),
        size: 24,
        duration_ms: 1_000,
        sample_rate: 44_100,
        channels: 2,
        overview: [0; 32],
        rights: AssetRights::Free,
        origin: "upload".into(),
        collection_id: None,
        tags: vec!["rain".into()],
        created_at: "e".into(),
        updated_at: "f".into(),
    };
    let value = serde_json::to_value(sound).unwrap();
    assert_eq!(value["durationMs"], json!(1_000));
    assert_eq!(value["sampleRate"], json!(44_100));
    assert_eq!(value["collectionId"], serde_json::Value::Null);
    assert!(value.get("duration_ms").is_none());

    let prompt = LibraryPrompt {
        id: 5,
        name: "Prompt".into(),
        kind: crate::features::library::models::PromptKind::General,
        text: "text".into(),
        size: 4,
        rights: AssetRights::Own,
        origin: "app".into(),
        collection_id: Some(6),
        tags: vec![],
        created_at: "g".into(),
        updated_at: "h".into(),
    };
    let value = serde_json::to_value(prompt).unwrap();
    assert_eq!(value["collectionId"], json!(6));
    assert_eq!(value["createdAt"], json!("g"));
    assert!(value.get("collection_id").is_none());
}

#[test]
fn prompt_patch_deserializes_collection_variants() {
    let absent: PromptPatch = serde_json::from_value(json!({})).unwrap();
    let null: PromptPatch = serde_json::from_value(json!({"collectionId": null})).unwrap();
    let number: PromptPatch = serde_json::from_value(json!({"collectionId": 7})).unwrap();
    assert_eq!(absent.collection_id, None);
    assert_eq!(null.collection_id, Some(None));
    assert_eq!(number.collection_id, Some(Some(7)));
}

#[test]
fn commands_report_no_workspace() {
    assert_eq!(
        get_summary(&LibraryService::new(), &WorkspaceSession::new())
            .unwrap_err()
            .code,
        LibraryErrorCode::NoWorkspace
    );
    assert_eq!(
        list_images(&LibraryService::new(), &WorkspaceSession::new())
            .unwrap_err()
            .code,
        LibraryErrorCode::NoWorkspace
    );
    assert_eq!(
        list_sounds(&LibraryService::new(), &WorkspaceSession::new())
            .unwrap_err()
            .code,
        LibraryErrorCode::NoWorkspace
    );
    assert_eq!(
        list_prompts(&LibraryService::new(), &WorkspaceSession::new())
            .unwrap_err()
            .code,
        LibraryErrorCode::NoWorkspace
    );
}
