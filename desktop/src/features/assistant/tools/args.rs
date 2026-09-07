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

pub(crate) fn required_ints(args: &Value, key: &str) -> Result<Vec<i64>, String> {
    let items = required_list(args, key)?;
    let mut values = Vec::new();
    for item in items {
        let value = item
            .as_i64()
            .ok_or_else(|| format!("argument '{key}' must be an array of integers"))?;
        if !values.contains(&value) {
            values.push(value);
        }
    }
    non_empty(values, key)
}

pub(crate) fn required_strings(args: &Value, key: &str) -> Result<Vec<String>, String> {
    let items = required_list(args, key)?;
    let mut values = Vec::new();
    for item in items {
        let value = item
            .as_str()
            .ok_or_else(|| format!("argument '{key}' must be an array of strings"))?;
        if !values.iter().any(|known| known == value) {
            values.push(value.to_string());
        }
    }
    non_empty(values, key)
}

fn required_list<'a>(args: &'a Value, key: &str) -> Result<&'a Vec<Value>, String> {
    args.get(key)
        .and_then(Value::as_array)
        .ok_or_else(|| format!("missing array argument '{key}'"))
}

fn non_empty<T>(values: Vec<T>, key: &str) -> Result<Vec<T>, String> {
    if values.is_empty() {
        return Err(format!("argument '{key}' must list at least one item"));
    }
    Ok(values)
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

pub(crate) fn optional_number(args: &Value, key: &str) -> Result<Option<f64>, String> {
    match args.get(key) {
        None | Some(Value::Null) => Ok(None),
        Some(value) => value
            .as_f64()
            .map(Some)
            .ok_or_else(|| format!("argument '{key}' must be a number")),
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

pub(crate) fn array_of<'a>(args: &'a Value, key: &str) -> &'a [Value] {
    args.get(key)
        .and_then(Value::as_array)
        .map_or(&[], Vec::as_slice)
}

pub(crate) fn output(value: Value, label: String) -> ToolOutput {
    ToolOutput {
        text: value.to_string(),
        label,
    }
}
