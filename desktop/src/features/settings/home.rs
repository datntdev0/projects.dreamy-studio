use crate::features::assistant::catalog::SKILL_DOCS;
use crate::features::assistant::catalog::skill_file;
use crate::features::novel::files::write_atomic;
use crate::features::settings::llm::CLI_SPECS;
use crate::features::settings::llm::CliSpec;
use serde_json::Map;
use serde_json::Value;
use serde_json::json;
use std::fs;
use std::path::Path;
use std::path::PathBuf;
use toml_edit::DocumentMut;
use toml_edit::Item;
use toml_edit::Table;
use toml_edit::value;

pub const MCP_SERVER: &str = "dreamy";
pub const MCP_TOKEN_ENV: &str = "DREAMY_MCP_TOKEN";
pub const CLAUDE_MCP_FILE: &str = "dreamy-mcp.json";
pub const CLAUDE_SETTINGS_FILE: &str = "settings.json";
pub const CODEX_CONFIG_FILE: &str = "config.toml";
pub const CODEX_APPROVAL_MODE: &str = "approve";
pub const SKILL_FILE: &str = "SKILL.md";

const CLAUDE_ALLOW: [&str; 2] = ["mcp__dreamy", "Skill"];
const CLAUDE_DENY: [&str; 10] = [
    "Bash",
    "Read",
    "Edit",
    "Write",
    "Glob",
    "Grep",
    "NotebookEdit",
    "WebFetch",
    "WebSearch",
    "Task",
];

pub fn claude_settings(existing: &str) -> Result<String, String> {
    let mut root = parse_object(existing)?;
    let permissions = child_object(&mut root, "permissions")?;
    merge_list(permissions, "allow", &CLAUDE_ALLOW)?;
    merge_list(permissions, "deny", &CLAUDE_DENY)?;
    pretty(&Value::Object(root))
}

pub fn claude_mcp(endpoint: &str) -> String {
    let config = json!({
        "mcpServers": {
            MCP_SERVER: {
                "type": "http",
                "url": endpoint,
                "headers": { "Authorization": format!("Bearer ${{{MCP_TOKEN_ENV}}}") },
            }
        }
    });
    pretty(&config).unwrap_or_default()
}

pub fn codex_config(existing: &str, endpoint: &str) -> Result<String, String> {
    let mut document = existing
        .parse::<DocumentMut>()
        .map_err(|error| format!("config.toml is not valid TOML: {error}"))?;
    let servers = child_table(document.as_table_mut(), "mcp_servers")?;
    servers.set_implicit(true);
    let server = child_table(servers, MCP_SERVER)?;
    set_text(server, "url", endpoint);
    set_text(server, "bearer_token_env_var", MCP_TOKEN_ENV);
    set_text(server, "default_tools_approval_mode", CODEX_APPROVAL_MODE);
    if !server.contains_key("enabled") {
        server["enabled"] = value(false);
    }
    Ok(document.to_string())
}

pub fn provision(cli: &CliSpec, data_dir: &Path, endpoint: &str) -> Result<(), String> {
    provision_config(cli, data_dir, endpoint)?;
    install_skills(cli, data_dir)
}

pub fn skills_dir(cli: &CliSpec, data_dir: &Path) -> Option<PathBuf> {
    let profile = cli.profile_dir(data_dir);
    match cli.id {
        "claude" | "codex" => Some(profile.join("skills")),
        "antigravity" => Some(profile.join(".gemini").join("config").join("skills")),
        _ => None,
    }
}

pub fn install_skills(cli: &CliSpec, data_dir: &Path) -> Result<(), String> {
    let Some(dir) = skills_dir(cli, data_dir) else {
        return Ok(());
    };
    for doc in &SKILL_DOCS {
        write_if_changed(&dir.join(doc.name).join(SKILL_FILE), &skill_file(doc))?;
    }
    Ok(())
}

pub fn install_present_skills(data_dir: &Path) -> Vec<String> {
    CLI_SPECS
        .iter()
        .filter(|cli| cli.profile_dir(data_dir).exists())
        .filter_map(|cli| install_skills(cli, data_dir).err())
        .collect()
}

