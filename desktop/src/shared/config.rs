use serde::Deserialize;
use std::path::Path;
use std::path::PathBuf;
use std::sync::OnceLock;

use crate::shared::env;

pub const CONFIG_FILE: &str = "DreamyStudio.config";
const PRODUCT_DIR: &str = "DreamyStudio";
const DATA_DIR: &str = "appdata";
const RUNTIME_DIR: &str = "runtime";
const TOOLBOX_DIR: &str = "toolbox";
const BACKEND_DIR: &str = "backend";
const LOGS_DIR: &str = "logs";
const WEBVIEW_DIR: &str = "webview";
const LOCAL_APP_DATA_VAR: &str = "LOCALAPPDATA";

static CURRENT: OnceLock<AppConfig> = OnceLock::new();

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "PascalCase", default)]
struct ConfigFile {
    #[serde(alias = "isPortable")]
    is_portable: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AppConfig {
    pub root_dir: PathBuf,
    pub app_data_dir: PathBuf,
    pub runtime_dir: PathBuf,
    pub toolbox_dir: PathBuf,
    pub backend_data_dir: PathBuf,
    pub portable: bool,
    pub source: Option<PathBuf>,
}

pub struct ConfigInput<'a> {
    pub install_dir: &'a Path,
    pub text: Option<&'a str>,
    pub source: Option<PathBuf>,
    pub variable: &'a dyn Fn(&str) -> Option<String>,
}

impl AppConfig {
    pub fn resolve(input: ConfigInput<'_>) -> Self {
        let portable = parse(input.text).is_portable;
        let root_dir = env::directory((input.variable)(env::STUDIO_DATA_DIR_VAR))
            .unwrap_or_else(|| default_root(portable, input.install_dir, input.variable));
        let backend_data_dir = env::directory((input.variable)(env::BACKEND_DATA_DIR_VAR))
            .unwrap_or_else(|| root_dir.join(BACKEND_DIR));
        Self {
            app_data_dir: root_dir.join(DATA_DIR),
            runtime_dir: root_dir.join(RUNTIME_DIR),
            toolbox_dir: root_dir.join(TOOLBOX_DIR),
            root_dir,
            backend_data_dir,
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
            variable: &read_variable,
        })
    }

    pub fn webview_dir(&self) -> Option<PathBuf> {
        self.portable.then(|| self.app_data_dir.join(WEBVIEW_DIR))
    }

    pub fn backend_logs_dir(&self) -> PathBuf {
        self.backend_data_dir.join(LOGS_DIR)
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

fn read_variable(name: &str) -> Option<String> {
    std::env::var(name).ok().filter(|value| !value.is_empty())
}

fn default_root(
    portable: bool,
    install_dir: &Path,
    variable: &dyn Fn(&str) -> Option<String>,
) -> PathBuf {
    if portable {
        return install_dir.to_path_buf();
    }
    match variable(LOCAL_APP_DATA_VAR) {
        Some(local) => PathBuf::from(local).join(PRODUCT_DIR),
        None => install_dir.to_path_buf(),
    }
}
