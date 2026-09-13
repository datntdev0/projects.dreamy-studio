use crate::features::backend::edge;
use crate::features::backend::elevenlabs;
use crate::features::backend::models::CloudAccountView;
use crate::features::backend::models::CloudCheckResult;
use crate::features::backend::models::CloudVoice;
use crate::features::backend::models::SynthesisRequest;
use crate::features::backend::models::SynthesizedAudio;
use crate::features::backend::remote::key_hint;
use crate::features::backend::speech::UNAVAILABLE_STATUS;
use crate::features::backend::speech::api_error;
use crate::features::settings::cloud::CloudAccountSettings;
use crate::features::settings::repository::SettingsRepository;
use crate::infra::backend_client::ClientError;
use std::sync::Mutex;

const KEYED_ACCOUNTS: [&str; 1] = [elevenlabs::ELEVENLABS_ENGINE];
const KEY_MISSING: &str = "Add an API key for this cloud account in Settings first.";

pub struct CloudAccountService {
    settings: SettingsRepository,
    gate: Mutex<()>,
}

pub fn supports(engine: &str) -> bool {
    edge::supports(engine) || elevenlabs::supports(engine)
}

impl CloudAccountService {
    pub fn new(settings: SettingsRepository) -> Self {
        Self {
            settings,
            gate: Mutex::new(()),
        }
    }

    pub fn list(&self) -> Result<Vec<CloudAccountView>, String> {
        let settings = self.settings.load().map_err(|error| error.to_string())?;
        Ok(settings
            .cloud
            .accounts
            .iter()
            .filter(|(_, account)| !account.api_key.is_empty())
            .map(|(id, account)| CloudAccountView {
                id: id.clone(),
                connected: true,
                key_hint: key_hint(&account.api_key),
            })
            .collect())
    }

    pub fn set_key(&self, id: &str, key: &str) -> Result<(), String> {
        let id = keyed_account(id)?;
        let key = key.trim();
        if key.is_empty() {
            return Err("The API key is empty.".to_string());
        }
        let account = CloudAccountSettings {
            api_key: key.to_string(),
        };
        self.update(|accounts| {
            accounts.insert(id.to_string(), account);
        })
    }

    pub fn remove_key(&self, id: &str) -> Result<(), String> {
        let id = keyed_account(id)?;
        self.update(|accounts| {
            accounts.remove(id);
        })
    }

    pub fn check(&self, id: &str) -> Result<CloudCheckResult, String> {
        if edge::supports(id) {
            return Ok(edge::check());
        }
        Ok(elevenlabs::check(&self.require_key(id)?))
    }

    pub fn search_voices(&self, id: &str, query: &str) -> Result<Vec<CloudVoice>, String> {
        let key = self.require_key(id)?;
        elevenlabs::search(&key, query).map_err(|error| error.to_string())
    }

    pub fn synthesize(&self, request: &SynthesisRequest) -> Result<SynthesizedAudio, ClientError> {
        if edge::supports(&request.model) {
            return edge::synthesize(request);
        }
        let key = self
            .require_key(&request.model)
            .map_err(|message| api_error(UNAVAILABLE_STATUS, "MODEL_NOT_INSTALLED", &message))?;
        elevenlabs::synthesize(&key, request)
    }

    fn require_key(&self, id: &str) -> Result<String, String> {
        let id = keyed_account(id)?;
        let settings = self.settings.load().map_err(|error| error.to_string())?;
        settings
            .cloud
            .api_key(id)
            .map(str::to_string)
            .ok_or_else(|| KEY_MISSING.to_string())
    }

    fn update(
        &self,
        change: impl FnOnce(&mut std::collections::BTreeMap<String, CloudAccountSettings>),
    ) -> Result<(), String> {
        let _guard = self
            .gate
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let mut settings = self.settings.load().map_err(|error| error.to_string())?;
        change(&mut settings.cloud.accounts);
        self.settings
            .save(&settings)
            .map_err(|error| error.to_string())
    }
}

fn keyed_account(id: &str) -> Result<&str, String> {
    KEYED_ACCOUNTS
        .iter()
        .copied()
        .find(|account| *account == id)
        .ok_or_else(|| format!("{id} is not a supported cloud account"))
}
