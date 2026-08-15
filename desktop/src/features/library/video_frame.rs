use crate::features::library::models::LibraryError;
use crate::features::library::models::LibraryErrorCode;
use crate::features::library::models::LibraryResult;
use std::path::Path;
use std::path::PathBuf;
use std::process::Command;
use std::process::Output;
use std::process::Stdio;

pub const FRAME_SECOND: i64 = 1;
const JPEG_MAGIC: [u8; 3] = [0xff, 0xd8, 0xff];
const JPEG_QUALITY: &str = "3";
const SCALE_FILTER: &str = "scale=w='if(gt(iw,ih),min(480,iw),-2)':h='if(gt(iw,ih),-2,min(480,ih))'";
const STDERR_DETAIL_LIMIT: usize = 400;
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

pub fn extract_poster(video: &Path, duration_ms: i64) -> LibraryResult<Vec<u8>> {
    let ffmpeg = sidecar_path()?;
    let mut failure = unreadable("ffmpeg produced no frame");
    for seconds in seek_candidates(duration_ms) {
        match run_ffmpeg(&ffmpeg, video, seconds) {
            Ok(bytes) => return Ok(bytes),
            Err(error) => failure = error,
        }
    }
    Err(failure)
}

fn seek_candidates(duration_ms: i64) -> Vec<i64> {
    if duration_ms > FRAME_SECOND * 1_000 {
        vec![FRAME_SECOND, 0]
    } else {
        vec![0]
    }
}

pub fn sidecar_path() -> LibraryResult<PathBuf> {
    let executable = std::env::current_exe()?;
    let name = if cfg!(windows) { "ffmpeg.exe" } else { "ffmpeg" };
    executable
        .ancestors()
        .skip(1)
        .take(2)
        .map(|directory| directory.join(name))
        .find(|candidate| candidate.is_file())
        .ok_or_else(|| unreadable("ffmpeg sidecar is missing"))
}

fn run_ffmpeg(ffmpeg: &Path, video: &Path, seconds: i64) -> LibraryResult<Vec<u8>> {
    let mut command = Command::new(ffmpeg);
    command
        .args(["-v", "error", "-nostdin", "-ss"])
        .arg(seconds.to_string())
        .arg("-i")
        .arg(video)
        .args(["-frames:v", "1", "-an", "-sn", "-vf", SCALE_FILTER])
        .args(["-q:v", JPEG_QUALITY, "-f", "image2pipe", "-c:v", "mjpeg", "pipe:1"])
        .stdin(Stdio::null());
    hide_window(&mut command);
    let output = command.output()?;
    if output.status.success() && output.stdout.starts_with(&JPEG_MAGIC) {
        return Ok(output.stdout);
    }
    Err(unreadable(failure_detail(&output)))
}

fn failure_detail(output: &Output) -> String {
    let stderr = String::from_utf8_lossy(&output.stderr);
    let detail: String = stderr.trim().chars().take(STDERR_DETAIL_LIMIT).collect();
    if detail.is_empty() {
        format!("ffmpeg returned no frame ({})", output.status)
    } else {
        format!("ffmpeg failed: {detail}")
    }
}

#[cfg(windows)]
fn hide_window(command: &mut Command) {
    use std::os::windows::process::CommandExt;
    command.creation_flags(CREATE_NO_WINDOW);
}

#[cfg(not(windows))]
fn hide_window(_command: &mut Command) {}

fn unreadable(detail: impl Into<String>) -> LibraryError {
    LibraryError::new(LibraryErrorCode::VideoUnreadable, detail)
}

#[cfg(test)]
pub fn write_sample_clip(path: &Path, seconds: &str) {
    let mut command = Command::new(sidecar_path().unwrap());
    command
        .args(["-v", "error", "-y", "-f", "lavfi", "-i"])
        .arg(format!("testsrc=size=640x360:rate=10:duration={seconds}"))
        .args(["-c:v", "mpeg4", "-pix_fmt", "yuv420p"])
        .arg(path);
    let output = command.output().unwrap();
    assert!(output.status.success(), "{}", failure_detail(&output));
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn jpeg_size(bytes: &[u8]) -> (u32, u32) {
        let image = image::load_from_memory(bytes).unwrap();
        (image.width(), image.height())
    }

    #[test]
    fn plans_the_first_second_then_the_first_frame() {
        assert_eq!(seek_candidates(5_000), vec![1, 0]);
        assert_eq!(seek_candidates(1_001), vec![1, 0]);
        assert_eq!(seek_candidates(1_000), vec![0]);
        assert_eq!(seek_candidates(0), vec![0]);
    }

    #[test]
    fn extracts_a_scaled_jpeg_frame_from_the_first_second() {
        let directory = TempDir::new().unwrap();
        let clip = directory.path().join("clip.mp4");
        write_sample_clip(&clip, "3");
        let bytes = extract_poster(&clip, 3_000).unwrap();
        assert!(bytes.starts_with(&JPEG_MAGIC));
        assert_eq!(jpeg_size(&bytes), (480, 270));
    }

    #[test]
    fn falls_back_to_the_first_frame_for_clips_shorter_than_a_second() {
        let directory = TempDir::new().unwrap();
        let clip = directory.path().join("short.mp4");
        write_sample_clip(&clip, "0.5");
        let bytes = extract_poster(&clip, 500).unwrap();
        assert_eq!(jpeg_size(&bytes), (480, 270));
        let overestimated = extract_poster(&clip, 5_000).unwrap();
        assert!(overestimated.starts_with(&JPEG_MAGIC));
    }

    #[test]
    fn rejects_files_that_ffmpeg_cannot_decode() {
        let directory = TempDir::new().unwrap();
        let broken = directory.path().join("broken.mp4");
        std::fs::write(&broken, b"not a video").unwrap();
        let error = extract_poster(&broken, 2_000).unwrap_err();
        assert_eq!(error.code, LibraryErrorCode::VideoUnreadable);
    }
}
