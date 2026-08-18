use crate::features::settings::llm::CliSettings;
use crate::features::settings::llm::CliSpec;
use crate::features::settings::llm::LlmSettings;
use crate::features::settings::llm::LlmView;
use crate::features::settings::llm::spec;
use crate::features::settings::models::GeneralSettings;
use crate::features::settings::models::LayoutSettings;
use crate::features::settings::models::SettingsView;
use crate::features::settings::probe::CliProbe;
use crate::features::settings::probe::login;
use crate::features::settings::probe::logout;
use crate::features::settings::probe::probe;
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

    pub fn save_layout(&self, layout: LayoutSettings) -> Result<LayoutSettings, String> {
        let _guard = self.lock();
        let mut settings = self.repository.load().map_err(|error| error.to_string())?;
        settings.layout = layout.clone();
        self.repository
            .save(&settings)
            .map_err(|error| error.to_string())?;
        Ok(layout)
    }

    pub fn llm(&self) -> LlmSettings {
        let _guard = self.lock();
        self.repository
            .load()
            .map(|settings| settings.llm)
            .unwrap_or_default()
    }

    pub fn llm_view(&self) -> LlmView {
        self.llm().view(&self.data_dir())
    }

    pub fn save_llm_provider(&self, id: &str, provider: CliSettings) -> Result<LlmView, String> {
        if spec(id).is_none() {
            return Err(format!("Unknown LLM provider: {id}"));
        }
        let _guard = self.lock();
        let mut settings = self.repository.load().map_err(|error| error.to_string())?;
        settings
            .llm
            .providers
            .insert(id.to_string(), provider.normalized());
        self.repository
            .save(&settings)
            .map_err(|error| error.to_string())?;
        Ok(settings.llm.view(&self.data_dir()))
    }

    pub fn probe_llm(&self, id: &str) -> Result<CliProbe, String> {
        let (spec, provider) = self.llm_target(id)?;
        Ok(probe(spec, provider.path(), &self.data_dir()))
    }

    pub fn login_llm(&self, id: &str) -> Result<(), String> {
        let (spec, provider) = self.llm_target(id)?;
        login(spec, provider.path(), &self.data_dir())
    }

    pub fn logout_llm(&self, id: &str) -> Result<(), String> {
        let (spec, provider) = self.llm_target(id)?;
        logout(spec, provider.path(), &self.data_dir())
    }

    pub fn llm_profile_dir(&self, id: &str) -> Result<PathBuf, String> {
        let (spec, _) = self.llm_target(id)?;
        if spec.profile_env.is_none() {
            return Err(format!("{} does not use an app profile.", spec.name));
        }
        let dir = spec.profile_dir(&self.data_dir());
        std::fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
        Ok(dir)
    }

    fn llm_target(&self, id: &str) -> Result<(&'static CliSpec, CliSettings), String> {
        let spec = spec(id).ok_or_else(|| format!("Unknown LLM provider: {id}"))?;
        Ok((spec, self.llm().provider(id)))
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
