use chrono::DateTime;
use chrono::Utc;
use serde::Deserialize;
use serde::Serialize;
use serde_json::Value;
use std::path::Path;

const DAY_MINUTES: i64 = 24 * 60;
const PERCENT: f64 = 100.0;
const API_KEY_FREE: &str = "none";
const CLAUDE_WINDOWS: [(&str, QuotaWindow); 2] = [
    ("five_hour", QuotaWindow::Session),
    ("seven_day", QuotaWindow::Weekly),
];
const CODEX_WINDOWS: [(&str, QuotaWindow); 2] = [
    ("primary", QuotaWindow::Session),
    ("secondary", QuotaWindow::Weekly),
];

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContextUsage {
    pub used_tokens: u64,
    pub max_tokens: Option<u64>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum QuotaWindow {
    Session,
    Weekly,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum QuotaStatus {
    Ok,
    Warning,
    Limited,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Quota {
    pub window: QuotaWindow,
    pub status: QuotaStatus,
    pub used_percent: Option<f64>,
    pub resets_at: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuotaSnapshot {
    pub provider: String,
    pub plan: Option<String>,
    pub updated_at: String,
    pub quotas: Vec<Quota>,
}

#[derive(Debug, Clone, Default, PartialEq)]
pub struct QuotaReading {
    pub plan: Option<String>,
    pub quotas: Vec<Quota>,
}

#[derive(Debug, Clone, Default, PartialEq)]
pub struct Usage {
    pub context: Option<ContextUsage>,
    pub quota: Option<QuotaReading>,
}

#[derive(Debug, Clone, Default, PartialEq)]
pub struct StreamReply {
    pub text: Option<String>,
    pub session: Option<String>,
    pub usage: Usage,
}

#[derive(Default)]
struct ClaudeState {
    model: Option<String>,
    used: Option<u64>,
    max: Option<u64>,
    subscribed: Option<bool>,
    quotas: Option<Vec<Quota>>,
}

pub fn snapshot(provider: &str, reading: QuotaReading, now: DateTime<Utc>) -> QuotaSnapshot {
    QuotaSnapshot {
        provider: provider.to_string(),
        plan: reading.plan,
        updated_at: now.to_rfc3339(),
        quotas: reading.quotas,
    }
}

pub fn load(path: &Path) -> Option<QuotaSnapshot> {
    let text = std::fs::read_to_string(path).ok()?;
    serde_json::from_str(&text).ok()
}

pub fn save(path: &Path, snapshot: &QuotaSnapshot) {
    let Ok(text) = serde_json::to_string_pretty(snapshot) else {
        return;
    };
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let _ = std::fs::write(path, text);
}

pub fn claude_stream(stdout: &str) -> StreamReply {
    let mut state = ClaudeState::default();
    let mut reply = StreamReply::default();
    for event in events(stdout) {
        match event.get("type").and_then(Value::as_str) {
            Some("system") => read_init(&mut state, &event),
            Some("assistant") => read_assistant(&mut state, &event),
            Some("rate_limit_event") => {
                state.quotas = Some(claude_quotas(&event["rate_limit_info"]));
            }
            Some("result") => {
                reply.text = text_of(&event["result"]).or(reply.text);
                reply.session = text_of(&event["session_id"]).or(reply.session);
                read_result(&mut state, &event);
            }
            _ => {}
        }
    }
    reply.usage = Usage {
        context: state.used.map(|used_tokens| ContextUsage {
            used_tokens,
            max_tokens: state.max,
        }),
        quota: claude_reading(state.subscribed, state.quotas),
    };
    reply
}

pub fn codex_rollout(text: &str) -> Usage {
    let mut usage = Usage::default();
    for event in events(text) {
        let payload = &event["payload"];
        if payload.get("type").and_then(Value::as_str) != Some("token_count") {
            continue;
        }
        if let Some(context) = codex_context(&payload["info"]) {
            usage.context = Some(context);
        }
        if payload["rate_limits"].is_object() {
            usage.quota = Some(codex_reading(&payload["rate_limits"], Utc::now()));
        }
    }
    usage
}

fn events(text: &str) -> impl Iterator<Item = Value> + '_ {
    text.lines()
        .filter_map(|line| serde_json::from_str::<Value>(line.trim()).ok())
}

fn text_of(value: &Value) -> Option<String> {
    value.as_str().map(String::from)
}

fn tokens(value: &Value, keys: &[&str]) -> u64 {
    keys.iter()
        .filter_map(|key| value.get(*key).and_then(Value::as_u64))
        .sum()
}

fn context_tokens(usage: &Value) -> Option<u64> {
    if !usage.is_object() {
        return None;
    }
    Some(tokens(
        usage,
        &[
            "input_tokens",
            "cache_creation_input_tokens",
            "cache_read_input_tokens",
            "output_tokens",
        ],
    ))
}

fn read_init(state: &mut ClaudeState, event: &Value) {
    if event.get("subtype").and_then(Value::as_str) != Some("init") {
        return;
    }
    if let Some(source) = event.get("apiKeySource").and_then(Value::as_str) {
        state.subscribed = Some(source == API_KEY_FREE);
    }
}

fn read_assistant(state: &mut ClaudeState, event: &Value) {
    if !event["parent_tool_use_id"].is_null() {
        return;
    }
    let message = &event["message"];
    state.model = text_of(&message["model"]).or(state.model.take());
    if let Some(used) = context_tokens(&message["usage"]) {
        state.used = Some(used);
    }
}

fn read_result(state: &mut ClaudeState, event: &Value) {
    let last = event["usage"]["iterations"]
        .as_array()
        .and_then(|iterations| iterations.last());
    if let Some(used) = last.and_then(context_tokens) {
        state.used = Some(used);
    }
    state.max = context_window(&event["modelUsage"], state.model.as_deref()).or(state.max);
}

fn context_window(models: &Value, model: Option<&str>) -> Option<u64> {
    let models = models.as_object()?;
    let chosen = model
        .and_then(|name| models.get(name))
        .or_else(|| models.values().next())?;
    chosen.get("contextWindow").and_then(Value::as_u64)
}

fn claude_reading(subscribed: Option<bool>, quotas: Option<Vec<Quota>>) -> Option<QuotaReading> {
    match (quotas, subscribed) {
        (Some(quotas), _) => Some(QuotaReading { plan: None, quotas }),
        (None, Some(false)) => Some(QuotaReading::default()),
        (None, _) => None,
    }
}

fn claude_quotas(info: &Value) -> Vec<Quota> {
    match info.get("unifiedWindows").and_then(Value::as_object) {
        Some(windows) => CLAUDE_WINDOWS
            .iter()
            .filter_map(|(key, window)| windows.get(*key).map(|value| claude_quota(*window, value)))
            .collect(),
        None => claude_legacy(info).into_iter().collect(),
    }
}

fn claude_legacy(info: &Value) -> Option<Quota> {
    let kind = info.get("rateLimitType").and_then(Value::as_str)?;
    let window = if kind.starts_with("seven_day") {
        QuotaWindow::Weekly
    } else {
        QuotaWindow::Session
    };
    Some(claude_quota(window, info))
}

fn claude_quota(window: QuotaWindow, value: &Value) -> Quota {
    Quota {
        window,
        status: claude_status(value.get("status").and_then(Value::as_str)),
        used_percent: value
            .get("utilization")
            .and_then(Value::as_f64)
            .map(|fraction| fraction * PERCENT),
        resets_at: value
            .get("resetsAt")
            .and_then(Value::as_i64)
            .and_then(moment),
    }
}

fn claude_status(status: Option<&str>) -> QuotaStatus {
    match status {
        Some("allowed_warning") => QuotaStatus::Warning,
        Some("rejected") => QuotaStatus::Limited,
        _ => QuotaStatus::Ok,
    }
}

fn codex_context(info: &Value) -> Option<ContextUsage> {
    let used = info["last_token_usage"]["total_tokens"].as_u64()?;
    Some(ContextUsage {
        used_tokens: used,
        max_tokens: info["model_context_window"].as_u64(),
    })
}

fn codex_reading(limits: &Value, now: DateTime<Utc>) -> QuotaReading {
    QuotaReading {
        plan: limits["plan_type"].as_str().map(title_case),
        quotas: CODEX_WINDOWS
            .iter()
            .filter(|(key, _)| limits[*key].is_object())
            .map(|(key, window)| codex_quota(&limits[*key], *window, now))
            .collect(),
    }
}

fn codex_quota(value: &Value, fallback: QuotaWindow, now: DateTime<Utc>) -> Quota {
    let used_percent = value["used_percent"].as_f64();
    let window = match value["window_minutes"].as_i64() {
        Some(minutes) if minutes > DAY_MINUTES => QuotaWindow::Weekly,
        Some(_) => QuotaWindow::Session,
        None => fallback,
    };
    let resets_at = value["resets_at"].as_i64().or_else(|| {
        value["resets_in_seconds"]
            .as_i64()
            .map(|seconds| now.timestamp() + seconds)
    });
    Quota {
        window,
        status: if used_percent.is_some_and(|percent| percent >= PERCENT) {
            QuotaStatus::Limited
        } else {
            QuotaStatus::Ok
        },
        used_percent,
        resets_at: resets_at.and_then(moment),
    }
}

fn moment(seconds: i64) -> Option<String> {
    DateTime::<Utc>::from_timestamp(seconds, 0).map(|time| time.to_rfc3339())
}

fn title_case(text: &str) -> String {
    let mut chars = text.chars();
    match chars.next() {
        Some(first) => first.to_uppercase().chain(chars).collect(),
        None => String::new(),
    }
}

#[cfg(test)]
#[path = "../../../test/features/pipeline/usage.test.rs"]
mod tests;
