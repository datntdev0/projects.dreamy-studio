use super::*;
use crate::features::settings::llm::spec;
use serde_json::Value;
use serde_json::json;
use tempfile::TempDir;

const ENDPOINT: &str = "http://127.0.0.1:4000/mcp";

fn parsed(text: &str) -> Value {
    serde_json::from_str(text).unwrap()
}

fn count(list: &Value, item: &str) -> usize {
    list.as_array()
        .unwrap()
        .iter()
        .filter(|entry| entry.as_str() == Some(item))
        .count()
}

#[test]
fn claude_settings_starts_from_empty_text() {
    let result = parsed(&claude_settings("  \n").unwrap());

    assert_eq!(result["permissions"]["allow"], json!(["mcp__dreamy"]));
    assert_eq!(result["permissions"]["deny"].as_array().unwrap().len(), 10);
    assert_eq!(count(&result["permissions"]["deny"], "Bash"), 1);
    assert_eq!(count(&result["permissions"]["deny"], "Task"), 1);
}

#[test]
fn claude_settings_keeps_unknown_keys_and_existing_entries() {
    let existing =
        r#"{"theme":"dark","permissions":{"allow":["Foo"],"deny":["Bar","Bash"],"ask":["Baz"]}}"#;

    let result = parsed(&claude_settings(existing).unwrap());

    assert_eq!(result["theme"], "dark");
    assert_eq!(result["permissions"]["ask"], json!(["Baz"]));
    assert_eq!(
        result["permissions"]["allow"],
        json!(["Foo", "mcp__dreamy"])
    );
    assert_eq!(result["permissions"]["deny"][0], "Bar");
    assert_eq!(count(&result["permissions"]["deny"], "Bar"), 1);
    assert_eq!(count(&result["permissions"]["deny"], "Bash"), 1);
    assert_eq!(count(&result["permissions"]["deny"], "Grep"), 1);
}

#[test]
fn claude_settings_does_not_duplicate_on_repeat() {
    let once = claude_settings("{}").unwrap();
    let twice = claude_settings(&once).unwrap();

    assert_eq!(once, twice);
}

