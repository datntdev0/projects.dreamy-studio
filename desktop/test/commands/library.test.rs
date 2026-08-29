use super::*;
use crate::features::library::models::AssetRights;
use crate::features::library::models::KindCounts;
use crate::testing::app::MockHost;
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

fn upload_input() -> serde_json::Value {
    json!({ "collectionId": null, "tags": ["a"], "rights": "own" })
}

fn prompt_input() -> serde_json::Value {
    json!({
        "name": "Scene",
        "kind": "image",
        "text": "a quiet harbour",
        "tags": ["Sea"],
        "rights": "own"
    })
}

fn asset_calls(kind: &str) -> Vec<(String, serde_json::Value)> {
    vec![
        (
            format!("library_{kind}_inspect"),
            json!({ "paths": ["missing.bin"] }),
        ),
        (
            format!("library_{kind}_upload"),
            json!({ "path": "missing.bin", "input": upload_input() }),
        ),
        (format!("library_{kind}_list"), json!({})),
        (
            format!("library_{kind}_update"),
            json!({ "id": 1, "patch": {} }),
        ),
        (format!("library_{kind}_delete"), json!({ "ids": [1] })),
    ]
}

fn library_calls() -> Vec<(String, serde_json::Value)> {
    let mut calls = vec![
        ("library_summary".to_string(), json!({})),
        ("library_collection_list".to_string(), json!({})),
        (
            "library_collection_create".to_string(),
            json!({ "input": { "name": "Folder" } }),
        ),
        (
            "library_collection_update".to_string(),
            json!({ "id": 1, "patch": {} }),
        ),
        ("library_collection_delete".to_string(), json!({ "id": 1 })),
        ("library_tag_list".to_string(), json!({})),
        (
            "library_tag_rename".to_string(),
            json!({ "from": "a", "to": "b" }),
        ),
        (
            "library_tag_merge".to_string(),
            json!({ "from": "a", "into": "b" }),
        ),
        ("library_tag_delete".to_string(), json!({ "tag": "a" })),
        ("library_image_thumb".to_string(), json!({ "id": 1 })),
        ("library_image_read".to_string(), json!({ "id": 1 })),
        ("library_sound_peaks".to_string(), json!({ "id": 1 })),
        ("library_video_poster".to_string(), json!({ "id": 1 })),
        (
            "library_prompt_create".to_string(),
            json!({ "input": prompt_input() }),
        ),
    ];
    for kind in ["image", "sound", "video", "prompt"] {
        calls.extend(asset_calls(kind));
    }
    calls
}

#[test]
fn every_library_command_reports_no_workspace_through_ipc() {
    let host = MockHost::new();
    let calls = library_calls();
    let borrowed: Vec<(&str, serde_json::Value)> = calls
        .iter()
        .map(|(cmd, payload)| (cmd.as_str(), payload.clone()))
        .collect();

    host.expect_code(&borrowed, "no_workspace");
}

#[test]
fn library_commands_reject_unknown_rows_and_files_in_an_open_workspace() {
    let host = MockHost::new();
    host.open_workspace();
    let rejected = [
        "library_collection_update",
        "library_collection_delete",
        "library_tag_rename",
        "library_tag_merge",
        "library_image_thumb",
        "library_image_read",
        "library_sound_peaks",
        "library_image_upload",
        "library_image_update",
        "library_sound_upload",
        "library_sound_update",
        "library_video_upload",
        "library_video_update",
        "library_prompt_upload",
        "library_prompt_update",
    ];

    for (cmd, payload) in library_calls() {
        if rejected.contains(&cmd.as_str()) {
            assert!(host.invoke(&cmd, payload).is_err(), "{cmd}");
        }
    }
}

#[test]
fn library_lists_and_inspections_work_in_an_open_workspace() {
    let host = MockHost::new();
    host.open_workspace();

    for kind in ["image", "sound", "video", "prompt"] {
        let list = host.invoke(&format!("library_{kind}_list"), json!({}));
        let inspect = host.invoke(
            &format!("library_{kind}_inspect"),
            json!({ "paths": ["missing.bin"] }),
        );
        let delete = host.invoke(&format!("library_{kind}_delete"), json!({ "ids": [] }));

        assert!(list.unwrap().as_array().unwrap().is_empty(), "{kind}");
        assert_eq!(inspect.unwrap().as_array().unwrap().len(), 1, "{kind}");
        assert_eq!(delete.unwrap(), 0, "{kind}");
    }
    assert!(host.invoke("library_summary", json!({})).is_ok());
    assert!(
        host.invoke("library_tag_list", json!({}))
            .unwrap()
            .is_array()
    );
    assert!(
        host.invoke("library_tag_delete", json!({ "tag": "none" }))
            .is_err()
    );
    assert!(
        host.invoke("library_video_poster", json!({ "id": 1 }))
            .is_err()
    );
}

