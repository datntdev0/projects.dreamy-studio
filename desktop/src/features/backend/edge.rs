use crate::features::backend::models::CloudCheckResult;
use crate::features::backend::models::SynthesisRequest;
use crate::features::backend::models::SynthesizedAudio;
use crate::features::backend::speech;
use crate::features::backend::speech::FAILURE_STATUS;
use crate::features::backend::speech::INVALID_STATUS;
use crate::features::backend::speech::UNAVAILABLE_STATUS;
use crate::features::backend::speech::api_error;
use crate::infra::backend_client::ClientError;
use crate::infra::startup::manifest::installed_executable;
use crate::shared::config;
use crate::shared::process::failure_snippet;
use crate::shared::process::hide_window;
use std::fmt::Display;
use std::fs;
use std::io::Write;
use std::path::Path;
use std::path::PathBuf;
use std::process::Command;
use std::process::Output;
use std::process::Stdio;
use uuid::Uuid;

pub const EDGE_ENGINE: &str = "edge-read-aloud";
const SCRIPT: &str = include_str!("../../../scripts/edge_tts_speak.py");
const SCRIPT_FILE: &str = "edge_tts_speak.py";
const HOME_DIR: &str = "edge-tts";
const JOBS_DIR: &str = "jobs";
const AUDIO_FILE: &str = "speech.mp3";
const SUBTITLES_FILE: &str = "speech.srt";
const PYTHON_ITEM: &str = "python";
const CHECK_VOICE: &str = "vi-VN-HoaiMyNeural";
const CHECK_TEXT: &str = "Xin chào.";
const PRESET_SOURCE: &str = "preset";
const FAILURE_CODE: &str = "EDGE_TTS_FAILED";

struct EdgeSpeech {
    mp3: Vec<u8>,
    subtitles: String,
}

struct EdgeRuntime {
    python: PathBuf,
    home: PathBuf,
}

pub fn supports(engine: &str) -> bool {
    engine == EDGE_ENGINE
}

pub fn synthesize(request: &SynthesisRequest) -> Result<SynthesizedAudio, ClientError> {
    let voice = require_voice(request)?;
    let text = speech::collapsed_text(&request.text)?;
    let spoken = EdgeRuntime::current()?.speak(voice, &text)?;
    speech::mp3_audio(spoken.mp3, Some(spoken.subtitles), FAILURE_CODE)
}

pub fn check() -> CloudCheckResult {
    let outcome = EdgeRuntime::current().and_then(|runtime| runtime.speak(CHECK_VOICE, CHECK_TEXT));
    speech::check_result(outcome.map(drop))
}

fn require_voice(request: &SynthesisRequest) -> Result<&str, ClientError> {
    if request.source != PRESET_SOURCE {
        let message = format!("Microsoft Edge does not support {} voices", request.source);
        return Err(api_error(INVALID_STATUS, "SOURCE_UNSUPPORTED", &message));
    }
    let voice = request.preset.as_str();
    let valid = voice.ends_with("Neural")
        && voice
            .chars()
            .all(|char| char.is_ascii_alphanumeric() || char == '-');
    if !valid {
        let message = format!("Unknown preset voice '{voice}'");
        return Err(api_error(INVALID_STATUS, "PRESET_UNKNOWN", &message));
    }
    Ok(voice)
}

impl EdgeRuntime {
    fn current() -> Result<Self, ClientError> {
        let config = config::current();
        let python = installed_executable(config, PYTHON_ITEM).ok_or_else(|| {
            api_error(
                UNAVAILABLE_STATUS,
                "MODEL_NOT_INSTALLED",
                "The Python runtime is not installed yet",
            )
        })?;
        Ok(Self {
            python,
            home: config.runtime_dir.join(HOME_DIR),
        })
    }

    fn speak(&self, voice: &str, text: &str) -> Result<EdgeSpeech, ClientError> {
        let script = self.ensure_script()?;
        let job = self
            .home
            .join(JOBS_DIR)
            .join(Uuid::new_v4().simple().to_string());
        fs::create_dir_all(&job).map_err(failure)?;
        let result = self.run_script(&script, &job, voice, text);
        let _ = fs::remove_dir_all(&job);
        result
    }

    fn run_script(
        &self,
        script: &Path,
        job: &Path,
        voice: &str,
        text: &str,
    ) -> Result<EdgeSpeech, ClientError> {
        let audio = job.join(AUDIO_FILE);
        let subtitles = job.join(SUBTITLES_FILE);
        let mut command = self.python_command();
        command
            .arg(script)
            .args(["--voice", voice])
            .arg("--audio")
            .arg(&audio)
            .arg("--subtitles")
            .arg(&subtitles);
        let output = run_with_input(command, text.as_bytes())?;
        require_success(&output, "Microsoft Edge Read Aloud failed")?;
        Ok(EdgeSpeech {
            mp3: fs::read(&audio).map_err(failure)?,
            subtitles: fs::read_to_string(&subtitles).unwrap_or_default(),
        })
    }

    fn ensure_script(&self) -> Result<PathBuf, ClientError> {
        let path = self.home.join(SCRIPT_FILE);
        if fs::read_to_string(&path).ok().as_deref() != Some(SCRIPT) {
            fs::create_dir_all(&self.home).map_err(failure)?;
            fs::write(&path, SCRIPT).map_err(failure)?;
        }
        Ok(path)
    }

    fn python_command(&self) -> Command {
        let mut command = Command::new(&self.python);
        command
            .args(["-E", "-s"])
            .env("PYTHONIOENCODING", "utf-8")
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        hide_window(&mut command);
        command
    }
}

fn run_with_input(mut command: Command, input: &[u8]) -> Result<Output, ClientError> {
    let mut child = command.stdin(Stdio::piped()).spawn().map_err(failure)?;
    if let Some(mut stdin) = child.stdin.take() {
        stdin.write_all(input).map_err(failure)?;
    }
    child.wait_with_output().map_err(failure)
}

fn require_success(output: &Output, context: &str) -> Result<(), ClientError> {
    if output.status.success() {
        return Ok(());
    }
    let detail = failure_snippet(
        &String::from_utf8_lossy(&output.stdout),
        &String::from_utf8_lossy(&output.stderr),
    );
    Err(failure(format!("{context}: {detail}")))
}

fn failure(detail: impl Display) -> ClientError {
    api_error(FAILURE_STATUS, FAILURE_CODE, &detail.to_string())
}
