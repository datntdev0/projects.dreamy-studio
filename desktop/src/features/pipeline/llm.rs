use crate::features::pipeline::translator::TranslateError;
use crate::features::pipeline::translator::TranslateJob;
use crate::features::pipeline::translator::Translator;
use crate::features::settings::llm::CliSpec;
use crate::features::settings::llm::Effort;
use crate::features::settings::llm::FeatureSettings;
use crate::features::settings::llm::LLM_DIR;
use crate::features::settings::llm::spec;
use crate::features::settings::probe::hide_window;
use crate::features::settings::probe::locate;
use crate::features::settings::probe::prepare;
use crate::features::settings::repository::SettingsRepository;
use crate::features::translation::service::TranslatedRun;
use serde::Deserialize;
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

pub const FEATURE: &str = "translation";
const RUN_TIMEOUT: Duration = Duration::from_secs(900);
const POLL_INTERVAL: Duration = Duration::from_millis(50);
const WORK_DIR: &str = "work";
const DETAIL_LIMIT: usize = 400;
const STARTED_PROGRESS: u8 = 10;
const FINISHED_PROGRESS: u8 = 100;

#[derive(Debug, Clone)]
pub struct LlmTranslator {
    repository: SettingsRepository,
    timeout: Duration,
}

impl LlmTranslator {
    pub fn new(repository: SettingsRepository) -> Self {
        Self {
            repository,
            timeout: RUN_TIMEOUT,
        }
    }

    fn data_dir(&self) -> PathBuf {
        self.repository
            .path()
            .parent()
            .map(Path::to_path_buf)
            .unwrap_or_default()
    }

    fn resolve(&self) -> Result<Provider, TranslateError> {
        let settings = self
            .repository
            .load()
            .map_err(|error| failed(error.to_string()))?
            .llm;
        let feature = settings.feature(FEATURE).normalized();
        let id = feature.provider.clone().ok_or_else(|| {
            failed("No LLM provider is set for translation. Choose one in Settings > LLM.")
        })?;
        let cli = spec(&id)
            .filter(|cli| cli.caps.contains(&FEATURE))
            .ok_or_else(|| failed(format!("{id} cannot be used for translation.")))?;
        let configured = settings.provider(&id).normalized();
        let path = locate(cli, configured.path()).ok_or_else(|| {
            failed(format!(
                "{} was not found. Check its path in Settings > LLM.",
                cli.name
            ))
        })?;
        let args = invocation_args(cli, &feature).map_err(failed)?;
        Ok(Provider { cli, path, args })
    }

    fn command(&self, provider: &Provider) -> Result<Command, TranslateError> {
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
        hide_window(&mut command);
        Ok(command)
    }
}

impl Translator for LlmTranslator {
    fn translate(
        &self,
        job: &TranslateJob,
        progress: &dyn Fn(u8),
        cancel: &AtomicBool,
    ) -> Result<TranslatedRun, TranslateError> {
        if cancel.load(Ordering::SeqCst) {
            return Err(TranslateError::Cancelled);
        }
        let provider = self.resolve()?;
        let command = self.command(&provider)?;
        progress(STARTED_PROGRESS);
        let output = run(command, build_prompt(job), self.timeout, cancel)?;
        if !output.success {
            return Err(failed(failure_detail(provider.cli, &output)));
        }
        let run = parse_output(&output.stdout, job).map_err(failed)?;
        progress(FINISHED_PROGRESS);
        Ok(run)
    }
}

struct Provider {
    cli: &'static CliSpec,
    path: PathBuf,
    args: Vec<String>,
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

fn failed(message: impl Into<String>) -> TranslateError {
    TranslateError::Failed(message.into())
}

pub fn invocation_args(cli: &CliSpec, feature: &FeatureSettings) -> Result<Vec<String>, String> {
    let mut args: Vec<String> = match cli.id {
        "claude" => ["-p", "--output-format", "text", "--no-session-persistence"]
            .into_iter()
            .chain(["--tools", ""])
            .map(String::from)
            .collect(),
        "codex" => [
            "exec",
            "--skip-git-repo-check",
            "--ephemeral",
            "--sandbox",
            "read-only",
        ]
        .map(String::from)
        .to_vec(),
        _ => return Err(format!("{} cannot translate yet.", cli.name)),
    };
    if let Some(model) = &feature.model {
        args.extend(model_args(cli.id, model));
    }
    if let Some(effort) = feature.effort {
        args.extend(effort_args(cli.id, effort));
    }
    if let Some(extra) = &feature.args {
        args.extend(split_args(extra));
    }
    if cli.id == "codex" {
        args.push("-".to_string());
    }
    Ok(args)
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
) -> Result<Captured, TranslateError> {
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
) -> Result<ExitStatus, TranslateError> {
    let deadline = Instant::now() + timeout;
    loop {
        match child.try_wait() {
            Ok(Some(status)) => return Ok(status),
            Ok(None) if cancel.load(Ordering::SeqCst) => {
                stop(child);
                return Err(TranslateError::Cancelled);
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
    let source = if output.stderr.trim().is_empty() {
        &output.stdout
    } else {
        &output.stderr
    };
    let detail: String = source.trim().chars().take(DETAIL_LIMIT).collect();
    if detail.is_empty() {
        format!("{} exited with {}.", cli.name, output.status)
    } else {
        format!("{} exited with {}: {detail}", cli.name, output.status)
    }
}

#[cfg(test)]
#[path = "../../../test/features/pipeline/llm.test.rs"]
mod tests;
