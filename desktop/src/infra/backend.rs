#[cfg(windows)]
use crate::shared::process::CREATE_NO_WINDOW;
use crate::shared::process::hide_window;
use std::fmt;
use std::fs::File;
use std::io::ErrorKind;
use std::net::Ipv4Addr;
use std::net::TcpListener;
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

use crate::infra::backend_client::BackendClient;
use crate::shared::config::install_dir;

const READY_TIMEOUT: Duration = Duration::from_secs(30);
const POLL_INTERVAL: Duration = Duration::from_millis(100);
const PROBE_TIMEOUT: Duration = Duration::from_millis(300);
const STDERR_FILE: &str = "backend-stderr.log";

const PORT_VAR: &str = "DREAMY_BACKEND_PORT";
const RUN_MODE_VAR: &str = "DREAMY_BACKEND_RUN_MODE";
const LOG_DIR_VAR: &str = "DREAMY_BACKEND_LOG_DIR";
const DATA_DIR_VAR: &str = "DREAMY_BACKEND_DATA_DIR";
const API_KEY_VAR: &str = "DREAMY_BACKEND_API_KEY";

const BACKEND_DIR: &str = "backend";
pub const DEFAULT_DEVICE: &str = "cpu";

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
    fn set_device(&self, device: &str);
}

#[derive(Debug, Clone)]
pub struct BackendLaunch {
    pub program: PathBuf,
    pub args: Vec<String>,
    pub working_dir: Option<PathBuf>,
    pub run_mode: &'static str,
    pub log_dir: PathBuf,
    pub data_dir: PathBuf,
    pub ready_timeout: Duration,
}

impl BackendLaunch {
    pub fn resolve(data_dir: PathBuf, log_dir: PathBuf, runtime_python: PathBuf) -> Self {
        let launch = if cfg!(debug_assertions) {
            Self::development(log_dir, &runtime_python)
        } else {
            Self::packaged(log_dir, runtime_python)
        };
        Self { data_dir, ..launch }
    }

    fn development(log_dir: PathBuf, runtime_python: &Path) -> Self {
        let manifest = Path::new(env!("CARGO_MANIFEST_DIR"));
        let root = match manifest.parent() {
            Some(parent) => parent,
            None => manifest,
        };
        let backend = root.join("backend");
        Self {
            program: venv_python(&backend),
            args: development_args(runtime_python),
            working_dir: Some(backend),
            run_mode: "dev",
            log_dir,
            data_dir: PathBuf::new(),
            ready_timeout: READY_TIMEOUT,
        }
    }

    fn packaged(log_dir: PathBuf, runtime_python: PathBuf) -> Self {
        Self {
            program: runtime_python,
            args: ["-E", "-s", "-m", "app"].map(String::from).to_vec(),
            working_dir: Some(install_dir().join(BACKEND_DIR)),
            run_mode: "prod",
            log_dir,
            data_dir: PathBuf::new(),
            ready_timeout: READY_TIMEOUT,
        }
    }

    fn stderr_path(&self) -> PathBuf {
        self.log_dir.join(STDERR_FILE)
    }
}

fn development_args(worker_python: &Path) -> Vec<String> {
    let mut args = vec!["-m".to_string(), "app".to_string()];
    if worker_python.is_file() {
        args.push("--worker-python".to_string());
        args.push(worker_python.to_string_lossy().into_owned());
    }
    args
}

#[cfg(windows)]
fn venv_python(backend: &Path) -> PathBuf {
    backend.join(".venv").join("Scripts").join("python.exe")
}

#[cfg(not(windows))]
fn venv_python(backend: &Path) -> PathBuf {
    backend.join(".venv").join("bin").join("python")
}

struct Running {
    child: Child,
    port: u16,
}

pub struct BackendProcess {
    launch: BackendLaunch,
    state: Mutex<Option<Running>>,
    device: Mutex<String>,
}

impl BackendProcess {
    pub fn new(launch: BackendLaunch) -> Self {
        Self {
            launch,
            state: Mutex::new(None),
            device: Mutex::new(DEFAULT_DEVICE.to_string()),
        }
    }

    fn device(&self) -> String {
        lock(&self.device).clone()
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

    fn command(&self, port: u16) -> Command {
        let launch = &self.launch;
        let mut command = Command::new(&launch.program);
        command
            .args(&launch.args)
            .arg("--device")
            .arg(self.device())
            .env(PORT_VAR, port.to_string())
            .env(RUN_MODE_VAR, launch.run_mode)
            .env(LOG_DIR_VAR, &launch.log_dir)
            .env(DATA_DIR_VAR, &launch.data_dir)
            .env(API_KEY_VAR, "")
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(stderr_target(&launch.stderr_path()));
        if let Some(directory) = &launch.working_dir {
            command.current_dir(directory);
        }
        hide_window(&mut command);
        command
    }

    fn spawn(&self, port: u16) -> Result<Child, BackendError> {
        let launch = &self.launch;
        let mut command = self.command(port);
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

    fn set_device(&self, device: &str) {
        *lock(&self.device) = device.to_string();
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
    BackendClient::new(port, PROBE_TIMEOUT).health().is_ok()
}

fn terminate(child: &mut Child) {
    kill_tree(child.id());
    let _ = child.kill();
    let _ = child.wait();
}

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
