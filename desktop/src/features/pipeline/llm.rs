use crate::features::pipeline::log::TaskLog;
use crate::features::pipeline::translator::TranslateError;
use crate::features::pipeline::translator::TranslateJob;
use crate::features::pipeline::translator::Translator;
use crate::features::settings::home::MCP_TOKEN_ENV;
use crate::features::settings::llm::CliSpec;
use crate::features::settings::llm::Effort;
use crate::features::settings::llm::FeatureSettings;
use crate::features::settings::llm::LLM_DIR;
use crate::features::settings::llm::LlmSettings;
use crate::features::settings::llm::spec;
use crate::features::settings::probe::hide_window;
use crate::features::settings::probe::locate;
use crate::features::settings::probe::prepare;
use crate::features::settings::repository::SettingsRepository;
use crate::features::translation::service::TranslatedRun;
use crate::shared::process::failure_snippet;
use serde::Deserialize;
use serde_json::Value;
use serde_json::json;
use std::io::Read;
use std::io::Write;
use std::path::Path;
use std::path::PathBuf;
use std::process::Child;
use std::process::Command;
use std::process::ExitStatus;
use std::process::Stdio;
use std::sync::atomic::AtomicBool;
use std::sync::atomic::Ordering;
use std::thread;
use std::thread::JoinHandle;
use std::time::Duration;
use std::time::Instant;
use uuid::Uuid;

pub const FEATURE: &str = "translation";
const ASSISTANT_FEATURE: &str = "assistant";
const RUN_TIMEOUT: Duration = Duration::from_secs(900);
const POLL_INTERVAL: Duration = Duration::from_millis(50);
const WORK_DIR: &str = "work";
const STARTED_PROGRESS: u8 = 10;
const FINISHED_PROGRESS: u8 = 100;
const SESSION_DEPTH: usize = 4;

#[derive(Debug, Clone)]
pub struct LlmTranslator {
    client: LlmClient,
}

impl LlmTranslator {
    pub fn new(repository: SettingsRepository) -> Self {
        Self {
            client: LlmClient::new(repository, FEATURE, FEATURE),
        }
    }
}

impl Translator for LlmTranslator {
    fn translate(
        &self,
        job: &TranslateJob,
        log: &TaskLog,
        progress: &dyn Fn(u8),
        cancel: &AtomicBool,
    ) -> Result<TranslatedRun, TranslateError> {
        let text = self
            .client
            .complete("translation", build_prompt(job), log, progress, cancel)?;
        let run = parse_output(&text, job).map_err(TranslateError::Failed)?;
        progress(FINISHED_PROGRESS);
        Ok(run)
    }
}

#[derive(Debug, Clone)]
pub(crate) struct LlmClient {
    repository: SettingsRepository,
    feature: &'static str,
    label: &'static str,
    timeout: Duration,
}

impl LlmClient {
    pub(crate) fn new(
        repository: SettingsRepository,
        feature: &'static str,
        label: &'static str,
    ) -> Self {
        Self {
            repository,
            feature,
            label,
            timeout: RUN_TIMEOUT,
        }
    }

    pub(crate) fn complete(
        &self,
        purpose: &str,
        prompt: String,
        log: &TaskLog,
        progress: &dyn Fn(u8),
        cancel: &AtomicBool,
    ) -> Result<String, ClientError> {
        Ok(self
            .exchange(
                Mode::Once,
                purpose,
                prompt,
                log,
                progress,
                cancel,
                &Extras::default(),
            )?
            .0)
    }

    pub(crate) fn provider(&self) -> Result<String, ClientError> {
        Ok(self.select()?.cli.id.to_string())
    }

    pub(crate) fn start(
        &self,
        purpose: &str,
        prompt: String,
        log: &TaskLog,
        progress: &dyn Fn(u8),
        cancel: &AtomicBool,
    ) -> Result<Turn, ClientError> {
        self.start_with(purpose, prompt, log, progress, cancel, &Extras::default())
    }

