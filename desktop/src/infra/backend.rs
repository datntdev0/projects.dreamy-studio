use std::env::current_exe;
use std::fmt;
use std::fs::File;
use std::io::ErrorKind;
use std::io::Read;
use std::io::Write;
use std::net::Ipv4Addr;
use std::net::SocketAddr;
use std::net::TcpListener;
use std::net::TcpStream;
use std::path::Path;
use std::path::PathBuf;
use std::process::Child;
use std::process::Command;
use std::process::Stdio;
use std::sync::Mutex;
use std::sync::MutexGuard;
use std::sync::atomic::AtomicBool;
use std::sync::atomic::Ordering;
use std::thread::sleep;
use std::time::Duration;
use std::time::Instant;

const READY_TIMEOUT: Duration = Duration::from_secs(30);
const POLL_INTERVAL: Duration = Duration::from_millis(100);
const PROBE_TIMEOUT: Duration = Duration::from_millis(300);
const STDERR_FILE: &str = "backend-stderr.log";

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;
#[cfg(windows)]
const SIDECAR_FILE: &str = "dreamy-backend.exe";
#[cfg(not(windows))]
const SIDECAR_FILE: &str = "dreamy-backend";

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum BackendError {
    Missing(String),
    StartFailed(String),
    Timeout(String),
    Cancelled,
}

impl fmt::Display for BackendError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            BackendError::Missing(detail) => write!(f, "backend not found: {detail}"),
            BackendError::StartFailed(detail) => write!(f, "backend failed to start: {detail}"),
            BackendError::Timeout(detail) => write!(f, "backend start timed out: {detail}"),
            BackendError::Cancelled => f.write_str("backend start cancelled"),
        }
    }
}

impl std::error::Error for BackendError {}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct BackendReady {
    pub port: u16,
    pub spawned: bool,
}

pub trait BackendHost: Send + Sync {
    fn start(&self, cancel: &AtomicBool) -> Result<BackendReady, BackendError>;
    fn stop(&self);
}

#[derive(Debug, Clone)]
pub struct BackendLaunch {
    pub program: PathBuf,
    pub args: Vec<String>,
    pub working_dir: Option<PathBuf>,
    pub run_mode: &'static str,
    pub log_dir: PathBuf,
    pub ready_timeout: Duration,
}

impl BackendLaunch {
    pub fn resolve(log_dir: PathBuf) -> Self {
        if cfg!(debug_assertions) {
            Self::development(log_dir)
        } else {
            Self::packaged(log_dir)
        }
    }

    fn development(log_dir: PathBuf) -> Self {
        let manifest = Path::new(env!("CARGO_MANIFEST_DIR"));
        let root = match manifest.parent() {
            Some(parent) => parent,
            None => manifest,
        };
        let backend = root.join("backend");
        Self {
            program: venv_python(&backend),
            args: vec!["-m".to_string(), "app".to_string()],
            working_dir: Some(backend),
            run_mode: "dev",
            log_dir,
            ready_timeout: READY_TIMEOUT,
        }
    }

    fn packaged(log_dir: PathBuf) -> Self {
        Self {
            program: sidecar_path(),
            args: Vec::new(),
            working_dir: None,
            run_mode: "prod",
            log_dir,
            ready_timeout: READY_TIMEOUT,
        }
    }

    fn stderr_path(&self) -> PathBuf {
        self.log_dir.join(STDERR_FILE)
    }
}

#[cfg(windows)]
fn venv_python(backend: &Path) -> PathBuf {
    backend.join(".venv").join("Scripts").join("python.exe")
}

#[cfg(not(windows))]
fn venv_python(backend: &Path) -> PathBuf {
    backend.join(".venv").join("bin").join("python")
}

fn sidecar_path() -> PathBuf {
    let mut path = match current_exe() {
        Ok(path) => path,
        Err(_) => PathBuf::new(),
    };
    path.set_file_name(SIDECAR_FILE);
    path
}

struct Running {
    child: Child,
    port: u16,
}

pub struct BackendProcess {
    launch: BackendLaunch,
    state: Mutex<Option<Running>>,
}

impl BackendProcess {
    pub fn new(launch: BackendLaunch) -> Self {
        Self {
            launch,
            state: Mutex::new(None),
        }
    }

