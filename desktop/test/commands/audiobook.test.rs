use super::*;
use crate::testing::app::MockHost;
use serde_json::json;

fn request() -> serde_json::Value {
    json!({ "text": "Hi", "speaker": "narr", "voice": 99, "speed": 1, "paren": "" })
}

#[test]
fn reports_no_workspace() {
    let error = get_audiobook(&ProjectService::new(), &WorkspaceSession::new(), 1).unwrap_err();
    assert_eq!(error.code.as_str(), "no_workspace");
}

#[test]
fn every_audiobook_command_reports_no_workspace_through_ipc() {
    let host = MockHost::new();
    let segment = json!({ "projectId": 1, "unitId": "U01", "blockId": "b1" });

    host.expect_code(
        &[
            ("audiobook_get", json!({ "projectId": 1 })),
            ("audiobook_unit_get", json!({ "projectId": 1, "unitId": "U01" })),
            (
                "audiobook_config_save",
                json!({ "projectId": 1, "config": { "voices": {} } }),
            ),
            (
                "audiobook_mix_save",
                json!({ "projectId": 1, "mix": { "gap": 1, "intro": 1, "outro": 1, "vol": 0, "sentence": 0.3 } }),
            ),
            (
                "audiobook_flag_set",
                json!({ "projectId": 1, "unitId": "U01", "blockId": "b1", "flag": "x" }),
            ),
            (
                "audiobook_segment_generate",
                json!({ "projectId": 1, "unitId": "U01", "blockId": "b1", "request": request() }),
            ),
            ("audiobook_segment_audio", segment),
            (
                "audiobook_voice_preview",
                json!({ "projectId": 1, "voiceId": 1, "speed": 1, "text": "Hi" }),
            ),
            (
                "audiobook_export",
                json!({ "projectId": 1, "unitIds": ["U01"] }),
            ),
        ],
        "no_workspace",
    );
}

#[test]
fn audiobook_settings_round_trip_through_ipc() {
    let host = MockHost::new();
    host.open_workspace();
    let project = host
        .invoke(
            "project_create",
            json!({ "input": { "name": "Book", "template": "audiobook" } }),
        )
        .unwrap();
    let id = project["id"].as_i64().unwrap();
    let voices = json!({ "narr": { "voice": 3, "speed": 1.1 } });

    assert_eq!(
        host.invoke("audiobook_get", json!({ "projectId": id }))
            .unwrap(),
        json!(null)
    );
    host.invoke(
        "audiobook_config_save",
        json!({ "projectId": id, "config": { "voices": voices } }),
    )
    .unwrap();
    let mix = host
        .invoke(
            "audiobook_mix_save",
            json!({ "projectId": id, "mix": { "gap": 7, "intro": 1, "outro": 2, "vol": -20, "sentence": 3 } }),
        )
        .unwrap();
    let unit = host
        .invoke(
            "audiobook_unit_get",
            json!({ "projectId": id, "unitId": "U01" }),
        )
        .unwrap();
    host.invoke(
        "audiobook_config_save",
        json!({ "projectId": id, "config": { "voices": voices } }),
    )
    .unwrap();
    let book = host
        .invoke("audiobook_get", json!({ "projectId": id }))
        .unwrap();

    assert_eq!(
        mix,
        json!({ "gap": 5.0, "intro": 1.0, "outro": 2.0, "vol": -12.0, "sentence": 2.0 })
    );
    assert_eq!(unit, json!({ "audio": {}, "meta": null }));
    assert_eq!(book, json!({ "voices": voices, "mix": mix, "units": {} }));
    host.expect_code(
        &[
            (
                "audiobook_flag_set",
                json!({ "projectId": id, "unitId": "U01", "blockId": "b1", "flag": "x" }),
            ),
            (
                "audiobook_segment_audio",
                json!({ "projectId": id, "unitId": "U01", "blockId": "b1" }),
            ),
            (
                "audiobook_segment_generate",
                json!({ "projectId": id, "unitId": "U01", "blockId": "b1", "request": request() }),
            ),
            (
                "audiobook_export",
                json!({ "projectId": id, "unitIds": ["U01"] }),
            ),
        ],
        "not_found",
    );
    host.expect_code(
        &[
            (
                "audiobook_unit_get",
                json!({ "projectId": id, "unitId": "../U01" }),
            ),
            (
                "audiobook_export",
                json!({ "projectId": id, "unitIds": [] }),
            ),
            (
                "audiobook_export",
                json!({ "projectId": id, "unitIds": ["U01", "U01"] }),
            ),
        ],
        "invalid_input",
    );
}

#[test]
fn audio_pipelines_start_for_projects_through_ipc() {
    let host = MockHost::new();
    host.open_workspace();
    let project = host
        .invoke(
            "project_create",
            json!({ "input": { "name": "Book", "template": "audiobook" } }),
        )
        .unwrap();
    let id = project["id"].as_i64().unwrap();

    host.expect_code(
        &[(
            "pipeline_history_list",
            json!({ "novelId": 1, "projectId": id }),
        )],
        "invalid_input",
    );
    let history = host
        .invoke("pipeline_history_list", json!({ "projectId": id }))
        .unwrap();
    assert_eq!(history, json!([]));
}
