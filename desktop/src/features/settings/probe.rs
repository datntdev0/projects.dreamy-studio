use crate::features::settings::llm::CliSpec;
use crate::infra::startup::manifest::installed_executable;
use crate::shared::config;
use crate::shared::process::failure_snippet;
use crate::shared::process::hide_window;
use serde::Serialize;
use std::io::Read;
use std::path::Path;
use std::path::PathBuf;
use std::process::Child;
use std::process::Command;
use std::process::Stdio;
use std::time::Duration;
use std::time::Instant;
use std::time::SystemTime;
use std::time::UNIX_EPOCH;

const PROBE_TIMEOUT: Duration = Duration::from_secs(15);
const POLL_INTERVAL: Duration = Duration::from_millis(25);
const ACCOUNT_LIMIT: usize = 80;
#[cfg(windows)]
const CREATE_NEW_CONSOLE: u32 = 0x0000_0010;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CliProbe {
    pub id: String,
    pub version: String,
    pub ok: bool,
    pub signed_in: Option<bool>,
    pub account: String,
    pub error: String,
    pub latency_ms: u64,
    pub checked_at_ms: u64,
}

impl CliProbe {
    fn new(spec: &CliSpec) -> Self {
        Self {
            id: spec.id.to_string(),
            version: String::new(),
            ok: false,
            signed_in: None,
            account: String::new(),
            error: String::new(),
            latency_ms: 0,
            checked_at_ms: 0,
        }
    }
}

struct Captured {
    success: bool,
    status: String,
    stdout: String,
    stderr: String,
}

pub fn probe(spec: &CliSpec, data_dir: &Path) -> CliProbe {
    let mut result = run_probe(spec, data_dir);
    result.checked_at_ms = now_ms();
    result
}

fn now_ms() -> u64 {
    match SystemTime::now().duration_since(UNIX_EPOCH) {
        Ok(elapsed) => u64::try_from(elapsed.as_millis()).unwrap_or(0),
        Err(_) => 0,
    }
}

fn run_probe(spec: &CliSpec, data_dir: &Path) -> CliProbe {
    let mut result = CliProbe::new(spec);
    let path = match installed(spec) {
        Ok(path) => path,
        Err(error) => {
            result.error = error;
            return result;
        }
    };
    let started = Instant::now();
    match prepare(spec, data_dir) {
        Ok(()) => fill(&mut result, spec, &path, data_dir),
        Err(error) => result.error = error,
    }
    result.latency_ms = started.elapsed().as_millis() as u64;
    result
}

fn fill(result: &mut CliProbe, spec: &CliSpec, path: &Path, data_dir: &Path) {
    let version = match capture(command(spec, path, &["--version"], data_dir)) {
        Ok(output) if output.success => output,
        Ok(output) => {
            result.error = failure_detail(&output);
            return;
        }
        Err(error) => {
            result.error = error;
            return;
        }
    };
    result.ok = true;
    result.version = parse_version(&version.stdout_or_stderr());
    if let Some(token) = spec.token_path(data_dir) {
        result.signed_in = Some(token.is_file());
        return;
    }
    let Some(status_args) = spec.status_args else {
        return;
    };
    match capture(command(spec, path, status_args, data_dir)) {
        Ok(output) if output.success => {
            result.signed_in = Some(true);
            result.account = account_of(&output);
        }
        Ok(_) => result.signed_in = Some(false),
        Err(error) => {
            result.ok = false;
            result.error = error;
        }
    }
}

pub fn login(spec: &CliSpec, data_dir: &Path) -> Result<Child, String> {
    let path = installed(spec)?;
    prepare(spec, data_dir)?;
    let mut command = command(spec, &path, spec.login_args, data_dir);
    open_terminal(&mut command);
    command
        .spawn()
        .map_err(|error| format!("Could not open the terminal: {error}"))
}

pub fn logout(spec: &CliSpec, data_dir: &Path) -> Result<(), String> {
    if let Some(token) = spec.token_path(data_dir) {
        return remove_token(&token);
    }
    let args = spec
        .logout_args
        .ok_or_else(|| format!("{} cannot sign out from here.", spec.name))?;
    let path = installed(spec)?;
    prepare(spec, data_dir)?;
    let output = capture(command(spec, &path, args, data_dir))?;
    if output.success {
        Ok(())
    } else {
        Err(failure_detail(&output))
    }
}

