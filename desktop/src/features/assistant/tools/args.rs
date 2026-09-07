use crate::features::assistant::tools::ToolOutput;
use serde_json::Value;

pub(crate) fn required_int(args: &Value, key: &str) -> Result<i64, String> {
    optional_int(args, key)?.ok_or_else(|| format!("missing integer argument '{key}'"))
}

pub(crate) fn required_str(args: &Value, key: &str) -> Result<String, String> {
    optional_str(args, key)?.ok_or_else(|| format!("missing string argument '{key}'"))
}

pub(crate) fn optional_str(args: &Value, key: &str) -> Result<Option<String>, String> {
    match args.get(key) {
        None | Some(Value::Null) => Ok(None),
        Some(value) => value
            .as_str()
            .map(|text| Some(text.to_string()))
            .ok_or_else(|| format!("argument '{key}' must be a string")),
    }
}

pub(crate) fn optional_strings(args: &Value, key: &str) -> Result<Option<Vec<String>>, String> {
    match args.get(key) {
        None | Some(Value::Null) => Ok(None),
        Some(Value::Array(items)) => items
            .iter()
            .map(|item| {
                item.as_str()
                    .map(str::to_string)
                    .ok_or_else(|| format!("argument '{key}' must be an array of strings"))
            })
            .collect::<Result<Vec<_>, _>>()
            .map(Some),
        Some(_) => Err(format!("argument '{key}' must be an array of strings")),
    }
}

pub(crate) fn optional_bool(args: &Value, key: &str) -> Result<Option<bool>, String> {
    match args.get(key) {
        None | Some(Value::Null) => Ok(None),
        Some(value) => value
            .as_bool()
            .map(Some)
            .ok_or_else(|| format!("argument '{key}' must be a boolean")),
    }
}

pub(crate) fn optional_int(args: &Value, key: &str) -> Result<Option<i64>, String> {
    match args.get(key) {
        None | Some(Value::Null) => Ok(None),
        Some(value) => value
            .as_i64()
            .map(Some)
            .ok_or_else(|| format!("argument '{key}' must be an integer")),
    }
}

pub(crate) fn output(value: Value, label: String) -> ToolOutput {
    ToolOutput {
        text: value.to_string(),
        label,
    }
}
