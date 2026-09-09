use crate::features::settings::llm::CliSpec;
use crate::features::settings::llm::LLM_DIR;
use crate::features::settings::probe::capture;
use crate::features::settings::probe::command;
use crate::features::settings::probe::failure_detail;
use crate::features::settings::probe::installed;
use crate::features::settings::probe::now_ms;
use crate::features::settings::probe::prepare;
use chrono::DateTime;
use chrono::Utc;
use serde::Serialize;
use serde_json::Value;
use serde_json::json;
use std::io::BufRead;
use std::io::BufReader;
use std::io::Write;
use std::path::Path;
use std::process::Child;
use std::process::Stdio;
use std::sync::mpsc;
use std::sync::mpsc::Receiver;
use std::time::Duration;
use std::time::Instant;

const WORK_DIR: &str = "work";
const USAGE_COMMAND: &str = "/usage";
const CODEX_TIMEOUT: Duration = Duration::from_secs(20);
const CODEX_LIMITS_ID: u64 = 2;
const DAY_MINUTES: i64 = 24 * 60;
const PERCENT: f64 = 100.0;
const USED_MARKER: &str = "% used";
const RESETS_MARKER: &str = "resets ";
const SESSION_PREFIX: &str = "Current session";
const AGY_SESSION_WINDOW: &str = "5h";
const CLAUDE_ARGS: [&str; 5] = [
    "-p",
    USAGE_COMMAND,
    "--output-format",
    "json",
    "--no-session-persistence",
];
const AGY_ARGS: [&str; 4] = ["-p", USAGE_COMMAND, "--output-format", "json"];

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum UsageWindowKind {
    Session,
    Weekly,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageWindow {
    pub window: UsageWindowKind,
    pub group: Option<String>,
    pub used_percent: Option<f64>,
    pub resets_at: Option<String>,
    pub resets_note: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LlmUsage {
    pub plan: Option<String>,
    pub windows: Vec<UsageWindow>,
    pub checked_at_ms: u64,
}

pub fn read_usage(spec: &CliSpec, data_dir: &Path) -> Result<Option<LlmUsage>, String> {
    let path = installed(spec)?;
    prepare(spec, data_dir)?;
    let work = data_dir.join(LLM_DIR).join(WORK_DIR);
    std::fs::create_dir_all(&work)
        .map_err(|error| format!("Could not create {}: {error}", work.display()))?;
    let mut usage = match spec.id {
        "claude" => claude_usage(&run(spec, &path, &CLAUDE_ARGS, data_dir, &work)?)?,
        "antigravity" => agy_usage(&run(spec, &path, &AGY_ARGS, data_dir, &work)?)?,
        "codex" => codex_usage(&codex_limits(spec, &path, data_dir, &work)?),
        _ => return Ok(None),
    };
    usage.checked_at_ms = now_ms();
    Ok(Some(usage))
}

fn run(
    spec: &CliSpec,
    path: &Path,
    args: &[&str],
    data_dir: &Path,
    work: &Path,
) -> Result<Value, String> {
    let mut command = command(spec, path, args, data_dir);
    command.current_dir(work);
    let output = capture(command)?;
    if !output.success {
        return Err(failure_detail(&output));
    }
    serde_json::from_str(output.stdout.trim())
        .map_err(|error| format!("{} returned unreadable usage: {error}", spec.name))
}

pub fn claude_usage(reply: &Value) -> Result<LlmUsage, String> {
    if reply["is_error"].as_bool() == Some(true) {
        return Err(text(&reply["result"]).unwrap_or_default());
    }
    let result = text(&reply["result"]).unwrap_or_default();
    Ok(LlmUsage {
        plan: None,
        windows: result.lines().filter_map(claude_window).collect(),
        checked_at_ms: 0,
    })
}

fn claude_window(line: &str) -> Option<UsageWindow> {
    let (label, rest) = line.trim().split_once(':')?;
    let (percent, tail) = rest.split_once(USED_MARKER)?;
    let used_percent = percent.trim().parse::<f64>().ok()?;
    let resets_note = tail
        .split_once(RESETS_MARKER)
        .map(|(_, note)| note.trim().to_string())
        .filter(|note| !note.is_empty());
    let group = label
        .split_once('(')
        .and_then(|(_, inner)| inner.strip_suffix(')'))
        .map(str::to_string);
    let window = if label.starts_with(SESSION_PREFIX) {
        UsageWindowKind::Session
    } else {
        UsageWindowKind::Weekly
    };
    Some(UsageWindow {
        window,
        group,
        used_percent: Some(used_percent),
        resets_at: None,
        resets_note,
    })
}

pub fn agy_usage(reply: &Value) -> Result<LlmUsage, String> {
    let groups = reply["command"]["data"]["groups"]
        .as_array()
        .ok_or_else(|| text(&reply["response"]).unwrap_or_default())?;
    Ok(LlmUsage {
        plan: None,
        windows: groups.iter().flat_map(agy_windows).collect(),
        checked_at_ms: 0,
    })
}

fn agy_windows(group: &Value) -> Vec<UsageWindow> {
    let name = text(&group["name"]);
    group["buckets"]
        .as_array()
        .map(|buckets| {
            buckets
                .iter()
                .map(|bucket| agy_window(name.clone(), bucket))
                .collect()
        })
        .unwrap_or_default()
}

fn agy_window(group: Option<String>, bucket: &Value) -> UsageWindow {
    let window = if bucket["window"].as_str() == Some(AGY_SESSION_WINDOW) {
        UsageWindowKind::Session
    } else {
        UsageWindowKind::Weekly
    };
    UsageWindow {
        window,
        group,
        used_percent: bucket["remaining_fraction"]
            .as_f64()
            .map(|remaining| (1.0 - remaining) * PERCENT),
        resets_at: text(&bucket["reset_time"]).filter(|time| is_future_moment(time)),
        resets_note: None,
    }
}

fn is_future_moment(time: &str) -> bool {
    DateTime::parse_from_rfc3339(time).is_ok_and(|moment| moment.timestamp() > 0)
}

pub fn codex_usage(result: &Value) -> LlmUsage {
    let limits = &result["rateLimits"];
    LlmUsage {
        plan: text(&limits["planType"]).map(|plan| title_case(&plan)),
        windows: ["primary", "secondary"]
            .iter()
            .filter(|key| limits[**key].is_object())
            .map(|key| codex_window(&limits[*key]))
            .collect(),
        checked_at_ms: 0,
    }
}

fn codex_window(value: &Value) -> UsageWindow {
    let window = match value["windowDurationMins"].as_i64() {
        Some(minutes) if minutes > DAY_MINUTES => UsageWindowKind::Weekly,
        _ => UsageWindowKind::Session,
    };
    UsageWindow {
        window,
        group: None,
        used_percent: value["usedPercent"].as_f64(),
        resets_at: value["resetsAt"]
            .as_i64()
            .and_then(|seconds| DateTime::<Utc>::from_timestamp(seconds, 0))
            .map(|moment| moment.to_rfc3339()),
        resets_note: None,
    }
}

fn codex_limits(
    spec: &CliSpec,
    path: &Path,
    data_dir: &Path,
    work: &Path,
) -> Result<Value, String> {
    let mut command = command(spec, path, &["app-server"], data_dir);
    command.current_dir(work).stdin(Stdio::piped());
    let mut child = command
        .spawn()
        .map_err(|error| format!("Could not run the command: {error}"))?;
    let result = exchange_limits(&mut child);
    let _ = child.kill();
    let _ = child.wait();
    result
}

fn exchange_limits(child: &mut Child) -> Result<Value, String> {
    let mut stdin = child
        .stdin
        .take()
        .ok_or_else(|| "Could not write to the CLI.".to_string())?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Could not read from the CLI.".to_string())?;
    let messages = listen(stdout);
    for request in codex_requests() {
        writeln!(stdin, "{request}").map_err(|error| format!("Could not write: {error}"))?;
    }
    await_response(&messages, CODEX_LIMITS_ID)
}

fn codex_requests() -> [Value; 3] {
    [
        json!({"jsonrpc": "2.0", "id": 1, "method": "initialize",
               "params": {"clientInfo": {"name": "dreamy-studio", "version": env!("CARGO_PKG_VERSION")}}}),
        json!({"jsonrpc": "2.0", "method": "initialized"}),
        json!({"jsonrpc": "2.0", "id": CODEX_LIMITS_ID, "method": "account/rateLimits/read"}),
    ]
}

fn listen(stdout: impl std::io::Read + Send + 'static) -> Receiver<Value> {
    let (sender, receiver) = mpsc::channel();
    std::thread::spawn(move || {
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            let Ok(message) = serde_json::from_str::<Value>(line.trim()) else {
                continue;
            };
            if sender.send(message).is_err() {
                return;
            }
        }
    });
    receiver
}

fn await_response(messages: &Receiver<Value>, id: u64) -> Result<Value, String> {
    let deadline = Instant::now() + CODEX_TIMEOUT;
    loop {
        let left = deadline.saturating_duration_since(Instant::now());
        let message = messages.recv_timeout(left).map_err(|_| {
            format!(
                "The CLI did not report usage within {} seconds.",
                CODEX_TIMEOUT.as_secs()
            )
        })?;
        if message["id"].as_u64() != Some(id) {
            continue;
        }
        if let Some(error) = message.get("error") {
            return Err(text(&error["message"]).unwrap_or_else(|| error.to_string()));
        }
        return Ok(message["result"].clone());
    }
}

fn text(value: &Value) -> Option<String> {
    value.as_str().map(String::from)
}

fn title_case(text: &str) -> String {
    let mut chars = text.chars();
    match chars.next() {
        Some(first) => first.to_uppercase().chain(chars).collect(),
        None => String::new(),
    }
}

#[cfg(test)]
#[path = "../../../test/features/settings/usage.test.rs"]
mod tests;
