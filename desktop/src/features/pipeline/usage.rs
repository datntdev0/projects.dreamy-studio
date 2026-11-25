use chrono::DateTime;
use chrono::Utc;
use serde::Deserialize;
use serde::Serialize;
use serde::de::DeserializeOwned;
use serde_json::Value;
use std::path::Path;

const DAY_MINUTES: i64 = 24 * 60;
const PERCENT: f64 = 100.0;
const API_KEY_FREE: &str = "none";
const AGY_SUCCESS: &str = "SUCCESS";
const CLAUDE_WINDOWS: [(&str, QuotaWindow); 2] = [
    ("five_hour", QuotaWindow::Session),
    ("seven_day", QuotaWindow::Weekly),
];
const CODEX_WINDOWS: [(&str, QuotaWindow); 2] = [
    ("primary", QuotaWindow::Session),
    ("secondary", QuotaWindow::Weekly),
];

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

pub fn load<T: DeserializeOwned>(path: &Path) -> Option<T> {
    let text = std::fs::read_to_string(path).ok()?;
    serde_json::from_str(&text).ok()
}

pub fn save<T: Serialize>(path: &Path, value: &T) {
    let Ok(text) = serde_json::to_string_pretty(value) else {
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
            Some("rate_limit_event") => {
                state.quotas = Some(claude_quotas(&event["rate_limit_info"]));
            }
            Some("result") => {
                reply.text = text_of(&event["result"]).or(reply.text);
                reply.session = text_of(&event["session_id"]).or(reply.session);
            }
            _ => {}
        }
    }
    reply.usage = Usage {
        quota: claude_reading(state.subscribed, state.quotas),
    };
    reply
}

pub fn agy_stream(stdout: &str) -> StreamReply {
    let mut reply = StreamReply::default();
    for event in events(stdout) {
        match event.get("event").and_then(Value::as_str) {
            Some("init") => reply.session = text_of(&event["conversation_id"]).or(reply.session),
            Some("result") => read_agy_result(&mut reply, &event["result"]),
            _ => {}
        }
    }
    reply
}

pub fn codex_rollout(text: &str) -> Usage {
    let mut usage = Usage::default();
    for event in events(text) {
        let payload = &event["payload"];
        if payload.get("type").and_then(Value::as_str) != Some("token_count") {
            continue;
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

fn read_agy_result(reply: &mut StreamReply, result: &Value) {
    reply.session = text_of(&result["conversation_id"])
        .filter(|id| !id.is_empty())
        .or(reply.session.take());
    if result["status"].as_str() == Some(AGY_SUCCESS) {
        reply.text = text_of(&result["response"]).or(reply.text.take());
    }
}

fn read_init(state: &mut ClaudeState, event: &Value) {
    if event.get("subtype").and_then(Value::as_str) != Some("init") {
        return;
    }
    if let Some(source) = event.get("apiKeySource").and_then(Value::as_str) {
        state.subscribed = Some(source == API_KEY_FREE);
    }
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