    fn running_port(&self) -> Option<u16> {
        let mut state = lock(&self.state);
        let running = state.as_mut()?;
        if matches!(running.child.try_wait(), Ok(None)) {
            return Some(running.port);
        }
        *state = None;
        None
    }

    fn exit_description(&self) -> Option<String> {
        let mut state = lock(&self.state);
        let running = match state.as_mut() {
            Some(running) => running,
            None => return Some("backend was stopped".to_string()),
        };
        match running.child.try_wait() {
            Ok(Some(status)) => Some(status.to_string()),
            Ok(None) => None,
            Err(error) => Some(error.to_string()),
        }
    }

    fn spawn(&self, port: u16) -> Result<Child, BackendError> {
        let launch = &self.launch;
        let mut command = Command::new(&launch.program);
        command
            .args(&launch.args)
            .arg("--port")
            .arg(port.to_string())
            .arg("--run-mode")
            .arg(launch.run_mode)
            .arg("--log-dir")
            .arg(&launch.log_dir)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(stderr_target(&launch.stderr_path()));
        if let Some(directory) = &launch.working_dir {
            command.current_dir(directory);
        }
        hide_window(&mut command);
        match command.spawn() {
            Ok(child) => Ok(child),
            Err(error) if error.kind() == ErrorKind::NotFound => Err(BackendError::Missing(
                format!("{}: {error}", launch.program.display()),
            )),
            Err(error) => Err(BackendError::StartFailed(error.to_string())),
        }
    }

    fn await_ready(&self, port: u16, cancel: &AtomicBool) -> Result<(), BackendError> {
        let started = Instant::now();
        loop {
            if cancel.load(Ordering::SeqCst) {
                return Err(BackendError::Cancelled);
            }
            if let Some(status) = self.exit_description() {
                return Err(BackendError::StartFailed(format!(
                    "backend exited early ({status}); see {}",
                    self.launch.stderr_path().display()
                )));
            }
            if probe_health(port) {
                return Ok(());
            }
            if started.elapsed() >= self.launch.ready_timeout {
                return Err(BackendError::Timeout(format!(
                    "no health response on port {port} within {} seconds",
                    self.launch.ready_timeout.as_secs()
                )));
            }
            sleep(POLL_INTERVAL);
        }
    }
}

impl BackendHost for BackendProcess {
    fn start(&self, cancel: &AtomicBool) -> Result<BackendReady, BackendError> {
        if let Some(port) = self.running_port() {
            return Ok(BackendReady {
                port,
                spawned: false,
            });
        }
        let port = free_port()?;
        let child = self.spawn(port)?;
        *lock(&self.state) = Some(Running { child, port });
        match self.await_ready(port, cancel) {
            Ok(()) => Ok(BackendReady {
                port,
                spawned: true,
            }),
            Err(error) => {
                self.stop();
                Err(error)
            }
        }
    }

    fn stop(&self) {
        let running = lock(&self.state).take();
        if let Some(mut running) = running {
            terminate(&mut running.child);
        }
    }
}

impl Drop for BackendProcess {
    fn drop(&mut self) {
        self.stop();
    }
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    match mutex.lock() {
        Ok(guard) => guard,
        Err(poisoned) => poisoned.into_inner(),
    }
}

fn free_port() -> Result<u16, BackendError> {
    let listener = match TcpListener::bind((Ipv4Addr::LOCALHOST, 0)) {
        Ok(listener) => listener,
        Err(error) => return Err(BackendError::StartFailed(error.to_string())),
    };
    match listener.local_addr() {
        Ok(address) => Ok(address.port()),
        Err(error) => Err(BackendError::StartFailed(error.to_string())),
    }
}

fn stderr_target(path: &Path) -> Stdio {
    match File::create(path) {
        Ok(file) => Stdio::from(file),
        Err(_) => Stdio::null(),
    }
}

