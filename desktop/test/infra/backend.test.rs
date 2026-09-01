use super::*;
use std::io::Read;
use std::io::Write;
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
        data_dir: log_dir.join("data"),
        log_dir,
        ready_timeout: Duration::from_secs(5),
    }
}

const HEALTH_OK: &str = "HTTP/1.1 200 OK
Content-Type: application/json
Content-Length: 15
Connection: close

{\"status\":\"ok\"}";

#[test]
fn probe_health_rejects_a_status_other_than_ok() {
    let (port, handle) = serve_once(
        "HTTP/1.1 200 OK
Content-Length: 17
Connection: close

{\"status\":\"down\"}",
    );

    assert!(!probe_health(port));

    handle.join().unwrap();
}

#[test]
fn probe_health_rejects_a_server_error() {
    let (port, handle) = serve_once(
        "HTTP/1.1 500 Internal Server Error
Content-Length: 0
Connection: close

",
    );

    assert!(!probe_health(port));

    handle.join().unwrap();
}

#[test]
fn command_passes_the_data_dir_and_the_selected_device() {
    let dir = tempdir().unwrap();
    let launch = launch_of(
        dir.path().join("python"),
        vec!["-m".to_string(), "app".to_string()],
        dir.path().to_path_buf(),
    );
    let process = BackendProcess::new(launch);
    let default_args = arguments(&process.command(5000));
    process.set_device("cuda");
    let cuda_args = arguments(&process.command(5000));

    let data_dir = dir.path().join("data").to_string_lossy().to_string();
    assert_eq!(
        &default_args[..4],
        &["-m", "app", "--port", "5000"].map(String::from)
    );
    assert_eq!(flag(&default_args, "--data-dir"), data_dir);
    assert_eq!(flag(&default_args, "--device"), "cpu");
    assert_eq!(flag(&cuda_args, "--device"), "cuda");
    assert_eq!(flag(&cuda_args, "--run-mode"), "test");
}

fn arguments(command: &Command) -> Vec<String> {
    command
        .get_args()
        .map(|arg| arg.to_string_lossy().to_string())
        .collect()
}

fn flag(args: &[String], name: &str) -> String {
    let index = args.iter().position(|arg| arg == name).unwrap();
    args[index + 1].clone()
}

#[test]
fn probe_health_reads_the_health_endpoint() {
    let (port, handle) = serve_once(HEALTH_OK);

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
    let launch = BackendLaunch::resolve(PathBuf::from("data"), PathBuf::from("logs"));
    assert_eq!(launch.data_dir, PathBuf::from("data"));

    if cfg!(debug_assertions) {
        assert_eq!(launch.run_mode, "dev");
        assert_eq!(launch.args, vec!["-m".to_string(), "app".to_string()]);
        assert!(launch.program.ends_with(venv_python(Path::new("backend"))));
    } else {
        assert_eq!(launch.run_mode, "prod");
        assert!(launch.program.ends_with(bundled_python(Path::new(""))));
        assert_eq!(launch.args, vec!["-E", "-s", "-m", "app"]);
        assert!(launch.working_dir.unwrap().ends_with(BACKEND_DIR));
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
fn real_backend_starts_reuses_and_stops() {
    let dir = tempdir().unwrap();
    let launch = BackendLaunch::resolve(dir.path().join("data"), dir.path().to_path_buf());
    if !launch.program.is_file() {
        eprintln!("skipped: no backend interpreter at {:?}", launch.program);
        return;
    }
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