#[test]
fn collections_and_prompts_round_trip_through_ipc() {
    let host = MockHost::new();
    host.open_workspace();

    let folder = host
        .invoke(
            "library_collection_create",
            json!({ "input": { "name": "Folder" } }),
        )
        .unwrap();
    let folder_id = folder["id"].as_i64().unwrap();
    let renamed = host
        .invoke(
            "library_collection_update",
            json!({ "id": folder_id, "patch": { "name": "Shelf" } }),
        )
        .unwrap();
    let prompt = host
        .invoke("library_prompt_create", json!({ "input": prompt_input() }))
        .unwrap();
    let prompt_id = prompt["id"].as_i64().unwrap();
    let edited = host
        .invoke(
            "library_prompt_update",
            json!({ "id": prompt_id, "patch": { "text": "a loud harbour" } }),
        )
        .unwrap();
    let mut land = prompt_input();
    land["tags"] = json!(["Land"]);
    host.invoke("library_prompt_create", json!({ "input": land }))
        .unwrap();
    let tag = host
        .invoke(
            "library_tag_rename",
            json!({ "from": "sea", "to": "ocean" }),
        )
        .unwrap();
    let merged = host
        .invoke(
            "library_tag_merge",
            json!({ "from": "ocean", "into": "land" }),
        )
        .unwrap();
    let removed_tag = host
        .invoke("library_tag_delete", json!({ "tag": "land" }))
        .unwrap();
    let removed_prompt = host
        .invoke("library_prompt_delete", json!({ "ids": [prompt_id] }))
        .unwrap();
    let removed_folder = host
        .invoke("library_collection_delete", json!({ "id": folder_id }))
        .unwrap();

    assert_eq!(renamed["name"], "Shelf");
    assert_eq!(edited["text"], "a loud harbour");
    assert_eq!(tag["tag"], "ocean");
    assert_eq!(merged["tag"], "land");
    assert!(removed_tag.as_i64().unwrap() >= 0);
    assert_eq!(removed_prompt, 1);
    assert_eq!(removed_folder, 0);
    assert!(
        host.invoke("library_collection_list", json!({}))
            .unwrap()
            .as_array()
            .unwrap()
            .is_empty()
    );
}

fn upload(host: &MockHost, cmd: &str, file: &std::path::Path) -> serde_json::Value {
    host.invoke(
        cmd,
        json!({ "path": file.to_str().unwrap(), "input": upload_input() }),
    )
    .unwrap()
}

#[test]
fn images_are_uploaded_read_updated_and_deleted_through_ipc() {
    let host = MockHost::new();
    host.open_workspace();
    let file = host.dir.path().join("dot.png");
    image::RgbImage::new(4, 4).save(&file).unwrap();

    let checks = host
        .invoke(
            "library_image_inspect",
            json!({ "paths": [file.to_str().unwrap()] }),
        )
        .unwrap();
    let image = upload(&host, "library_image_upload", &file);
    let id = image["id"].as_i64().unwrap();
    let thumb = host
        .invoke("library_image_thumb", json!({ "id": id }))
        .unwrap();
    let full = host
        .invoke("library_image_read", json!({ "id": id }))
        .unwrap();
    let renamed = host
        .invoke(
            "library_image_update",
            json!({ "id": id, "patch": { "name": "Dot" } }),
        )
        .unwrap();
    let deleted = host
        .invoke("library_image_delete", json!({ "ids": [id] }))
        .unwrap();

    assert_eq!(checks.as_array().unwrap().len(), 1);
    assert!(thumb.as_str().unwrap().starts_with("data:image/"));
    assert!(full.as_str().unwrap().starts_with("data:image/"));
    assert_eq!(renamed["name"], "Dot");
    assert_eq!(deleted, 1);
}

#[test]
fn prompt_files_are_uploaded_through_ipc() {
    let host = MockHost::new();
    host.open_workspace();
    let file = host.dir.path().join("scene.txt");
    std::fs::write(&file, "a quiet harbour").unwrap();

    let prompt = upload(&host, "library_prompt_upload", &file);

    assert_eq!(prompt["text"], "a quiet harbour");
}