    pub(crate) fn start_with(
        &self,
        purpose: &str,
        prompt: String,
        log: &TaskLog,
        progress: &dyn Fn(u8),
        cancel: &AtomicBool,
        extras: &Extras,
    ) -> Result<Turn, ClientError> {
        let id = Uuid::new_v4().to_string();
        let (text, session) = self.exchange(
            Mode::Start(&id),
            purpose,
            prompt,
            log,
            progress,
            cancel,
            extras,
        )?;
        Ok(Turn {
            text,
            session: session.unwrap_or(id),
        })
    }

    pub(crate) fn resume(
        &self,
        purpose: &str,
        session: &str,
        prompt: String,
        log: &TaskLog,
        progress: &dyn Fn(u8),
        cancel: &AtomicBool,
    ) -> Result<Turn, ClientError> {
        self.resume_with(
            purpose,
            session,
            prompt,
            log,
            progress,
            cancel,
            &Extras::default(),
        )
    }

    #[allow(clippy::too_many_arguments)]
    pub(crate) fn resume_with(
        &self,
        purpose: &str,
        session: &str,
        prompt: String,
        log: &TaskLog,
        progress: &dyn Fn(u8),
        cancel: &AtomicBool,
        extras: &Extras,
    ) -> Result<Turn, ClientError> {
        let (text, _) = self.exchange(
            Mode::Resume(session),
            purpose,
            prompt,
            log,
            progress,
            cancel,
            extras,
        )?;
        Ok(Turn {
            text,
            session: session.to_string(),
        })
    }

    pub(crate) fn forget(&self, session: &str) {
        let Ok(settings) = self.repository.load() else {
            return;
        };
        let feature = settings.llm.feature(self.feature).normalized();
        let Some(cli) = feature.provider.as_deref().and_then(spec) else {
            return;
        };
        let folder = match cli.id {
            "claude" => "projects",
            "codex" => "sessions",
            _ => return,
        };
        let root = cli.profile_dir(&self.data_dir()).join(folder);
        remove_session(&root, session, SESSION_DEPTH);
    }

    #[allow(clippy::too_many_arguments)]
    fn exchange(
        &self,
        mode: Mode,
        purpose: &str,
        prompt: String,
        log: &TaskLog,
        progress: &dyn Fn(u8),
        cancel: &AtomicBool,
        extras: &Extras,
    ) -> Result<(String, Option<String>), ClientError> {
        let result = self.exchange_once(mode, purpose, prompt, log, progress, cancel, extras);
        match &result {
            Err(ClientError::Cancelled) => log.line("exchange cancelled"),
            Err(ClientError::Failed(message)) => log.line(&format!("exchange failed: {message}")),
            Ok(_) => {}
        }
        result
    }

    #[allow(clippy::too_many_arguments)]
    fn exchange_once(
        &self,
        mode: Mode,
        purpose: &str,
        prompt: String,
        log: &TaskLog,
        progress: &dyn Fn(u8),
        cancel: &AtomicBool,
        extras: &Extras,
    ) -> Result<(String, Option<String>), ClientError> {
        if cancel.load(Ordering::SeqCst) {
            return Err(ClientError::Cancelled);
        }
        let provider = self.resolve(mode, extras)?;
        let command = self.command(&provider)?;
        if !matches!(mode, Mode::Resume(_)) {
            progress(STARTED_PROGRESS);
        }
        let number = log.next_exchange();
        record_call(log, number, purpose, mode, &command, &prompt);
        let started = Instant::now();
        let output = run(command, prompt, self.timeout, cancel)?;
        record_output(log, number, purpose, &output, started.elapsed());
        if !output.success {
            return Err(failed(failure_detail(provider.cli, &output)));
        }
        reply_of(provider.cli, mode, output.stdout).map_err(failed)
    }

    fn data_dir(&self) -> PathBuf {
        self.repository
            .path()
            .parent()
            .map(Path::to_path_buf)
            .unwrap_or_default()
    }

