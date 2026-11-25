use crate::features::settings::install::InstallView;
use crate::features::settings::models::lenient;
use crate::features::settings::probe::CliProbe;
use serde::Deserialize;
use serde::Serialize;
use std::collections::BTreeMap;
use std::path::Path;
use std::path::PathBuf;
use std::process::Command;

pub const LLM_DIR: &str = "llm";

const AGY_TOKEN_FILE: &str = ".gemini/antigravity-cli/antigravity-oauth-token";

pub const FEATURES: [&str; 3] = ["translation", "knowledge", "assistant"];

pub struct CliSpec {
    pub id: &'static str,
    pub command: &'static str,
    pub name: &'static str,
    pub caps: &'static [&'static str],
    pub profile_env: Option<&'static str>,
    pub env: &'static [(&'static str, &'static str)],
    pub login_args: &'static [&'static str],
    pub logout_args: Option<&'static [&'static str]>,
    pub status_args: Option<&'static [&'static str]>,
    pub token_file: Option<&'static str>,
}

impl CliSpec {
    pub fn profile_dir(&self, data_dir: &Path) -> PathBuf {
        data_dir.join(LLM_DIR).join(self.id)
    }

    pub fn configure(&self, command: &mut Command, data_dir: &Path) {
        if let Some(name) = self.profile_env {
            command.env(name, self.profile_dir(data_dir));
        }
        command.envs(self.env.iter().copied());
    }

    pub fn token_path(&self, data_dir: &Path) -> Option<PathBuf> {
        self.token_file
            .map(|file| self.profile_dir(data_dir).join(file))
    }

    pub fn can_logout(&self) -> bool {
        self.logout_args.is_some() || self.token_file.is_some()
    }

    pub fn can_detect_login(&self) -> bool {
        self.status_args.is_some() || self.token_file.is_some()
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
        env: &[("DISABLE_AUTOUPDATER", "1")],
        login_args: &["auth", "login"],
        logout_args: Some(&["auth", "logout"]),
        status_args: Some(&["auth", "status"]),
        token_file: None,
    },
    CliSpec {
        id: "antigravity",
        command: "agy",
        name: "Antigravity CLI",
        caps: &["translation", "knowledge", "assistant"],
        profile_env: Some("USERPROFILE"),
        env: &[
            ("AGY_CLI_FORCE_FILE_TOKEN_STORAGE", "1"),
            ("AGY_CLI_DISABLE_AUTO_UPDATE", "1"),
        ],
        login_args: &[],
        logout_args: None,
        status_args: None,
        token_file: Some(AGY_TOKEN_FILE),
    },
    CliSpec {
        id: "codex",
        command: "codex",
        name: "Codex CLI",
        caps: &["translation", "knowledge", "assistant"],
        profile_env: Some("CODEX_HOME"),
        env: &[],
        login_args: &["login"],
        logout_args: Some(&["logout"]),
        status_args: Some(&["login", "status"]),
        token_file: None,
    },
];

pub fn spec(id: &str) -> Option<&'static CliSpec> {
    CLI_SPECS.iter().find(|spec| spec.id == id)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Effort {
    Low,
    Medium,
    High,
}

impl Effort {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Low => "low",
            Self::Medium => "medium",
            Self::High => "high",
        }
    }
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FeatureSettings {
    #[serde(
        default,
        deserialize_with = "lenient",
        skip_serializing_if = "Option::is_none"
    )]
    pub provider: Option<String>,
    #[serde(
        default,
        deserialize_with = "lenient",
        skip_serializing_if = "Option::is_none"
    )]
    pub model: Option<String>,
    #[serde(
        default,
        deserialize_with = "lenient",
        skip_serializing_if = "Option::is_none"
    )]
    pub effort: Option<Effort>,
    #[serde(
        default,
        deserialize_with = "lenient",
        skip_serializing_if = "Option::is_none"
    )]
    pub args: Option<String>,
}

fn clean(value: Option<String>) -> Option<String> {
    value
        .map(|text| text.trim().to_string())
        .filter(|text| !text.is_empty())
}

impl FeatureSettings {
    pub fn normalized(self) -> Self {
        Self {
            provider: clean(self.provider),
            model: clean(self.model),
            effort: self.effort,
            args: clean(self.args),
        }
    }
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct LlmSettings {
    #[serde(default, deserialize_with = "lenient")]
    pub features: BTreeMap<String, FeatureSettings>,
}

impl LlmSettings {
    pub fn is_empty(&self) -> bool {
        *self == Self::default()
    }

    pub fn feature(&self, id: &str) -> FeatureSettings {
        self.features.get(id).cloned().unwrap_or_default()
    }

    fn feature_view(&self, id: &'static str) -> FeatureView {
        let settings = self.feature(id);
        let provider = settings
            .provider
            .filter(|provider| spec(provider).is_some_and(|spec| spec.caps.contains(&id)));
        FeatureView {
            id,
            provider,
            model: settings.model.unwrap_or_default(),
            effort: settings.effort,
            args: settings.args.unwrap_or_default(),
        }
    }

    pub fn view(&self, data_dir: &Path, probes: &BTreeMap<String, CliProbe>) -> LlmView {
        let providers = CLI_SPECS
            .iter()
            .map(|spec| CliView {
                id: spec.id,
                name: spec.name,
                command: spec.command,
                caps: spec.caps,
                profile_env: spec.profile_env,
                profile_dir: spec
                    .profile_env
                    .map(|_| spec.profile_dir(data_dir).to_string_lossy().into_owned()),
                login_command: spec.login_command(),
                can_logout: spec.can_logout(),
                can_detect_login: spec.can_detect_login(),
                install: InstallView::unavailable(),
                probe: probes.get(spec.id).cloned(),
            })
            .collect();
        let features = FEATURES.iter().map(|id| self.feature_view(id)).collect();
        LlmView {
            providers,
            features,
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
    pub install: InstallView,
    pub probe: Option<CliProbe>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LlmView {
    pub providers: Vec<CliView>,
    pub features: Vec<FeatureView>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FeatureView {
    pub id: &'static str,
    pub provider: Option<String>,
    pub model: String,
    pub effort: Option<Effort>,
    pub args: String,
}