#[test]
fn claude_settings_rejects_invalid_input() {
    assert!(claude_settings("[1]").is_err());
    assert!(claude_settings("{nope").is_err());
    assert!(claude_settings(r#"{"permissions":[]}"#).is_err());
    assert!(claude_settings(r#"{"permissions":{"allow":"x"}}"#).is_err());
}

#[test]
fn claude_mcp_has_the_http_server_shape() {
    let result = parsed(&claude_mcp(ENDPOINT));

    assert_eq!(
        result,
        json!({
            "mcpServers": {
                "dreamy": {
                    "type": "http",
                    "url": ENDPOINT,
                    "headers": { "Authorization": "Bearer ${DREAMY_MCP_TOKEN}" }
                }
            }
        })
    );
}

#[test]
fn codex_config_adds_a_disabled_server_to_empty_text() {
    let result = codex_config("", ENDPOINT).unwrap();
    let document = result.parse::<DocumentMut>().unwrap();
    let server = &document["mcp_servers"]["dreamy"];

    assert_eq!(server["url"].as_str(), Some(ENDPOINT));
    assert_eq!(
        server["bearer_token_env_var"].as_str(),
        Some("DREAMY_MCP_TOKEN")
    );
    assert_eq!(
        server["default_tools_approval_mode"].as_str(),
        Some("approve")
    );
    assert_eq!(server["enabled"].as_bool(), Some(false));
}

#[test]
fn codex_config_keeps_other_tables_and_comments() {
    let existing = "# my settings\nmodel = \"gpt\"\n\n[mcp_servers.other]\ncommand = \"x\" # keep\n\n[mcp_servers.dreamy]\nurl = \"http://old\"\n";

    let result = codex_config(existing, ENDPOINT).unwrap();
    let document = result.parse::<DocumentMut>().unwrap();

    assert!(result.contains("# my settings"));
    assert!(result.contains("# keep"));
    assert_eq!(document["model"].as_str(), Some("gpt"));
    assert_eq!(
        document["mcp_servers"]["other"]["command"].as_str(),
        Some("x")
    );
    assert_eq!(
        document["mcp_servers"]["dreamy"]["url"].as_str(),
        Some(ENDPOINT)
    );
}

#[test]
fn codex_config_respects_a_user_set_enabled() {
    let existing = "[mcp_servers.dreamy]\nenabled = true\n";

    let result = codex_config(existing, ENDPOINT).unwrap();
    let document = result.parse::<DocumentMut>().unwrap();

    assert_eq!(
        document["mcp_servers"]["dreamy"]["enabled"].as_bool(),
        Some(true)
    );
}

#[test]
fn codex_config_is_stable_on_repeat_and_rejects_bad_toml() {
    let once = codex_config("", ENDPOINT).unwrap();

    assert_eq!(codex_config(&once, ENDPOINT).unwrap(), once);
    assert!(codex_config("= nope", ENDPOINT).is_err());
}

#[test]
fn provision_writes_claude_files_once() {
    let dir = TempDir::new().unwrap();
    let cli = spec("claude").unwrap();
    let profile = cli.profile_dir(dir.path());

    provision(cli, dir.path(), ENDPOINT).unwrap();
    let settings = profile.join(CLAUDE_SETTINGS_FILE);
    let mcp = profile.join(CLAUDE_MCP_FILE);
    let first = std::fs::metadata(&mcp).unwrap().modified().unwrap();
    let first_settings = std::fs::metadata(&settings).unwrap().modified().unwrap();
    std::thread::sleep(std::time::Duration::from_millis(30));
    provision(cli, dir.path(), ENDPOINT).unwrap();

    assert_eq!(std::fs::read_to_string(&mcp).unwrap(), claude_mcp(ENDPOINT));
    assert_eq!(std::fs::metadata(&mcp).unwrap().modified().unwrap(), first);
    assert_eq!(
        std::fs::metadata(&settings).unwrap().modified().unwrap(),
        first_settings
    );

    provision(cli, dir.path(), "http://127.0.0.1:5000/mcp").unwrap();
    assert!(
        std::fs::read_to_string(&mcp)
            .unwrap()
            .contains("127.0.0.1:5000")
    );
}

#[test]
fn provision_writes_codex_config_once() {
    let dir = TempDir::new().unwrap();
    let cli = spec("codex").unwrap();
    let config = cli.profile_dir(dir.path()).join(CODEX_CONFIG_FILE);

    provision(cli, dir.path(), ENDPOINT).unwrap();
    let first = std::fs::metadata(&config).unwrap().modified().unwrap();
    std::thread::sleep(std::time::Duration::from_millis(30));
    provision(cli, dir.path(), ENDPOINT).unwrap();

    assert!(std::fs::read_to_string(&config).unwrap().contains(ENDPOINT));
    assert_eq!(
        std::fs::metadata(&config).unwrap().modified().unwrap(),
        first
    );
}

#[test]
fn provision_ignores_other_clis() {
    let dir = TempDir::new().unwrap();
    let cli = spec("antigravity").unwrap();

    provision(cli, dir.path(), ENDPOINT).unwrap();

    assert!(!cli.profile_dir(dir.path()).exists());
}

#[test]
fn provision_reports_invalid_existing_files() {
    let dir = TempDir::new().unwrap();
    let cli = spec("claude").unwrap();
    let profile = cli.profile_dir(dir.path());
    std::fs::create_dir_all(&profile).unwrap();
    std::fs::write(profile.join(CLAUDE_SETTINGS_FILE), "{broken").unwrap();

    assert!(provision(cli, dir.path(), ENDPOINT).is_err());
}

#[test]
fn assistant_args_per_cli() {
    let dir = TempDir::new().unwrap();
    let claude = spec("claude").unwrap();
    let expected = claude
        .profile_dir(dir.path())
        .join(CLAUDE_MCP_FILE)
        .to_string_lossy()
        .into_owned();

    assert_eq!(
        assistant_args(claude, dir.path()),
        vec![
            "--mcp-config".to_string(),
            expected,
            "--strict-mcp-config".to_string()
        ]
    );
    assert_eq!(
        assistant_args(spec("codex").unwrap(), dir.path()),
        vec![
            "-c".to_string(),
            "mcp_servers.dreamy.enabled=true".to_string()
        ]
    );
    assert!(assistant_args(spec("antigravity").unwrap(), dir.path()).is_empty());
}