    fn select(&self) -> Result<Selection, ClientError> {
        let settings = self
            .repository
            .load()
            .map_err(|error| failed(error.to_string()))?
            .llm;
        let feature = settings.feature(self.feature).normalized();
        let id = feature.provider.clone().ok_or_else(|| {
            failed(format!(
                "No LLM provider is set for {}. Choose one in Settings > LLM.",
                self.label
            ))
        })?;
        let cli = spec(&id)
            .filter(|cli| cli.caps.contains(&self.feature))
            .ok_or_else(|| failed(format!("{id} cannot be used for {}.", self.label)))?;
        Ok(Selection {
            settings,
            feature,
            cli,
        })
    }

    fn resolve(&self, mode: Mode, extras: &Extras) -> Result<Provider, ClientError> {
        let Selection {
            settings,
            feature,
            cli,
        } = self.select()?;
        let configured = settings.provider(cli.id).normalized();
        let path = locate(cli, configured.path()).ok_or_else(|| {
            failed(format!(
                "{} was not found. Check its path in Settings > LLM.",
                cli.name
            ))
        })?;
        let args = build_args(
            cli,
            &feature,
            self.label,
            mode,
            self.feature != ASSISTANT_FEATURE,
            &extras.args,
        )
        .map_err(failed)?;
        Ok(Provider {
            cli,
            path,
            args,
            env: extras.env.clone(),
        })
    }

    fn command(&self, provider: &Provider) -> Result<Command, ClientError> {
        let data_dir = self.data_dir();
        prepare(provider.cli, &data_dir).map_err(failed)?;
        let work = data_dir.join(LLM_DIR).join(WORK_DIR);
        std::fs::create_dir_all(&work)
            .map_err(|error| failed(format!("Could not create {}: {error}", work.display())))?;
        let mut command = Command::new(&provider.path);
        command
            .args(&provider.args)
            .current_dir(work)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        if let Some(name) = provider.cli.profile_env {
            command.env(name, provider.cli.profile_dir(&data_dir));
        }
        command.envs(provider.env.iter().map(|(name, value)| (name, value)));
        hide_window(&mut command);
        Ok(command)
    }
}

#[derive(Debug)]
pub(crate) enum ClientError {
    Cancelled,
    Failed(String),
}

