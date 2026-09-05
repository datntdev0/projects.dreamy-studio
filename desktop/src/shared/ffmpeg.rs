use crate::shared::process::failure_snippet;
use crate::shared::process::hide_window;
use std::ffi::OsString;
use std::path::Path;
use std::path::PathBuf;
use std::process::Command;
use std::process::Stdio;

const SIDECAR_MISSING: &str = "ffmpeg sidecar is missing";

pub fn sidecar_path() -> Result<PathBuf, String> {
    let executable = std::env::current_exe().map_err(|error| error.to_string())?;
    let name = if cfg!(windows) {
        "ffmpeg.exe"
    } else {
        "ffmpeg"
    };
    executable
        .ancestors()
        .skip(1)
        .take(2)
        .map(|directory| directory.join(name))
        .find(|candidate| candidate.is_file())
        .ok_or_else(|| SIDECAR_MISSING.to_string())
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
