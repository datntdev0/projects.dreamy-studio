use crate::features::settings::models::AppSettings;
use crate::features::settings::secrets;
use crate::infra::secret_store::SecretStore;
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
    secrets: SecretStore,
}

impl SettingsRepository {
    pub fn new(path: PathBuf, secrets: SecretStore) -> Self {
        Self { path, secrets }
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    pub fn secrets(&self) -> &SecretStore {
        &self.secrets
    }

    pub fn load(&self) -> StorageResult<AppSettings> {
        let mut settings = self.read()?;
        if secrets::seal(&mut settings, &self.secrets) {
            self.write(settings.clone())?;
        }
        secrets::unseal(&mut settings, &self.secrets);
        Ok(settings)
    }

    pub fn save(&self, settings: &AppSettings) -> StorageResult<()> {
        let mut settings = settings.clone();
        secrets::seal(&mut settings, &self.secrets);
        self.write(settings)
    }

    pub fn forget(&self, account: &str) {
        self.secrets.delete(account);
    }

    fn read(&self) -> StorageResult<AppSettings> {
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

    fn write(&self, mut settings: AppSettings) -> StorageResult<()> {
        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent)?;
        }
        secrets::redact(&mut settings);
        let text = serde_json::to_string_pretty(&settings)
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
