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
    let launch = BackendLaunch::resolve(dir.path().to_path_buf());
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