fn provision_config(cli: &CliSpec, data_dir: &Path, endpoint: &str) -> Result<(), String> {
    let dir = cli.profile_dir(data_dir);
    match cli.id {
        "claude" => {
            let settings = dir.join(CLAUDE_SETTINGS_FILE);
            let merged = claude_settings(&read_or_empty(&settings)?)?;
            write_if_changed(&settings, &merged)?;
            write_if_changed(&dir.join(CLAUDE_MCP_FILE), &claude_mcp(endpoint))
        }
        "codex" => {
            let config = dir.join(CODEX_CONFIG_FILE);
            let merged = codex_config(&read_or_empty(&config)?, endpoint)?;
            write_if_changed(&config, &merged)
        }
        _ => Ok(()),
    }
}

pub fn assistant_args(cli: &CliSpec, data_dir: &Path) -> Vec<String> {
    match cli.id {
        "claude" => vec![
            "--mcp-config".to_string(),
            cli.profile_dir(data_dir)
                .join(CLAUDE_MCP_FILE)
                .to_string_lossy()
                .into_owned(),
            "--strict-mcp-config".to_string(),
        ],
        "codex" => vec![
            "-c".to_string(),
            format!("mcp_servers.{MCP_SERVER}.enabled=true"),
        ],
        _ => Vec::new(),
    }
}

fn parse_object(text: &str) -> Result<Map<String, Value>, String> {
    if text.trim().is_empty() {
        return Ok(Map::new());
    }
    match serde_json::from_str::<Value>(text) {
        Ok(Value::Object(map)) => Ok(map),
        Ok(_) => Err("settings.json is not a JSON object".to_string()),
        Err(error) => Err(format!("settings.json is not valid JSON: {error}")),
    }
}

fn child_object<'a>(
    parent: &'a mut Map<String, Value>,
    key: &str,
) -> Result<&'a mut Map<String, Value>, String> {
    let entry = parent
        .entry(key.to_string())
        .or_insert_with(|| Value::Object(Map::new()));
    entry
        .as_object_mut()
        .ok_or_else(|| format!("settings.json `{key}` is not an object"))
}

fn merge_list(parent: &mut Map<String, Value>, key: &str, wanted: &[&str]) -> Result<(), String> {
    let entry = parent
        .entry(key.to_string())
        .or_insert_with(|| Value::Array(Vec::new()));
    let list = entry
        .as_array_mut()
        .ok_or_else(|| format!("settings.json `{key}` is not an array"))?;
    for item in wanted {
        if !list.iter().any(|existing| existing.as_str() == Some(item)) {
            list.push(Value::String((*item).to_string()));
        }
    }
    Ok(())
}

fn pretty(value: &Value) -> Result<String, String> {
    let mut text = serde_json::to_string_pretty(value).map_err(|error| error.to_string())?;
    text.push('\n');
    Ok(text)
}

fn child_table<'a>(parent: &'a mut Table, key: &str) -> Result<&'a mut Table, String> {
    if !parent.contains_key(key) {
        parent.insert(key, Item::Table(Table::new()));
    }
    parent[key]
        .as_table_mut()
        .ok_or_else(|| format!("config.toml `{key}` is not a table"))
}

fn set_text(table: &mut Table, key: &str, text: &str) {
    let current = table.get(key).and_then(|item| item.as_str());
    if current != Some(text) {
        table[key] = value(text);
    }
}

fn read_or_empty(path: &Path) -> Result<String, String> {
    match fs::read_to_string(path) {
        Ok(text) => Ok(text),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(String::new()),
        Err(error) => Err(format!("cannot read {}: {error}", path.display())),
    }
}

fn write_if_changed(path: &Path, content: &str) -> Result<(), String> {
    if read_or_empty(path)? == content {
        return Ok(());
    }
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("cannot create {}: {error}", parent.display()))?;
    }
    write_atomic(path, content.as_bytes())
        .map_err(|error| format!("cannot write {}: {error}", path.display()))
}
