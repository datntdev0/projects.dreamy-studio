use crate::features::backend::cache::CacheStatus;
use crate::features::backend::cache::CloudSpeech;
use crate::features::backend::cache::SpeechCache;
use crate::features::backend::cache::SpeechOrder;
use crate::features::backend::edge;
use crate::features::backend::elevenlabs;
use crate::features::backend::models::CloudAccountView;
use crate::features::backend::models::CloudCheckResult;
use crate::features::backend::models::CloudVoice;
use crate::features::backend::models::SynthesisRequest;
use crate::features::backend::models::SynthesizedAudio;
use crate::features::backend::speech::UNAVAILABLE_STATUS;
use crate::features::backend::speech::api_error;
use crate::features::backend::speech::mp3_audio;
use crate::features::settings::cloud::CloudAccountSettings;
use crate::features::settings::repository::SettingsRepository;
use crate::features::settings::secrets::ApiKey;
use crate::features::settings::secrets::cloud_account;
use crate::infra::backend_client::ClientError;
use std::path::PathBuf;
use std::sync::Mutex;

const KEYED_ACCOUNTS: [&str; 1] = [elevenlabs::ELEVENLABS_ENGINE];
const KEY_MISSING: &str = "Add an API key for this cloud account in Settings first.";

pub struct CloudAccountService {
    settings: SettingsRepository,
    cache: SpeechCache,
    gate: Mutex<()>,
}

pub fn supports(engine: &str) -> bool {
    edge::supports(engine) || elevenlabs::supports(engine)
}

impl CloudAccountService {
    pub fn new(settings: SettingsRepository, cache: SpeechCache) -> Self {
        Self {
            settings,
            cache,
            gate: Mutex::new(()),
        }
    }

    pub fn list(&self) -> Result<Vec<CloudAccountView>, String> {
        let settings = self.settings.load().map_err(|error| error.to_string())?;
        Ok(settings
            .cloud
            .accounts
            .iter()
            .filter(|(_, account)| account.key.is_set())
            .map(|(id, account)| CloudAccountView {
                id: id.clone(),
                connected: account.key.secret().is_some(),
                key_hint: account.key.hint(),
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
            key: ApiKey::new(key),
        };
        self.update(|accounts| {
            accounts.insert(id.to_string(), account);
        })
    }

    pub fn remove_key(&self, id: &str) -> Result<(), String> {
        let id = keyed_account(id)?;
        self.update(|accounts| {
            accounts.remove(id);
        })?;
        self.settings.forget(&cloud_account(id));
        Ok(())
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
        let order = speech_order(request)?;
        let key = order.key();
        if let Some(audio) = self.cached_audio(&key, &order) {
            return Ok(audio);
        }
        let speech = self.fetch(&order)?;
        let _ = self.cache.put(&key, order.provider, &speech);
        let audio = mp3_audio(speech, order.failure_code)?;
        Ok(SynthesizedAudio {
            cache_key: Some(key),
            ..audio
        })
    }

    pub fn cache_status(&self) -> CacheStatus {
        self.cache.status()
    }

    pub fn cache_clear(&self) -> Result<CacheStatus, String> {
        self.cache.clear().map_err(|error| error.to_string())
    }

    pub fn cache_dir(&self) -> Result<PathBuf, String> {
        self.cache.dir().map_err(|error| error.to_string())
    }

    fn cached_audio(&self, key: &str, order: &SpeechOrder) -> Option<SynthesizedAudio> {
        let speech = self.cache.get(key)?;
        match mp3_audio(speech, order.failure_code) {
            Ok(audio) => Some(SynthesizedAudio {
                cached: true,
                cache_key: Some(key.to_string()),
                ..audio
            }),
            Err(_) => {
                self.cache.forget(key);
                None
            }
        }
    }

    fn fetch(&self, order: &SpeechOrder) -> Result<CloudSpeech, ClientError> {
        if edge::supports(order.provider) {
            return edge::speak(order);
        }
        let key = self
            .require_key(order.provider)
            .map_err(|message| api_error(UNAVAILABLE_STATUS, "MODEL_NOT_INSTALLED", &message))?;
        elevenlabs::speak(&key, order)
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

fn speech_order(request: &SynthesisRequest) -> Result<SpeechOrder, ClientError> {
    if edge::supports(&request.model) {
        return edge::order(request);
    }
    elevenlabs::order(request)
}

fn keyed_account(id: &str) -> Result<&str, String> {
    KEYED_ACCOUNTS
        .iter()
        .copied()
        .find(|account| *account == id)
        .ok_or_else(|| format!("{id} is not a supported cloud account"))
}
