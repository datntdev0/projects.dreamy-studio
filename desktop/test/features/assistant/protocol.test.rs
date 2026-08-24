use super::*;
use serde_json::json;

struct FakeCaller;

impl ToolCaller for FakeCaller {
    fn tools(&self) -> Value {
        json!([{ "name": "echo", "description": "Echo", "inputSchema": { "type": "object" } }])
    }

    fn call(&self, name: &str, args: &Value) -> Result<String, String> {
        match name {
            "echo" => Ok(args.to_string()),
            "fail" => Err("boom".to_string()),
            other => Err(format!("unknown tool {other}")),
        }
    }
}

fn request(id: i64, method: &str, params: Value) -> Value {
    json!({ "jsonrpc": "2.0", "id": id, "method": method, "params": params })
}

fn reply(body: Value) -> Value {
    handle(&body, &FakeCaller).unwrap()
}

#[test]
fn initialize_echoes_supported_version() {
    for version in ["2025-06-18", "2025-03-26", "2024-11-05"] {
        let response = reply(request(
            1,
            "initialize",
            json!({ "protocolVersion": version }),
        ));
        assert_eq!(response["result"]["protocolVersion"], version);
    }
}

#[test]
fn initialize_falls_back_to_latest_version() {
    let unknown = reply(request(
        1,
        "initialize",
        json!({ "protocolVersion": "1999-01-01" }),
    ));
    assert_eq!(unknown["result"]["protocolVersion"], "2025-06-18");
    let missing = reply(request(2, "initialize", json!({})));
    assert_eq!(missing["result"]["protocolVersion"], "2025-06-18");
}

#[test]
fn initialize_reports_capabilities_and_server_info() {
    let response = reply(request(
        7,
        "initialize",
        json!({ "protocolVersion": "2025-06-18" }),
    ));
    assert_eq!(response["jsonrpc"], "2.0");
    assert_eq!(response["id"], 7);
    assert_eq!(response["result"]["capabilities"], json!({ "tools": {} }));
    assert_eq!(response["result"]["serverInfo"]["name"], "dreamy-studio");
    assert_eq!(
        response["result"]["serverInfo"]["version"],
        env!("CARGO_PKG_VERSION")
    );
}

#[test]
fn notification_returns_none() {
    let body = json!({ "jsonrpc": "2.0", "method": "notifications/initialized" });
    assert!(handle(&body, &FakeCaller).is_none());
}

#[test]
fn ping_returns_empty_result() {
    let response = reply(request(3, "ping", Value::Null));
    assert_eq!(response["id"], 3);
    assert_eq!(response["result"], json!({}));
}

#[test]
fn tools_list_returns_caller_tools() {
    let response = reply(request(4, "tools/list", json!({})));
    assert_eq!(response["result"]["tools"], FakeCaller.tools());
}

#[test]
fn tools_call_success() {
    let response = reply(request(
        5,
        "tools/call",
        json!({ "name": "echo", "arguments": { "a": 1 } }),
    ));
    assert_eq!(
        response["result"],
        json!({ "content": [{ "type": "text", "text": "{\"a\":1}" }], "isError": false })
    );
}

#[test]
fn tools_call_without_arguments_passes_empty_object() {
    let response = reply(request(5, "tools/call", json!({ "name": "echo" })));
    assert_eq!(response["result"]["content"][0]["text"], "{}");
}

#[test]
fn tools_call_tool_error_is_is_error() {
    let response = reply(request(
        6,
        "tools/call",
        json!({ "name": "fail", "arguments": {} }),
    ));
    assert!(response.get("error").is_none());
    assert_eq!(
        response["result"],
        json!({ "content": [{ "type": "text", "text": "boom" }], "isError": true })
    );
}

#[test]
fn unknown_method_is_method_not_found() {
    let response = reply(request(8, "resources/list", json!({})));
    assert_eq!(response["id"], 8);
    assert_eq!(response["error"]["code"], -32601);
}

#[test]
fn invalid_tools_call_params_are_invalid_params() {
    let bodies = [
        request(9, "tools/call", Value::Null),
        request(9, "tools/call", json!({ "arguments": {} })),
        request(9, "tools/call", json!({ "name": 3 })),
        request(9, "tools/call", json!({ "name": "echo", "arguments": [1] })),
    ];
    for body in bodies {
        let response = reply(body);
        assert_eq!(response["id"], 9);
        assert_eq!(response["error"]["code"], -32602);
    }
}

#[test]
fn invalid_request_shapes() {
    let response = reply(json!("hello"));
    assert_eq!(response["error"]["code"], -32600);
    assert_eq!(response["id"], Value::Null);
    let response = reply(json!({ "jsonrpc": "2.0", "id": 1 }));
    assert_eq!(response["error"]["code"], -32600);
    assert_eq!(response["id"], 1);
    let response = reply(json!({ "jsonrpc": "1.0", "id": 1, "method": "ping" }));
    assert_eq!(response["error"]["code"], -32600);
    let response = reply(json!([]));
    assert_eq!(response["error"]["code"], -32600);
}

#[test]
fn batch_returns_responses_without_notifications() {
    let body = json!([
        request(1, "ping", Value::Null),
        { "jsonrpc": "2.0", "method": "notifications/initialized" },
        request(2, "nope", Value::Null),
    ]);
    let response = reply(body);
    let items = response.as_array().unwrap();
    assert_eq!(items.len(), 2);
    assert_eq!(items[0]["id"], 1);
    assert_eq!(items[0]["result"], json!({}));
    assert_eq!(items[1]["id"], 2);
    assert_eq!(items[1]["error"]["code"], -32601);
}

#[test]
fn batch_of_only_notifications_returns_none() {
    let body = json!([
        { "jsonrpc": "2.0", "method": "notifications/initialized" },
        { "jsonrpc": "2.0", "method": "notifications/cancelled" },
    ]);
    assert!(handle(&body, &FakeCaller).is_none());
}
