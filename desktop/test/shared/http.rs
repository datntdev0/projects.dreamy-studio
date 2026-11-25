use serde_json::Value;
use serde_json::json;
use std::collections::HashMap;
use std::collections::VecDeque;
use std::sync::Arc;
use std::sync::Mutex;
use std::thread::JoinHandle;
use std::thread::spawn;
use tiny_http::Header;
use tiny_http::Request;
use tiny_http::Response;
use tiny_http::Server;

type Routes = Arc<Mutex<HashMap<String, (u16, String)>>>;
type Queues = Arc<Mutex<HashMap<String, VecDeque<(u16, String)>>>>;
type Requests = Arc<Mutex<Vec<Recorded>>>;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Recorded {
    pub name: String,
    pub api_key: Option<String>,
    pub body: String,
}

#[derive(Clone, Default)]
struct Answers {
    routes: Routes,
    queues: Queues,
}

pub struct FakeHttp {
    pub port: u16,
    server: Arc<Server>,
    answers: Answers,
    requests: Requests,
    thread: Option<JoinHandle<()>>,
}

impl FakeHttp {
    pub fn start() -> Self {
        let server = Arc::new(Server::http("127.0.0.1:0").unwrap());
        let port = server.server_addr().to_ip().unwrap().port();
        let answers = Answers::default();
        let requests: Requests = Arc::default();
        let thread = spawn({
            let server = server.clone();
            let answers = answers.clone();
            let requests = requests.clone();
            move || serve(&server, &answers, &requests)
        });
        Self {
            port,
            server,
            answers,
            requests,
            thread: Some(thread),
        }
    }

    pub fn healthy() -> Self {
        let fake = Self::start();
        fake.route("GET", "/health", 200, health_body());
        fake
    }

    pub fn route(&self, method: &str, path: &str, status: u16, body: Value) -> &Self {
        lock(&self.answers.routes).insert(key(method, path), (status, body.to_string()));
        self
    }

    pub fn queue(&self, method: &str, path: &str, status: u16, body: Value) -> &Self {
        lock(&self.answers.queues)
            .entry(key(method, path))
            .or_default()
            .push_back((status, body.to_string()));
        self
    }

    pub fn requests(&self) -> Vec<String> {
        self.recorded()
            .into_iter()
            .map(|request| request.name)
            .collect()
    }

    pub fn recorded(&self) -> Vec<Recorded> {
        lock(&self.requests).clone()
    }
}

impl Drop for FakeHttp {
    fn drop(&mut self) {
        self.server.unblock();
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
    }
}

pub fn health_body() -> Value {
    json!({
        "status": "ok",
        "version": "0.3.0",
        "pythonVersion": "3.12.4",
        "startedAt": "2026-11-22T08:00:00Z",
        "device": "cpu"
    })
}

pub fn api_error(code: &str, message: &str) -> Value {
    json!({ "code": code, "message": message, "details": null })
}

fn serve(server: &Server, answers: &Answers, requests: &Requests) {
    for request in server.incoming_requests() {
        respond(request, answers, requests);
    }
}

fn record(request: &mut Request) -> Recorded {
    let mut body = String::new();
    let _ = request.as_reader().read_to_string(&mut body);
    let api_key = request
        .headers()
        .iter()
        .find(|header| header.field.equiv("X-API-Key"))
        .map(|header| header.value.to_string());
    Recorded {
        name: key(request.method().as_str(), request.url()),
        api_key,
        body,
    }
}

fn answer(answers: &Answers, name: &str) -> (u16, String) {
    if let Some(queued) = lock(&answers.queues)
        .get_mut(name)
        .and_then(VecDeque::pop_front)
    {
        return queued;
    }
    lock(&answers.routes)
        .get(name)
        .cloned()
        .unwrap_or_else(|| (404, api_error("NOT_FOUND", "Not Found").to_string()))
}

fn respond(mut request: Request, answers: &Answers, requests: &Requests) {
    let recorded = record(&mut request);
    let (status, body) = answer(answers, &recorded.name);
    lock(requests).push(recorded);
    let header = Header::from_bytes("Content-Type", "application/json").unwrap();
    let response = Response::from_string(body)
        .with_status_code(status)
        .with_header(header);
    let _ = request.respond(response);
}

fn key(method: &str, path: &str) -> String {
    format!("{method} {path}")
}

fn lock<T>(mutex: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(|error| error.into_inner())
}
