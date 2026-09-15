use std::io;
use std::io::Read;
use std::process::Child;
use std::process::Command;
use std::process::ExitStatus;
use std::process::Output;
use std::process::Stdio;
use std::thread;
use std::thread::JoinHandle;
use std::time::Duration;
use std::time::Instant;

#[cfg(windows)]
pub const CREATE_NO_WINDOW: u32 = 0x0800_0000;
const DETAIL_LIMIT: usize = 400;
const POLL_INTERVAL: Duration = Duration::from_millis(25);

pub fn failure_snippet(stdout: &str, stderr: &str) -> String {
    let source = if stderr.trim().is_empty() {
        stdout
    } else {
        stderr
    };
    source.trim().chars().take(DETAIL_LIMIT).collect()
}

#[cfg(windows)]
pub fn hide_window(command: &mut Command) {
    use std::os::windows::process::CommandExt;
    command.creation_flags(CREATE_NO_WINDOW);
}

#[cfg(not(windows))]
pub fn hide_window(_command: &mut Command) {}

pub fn output_with_timeout(command: &mut Command, timeout: Duration) -> io::Result<Output> {
    let mut child = command
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()?;
    let stdout = spawn_reader(child.stdout.take());
    let stderr = spawn_reader(child.stderr.take());
    let status = wait_until(&mut child, timeout);
    let stdout = join_reader(stdout);
    let stderr = join_reader(stderr);
    Ok(Output {
        status: status?,
        stdout,
        stderr,
    })
}

fn wait_until(child: &mut Child, timeout: Duration) -> io::Result<ExitStatus> {
    let deadline = Instant::now() + timeout;
    loop {
        if let Some(status) = child.try_wait()? {
            return Ok(status);
        }
        if Instant::now() >= deadline {
            let _ = child.kill();
            let _ = child.wait();
            return Err(io::Error::new(
                io::ErrorKind::TimedOut,
                format!(
                    "the command did not finish within {} seconds",
                    timeout.as_secs()
                ),
            ));
        }
        thread::sleep(POLL_INTERVAL);
    }
}

fn spawn_reader<R: Read + Send + 'static>(stream: Option<R>) -> JoinHandle<Vec<u8>> {
    thread::spawn(move || read_all(stream))
}

fn read_all<R: Read>(stream: Option<R>) -> Vec<u8> {
    let mut bytes = Vec::new();
    if let Some(mut stream) = stream {
        let _ = stream.read_to_end(&mut bytes);
    }
    bytes
}

fn join_reader(reader: JoinHandle<Vec<u8>>) -> Vec<u8> {
    reader.join().unwrap_or_default()
}
