use crate::features::settings::models::AppSettings;
use crate::infra::storage::StorageError;
use crate::infra::storage::StorageResult;
use std::fs;
use std::io::ErrorKind;
use std::path::Path;
use std::path::PathBuf;

pub const SETTINGS_FILE: &str = "settings.json";
const INVALID_SUFFIX: &str = "invalid";
const TEMP_SUFFIX: &str = "tmp";

#[derive(Debug, Clone)]
pub struct SettingsRepository {
    path: PathBuf,
}

impl SettingsRepository {
    pub fn new(path: PathBuf) -> Self {
        Self { path }
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    pub fn load(&self) -> StorageResult<AppSettings> {
        let text = match fs::read_to_string(&self.path) {
            Ok(text) => text,
            Err(error) if error.kind() == ErrorKind::NotFound => return Ok(AppSettings::default()),
            Err(error) => return Err(StorageError::Io(error)),
        };
        match serde_json::from_str(&text) {
            Ok(settings) => Ok(settings),
            Err(_) => {
                self.set_aside();
                Ok(AppSettings::default())
            }
        }
    }

    pub fn save(&self, settings: &AppSettings) -> StorageResult<()> {
        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent)?;
        }
        let text = serde_json::to_string_pretty(settings)
            .map_err(|error| StorageError::Corrupt(error.to_string()))?;
        let temp = self.sibling(TEMP_SUFFIX);
        fs::write(&temp, text)?;
        fs::rename(&temp, &self.path)?;
        Ok(())
    }

    fn set_aside(&self) {
        let _ = fs::rename(&self.path, self.sibling(INVALID_SUFFIX));
    }

    fn sibling(&self, suffix: &str) -> PathBuf {
        let mut name = self.path.clone().into_os_string();
        name.push(".");
        name.push(suffix);
        PathBuf::from(name)
    }
}
