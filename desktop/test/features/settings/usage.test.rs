use super::*;

#[test]
fn claude_usage_reads_each_window_line() {
    let reply = json!({
        "is_error": false,
        "local_command": "usage",
        "result": "You are currently using your subscription to power your Claude Code usage\n\nCurrent session: 5% used · resets Nov 26, 2am (Asia/Ho_Chi_Minh)\nCurrent week (all models): 30% used · resets Nov 28, 12pm (Asia/Ho_Chi_Minh)"
    });

    let usage = claude_usage(&reply).unwrap();

    assert_eq!(usage.windows.len(), 2);
    assert_eq!(usage.windows[0].window, UsageWindowKind::Session);
    assert_eq!(usage.windows[0].used_percent, Some(5.0));
    assert_eq!(
        usage.windows[0].resets_note.as_deref(),
        Some("Nov 26, 2am (Asia/Ho_Chi_Minh)")
    );
    assert_eq!(usage.windows[1].window, UsageWindowKind::Weekly);
    assert_eq!(usage.windows[1].group.as_deref(), Some("all models"));
}

#[test]
fn claude_usage_with_an_api_key_has_no_windows() {
    let reply = json!({ "is_error": false, "result": "You are currently using your API key." });

    assert!(claude_usage(&reply).unwrap().windows.is_empty());
}

#[test]
fn claude_usage_reports_a_failed_command() {
    let reply = json!({ "is_error": true, "result": "Not logged in" });

    assert_eq!(claude_usage(&reply), Err("Not logged in".to_string()));
}

#[test]
fn agy_usage_turns_remaining_fractions_into_used_percent() {
    let reply = json!({
        "status": "SUCCESS",
        "command": { "name": "usage", "data": { "groups": [
            { "name": "Gemini Models", "buckets": [
                { "window": "weekly", "remaining_fraction": 0.75, "reset_time": "2026-12-02T14:20:49Z" }
            ]},
            { "name": "Claude and GPT models", "buckets": [
                { "window": "5h", "remaining_fraction": 1, "reset_time": "1970-01-01T00:00:00Z" }
            ]}
        ]}}
    });

    let usage = agy_usage(&reply).unwrap();

    assert_eq!(usage.windows.len(), 2);
    assert_eq!(usage.windows[0].group.as_deref(), Some("Gemini Models"));
    assert_eq!(usage.windows[0].used_percent, Some(25.0));
    assert_eq!(
        usage.windows[0].resets_at.as_deref(),
        Some("2026-12-02T14:20:49Z")
    );
    assert_eq!(usage.windows[1].window, UsageWindowKind::Session);
    assert_eq!(usage.windows[1].used_percent, Some(0.0));
    assert_eq!(usage.windows[1].resets_at, None);
}

#[test]
fn agy_usage_without_groups_reports_the_response() {
    let reply = json!({ "status": "ERROR", "response": "Please sign in." });

    assert_eq!(agy_usage(&reply), Err("Please sign in.".to_string()));
}

#[test]
fn codex_usage_reads_the_plan_and_both_windows() {
    let result = json!({ "rateLimits": {
        "planType": "plus",
        "primary": { "usedPercent": 0, "windowDurationMins": 300, "resetsAt": 1795638705 },
        "secondary": { "usedPercent": 62, "windowDurationMins": 10080, "resetsAt": 1795797055 }
    }});

    let usage = codex_usage(&result);

    assert_eq!(usage.plan.as_deref(), Some("Plus"));
    assert_eq!(usage.windows[0].window, UsageWindowKind::Session);
    assert_eq!(usage.windows[1].window, UsageWindowKind::Weekly);
    assert_eq!(usage.windows[1].used_percent, Some(62.0));
    assert!(usage.windows[1].resets_at.is_some());
}