impl From<ClientError> for TranslateError {
    fn from(error: ClientError) -> Self {
        match error {
            ClientError::Cancelled => TranslateError::Cancelled,
            ClientError::Failed(message) => TranslateError::Failed(message),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct Turn {
    pub text: String,
    pub session: String,
}

#[derive(Debug, Clone, Copy)]
enum Mode<'a> {
    Once,
    Start(&'a str),
    Resume(&'a str),
}

#[derive(Debug, Clone, Default)]
pub(crate) struct Extras {
    pub args: Vec<String>,
    pub env: Vec<(String, String)>,
}

struct Selection {
    settings: LlmSettings,
    feature: FeatureSettings,
    cli: &'static CliSpec,
}

struct Provider {
    cli: &'static CliSpec,
    path: PathBuf,
    args: Vec<String>,
    env: Vec<(String, String)>,
}

struct Captured {
    success: bool,
    status: String,
    stdout: String,
    stderr: String,
}

#[derive(Deserialize)]
struct Reply {
    #[serde(default)]
    title: Option<String>,
    paragraphs: Vec<String>,
}

fn failed(message: impl Into<String>) -> ClientError {
    ClientError::Failed(message.into())
}

#[cfg(test)]
pub fn invocation_args(cli: &CliSpec, feature: &FeatureSettings) -> Result<Vec<String>, String> {
    build_args(cli, feature, FEATURE, Mode::Once, true, &[])
}

fn base_args(
    cli: &CliSpec,
    label: &str,
    mode: Mode,
    tools_off: bool,
) -> Result<Vec<String>, String> {
    let args: Vec<&str> = match (cli.id, mode) {
        ("claude", Mode::Once) => vec!["-p", "--output-format", "text", "--no-session-persistence"],
        ("claude", Mode::Start(id)) => vec!["-p", "--output-format", "text", "--session-id", id],
        ("claude", Mode::Resume(id)) => vec!["-p", "--output-format", "text", "--resume", id],
        ("codex", Mode::Once) => vec![
            "exec",
            "--skip-git-repo-check",
            "--ephemeral",
            "--sandbox",
            "read-only",
        ],
        ("codex", Mode::Start(_)) => vec![
            "exec",
            "--skip-git-repo-check",
            "--json",
            "--sandbox",
            "read-only",
        ],
        ("codex", Mode::Resume(_)) => vec![
            "exec",
            "resume",
            "--skip-git-repo-check",
            "--json",
            "-c",
            "sandbox_mode=\"read-only\"",
        ],
        _ => return Err(format!("{} cannot be used for {label} yet.", cli.name)),
    };
    let mut args: Vec<String> = args.into_iter().map(String::from).collect();
    if cli.id == "claude" && tools_off {
        args.extend(["--tools".to_string(), String::new()]);
    }
    Ok(args)
}

fn build_args(
    cli: &CliSpec,
    feature: &FeatureSettings,
    label: &str,
    mode: Mode,
    tools_off: bool,
    extras: &[String],
) -> Result<Vec<String>, String> {
    let mut args = base_args(cli, label, mode, tools_off)?;
    if let Some(model) = &feature.model {
        args.extend(model_args(cli.id, model));
    }
    if let Some(effort) = feature.effort {
        args.extend(effort_args(cli.id, effort));
    }
    if let Some(extra) = &feature.args {
        args.extend(split_args(extra));
    }
    args.extend(extras.iter().cloned());
    if let (Mode::Resume(id), "codex") = (mode, cli.id) {
        args.push(id.to_string());
    }
    if cli.id == "codex" {
        args.push("-".to_string());
    }
    Ok(args)
}

fn reply_of(cli: &CliSpec, mode: Mode, stdout: String) -> Result<(String, Option<String>), String> {
    if cli.id != "codex" || matches!(mode, Mode::Once) {
        return Ok((stdout, None));
    }
    let mut session = None;
    let mut text = None;
    for line in stdout.lines() {
        let Ok(event) = serde_json::from_str::<Value>(line.trim()) else {
            continue;
        };
        match event.get("type").and_then(Value::as_str) {
            Some("thread.started") => {
                session = event
                    .get("thread_id")
                    .and_then(Value::as_str)
                    .map(String::from);
            }
            Some("item.completed") => {
                let item = event.get("item");
                if item
                    .and_then(|item| item.get("type"))
                    .and_then(Value::as_str)
                    == Some("agent_message")
                {
                    text = item
                        .and_then(|item| item.get("text"))
                        .and_then(Value::as_str)
                        .map(String::from);
                }
            }
            _ => {}
        }
    }
    match text {
        Some(text) => Ok((text, session)),
        None => Err(format!("{} returned no message.", cli.name)),
    }
}

fn quoted(text: &str) -> String {
    if text.is_empty() || text.contains(char::is_whitespace) {
        format!("\"{text}\"")
    } else {
        text.to_string()
    }
}

fn record_call(
    log: &TaskLog,
    number: usize,
    purpose: &str,
    mode: Mode,
    command: &Command,
    prompt: &str,
) {
    let kind = match mode {
        Mode::Once => "single call",
        Mode::Start(_) => "new session",
        Mode::Resume(_) => "resumed session",
    };
    let mut words = vec![quoted(&command.get_program().to_string_lossy())];
    words.extend(command.get_args().map(|arg| quoted(&arg.to_string_lossy())));
    log.line(&format!(
        "exchange {number} ({purpose}, {kind}): {}",
        words.join(" ")
    ));
    if let Some(dir) = command.get_current_dir() {
        log.line(&format!(
            "exchange {number} working directory: {}",
            dir.display()
        ));
    }
    for (name, value) in command.get_envs() {
        if let Some(value) = value {
            let shown = if name == MCP_TOKEN_ENV {
                "***".into()
            } else {
                value.to_string_lossy()
            };
            log.line(&format!(
                "exchange {number} environment: {}={shown}",
                name.to_string_lossy()
            ));
        }
    }
    let file = log.attach(&format!("exchange-{number}-{purpose}-prompt.txt"), prompt);
    log.line(&format!(
        "exchange {number} prompt: {} ({} bytes, sent on stdin)",
        file.as_deref().unwrap_or("not saved"),
        prompt.len()
    ));
}

fn record_output(
    log: &TaskLog,
    number: usize,
    purpose: &str,
    output: &Captured,
    elapsed: Duration,
) {
    log.line(&format!(
        "exchange {number} finished: {} after {} ms",
        output.status,
        elapsed.as_millis()
    ));
    let response = log.attach(
        &format!("exchange-{number}-{purpose}-response.txt"),
        &output.stdout,
    );
    log.line(&format!(
        "exchange {number} response: {} ({} bytes)",
        response.as_deref().unwrap_or("not saved"),
        output.stdout.len()
    ));
    if !output.stderr.trim().is_empty() {
        let stderr = log.attach(
            &format!("exchange-{number}-{purpose}-stderr.txt"),
            &output.stderr,
        );
        log.line(&format!(
            "exchange {number} stderr: {} ({} bytes)",
            stderr.as_deref().unwrap_or("not saved"),
            output.stderr.len()
        ));
    }
}

fn remove_session(dir: &Path, id: &str, depth: usize) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().into_owned();
        if path.is_dir() && name == id {
            let _ = std::fs::remove_dir_all(&path);
        } else if path.is_dir() && depth > 0 {
            remove_session(&path, id, depth - 1);
        } else if path.is_file() && name.ends_with(&format!("{id}.jsonl")) {
            let _ = std::fs::remove_file(&path);
        }
    }
}

fn model_args(id: &str, model: &str) -> Vec<String> {
    let flag = if id == "codex" { "-m" } else { "--model" };
    vec![flag.to_string(), model.to_string()]
}

fn effort_args(id: &str, effort: Effort) -> Vec<String> {
    if id == "codex" {
        return vec![
            "-c".to_string(),
            format!("model_reasoning_effort=\"{}\"", effort.as_str()),
        ];
    }
    vec!["--effort".to_string(), effort.as_str().to_string()]
}

pub fn split_args(text: &str) -> Vec<String> {
    let mut args = Vec::new();
    let mut current = String::new();
    let mut quote: Option<char> = None;
    let mut started = false;
    for ch in text.chars() {
        match quote {
            Some(open) if ch == open => quote = None,
            Some(_) => current.push(ch),
            None if ch == '"' || ch == '\'' => {
                quote = Some(ch);
                started = true;
            }
            None if ch.is_whitespace() => {
                if started {
                    args.push(std::mem::take(&mut current));
                    started = false;
                }
            }
            None => {
                current.push(ch);
                started = true;
            }
        }
    }
    if started {
        args.push(current);
    }
    args
}

pub fn build_prompt(job: &TranslateJob) -> String {
    let language = match job.target.as_str() {
        "EN" => "English",
        _ => "Vietnamese",
    };
    let source = match job.passage {
        Some(_) => json!({ "paragraphs": job.paragraphs }),
        None => json!({ "title": job.title, "paragraphs": job.paragraphs }),
    };
    let mut prompt = format!(
        "You are a professional literary translator. Translate the novel text below into {language}.\n\
         Keep the meaning, tone and style, and keep every paragraph separate.\n"
    );
    let guidelines = job.guidelines.trim();
    if !guidelines.is_empty() {
        prompt.push_str(&format!("\nTranslation guidelines:\n{guidelines}\n"));
    }
    if !job.dict.is_empty() {
        prompt.push_str("\nDictionary. Always translate these terms exactly as given:\n");
        for entry in &job.dict {
            prompt.push_str(&format!(
                "- {} => {} ({})",
                entry.src, entry.dst, entry.kind
            ));
            if !entry.note.trim().is_empty() {
                prompt.push_str(&format!(": {}", entry.note.trim()));
            }
            prompt.push('\n');
        }
    }
    let shape = match job.passage {
        Some(_) => "{\"paragraphs\": [\"...\"]}",
        None => "{\"title\": \"...\", \"paragraphs\": [\"...\"]}",
    };
    prompt.push_str(&format!(
        "\nThe source is this JSON:\n{}\n\n\
         Reply with only one JSON object shaped like {shape}.\n\
         \"paragraphs\" must hold exactly {} translated strings in the same order.\n\
         Do not add commentary, notes or code fences.\n",
        serde_json::to_string_pretty(&source).unwrap_or_default(),
        job.paragraphs.len()
    ));
    prompt
}

pub fn parse_output(text: &str, job: &TranslateJob) -> Result<TranslatedRun, String> {
    let start = text.find('{');
    let end = text.rfind('}');
    let (Some(start), Some(end)) = (start, end) else {
        return Err("The model did not return a JSON result.".to_string());
    };
    if end < start {
        return Err("The model did not return a JSON result.".to_string());
    }
    let reply: Reply = serde_json::from_str(&text[start..=end])
        .map_err(|error| format!("The model returned an unreadable result: {error}"))?;
    if reply.paragraphs.len() != job.paragraphs.len() {
        return Err(format!(
            "The model returned {} paragraphs but {} were expected.",
            reply.paragraphs.len(),
            job.paragraphs.len()
        ));
    }
    let title = reply
        .title
        .map(|title| title.trim().to_string())
        .filter(|title| !title.is_empty())
        .unwrap_or_else(|| job.title.clone());
    Ok(TranslatedRun {
        title,
        paragraphs: reply.paragraphs,
    })
}

fn run(
    mut command: Command,
    prompt: String,
    timeout: Duration,
    cancel: &AtomicBool,
) -> Result<Captured, ClientError> {
    let mut child = command
        .spawn()
        .map_err(|error| failed(format!("Could not run the command: {error}")))?;
    let writer = child.stdin.take().map(|mut stdin| {
        thread::spawn(move || {
            let _ = stdin.write_all(prompt.as_bytes());
        })
    });
    let stdout = reader(child.stdout.take());
    let stderr = reader(child.stderr.take());
    let status = wait(&mut child, timeout, cancel)?;
    if let Some(writer) = writer {
        let _ = writer.join();
    }
    Ok(Captured {
        success: status.success(),
        status: status.to_string(),
        stdout: collect(stdout),
        stderr: collect(stderr),
    })
}

fn reader<R: Read + Send + 'static>(stream: Option<R>) -> JoinHandle<Vec<u8>> {
    thread::spawn(move || {
        let mut bytes = Vec::new();
        if let Some(mut stream) = stream {
            let _ = stream.read_to_end(&mut bytes);
        }
        bytes
    })
}

fn collect(handle: JoinHandle<Vec<u8>>) -> String {
    String::from_utf8_lossy(&handle.join().unwrap_or_default()).into_owned()
}

fn wait(
    child: &mut Child,
    timeout: Duration,
    cancel: &AtomicBool,
) -> Result<ExitStatus, ClientError> {
    let deadline = Instant::now() + timeout;
    loop {
        match child.try_wait() {
            Ok(Some(status)) => return Ok(status),
            Ok(None) if cancel.load(Ordering::SeqCst) => {
                stop(child);
                return Err(ClientError::Cancelled);
            }
            Ok(None) if Instant::now() >= deadline => {
                stop(child);
                return Err(failed(format!(
                    "The command did not finish within {} seconds.",
                    timeout.as_secs()
                )));
            }
            Ok(None) => thread::sleep(POLL_INTERVAL),
            Err(error) => {
                stop(child);
                return Err(failed(format!("Could not run the command: {error}")));
            }
        }
    }
}

fn stop(child: &mut Child) {
    let _ = child.kill();
    let _ = child.wait();
}

fn failure_detail(cli: &CliSpec, output: &Captured) -> String {
    let detail = failure_snippet(&output.stdout, &output.stderr);
    if detail.is_empty() {
        format!("{} exited with {}.", cli.name, output.status)
    } else {
        format!("{} exited with {}: {detail}", cli.name, output.status)
    }
}

#[cfg(test)]
#[path = "../../../test/features/pipeline/llm.test.rs"]
mod tests;
