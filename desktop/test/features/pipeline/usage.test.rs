use super::*;
use tempfile::TempDir;

const INIT_SUBSCRIBED: &str = r#"{"type":"system","subtype":"init","apiKeySource":"none"}"#;
const INIT_API_KEY: &str =
    r#"{"type":"system","subtype":"init","apiKeySource":"ANTHROPIC_API_KEY"}"#;
const RESULT: &str = r#"{"type":"result","result":"Xin chào","session_id":"s1","usage":{"iterations":[{"input_tokens":5,"output_tokens":1},{"input_tokens":2,"cache_read_input_tokens":3474,"cache_creation_input_tokens":3510,"output_tokens":4}]},"modelUsage":{"sub":{"contextWindow":50},"main":{"contextWindow":200000}}}"#;

fn lines(items: &[&str]) -> String {
    items.join("\n")
}

#[test]
fn claude_stream_gives_the_text_the_context_and_the_unified_windows() {
    let stdout = lines(&[
        INIT_SUBSCRIBED,
        r#"{"type":"assistant","parent_tool_use_id":null,"message":{"model":"main","usage":{"input_tokens":1}}}"#,
        r#"{"type":"assistant","parent_tool_use_id":"tool-1","message":{"model":"sub","usage":{"input_tokens":999999}}}"#,
        r#"{"type":"rate_limit_event","rate_limit_info":{"unifiedWindows":{"five_hour":{"utilization":0.01,"resetsAt":1795591200,"status":"allowed"},"seven_day":{"utilization":1.2,"resetsAt":1796068800,"status":"rejected"}}}}"#,
        RESULT,
    ]);

    let reply = claude_stream(&stdout);
    let quota = reply.usage.quota.unwrap();

    assert_eq!(reply.text.as_deref(), Some("Xin chào"));
    assert_eq!(reply.session.as_deref(), Some("s1"));
    assert_eq!(
        reply.usage.context,
        Some(ContextUsage {
            used_tokens: 6990,
            max_tokens: Some(200000),
        })
    );
    assert_eq!(quota.quotas.len(), 2);
    assert_eq!(quota.quotas[0].window, QuotaWindow::Session);
    assert_eq!(quota.quotas[0].used_percent, Some(1.0));
    assert_eq!(
        quota.quotas[0].resets_at.as_deref(),
        Some("2026-11-25T07:20:00+00:00")
    );
    assert_eq!(quota.quotas[1].status, QuotaStatus::Limited);
    assert_eq!(quota.quotas[1].used_percent, Some(120.0));
}

#[test]
fn claude_stream_without_unified_windows_reports_the_status_only() {
    let stdout = lines(&[
        INIT_SUBSCRIBED,
        r#"{"type":"rate_limit_event","rate_limit_info":{"status":"allowed_warning","rateLimitType":"seven_day_opus","resetsAt":1796068800}}"#,
        RESULT,
    ]);

    let quotas = claude_stream(&stdout).usage.quota.unwrap().quotas;

    assert_eq!(quotas.len(), 1);
    assert_eq!(quotas[0].window, QuotaWindow::Weekly);
    assert_eq!(quotas[0].status, QuotaStatus::Warning);
    assert_eq!(quotas[0].used_percent, None);
}

#[test]
fn claude_stream_tells_an_api_key_from_a_missing_event() {
    let api_key = claude_stream(&lines(&[INIT_API_KEY, RESULT]));
    let subscribed = claude_stream(&lines(&[INIT_SUBSCRIBED, RESULT]));

    assert_eq!(api_key.usage.quota, Some(QuotaReading::default()));
    assert_eq!(subscribed.usage.quota, None);
    assert_eq!(claude_stream("not json").text, None);
}

#[test]
fn codex_rollout_keeps_the_last_token_count() {
    let text = lines(&[
        r#"{"type":"event_msg","payload":{"type":"token_count","info":null,"rate_limits":null}}"#,
        r#"{"type":"event_msg","payload":{"type":"agent_message","message":"hi"}}"#,
        r#"{"type":"event_msg","payload":{"type":"token_count","info":{"last_token_usage":{"total_tokens":32102},"model_context_window":258400},"rate_limits":{"primary":{"used_percent":100.0,"window_minutes":300,"resets_at":1795276220},"secondary":{"used_percent":8.0,"window_minutes":10080,"resets_at":1795762880},"plan_type":"plus"}}}"#,
    ]);

    let usage = codex_rollout(&text);
    let quota = usage.quota.unwrap();

    assert_eq!(
        usage.context,
        Some(ContextUsage {
            used_tokens: 32102,
            max_tokens: Some(258400),
        })
    );
    assert_eq!(quota.plan.as_deref(), Some("Plus"));
    assert_eq!(quota.quotas[0].window, QuotaWindow::Session);
    assert_eq!(quota.quotas[0].status, QuotaStatus::Limited);
    assert_eq!(quota.quotas[1].window, QuotaWindow::Weekly);
    assert_eq!(quota.quotas[1].status, QuotaStatus::Ok);
}

#[test]
fn codex_rollout_reads_a_relative_reset() {
    let text = r#"{"payload":{"type":"token_count","info":null,"rate_limits":{"primary":{"used_percent":5.0,"resets_in_seconds":60}}}}"#;

    let quota = codex_rollout(text).quota.unwrap();

    assert_eq!(quota.plan, None);
    assert_eq!(quota.quotas[0].window, QuotaWindow::Session);
    assert!(quota.quotas[0].resets_at.is_some());
}

#[test]
fn a_snapshot_survives_a_save_and_a_load() {
    let dir = TempDir::new().unwrap();
    let path = dir.path().join("llm").join("quota-codex.json");
    let now = DateTime::<Utc>::from_timestamp(1795276220, 0).unwrap();
    let reading = QuotaReading {
        plan: Some("Plus".to_string()),
        quotas: vec![Quota {
            window: QuotaWindow::Session,
            status: QuotaStatus::Ok,
            used_percent: Some(9.0),
            resets_at: None,
        }],
    };

    save(&path, &snapshot("Codex", reading, now));
    let loaded = load(&path).unwrap();

    assert_eq!(loaded.provider, "Codex");
    assert_eq!(loaded.updated_at, now.to_rfc3339());
    assert_eq!(loaded.quotas[0].used_percent, Some(9.0));
    assert!(load(&dir.path().join("missing.json")).is_none());
}
