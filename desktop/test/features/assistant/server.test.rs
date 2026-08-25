use super::*;
use crate::features::assistant::models::AssistantScope;
use crate::features::assistant::models::ScopeKind;
use crate::testing::assistant::FakeKnowledge;
use crate::testing::assistant::FakeNovels;
use crate::testing::assistant::RecordingSink;
use crate::testing::assistant::sources_of;
use std::io::Read;
use std::io::Write;
use std::net::TcpStream;

struct FakeHost;

impl McpHost for FakeHost {
    fn open(&self, grant: &Grant) -> Result<Sources, String> {
        if grant.workspace == "broken" {
            return Err("workspace is not available".to_string());
        }
        let novels = FakeNovels::new().with_novel(1, "Alpha").with_chapter(
            1,
            1,
            "One",
            &["first", "second"],
        );
        let knowledge = FakeKnowledge::new().with_entity("e1", "persona", "Lan", &[], &[], &[1]);
        Ok(sources_of(&novels, &knowledge))
    }
}

struct Fixture {
    server: McpServer,
    grants: McpGrants,
    sink: Arc<RecordingSink>,
}

impl Fixture {
    fn new() -> Self {
        let grants = McpGrants::new();
        let server = McpServer::start(grants.clone(), Arc::new(FakeHost)).unwrap();
        Fixture {
            server,
            grants,
            sink: Arc::new(RecordingSink::new()),
        }
    }

    fn issue(&self, workspace: &str) -> String {
        self.grants.issue(Grant {
            workspace: workspace.to_string(),
            scope: AssistantScope {
                kind: ScopeKind::Workspace,
                novel_id: None,
            },
            can_edit: false,
            sink: self.sink.clone(),
        })
    }

    fn request(&self, method: &str, path: &str, token: Option<&str>, body: &str) -> (u16, String) {
        let address = self.server.endpoint().replace("http://", "");
        let address = address.trim_end_matches(MCP_PATH).to_string();
        let mut stream = TcpStream::connect(&address).unwrap();
        let mut head = format!(
            "{method} {path} HTTP/1.1\r\nHost: {address}\r\nConnection: close\r\nContent-Type: application/json\r\nContent-Length: {}\r\n",
            body.len()
        );
        if let Some(token) = token {
            head.push_str(&format!("Authorization: Bearer {token}\r\n"));
        }
        head.push_str("\r\n");
        stream.write_all(head.as_bytes()).unwrap();
        stream.write_all(body.as_bytes()).unwrap();
        let mut raw = String::new();
        stream.read_to_string(&mut raw).unwrap();
        let status = raw
            .split_whitespace()
            .nth(1)
            .and_then(|value| value.parse().ok())
            .unwrap();
        let body = raw
            .split_once("\r\n\r\n")
            .map(|parts| parts.1)
            .unwrap_or("");
        (status, body.to_string())
    }

    fn post(&self, token: Option<&str>, body: &Value) -> (u16, String) {
        self.request("POST", MCP_PATH, token, &body.to_string())
    }
}

fn parsed(body: &str) -> Value {
    serde_json::from_str(body).unwrap()
}

#[test]
fn endpoint_points_at_the_loopback_mcp_path() {
    let fixture = Fixture::new();
    let endpoint = fixture.server.endpoint();
    assert!(endpoint.starts_with("http://127.0.0.1:"));
    assert!(endpoint.ends_with("/mcp"));
}

#[test]
fn a_request_without_a_token_is_unauthorized() {
    let fixture = Fixture::new();
    let (status, _) = fixture.post(None, &json!({"jsonrpc":"2.0","id":1,"method":"ping"}));
    assert_eq!(status, 401);
}

#[test]
fn an_unknown_token_is_unauthorized() {
    let fixture = Fixture::new();
    let (status, _) = fixture.post(
        Some("nope"),
        &json!({"jsonrpc":"2.0","id":1,"method":"ping"}),
    );
    assert_eq!(status, 401);
}

#[test]
fn get_is_not_allowed() {
    let fixture = Fixture::new();
    let token = fixture.issue("ws");
    let (status, _) = fixture.request("GET", MCP_PATH, Some(&token), "");
    assert_eq!(status, 405);
}

#[test]
fn other_methods_are_not_allowed() {
    let fixture = Fixture::new();
    let token = fixture.issue("ws");
    let (status, _) = fixture.request("DELETE", MCP_PATH, Some(&token), "");
    assert_eq!(status, 405);
}

#[test]
fn another_path_is_not_found() {
    let fixture = Fixture::new();
    let token = fixture.issue("ws");
    let (status, _) = fixture.request("POST", "/other", Some(&token), "{}");
    assert_eq!(status, 404);
}

