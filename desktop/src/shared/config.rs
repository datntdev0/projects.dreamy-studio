use serde::Deserialize;
use std::path::Component;
use std::path::Path;
use std::path::PathBuf;
use std::sync::OnceLock;

use crate::shared::env;

pub const CONFIG_FILE: &str = "DreamyStudio.config";
const PRODUCT_DIR: &str = "DreamyStudio";
const DATA_DIR: &str = "appdata";
const RUNTIME_DIR: &str = "runtime";
const TOOLBOX_DIR: &str = "toolbox";
const LOCAL_APP_DATA_VAR: &str = "LOCALAPPDATA";

static CURRENT: OnceLock<AppConfig> = OnceLock::new();

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "PascalCase")]
struct ConfigFile {
    app_data_dir: Option<String>,
    runtime_dir: Option<String>,
    toolbox_dir: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AppConfig {
    pub app_data_dir: PathBuf,
    pub runtime_dir: PathBuf,
    pub toolbox_dir: PathBuf,
    pub portable: bool,
    pub source: Option<PathBuf>,
}

pub struct ConfigInput<'a> {
    pub install_dir: &'a Path,
    pub text: Option<&'a str>,
    pub source: Option<PathBuf>,
    pub data_override: Option<PathBuf>,
    pub variable: &'a dyn Fn(&str) -> Option<String>,
}

impl AppConfig {
    pub fn resolve(input: ConfigInput<'_>) -> Self {
        let file = parse(input.text);
        let portable = file.app_data_dir.as_deref().is_some_and(is_relative);
        let app_data_dir = match &input.data_override {
            Some(path) => path.clone(),
            None => directory(&input, file.app_data_dir.as_deref(), DATA_DIR),
        };
        Self {
            app_data_dir,
            runtime_dir: directory(&input, file.runtime_dir.as_deref(), RUNTIME_DIR),
            toolbox_dir: directory(&input, file.toolbox_dir.as_deref(), TOOLBOX_DIR),
            portable,
            source: input.source,
        }
    }

    pub fn load() -> Self {
        let install_dir = install_dir();
        let source = install_dir.join(CONFIG_FILE);
        let text = std::fs::read_to_string(&source).ok();
        let found = text.is_some().then_some(source);
        Self::resolve(ConfigInput {
            install_dir: &install_dir,
            text: text.as_deref(),
            source: found,
            data_override: env::data_dir(),
            variable: &read_variable,
        })
    }

    pub fn webview_dir(&self) -> Option<PathBuf> {
        self.portable.then(|| self.app_data_dir.join("webview"))
    }
}

pub fn current() -> &'static AppConfig {
    CURRENT.get_or_init(AppConfig::load)
}

pub fn install_dir() -> PathBuf {
    let mut path = std::env::current_exe().unwrap_or_default();
    path.pop();
    path
}

fn parse(text: Option<&str>) -> ConfigFile {
    let Some(text) = text else {
        return ConfigFile::default();
    };
    match serde_json::from_str(text.trim_start_matches('\u{feff}')) {
        Ok(file) => file,
        Err(error) => {
            eprintln!("ignoring invalid {CONFIG_FILE}: {error}");
            ConfigFile::default()
        }
    }
}

fn directory(input: &ConfigInput<'_>, value: Option<&str>, name: &str) -> PathBuf {
    match value {
        Some(value) if !value.trim().is_empty() => {
            resolve_path(value, input.install_dir, input.variable)
        }
        _ => default_root(input.install_dir, input.variable).join(name),
    }
}

fn read_variable(name: &str) -> Option<String> {
    std::env::var(name).ok().filter(|value| !value.is_empty())
}

fn default_root(install_dir: &Path, variable: &dyn Fn(&str) -> Option<String>) -> PathBuf {
    match variable(LOCAL_APP_DATA_VAR) {
        Some(local) => PathBuf::from(local).join(PRODUCT_DIR),
        None => install_dir.to_path_buf(),
    }
}

fn is_relative(value: &str) -> bool {
    !value.contains('%') && Path::new(value).is_relative()
}

pub fn expand(value: &str, variable: &dyn Fn(&str) -> Option<String>) -> String {
    let mut output = String::new();
    let mut rest = value;
    while let Some(start) = rest.find('%') {
        output.push_str(&rest[..start]);
        let after = &rest[start + 1..];
        let Some(end) = after.find('%') else {
            output.push_str(&rest[start..]);
            return output;
        };
        let name = &after[..end];
        match variable(name) {
            Some(found) if !name.is_empty() => output.push_str(&found),
            _ => output.push_str(&rest[start..start + end + 2]),
        }
        rest = &after[end + 1..];
    }
    output.push_str(rest);
    output
}

fn resolve_path(
    value: &str,
    install_dir: &Path,
    variable: &dyn Fn(&str) -> Option<String>,
) -> PathBuf {
    let expanded = PathBuf::from(expand(value.trim(), variable));
    let joined = if expanded.is_absolute() {
        expanded
    } else {
        install_dir.join(expanded)
    };
    normalize(&joined)
}

fn normalize(path: &Path) -> PathBuf {
    let mut output = PathBuf::new();
    for component in path.components() {
        match component {
            Component::CurDir => {}
            Component::ParentDir => {
                output.pop();
            }
            other => output.push(other.as_os_str()),
        }
    }
    output
}
