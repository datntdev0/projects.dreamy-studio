use serde::Deserialize;
use std::path::Path;
use std::path::PathBuf;
use std::sync::OnceLock;

use crate::shared::config::AppConfig;

const MANIFEST_TEXT: &str = include_str!("../../../setup.manifest.json");
const DOWNLOADS_DIR: &str = ".downloads";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ItemGroup {
    Runtime,
    Toolbox,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
pub enum ArchiveFormat {
    #[serde(rename = "tar.gz")]
    TarGz,
    #[serde(rename = "zip")]
    Zip,
    #[serde(rename = "raw")]
    Raw,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HashAlgorithm {
    Sha256,
    Sha512,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ManifestItem {
    pub id: String,
    pub group: ItemGroup,
    pub version: String,
    pub build: String,
    pub file: String,
    pub urls: Vec<String>,
    #[serde(default)]
    pub sha256: String,
    #[serde(default)]
    pub sha512: String,
    pub size: u64,
    pub format: ArchiveFormat,
    pub root: String,
    #[serde(default)]
    pub include: Vec<String>,
    pub entry: String,
    #[serde(default)]
    pub on_demand: bool,
    #[serde(default)]
    pub packages: Vec<String>,
}

impl ManifestItem {
    pub fn group_dir<'a>(&self, config: &'a AppConfig) -> &'a Path {
        match self.group {
            ItemGroup::Runtime => &config.runtime_dir,
            ItemGroup::Toolbox => &config.toolbox_dir,
        }
    }

    pub fn install_dir(&self, config: &AppConfig) -> PathBuf {
        self.group_dir(config).join(&self.id)
    }

    pub fn executable(&self, config: &AppConfig) -> PathBuf {
        self.install_dir(config).join(&self.entry)
    }

    pub fn downloads_dir(&self, config: &AppConfig) -> PathBuf {
        self.group_dir(config).join(DOWNLOADS_DIR)
    }

    pub fn algorithm(&self) -> HashAlgorithm {
        if self.sha512.is_empty() {
            HashAlgorithm::Sha256
        } else {
            HashAlgorithm::Sha512
        }
    }

    pub fn digest(&self) -> &str {
        match self.algorithm() {
            HashAlgorithm::Sha256 => &self.sha256,
            HashAlgorithm::Sha512 => &self.sha512,
        }
    }

    pub fn display_version(&self) -> String {
        format!("{} {}", self.version, self.build)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct SetupManifest {
    pub items: Vec<ManifestItem>,
}

impl SetupManifest {
    pub fn parse(text: &str) -> Result<Self, String> {
        serde_json::from_str(text).map_err(|error| error.to_string())
    }

    pub fn startup(&self) -> Self {
        Self {
            items: self
                .items
                .iter()
                .filter(|item| !item.on_demand)
                .cloned()
                .collect(),
        }
    }

    pub fn item(&self, id: &str) -> Option<&ManifestItem> {
        self.items.iter().find(|item| item.id == id)
    }
}

pub fn manifest() -> &'static SetupManifest {
    static MANIFEST: OnceLock<SetupManifest> = OnceLock::new();
    MANIFEST.get_or_init(embedded)
}

fn embedded() -> SetupManifest {
    match SetupManifest::parse(MANIFEST_TEXT) {
        Ok(manifest) => manifest,
        Err(error) => panic!("embedded setup.manifest.json is invalid: {error}"),
    }
}

pub fn executable_of(config: &AppConfig, id: &str) -> Option<PathBuf> {
    manifest().item(id).map(|item| item.executable(config))
}

pub fn installed_executable(config: &AppConfig, id: &str) -> Option<PathBuf> {
    executable_of(config, id).filter(|path| path.is_file())
}
