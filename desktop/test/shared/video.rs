use crate::features::library::videos::sidecar_path;
use std::path::Path;
use std::process::Command;

pub fn write_sample_clip(path: &Path, seconds: &str) {
    let mut command = Command::new(sidecar_path().unwrap());
    command
        .args(["-v", "error", "-y", "-f", "lavfi", "-i"])
        .arg(format!("testsrc=size=640x360:rate=10:duration={seconds}"))
        .args(["-c:v", "mpeg4", "-pix_fmt", "yuv420p"])
        .arg(path);
    let output = command.output().unwrap();
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
}
