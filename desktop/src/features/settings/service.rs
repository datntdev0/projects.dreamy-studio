use crate::features::settings::models::GeneralSettings;
use crate::features::settings::models::LayoutSettings;
use crate::features::settings::models::SettingsView;
use crate::features::settings::repository::SettingsRepository;
use crate::features::settings::window::WindowSettings;
use std::path::PathBuf;
use std::sync::Mutex;

pub struct SettingsService {
    repository: SettingsRepository,
    gate: Mutex<()>,
}

impl SettingsService {
    pub fn new(repository: SettingsRepository) -> Self {
        Self {
            repository,
            gate: Mutex::new(()),
        }
    }

    pub fn view(&self) -> SettingsView {
        let settings = {
            let _guard = self.lock();
            self.repository.load().unwrap_or_default()
        };
        SettingsView {
            general: settings.general,
            layout: settings.layout,
            data_dir: self.data_dir().to_string_lossy().into_owned(),
            file: self.repository.path().to_string_lossy().into_owned(),
        }
    }

    pub fn general(&self) -> GeneralSettings {
        let _guard = self.lock();
        self.repository
            .load()
            .map(|settings| settings.general)
            .unwrap_or_default()
    }

    pub fn save_general(&self, general: GeneralSettings) -> Result<GeneralSettings, String> {
        let _guard = self.lock();
        let mut settings = self.repository.load().map_err(|error| error.to_string())?;
        settings.general = general.clone();
        self.repository
            .save(&settings)
            .map_err(|error| error.to_string())?;
        Ok(general)
    }

    pub fn layout(&self) -> LayoutSettings {
        let _guard = self.lock();
        self.repository
            .load()
            .map(|settings| settings.layout)
            .unwrap_or_default()
    }

    pub fn save_layout(&self, layout: LayoutSettings) -> Result<LayoutSettings, String> {
        let _guard = self.lock();
        let mut settings = self.repository.load().map_err(|error| error.to_string())?;
        settings.layout = layout.clone();
        self.repository
            .save(&settings)
            .map_err(|error| error.to_string())?;
        Ok(layout)
    }

    pub fn window(&self) -> Option<WindowSettings> {
        let _guard = self.lock();
        self.repository
            .load()
            .ok()
            .and_then(|settings| settings.window)
    }

    pub fn save_window(&self, window: WindowSettings) -> Result<(), String> {
        let _guard = self.lock();
        let mut settings = self.repository.load().map_err(|error| error.to_string())?;
        settings.window = Some(window);
        self.repository
            .save(&settings)
            .map_err(|error| error.to_string())
    }

    pub fn data_dir(&self) -> PathBuf {
        match self.repository.path().parent() {
            Some(parent) => parent.to_path_buf(),
            None => PathBuf::new(),
        }
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, ()> {
        self.gate
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }
}

#[cfg(test)]
#[path = "../../../test/features/settings/service.test.rs"]
mod tests;
