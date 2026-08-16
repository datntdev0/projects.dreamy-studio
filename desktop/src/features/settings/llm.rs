use crate::features::settings::models::lenient;
use serde::Deserialize;
use serde::Serialize;
use std::collections::BTreeMap;
use std::path::Path;
use std::path::PathBuf;

pub const LLM_DIR: &str = "llm";

pub struct CliSpec {
    pub id: &'static str,
    pub command: &'static str,
    pub name: &'static str,
    pub caps: &'static [&'static str],
    pub profile_env: Option<&'static str>,
    pub login_args: &'static [&'static str],
    pub logout_args: Option<&'static [&'static str]>,
    pub status_args: Option<&'static [&'static str]>,
}

impl CliSpec {
    pub fn profile_dir(&self, data_dir: &Path) -> PathBuf {
        data_dir.join(LLM_DIR).join(self.id)
    }

    pub fn login_command(&self) -> String {
        std::iter::once(self.command)
            .chain(self.login_args.iter().copied())
            .collect::<Vec<_>>()
            .join(" ")
    }
}

pub const CLI_SPECS: [CliSpec; 3] = [
    CliSpec {
        id: "claude",
        command: "claude",
        name: "Claude Code CLI",
        caps: &["translation", "knowledge", "assistant"],
        profile_env: Some("CLAUDE_CONFIG_DIR"),
        login_args: &["auth", "login"],
        logout_args: Some(&["auth", "logout"]),
        status_args: Some(&["auth", "status"]),
    },
    CliSpec {
        id: "antigravity",
        command: "agy",
        name: "Antigravity CLI",
        caps: &["translation", "knowledge", "assistant"],
        profile_env: None,
        login_args: &[],
        logout_args: None,
        status_args: None,
    },
    CliSpec {
        id: "codex",
        command: "codex",
        name: "Codex CLI",
        caps: &["knowledge", "assistant"],
        profile_env: Some("CODEX_HOME"),
        login_args: &["login"],
        logout_args: Some(&["logout"]),
        status_args: Some(&["login", "status"]),
    },
];

pub fn spec(id: &str) -> Option<&'static CliSpec> {
    CLI_SPECS.iter().find(|spec| spec.id == id)
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CliSettings {
    #[serde(
        default,
        deserialize_with = "lenient",
        skip_serializing_if = "Option::is_none"
    )]
    pub enabled: Option<bool>,
    #[serde(
        default,
        deserialize_with = "lenient",
        skip_serializing_if = "Option::is_none"
    )]
    pub path: Option<String>,
    #[serde(
        default,
        deserialize_with = "lenient",
        skip_serializing_if = "Option::is_none"
    )]
    pub args: Option<String>,
}

impl CliSettings {
    pub fn normalized(self) -> Self {
        Self {
            enabled: self.enabled,
            path: self.path.map(|path| path.trim().to_string()),
            args: self.args.map(|args| args.trim().to_string()),
        }
    }

    pub fn is_enabled(&self) -> bool {
        self.enabled.unwrap_or(true)
    }

    pub fn path(&self) -> &str {
        self.path.as_deref().unwrap_or("")
    }

    pub fn args(&self) -> &str {
        self.args.as_deref().unwrap_or("")
    }
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct LlmSettings {
    #[serde(
        default,
        deserialize_with = "lenient",
        skip_serializing_if = "Option::is_none"
    )]
    pub default: Option<String>,
    #[serde(default, deserialize_with = "lenient")]
    pub providers: BTreeMap<String, CliSettings>,
}

impl LlmSettings {
    pub fn is_empty(&self) -> bool {
        *self == Self::default()
    }

    pub fn provider(&self, id: &str) -> CliSettings {
        self.providers.get(id).cloned().unwrap_or_default()
    }

    pub fn view(&self, data_dir: &Path) -> LlmView {
        let providers = CLI_SPECS
            .iter()
            .map(|spec| {
                let settings = self.provider(spec.id);
                CliView {
                    id: spec.id,
                    name: spec.name,
                    command: spec.command,
                    caps: spec.caps,
                    profile_env: spec.profile_env,
                    profile_dir: spec
                        .profile_env
                        .map(|_| spec.profile_dir(data_dir).to_string_lossy().into_owned()),
                    login_command: spec.login_command(),
                    can_logout: spec.logout_args.is_some(),
                    can_detect_login: spec.status_args.is_some(),
                    enabled: settings.is_enabled(),
                    path: settings.path().to_string(),
                    args: settings.args().to_string(),
                }
            })
            .collect();
        LlmView {
            default: self.default.clone().filter(|id| spec(id).is_some()),
            providers,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CliView {
    pub id: &'static str,
    pub name: &'static str,
    pub command: &'static str,
    pub caps: &'static [&'static str],
    pub profile_env: Option<&'static str>,
    pub profile_dir: Option<String>,
    pub login_command: String,
    pub can_logout: bool,
    pub can_detect_login: bool,
    pub enabled: bool,
    pub path: String,
    pub args: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LlmView {
    pub default: Option<String>,
    pub providers: Vec<CliView>,
}
