use crate::features::settings::check::LlmStatus;
use crate::features::settings::llm::CliSpec;
use crate::features::settings::llm::FEATURES;
use crate::features::settings::llm::FeatureSettings;
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
use crate::features::settings::usage::LlmUsage;
use crate::features::settings::usage::read_usage;
use crate::features::settings::window::WindowSettings;
use std::collections::HashMap;
use std::path::PathBuf;
use std::process::Child;
use std::sync::Mutex;

pub struct SettingsService {
    repository: SettingsRepository,
    gate: Mutex<()>,
    status: LlmStatus,
    logins: Mutex<HashMap<String, Child>>,
}

impl SettingsService {
    pub fn new(repository: SettingsRepository) -> Self {
        Self {
            repository,
            gate: Mutex::new(()),
            status: LlmStatus::default(),
            logins: Mutex::new(HashMap::new()),
        }
    }

    pub fn with_status(mut self, status: LlmStatus) -> Self {
        self.status = status;
        self
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
        let general = GeneralSettings {
            pipelines: general.pipelines.normalized(),
            ..general
        };
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
        self.llm_view_of(&self.llm())
    }

    fn llm_view_of(&self, llm: &LlmSettings) -> LlmView {
        llm.view(&self.data_dir(), &self.status.snapshot())
    }

    pub fn save_llm_feature(
        &self,
        feature: &str,
        config: FeatureSettings,
    ) -> Result<LlmView, String> {
        let Some(id) = FEATURES.iter().find(|id| **id == feature) else {
            return Err(format!("Unknown LLM feature: {feature}"));
        };
        let config = config.normalized();
        if let Some(provider) = &config.provider {
            let Some(cli) = spec(provider) else {
                return Err(format!("Unknown LLM provider: {provider}"));
            };
            if !cli.caps.contains(id) {
                return Err(format!("{provider} does not support {feature}"));
            }
        }
        let _guard = self.lock();
        let mut settings = self.repository.load().map_err(|error| error.to_string())?;
        settings.llm.features.insert(id.to_string(), config);
        self.repository
            .save(&settings)
            .map_err(|error| error.to_string())?;
        Ok(self.llm_view_of(&settings.llm))
    }

    pub fn probe_llm(&self, id: &str) -> Result<CliProbe, String> {
        let spec = self.llm_target(id)?;
        let result = probe(spec, &self.data_dir());
        self.status.store(result.clone());
        if result.signed_in == Some(true) {
            self.close_login(id);
        }
        Ok(result)
    }

    pub fn llm_usage(&self, id: &str) -> Result<Option<LlmUsage>, String> {
        read_usage(self.llm_target(id)?, &self.data_dir())
    }

    pub fn login_llm(&self, id: &str) -> Result<(), String> {
        let spec = self.llm_target(id)?;
        self.close_login(id);
        let child = login(spec, &self.data_dir())?;
        self.login_processes().insert(id.to_string(), child);
        Ok(())
    }

    fn close_login(&self, id: &str) {
        if let Some(mut child) = self.login_processes().remove(id) {
            let _ = child.kill();
            let _ = child.wait();
        }
    }

    fn login_processes(&self) -> std::sync::MutexGuard<'_, HashMap<String, Child>> {
        match self.logins.lock() {
            Ok(guard) => guard,
            Err(poisoned) => poisoned.into_inner(),
        }
    }

    pub fn logout_llm(&self, id: &str) -> Result<(), String> {
        let spec = self.llm_target(id)?;
        logout(spec, &self.data_dir())
    }

    fn llm_target(&self, id: &str) -> Result<&'static CliSpec, String> {
        spec(id).ok_or_else(|| format!("Unknown LLM provider: {id}"))
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
