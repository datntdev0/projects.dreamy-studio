use super::*;

#[test]
fn a_claude_stream_reads_the_reply_and_its_unified_windows() {
    let stdout = [
        r#"{"type":"system","subtype":"init","apiKeySource":"none"}"#,
        r#"{"type":"rate_limit_event","rate_limit_info":{"unifiedWindows":{"five_hour":{"utilization":0.25,"resetsAt":1795591200,"status":"allowed"},"seven_day":{"utilization":0.5,"status":"rejected"}}}}"#,
        r#"{"type":"result","result":"hello","session_id":"s1"}"#,
    ]
    .join("\n");

    let reply = claude_stream(&stdout);
    let quotas = reply.usage.quota.unwrap().quotas;

    assert_eq!(reply.text.as_deref(), Some("hello"));
    assert_eq!(reply.session.as_deref(), Some("s1"));
    assert_eq!(quotas.len(), 2);
    assert_eq!(quotas[0].window, QuotaWindow::Session);
    assert_eq!(quotas[0].used_percent, Some(25.0));
    assert!(quotas[0].resets_at.is_some());
    assert_eq!(quotas[1].status, QuotaStatus::Limited);
}

#[test]
fn a_claude_stream_with_an_api_key_reports_no_windows() {
    let stdout = [
        r#"{"type":"system","subtype":"init","apiKeySource":"ANTHROPIC_API_KEY"}"#,
        r#"{"type":"result","result":"hi"}"#,
    ]
    .join("\n");

    assert_eq!(
        claude_stream(&stdout).usage.quota,
        Some(QuotaReading::default())
    );
}

#[test]
fn an_agy_stream_keeps_the_successful_response_and_conversation() {
    let stdout = [
        r#"{"event":"init","conversation_id":"c1"}"#,
        r#"{"event":"result","result":{"conversation_id":"c1","status":"SUCCESS","response":"done"}}"#,
    ]
    .join("\n");

    let reply = agy_stream(&stdout);

    assert_eq!(reply.text.as_deref(), Some("done"));
    assert_eq!(reply.session.as_deref(), Some("c1"));
}

#[test]
fn a_codex_rollout_reads_the_plan_and_rate_limits() {
    let text = r#"{"type":"event_msg","payload":{"type":"token_count","rate_limits":{"primary":{"used_percent":100.0,"window_minutes":300},"secondary":{"used_percent":40.0,"window_minutes":10080},"plan_type":"plus"}}}"#;

    let reading = codex_rollout(text).quota.unwrap();

    assert_eq!(reading.plan.as_deref(), Some("Plus"));
    assert_eq!(reading.quotas[0].status, QuotaStatus::Limited);
    assert_eq!(reading.quotas[1].window, QuotaWindow::Weekly);
}

#[test]
fn a_saved_snapshot_loads_back() {
    let dir = tempfile::TempDir::new().unwrap();
    let path = dir.path().join("llm/quota-codex.json");
    let now = DateTime::<Utc>::from_timestamp(1_795_000_000, 0).unwrap();
    let snapshot = snapshot("Codex", QuotaReading::default(), now);

    save(&path, &snapshot);

    assert_eq!(load::<QuotaSnapshot>(&path), Some(snapshot));
}
