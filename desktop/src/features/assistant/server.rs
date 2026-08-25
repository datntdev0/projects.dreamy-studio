use crate::features::assistant::grants::Grant;
use crate::features::assistant::grants::McpGrants;
use crate::features::assistant::protocol;
use crate::features::assistant::protocol::ToolCaller;
use crate::features::assistant::sources::Sources;
use crate::features::assistant::tools;
use crate::features::assistant::tools::ToolContext;
use serde_json::Value;
use serde_json::json;
use std::io::Read;
use std::sync::Arc;
use std::sync::Mutex;
use std::thread::JoinHandle;
use tiny_http::Header;
use tiny_http::Method;
use tiny_http::Request;
use tiny_http::Response;
use tiny_http::Server;

const MCP_PATH: &str = "/mcp";
const MAX_BODY_BYTES: usize = 1024 * 1024;
const PARSE_ERROR: i64 = -32700;

pub trait McpHost: Send + Sync {
    fn open(&self, grant: &Grant) -> Result<Sources, String>;
}

struct Running {
    server: Arc<Server>,
    thread: JoinHandle<()>,
}

pub struct McpServer {
    port: u16,
    running: Mutex<Option<Running>>,
}

impl McpServer {
    pub fn start(grants: McpGrants, host: Arc<dyn McpHost>) -> std::io::Result<McpServer> {
        let server = Server::http("127.0.0.1:0").map_err(std::io::Error::other)?;
        let port = server
            .server_addr()
            .to_ip()
            .map(|address| address.port())
            .ok_or_else(|| std::io::Error::other("server is not bound to an ip address"))?;
        let server = Arc::new(server);
        let accepting = server.clone();
        let thread = std::thread::Builder::new()
            .name("mcp-server".to_string())
            .spawn(move || serve(&accepting, &grants, host.as_ref()))?;
        Ok(McpServer {
            port,
            running: Mutex::new(Some(Running { server, thread })),
        })
    }

    pub fn endpoint(&self) -> String {
        format!("http://127.0.0.1:{}{MCP_PATH}", self.port)
    }

    pub fn stop(&self) {
        let running = self
            .running
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .take();
        if let Some(Running { server, thread }) = running {
            server.unblock();
            let _ = thread.join();
        }
    }
}

impl Drop for McpServer {
    fn drop(&mut self) {
        self.stop();
    }
}

struct GrantCaller<'a> {
    grant: &'a Grant,
    host: &'a dyn McpHost,
}

impl ToolCaller for GrantCaller<'_> {
    fn tools(&self) -> Value {
        tools::definitions()
    }

    fn call(&self, name: &str, args: &Value) -> Result<String, String> {
        let sources = self.host.open(self.grant)?;
        let ctx = ToolContext {
            scope: &self.grant.scope,
            can_edit: self.grant.can_edit,
            sink: self.grant.sink.as_ref(),
        };
        let output = tools::call(name, args, &ctx, &sources)?;
        ctx.sink.record(output.label);
        Ok(output.text)
    }
}

fn serve(server: &Server, grants: &McpGrants, host: &dyn McpHost) {
    for request in server.incoming_requests() {
        handle_request(request, grants, host);
    }
}

fn handle_request(mut request: Request, grants: &McpGrants, host: &dyn McpHost) {
    let path = request.url().split('?').next().unwrap_or("").to_string();
    if path != MCP_PATH {
        let _ = request.respond(plain(404));
        return;
    }
    if request.method() != &Method::Post {
        let _ = request.respond(plain(405).with_header(header("Allow", "POST")));
        return;
    }
    let Some(grant) = bearer_token(&request).and_then(|token| grants.get(&token)) else {
        let _ = request.respond(plain(401).with_header(header("WWW-Authenticate", "Bearer")));
        return;
    };
    if request
        .body_length()
        .is_some_and(|length| length > MAX_BODY_BYTES)
    {
        let _ = request.respond(plain(413));
        return;
    }
    let mut bytes = Vec::new();
    let read = request
        .as_reader()
        .take(MAX_BODY_BYTES as u64 + 1)
        .read_to_end(&mut bytes);
    if read.is_err() {
        let _ = request.respond(plain(400));
        return;
    }
    if bytes.len() > MAX_BODY_BYTES {
        let _ = request.respond(plain(413));
        return;
    }
    let Ok(body) = serde_json::from_slice::<Value>(&bytes) else {
        let failure = json!({
            "jsonrpc": "2.0",
            "id": Value::Null,
            "error": { "code": PARSE_ERROR, "message": "parse error" },
        });
        let _ = request.respond(json_response(400, &failure));
        return;
    };
    let caller = GrantCaller {
        grant: &grant,
        host,
    };
    let response = match protocol::handle(&body, &caller) {
        Some(value) => json_response(200, &value),
        None => plain(202),
    };
    let _ = request.respond(response);
}

fn bearer_token(request: &Request) -> Option<String> {
    let value = request
        .headers()
        .iter()
        .find(|header| header.field.equiv("Authorization"))?
        .value
        .as_str();
    let (scheme, token) = value.split_once(' ')?;
    if scheme.eq_ignore_ascii_case("bearer") && !token.trim().is_empty() {
        Some(token.trim().to_string())
    } else {
        None
    }
}

fn plain(status: u16) -> Response<std::io::Cursor<Vec<u8>>> {
    Response::from_data(Vec::new()).with_status_code(status)
}

fn json_response(status: u16, value: &Value) -> Response<std::io::Cursor<Vec<u8>>> {
    Response::from_string(value.to_string())
        .with_status_code(status)
        .with_header(header("Content-Type", "application/json"))
}

fn header(name: &str, value: &str) -> Header {
    Header::from_bytes(name.as_bytes(), value.as_bytes()).expect("static header is valid")
}

#[cfg(test)]
#[path = "../../../test/features/assistant/server.test.rs"]
mod tests;
