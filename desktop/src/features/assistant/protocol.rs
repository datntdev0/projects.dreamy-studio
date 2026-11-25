use serde_json::Value;
use serde_json::json;

const LATEST_VERSION: &str = "2025-06-18";
const SUPPORTED_VERSIONS: [&str; 3] = ["2025-06-18", "2025-03-26", "2024-11-05"];
const SERVER_NAME: &str = "dreamy-studio";

const INVALID_REQUEST: i64 = -32600;
const METHOD_NOT_FOUND: i64 = -32601;
const INVALID_PARAMS: i64 = -32602;

pub trait ToolCaller {
    fn tools(&self) -> Value;
    fn call(&self, name: &str, args: &Value) -> Result<String, String>;
}

pub fn handle(body: &Value, caller: &dyn ToolCaller) -> Option<Value> {
    match body {
        Value::Array(items) if items.is_empty() => {
            Some(failure(Value::Null, INVALID_REQUEST, "empty batch"))
        }
        Value::Array(items) => {
            let responses: Vec<Value> = items
                .iter()
                .filter_map(|item| handle_one(item, caller))
                .collect();
            if responses.is_empty() {
                None
            } else {
                Some(Value::Array(responses))
            }
        }
        other => handle_one(other, caller),
    }
}

fn handle_one(message: &Value, caller: &dyn ToolCaller) -> Option<Value> {
    let Some(object) = message.as_object() else {
        return Some(failure(
            Value::Null,
            INVALID_REQUEST,
            "request must be an object",
        ));
    };
    let id = object.get("id")?;
    if !(id.is_string() || id.is_number()) {
        return Some(failure(
            Value::Null,
            INVALID_REQUEST,
            "id must be a string or a number",
        ));
    }
    if object.get("jsonrpc").and_then(Value::as_str) != Some("2.0") {
        return Some(failure(id.clone(), INVALID_REQUEST, "jsonrpc must be 2.0"));
    }
    let Some(method) = object.get("method").and_then(Value::as_str) else {
        return Some(failure(
            id.clone(),
            INVALID_REQUEST,
            "method must be a string",
        ));
    };
    let params = object.get("params").unwrap_or(&Value::Null);
    let outcome = dispatch(method, params, caller);
    Some(match outcome {
        Ok(result) => json!({ "jsonrpc": "2.0", "id": id, "result": result }),
        Err((code, message)) => failure(id.clone(), code, &message),
    })
}

fn dispatch(method: &str, params: &Value, caller: &dyn ToolCaller) -> Result<Value, (i64, String)> {
    match method {
        "initialize" => Ok(initialize(params)),
        "ping" => Ok(json!({})),
        "tools/list" => Ok(json!({ "tools": caller.tools() })),
        "tools/call" => tools_call(params, caller),
        other => Err((METHOD_NOT_FOUND, format!("method not found: {other}"))),
    }
}

fn initialize(params: &Value) -> Value {
    let requested = params.get("protocolVersion").and_then(Value::as_str);
    let version = match requested {
        Some(value) if SUPPORTED_VERSIONS.contains(&value) => value,
        _ => LATEST_VERSION,
    };
    json!({
        "protocolVersion": version,
        "capabilities": { "tools": {} },
        "serverInfo": { "name": SERVER_NAME, "version": env!("CARGO_PKG_VERSION") },
    })
}

fn tools_call(params: &Value, caller: &dyn ToolCaller) -> Result<Value, (i64, String)> {
    let Some(name) = params.get("name").and_then(Value::as_str) else {
        return Err((INVALID_PARAMS, "params.name must be a string".to_string()));
    };
    let args = match params.get("arguments") {
        None | Some(Value::Null) => json!({}),
        Some(value) if value.is_object() => value.clone(),
        Some(_) => {
            return Err((
                INVALID_PARAMS,
                "params.arguments must be an object".to_string(),
            ));
        }
    };
    let (text, is_error) = match caller.call(name, &args) {
        Ok(text) => (text, false),
        Err(text) => (text, true),
    };
    Ok(json!({ "content": [{ "type": "text", "text": text }], "isError": is_error }))
}

fn failure(id: Value, code: i64, message: &str) -> Value {
    json!({ "jsonrpc": "2.0", "id": id, "error": { "code": code, "message": message } })
}