fn remove_token(token: &Path) -> Result<(), String> {
    match std::fs::remove_file(token) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(format!("Could not remove {}: {error}", token.display())),
    }
}

pub fn prepare(spec: &CliSpec, data_dir: &Path) -> Result<(), String> {
    if spec.profile_env.is_none() {
        return Ok(());
    }
    let dir = spec.profile_dir(data_dir);
    std::fs::create_dir_all(&dir)
        .map_err(|error| format!("Could not create {}: {error}", dir.display()))
}

fn command(spec: &CliSpec, path: &Path, args: &[&str], data_dir: &Path) -> Command {
    let mut command = Command::new(path);
    command
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    spec.configure(&mut command, data_dir);
    hide_window(&mut command);
    command
}

pub fn installed(spec: &CliSpec) -> Result<PathBuf, String> {
    installed_executable(config::current(), spec.id).ok_or_else(|| {
        format!(
            "{} is not installed; download it in Settings > LLM.",
            spec.name
        )
    })
}

fn capture(mut command: Command) -> Result<Captured, String> {
    let mut child = command
        .spawn()
        .map_err(|error| format!("Could not run the command: {error}"))?;
    let status = wait_with_timeout(&mut child)?;
    Ok(Captured {
        success: status.success(),
        status: status.to_string(),
        stdout: drain(child.stdout.take()),
        stderr: drain(child.stderr.take()),
    })
}

impl Captured {
    fn stdout_or_stderr(&self) -> String {
        if self.stdout.trim().is_empty() {
            self.stderr.clone()
        } else {
            self.stdout.clone()
        }
    }
}

fn wait_with_timeout(child: &mut Child) -> Result<std::process::ExitStatus, String> {
    let deadline = Instant::now() + PROBE_TIMEOUT;
    loop {
        match child.try_wait() {
            Ok(Some(status)) => return Ok(status),
            Ok(None) if Instant::now() >= deadline => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(format!(
                    "The command did not finish within {} seconds.",
                    PROBE_TIMEOUT.as_secs()
                ));
            }
            Ok(None) => std::thread::sleep(POLL_INTERVAL),
            Err(error) => return Err(format!("Could not run the command: {error}")),
        }
    }
}

fn drain<R: Read>(stream: Option<R>) -> String {
    let mut bytes = Vec::new();
    if let Some(mut stream) = stream {
        let _ = stream.read_to_end(&mut bytes);
    }
    String::from_utf8_lossy(&bytes).into_owned()
}

fn failure_detail(output: &Captured) -> String {
    let detail = failure_snippet(&output.stdout, &output.stderr);
    if detail.is_empty() {
        format!("Command exited with {}.", output.status)
    } else {
        format!("Command exited with {}: {detail}", output.status)
    }
}

fn account_of(output: &Captured) -> String {
    let text = output.stdout_or_stderr();
    if let Ok(value) = serde_json::from_str::<serde_json::Value>(&text) {
        return ["email", "account", "user"]
            .iter()
            .find_map(|key| value.get(key).and_then(|field| field.as_str()))
            .unwrap_or_default()
            .to_string();
    }
    text.lines()
        .map(str::trim)
        .find(|line| !line.is_empty() && !line.starts_with("WARNING"))
        .unwrap_or_default()
        .chars()
        .take(ACCOUNT_LIMIT)
        .collect()
}

pub fn parse_version(output: &str) -> String {
    let line = output.lines().find(|line| !line.trim().is_empty());
    let Some(line) = line.map(str::trim) else {
        return String::new();
    };
    line.split_whitespace()
        .map(|token| token.trim_matches(|c: char| c == '(' || c == ')' || c == 'v'))
        .find(|token| token.starts_with(|c: char| c.is_ascii_digit()) && token.contains('.'))
        .unwrap_or(line)
        .to_string()
}

#[cfg(windows)]
fn open_terminal(command: &mut Command) {
    use std::os::windows::process::CommandExt;
    command
        .stdin(Stdio::inherit())
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .creation_flags(CREATE_NEW_CONSOLE);
}

#[cfg(not(windows))]
fn open_terminal(command: &mut Command) {
    command
        .stdin(Stdio::inherit())
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit());
}

#[cfg(test)]
#[path = "../../../test/features/settings/probe.test.rs"]
mod tests;
