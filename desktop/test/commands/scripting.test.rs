use crate::testing::app::MockHost;
use crate::testing::script::script;
use crate::testing::script::unit;
use crate::testing::script::written_unit;
use serde_json::Value;
use serde_json::json;

fn create_project(host: &MockHost) -> i64 {
    let input = json!({ "name": "Book", "template": "audiobook" });
    let created = host
        .invoke("project_create", json!({ "input": input }))
        .unwrap();
    created["id"].as_i64().unwrap()
}

fn wire_script() -> Value {
    serde_json::to_value(script(vec![written_unit("U01", 1), unit("U02", 2)])).unwrap()
}

#[test]
fn every_scripting_command_reports_no_workspace_through_ipc() {
    let host = MockHost::new();

    host.expect_code(
        &[
            ("scripting_get", json!({ "projectId": 1 })),
            (
                "scripting_save",
                json!({ "projectId": 1, "script": wire_script() }),
            ),
            (
                "scripting_unit_save",
                json!({ "projectId": 1, "unit": wire_script()["units"][0], "seq": 1 }),
            ),
            (
                "scripting_cast_save",
                json!({ "projectId": 1, "extraCast": [] }),
            ),
            ("project_modules", json!({ "projectId": 1 })),
            ("audiobook_get", json!({ "projectId": 1 })),
        ],
        "no_workspace",
    );
}

#[test]
fn scripts_round_trip_the_wire_shape_through_ipc() {
    let host = MockHost::new();
    host.open_workspace();
    let id = create_project(&host);

    let before = host
        .invoke("scripting_get", json!({ "projectId": id }))
        .unwrap();
    host.invoke(
        "scripting_save",
        json!({ "projectId": id, "script": wire_script() }),
    )
    .unwrap();
    let after = host
        .invoke("scripting_get", json!({ "projectId": id }))
        .unwrap();

    assert!(before.is_null());
    assert_eq!(after, wire_script());
    assert_eq!(after["extraCast"][0]["name"], "Tea woman");
    assert_eq!(after["cfg"]["freeUnits"], false);
    assert_eq!(after["units"][0]["blocks"][0]["type"], "dialogue");
    assert_eq!(after["units"][0]["blocks"][0]["ref"], "p-1");
    assert!(after["units"][1]["blocks"].is_null());
    assert!(after["units"][1]["chs"].is_null());
}

#[test]
fn units_and_cast_are_saved_through_ipc() {
    let host = MockHost::new();
    host.open_workspace();
    let id = create_project(&host);
    host.invoke(
        "scripting_save",
        json!({ "projectId": id, "script": wire_script() }),
    )
    .unwrap();
    let mut edited = wire_script()["units"][1].clone();
    edited["chs"] = json!([2, 3]);
    edited["meta"] = json!({ "blocks": 0, "words": 0 });

    host.invoke(
        "scripting_unit_save",
        json!({ "projectId": id, "unit": edited, "seq": 12 }),
    )
    .unwrap();
    host.invoke(
        "scripting_cast_save",
        json!({ "projectId": id, "extraCast": [] }),
    )
    .unwrap();
    let linked = json!({
        "id": "c1",
        "chapterId": "c1",
        "blocks": [{ "id": "b1", "type": "narration", "text": "Hi" }],
        "updated": "now",
    });
    host.invoke(
        "scripting_unit_save",
        json!({ "projectId": id, "unit": linked, "seq": 13 }),
    )
    .unwrap();
    let mismatched = host
        .invoke(
            "scripting_unit_save",
            json!({ "projectId": id, "unit": { "id": "U99", "chapterId": "c9" }, "seq": 1 }),
        )
        .unwrap_err();
    let stored = host
        .invoke("scripting_get", json!({ "projectId": id }))
        .unwrap();

    assert_eq!(stored["seq"], 13);
    assert_eq!(stored["units"][1], edited);
    assert_eq!(stored["units"][2]["chapterId"], "c1");
    assert_eq!(stored["units"][2]["blocks"][0]["text"], "Hi");
    assert_eq!(stored["units"][2]["no"], 0);
    assert_eq!(stored["units"][2]["title"], "");
    assert!(stored["units"][0]["chapterId"].is_null());
    assert_eq!(stored["extraCast"], json!([]));
    assert_eq!(mismatched["code"], "invalid_input");
}

#[test]
fn project_modules_and_audiobook_report_through_ipc() {
    let host = MockHost::new();
    host.open_workspace();
    let id = create_project(&host);
    let idle = host
        .invoke("project_modules", json!({ "projectId": id }))
        .unwrap();
    host.invoke(
        "scripting_save",
        json!({ "projectId": id, "script": wire_script() }),
    )
    .unwrap();

    let modules = host
        .invoke("project_modules", json!({ "projectId": id }))
        .unwrap();
    let audiobook = host
        .invoke("audiobook_get", json!({ "projectId": id }))
        .unwrap();

    assert_eq!(
        idle[0],
        json!({ "id": "scripting", "state": "idle", "done": 0, "total": 0, "note": "" })
    );
    assert_eq!(
        modules,
        json!([
            { "id": "scripting", "state": "doing", "done": 1, "total": 2, "note": "1/2 chapters" },
            { "id": "audiobook", "state": "idle", "done": 0, "total": 2, "note": "0/2 chapters" },
        ])
    );
    assert!(audiobook.is_null());
}