fn probe_health(port: u16) -> bool {
    let address = SocketAddr::from((Ipv4Addr::LOCALHOST, port));
    let mut stream = match TcpStream::connect_timeout(&address, PROBE_TIMEOUT) {
        Ok(stream) => stream,
        Err(_) => return false,
    };
    let _ = stream.set_read_timeout(Some(PROBE_TIMEOUT));
    let _ = stream.set_write_timeout(Some(PROBE_TIMEOUT));
    let request =
        format!("GET /health HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\n\r\n");
    if stream.write_all(request.as_bytes()).is_err() {
        return false;
    }
    let mut response = String::new();
    let _ = stream.read_to_string(&mut response);
    is_health_response(&response)
}

fn is_health_response(response: &str) -> bool {
    response.starts_with("HTTP/1.1 200") && response.contains("\"status\":\"ok\"")
}

fn terminate(child: &mut Child) {
    kill_tree(child.id());
    let _ = child.kill();
    let _ = child.wait();
}

#[cfg(windows)]
fn hide_window(command: &mut Command) {
    use std::os::windows::process::CommandExt;
    command.creation_flags(CREATE_NO_WINDOW);
}

#[cfg(not(windows))]
fn hide_window(_command: &mut Command) {}

#[cfg(windows)]
fn kill_tree(pid: u32) {
    use std::os::windows::process::CommandExt;
    let pid_text = pid.to_string();
    let mut command = Command::new("taskkill");
    command
        .args(["/PID", pid_text.as_str(), "/T", "/F"])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .creation_flags(CREATE_NO_WINDOW);
    let _ = command.status();
}

#[cfg(not(windows))]
fn kill_tree(_pid: u32) {}

#[cfg(test)]
pub struct StubBackend {
    failure: Mutex<Option<BackendError>>,
    spawned: bool,
    started: std::sync::atomic::AtomicUsize,
    stopped: std::sync::atomic::AtomicUsize,
}

#[cfg(test)]
impl StubBackend {
    pub fn new() -> Self {
        Self {
            failure: Mutex::new(None),
            spawned: true,
            started: std::sync::atomic::AtomicUsize::new(0),
            stopped: std::sync::atomic::AtomicUsize::new(0),
        }
    }

    pub fn reusing() -> Self {
        let mut stub = Self::new();
        stub.spawned = false;
        stub
    }

    pub fn failing(error: BackendError) -> Self {
        let stub = Self::new();
        *lock(&stub.failure) = Some(error);
        stub
    }

    pub fn started(&self) -> usize {
        self.started.load(Ordering::SeqCst)
    }

    pub fn stopped(&self) -> usize {
        self.stopped.load(Ordering::SeqCst)
    }
}

#[cfg(test)]
impl BackendHost for StubBackend {
    fn start(&self, cancel: &AtomicBool) -> Result<BackendReady, BackendError> {
        if cancel.load(Ordering::SeqCst) {
            return Err(BackendError::Cancelled);
        }
        if let Some(error) = lock(&self.failure).clone() {
            return Err(error);
        }
        self.started.fetch_add(1, Ordering::SeqCst);
        Ok(BackendReady {
            port: 4321,
            spawned: self.spawned,
        })
    }

    fn stop(&self) {
        self.stopped.fetch_add(1, Ordering::SeqCst);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::thread::JoinHandle;
    use std::thread::spawn;
    use tempfile::tempdir;

    fn serve_once(response: &'static str) -> (u16, JoinHandle<String>) {
        let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).unwrap();
        let port = listener.local_addr().unwrap().port();
        let handle = spawn(move || answer(listener, response));
        (port, handle)
    }

    fn answer(listener: TcpListener, response: &str) -> String {
        let (mut stream, _) = listener.accept().unwrap();
        let mut buffer = [0u8; 1024];
        let read = stream.read(&mut buffer).unwrap();
        stream.write_all(response.as_bytes()).unwrap();
        String::from_utf8_lossy(&buffer[..read]).to_string()
    }

    fn launch_of(program: PathBuf, args: Vec<String>, log_dir: PathBuf) -> BackendLaunch {
        BackendLaunch {
            program,
            args,
            working_dir: None,
            run_mode: "test",
            log_dir,
            ready_timeout: Duration::from_secs(5),
        }
    }