#[test]
fn the_query_string_is_ignored() {
    let fixture = Fixture::new();
    let token = fixture.issue("ws");
    let body = json!({"jsonrpc":"2.0","id":1,"method":"ping"}).to_string();
    let (status, _) = fixture.request("POST", "/mcp?a=1", Some(&token), &body);
    assert_eq!(status, 200);
}

#[test]
fn a_notification_is_accepted_without_a_body() {
    let fixture = Fixture::new();
    let token = fixture.issue("ws");
    let (status, body) = fixture.post(
        Some(&token),
        &json!({"jsonrpc":"2.0","method":"notifications/initialized"}),
    );
    assert_eq!(status, 202);
    assert!(body.is_empty());
}

#[test]
fn initialize_returns_json() {
    let fixture = Fixture::new();
    let token = fixture.issue("ws");
    let (status, body) = fixture.post(
        Some(&token),
        &json!({"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26"}}),
    );
    assert_eq!(status, 200);
    let value = parsed(&body);
    assert_eq!(value["id"], 1);
    assert_eq!(value["result"]["protocolVersion"], "2025-03-26");
    assert_eq!(value["result"]["serverInfo"]["name"], "dreamy-studio");
}

#[test]
fn tools_list_returns_the_read_and_edit_tools() {
    let fixture = Fixture::new();
    let token = fixture.issue("ws");
    let (status, body) = fixture.post(
        Some(&token),
        &json!({"jsonrpc":"2.0","id":2,"method":"tools/list"}),
    );
    assert_eq!(status, 200);
    assert_eq!(
        parsed(&body)["result"]["tools"].as_array().unwrap().len(),
        7
    );
}

#[test]
fn a_tool_call_returns_json_and_records_the_activity() {
    let fixture = Fixture::new();
    let token = fixture.issue("ws");
    let (status, body) = fixture.post(
        Some(&token),
        &json!({"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"list_novel","arguments":{}}}),
    );
    assert_eq!(status, 200);
    let value = parsed(&body);
    assert_eq!(value["result"]["isError"], false);
    let text = value["result"]["content"][0]["text"].as_str().unwrap();
    assert!(text.contains("Alpha"));
    let labels = fixture.sink.labels();
    assert_eq!(labels.len(), 1);
    assert!(labels[0].starts_with("list_novel"));
}

#[test]
fn read_novel_knowledge_is_served_through_the_host_sources() {
    let fixture = Fixture::new();
    let token = fixture.issue("ws");
    let (status, body) = fixture.post(
        Some(&token),
        &json!({"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"read_novel_knowledge","arguments":{"novelId":1,"lang":"src"}}}),
    );
    assert_eq!(status, 200);
    let value = parsed(&body);
    assert_eq!(value["result"]["isError"], false);
    let text = value["result"]["content"][0]["text"].as_str().unwrap();
    assert!(text.contains("Lan"));
    assert!(fixture.sink.labels()[0].starts_with("read_novel_knowledge"));
}

#[test]
fn a_host_error_becomes_a_tool_error_without_an_activity() {
    let fixture = Fixture::new();
    let token = fixture.issue("broken");
    let (status, body) = fixture.post(
        Some(&token),
        &json!({"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"list_novel","arguments":{}}}),
    );
    assert_eq!(status, 200);
    let value = parsed(&body);
    assert_eq!(value["result"]["isError"], true);
    assert_eq!(
        value["result"]["content"][0]["text"],
        "workspace is not available"
    );
    assert!(fixture.sink.labels().is_empty());
}

#[test]
fn invalid_json_is_a_parse_error() {
    let fixture = Fixture::new();
    let token = fixture.issue("ws");
    let (status, body) = fixture.request("POST", MCP_PATH, Some(&token), "{not json");
    assert_eq!(status, 400);
    assert_eq!(parsed(&body)["error"]["code"], PARSE_ERROR);
}

#[test]
fn a_body_over_the_cap_is_too_large() {
    let fixture = Fixture::new();
    let token = fixture.issue("ws");
    let body = " ".repeat(MAX_BODY_BYTES + 1);
    let (status, _) = fixture.request("POST", MCP_PATH, Some(&token), &body);
    assert_eq!(status, 413);
}

#[test]
fn a_revoked_token_is_unauthorized() {
    let fixture = Fixture::new();
    let token = fixture.issue("ws");
    let body = json!({"jsonrpc":"2.0","id":1,"method":"ping"});
    assert_eq!(fixture.post(Some(&token), &body).0, 200);
    fixture.grants.revoke(&token);
    assert_eq!(fixture.post(Some(&token), &body).0, 401);
}

#[test]
fn stop_is_idempotent_and_keeps_the_endpoint() {
    let fixture = Fixture::new();
    let endpoint = fixture.server.endpoint();
    fixture.server.stop();
    fixture.server.stop();
    assert_eq!(fixture.server.endpoint(), endpoint);
}
