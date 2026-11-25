use crate::infra::startup::manifest::installed_executable;
use crate::shared::config;
use crate::shared::process::failure_snippet;
use crate::shared::process::hide_window;
use std::ffi::OsString;
use std::path::Path;
use std::path::PathBuf;
use std::process::Command;
use std::process::Stdio;

const FFMPEG_MISSING: &str = "ffmpeg is not installed; restart Dreamy Studio to finish setup";
const FFMPEG_ITEM: &str = "ffmpeg";

pub fn sidecar_path() -> Result<PathBuf, String> {
    installed_executable(config::current(), FFMPEG_ITEM).ok_or_else(|| FFMPEG_MISSING.to_string())
}

pub fn wav_args(input: &Path, output: &Path, options: &[String]) -> Vec<OsString> {
    let mut args: Vec<OsString> = ["-v", "error", "-nostdin", "-y", "-i"]
        .iter()
        .map(OsString::from)
        .collect();
    args.push(input.as_os_str().to_os_string());
    args.extend(options.iter().map(OsString::from));
    args.extend(
        ["-c:a", "pcm_s16le", "-f", "wav"]
            .iter()
            .map(OsString::from),
    );
    args.push(output.as_os_str().to_os_string());
    args
}

pub fn run(args: &[OsString]) -> Result<(), String> {
    let mut command = Command::new(sidecar_path()?);
    command.args(args).stdin(Stdio::null());
    hide_window(&mut command);
    let output = command.output().map_err(|error| error.to_string())?;
    if output.status.success() {
        return Ok(());
    }
    let detail = failure_snippet(
        &String::from_utf8_lossy(&output.stdout),
        &String::from_utf8_lossy(&output.stderr),
    );
    Err(format!("ffmpeg failed: {detail}"))
}
