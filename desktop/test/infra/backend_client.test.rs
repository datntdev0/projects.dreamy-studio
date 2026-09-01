use super::*;
use crate::testing::http::FakeHttp;
use crate::testing::http::api_error;
use serde_json::Value;
use serde_json::json;
use std::net::Ipv4Addr;
use std::net::TcpListener;

const TIMEOUT: Duration = Duration::from_secs(2);

fn client(fake: &FakeHttp) -> BackendClient {
    BackendClient::new(fake.port, TIMEOUT)
}

fn unused_port() -> u16 {
    let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).unwrap();
    listener.local_addr().unwrap().port()
}

#[test]
fn health_reads_the_version_details() {
    let fake = FakeHttp::healthy();

    let health = client(&fake).health().unwrap();

    assert_eq!(health.version, "0.3.0");
    assert_eq!(health.python_version, "3.12.4");
    assert_eq!(health.started_at.as_deref(), Some("2026-11-22T08:00:00Z"));
    assert_eq!(health.device, "cpu");
    assert_eq!(fake.requests(), vec!["GET /health"]);
}

#[test]
fn health_accepts_a_minimal_body() {
    let fake = FakeHttp::start();
    fake.route("GET", "/health", 200, json!({ "status": "ok" }));

    let health = client(&fake).health().unwrap();

    assert_eq!(health.version, "");
    assert_eq!(health.started_at, None);
}

#[test]
fn health_rejects_a_status_other_than_ok() {
    let fake = FakeHttp::start();
    fake.route("GET", "/health", 200, json!({ "status": "down" }));

    let error = client(&fake).health().unwrap_err();

    assert!(matches!(error, ClientError::Invalid(_)), "{error:?}");
}

#[test]
fn send_uses_the_requested_method() {
    let fake = FakeHttp::start();
    fake.route("POST", "/cuda/cancel", 200, json!({ "state": "none" }))
        .route("DELETE", "/cuda", 200, json!({ "state": "none" }));
    let client = client(&fake);

    let cancelled: Value = client.send(Method::Post, "/cuda/cancel").unwrap();
    let removed: Value = client.send(Method::Delete, "/cuda").unwrap();

    assert_eq!(cancelled["state"], "none");
    assert_eq!(removed["state"], "none");
    assert_eq!(fake.requests(), vec!["POST /cuda/cancel", "DELETE /cuda"]);
}

#[test]
fn api_errors_carry_the_python_code_and_message() {
    let fake = FakeHttp::start();
    fake.route(
        "POST",
        "/cuda/download",
        409,
        api_error("CUDA_NO_GPU", "No NVIDIA GPU was found."),
    );

    let error = client(&fake)
        .send::<Value>(Method::Post, "/cuda/download")
        .unwrap_err();

    assert_eq!(
        error,
        ClientError::Api {
            status: 409,
            code: "CUDA_NO_GPU".to_string(),
            message: "No NVIDIA GPU was found.".to_string(),
        }
    );
    assert_eq!(error.to_string(), "No NVIDIA GPU was found.");
}

#[test]
fn api_errors_without_a_message_describe_the_status() {
    let fake = FakeHttp::start();
    fake.route("GET", "/system", 500, json!("boom"));

    let error = client(&fake)
        .send::<Value>(Method::Get, "/system")
        .unwrap_err();

    assert_eq!(
        error.to_string(),
        "The local backend answered with status 500."
    );
}

#[test]
fn malformed_bodies_are_invalid_responses() {
    let fake = FakeHttp::start();
    fake.route("GET", "/models", 200, json!({ "not": "a list" }));

    let error = client(&fake)
        .send::<Vec<Value>>(Method::Get, "/models")
        .unwrap_err();

    assert!(matches!(error, ClientError::Invalid(_)), "{error:?}");
}

#[test]
fn a_closed_port_is_unreachable() {
    let error = BackendClient::new(unused_port(), TIMEOUT)
        .send::<Value>(Method::Get, "/health")
        .unwrap_err();

    assert!(matches!(error, ClientError::Unreachable(_)), "{error:?}");
    assert!(
        error
            .to_string()
            .starts_with("The local backend is not reachable")
    );
}