    #[test]
    fn health_response_requires_ok_status_and_body() {
        let ok = "HTTP/1.1 200 OK\r\ncontent-type: application/json\r\n\r\n{\"status\":\"ok\"}";
        assert!(is_health_response(ok));
        assert!(!is_health_response(
            "HTTP/1.1 500 Internal Server Error\r\n\r\n"
        ));
        assert!(!is_health_response(
            "HTTP/1.1 200 OK\r\n\r\n{\"status\":\"down\"}"
        ));
        assert!(!is_health_response(""));
    }

    #[test]
    fn probe_health_reads_the_health_endpoint() {
        let (port, handle) = serve_once("HTTP/1.1 200 OK\r\n\r\n{\"status\":\"ok\"}");

        assert!(probe_health(port));

        let request = handle.join().unwrap();
        assert!(request.starts_with("GET /health HTTP/1.1"));
    }

    #[test]
    fn probe_health_is_false_when_nothing_listens() {
        let port = free_port().unwrap();

        assert!(!probe_health(port));
    }

    #[test]
    fn free_port_returns_a_bindable_port() {
        let port = free_port().unwrap();

        assert!(TcpListener::bind((Ipv4Addr::LOCALHOST, port)).is_ok());
    }

    #[test]
    fn launch_resolves_to_the_expected_mode() {
        let launch = BackendLaunch::resolve(PathBuf::from("logs"));

        if cfg!(debug_assertions) {
            assert_eq!(launch.run_mode, "dev");
            assert_eq!(launch.args, vec!["-m".to_string(), "app".to_string()]);
            assert!(launch.program.ends_with(venv_python(Path::new("backend"))));
        } else {
            assert_eq!(launch.run_mode, "prod");
            assert!(launch.program.ends_with(SIDECAR_FILE));
        }
    }

    #[test]
    fn start_reports_missing_program() {
        let dir = tempdir().unwrap();
        let launch = launch_of(
            dir.path().join("absent"),
            Vec::new(),
            dir.path().to_path_buf(),
        );
        let process = BackendProcess::new(launch);

        let error = process.start(&AtomicBool::new(false)).unwrap_err();

        assert!(matches!(error, BackendError::Missing(_)), "{error:?}");
    }

    #[test]
    fn start_reports_a_process_that_exits_early() {
        let dir = tempdir().unwrap();
        let launch = launch_of(
            current_exe().unwrap(),
            vec!["--list".to_string()],
            dir.path().to_path_buf(),
        );
        let process = BackendProcess::new(launch);

        let error = process.start(&AtomicBool::new(false)).unwrap_err();

        assert!(matches!(error, BackendError::StartFailed(_)), "{error:?}");
        assert!(process.running_port().is_none());
    }

    #[test]
    fn start_honours_cancellation() {
        let dir = tempdir().unwrap();
        let launch = launch_of(
            current_exe().unwrap(),
            vec!["--list".to_string()],
            dir.path().to_path_buf(),
        );
        let process = BackendProcess::new(launch);

        let error = process.start(&AtomicBool::new(true)).unwrap_err();

        assert_eq!(error, BackendError::Cancelled);
        assert!(process.running_port().is_none());
    }

    #[test]
    fn stop_without_a_running_process_is_harmless() {
        let dir = tempdir().unwrap();
        let process = BackendProcess::new(launch_of(
            dir.path().join("absent"),
            Vec::new(),
            dir.path().to_path_buf(),
        ));

        process.stop();
        process.stop();
    }

    #[test]
    #[ignore = "needs backend/.venv; run with: cargo test -- --ignored"]
    fn real_backend_starts_reuses_and_stops() {
        let dir = tempdir().unwrap();
        let launch = BackendLaunch::resolve(dir.path().to_path_buf());
        let process = BackendProcess::new(launch);
        let cancel = AtomicBool::new(false);

        let first = process.start(&cancel).unwrap();
        let second = process.start(&cancel).unwrap();

        assert!(first.spawned);
        assert!(!second.spawned);
        assert_eq!(first.port, second.port);
        assert!(probe_health(first.port));
        let logs: Vec<String> = std::fs::read_dir(dir.path())
            .unwrap()
            .map(|entry| entry.unwrap().file_name().to_string_lossy().to_string())
            .collect();
        assert!(
            logs.iter().any(|name| name.starts_with("backend-")),
            "{logs:?}"
        );

        process.stop();

        assert!(!probe_health(first.port));
    }
}
