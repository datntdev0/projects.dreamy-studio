use crate::features::novel::files::write_atomic;
use crate::shared::files::remove_if_exists;
use serde::Deserialize;
use serde::Serialize;
use serde_json::Value;
use serde_json::json;
use sha2::Digest;
use sha2::Sha256;
use std::fs;
use std::fs::File;
use std::io::ErrorKind;
use std::io::Result;
use std::path::Path;
use std::path::PathBuf;
use std::sync::Mutex;
use std::sync::MutexGuard;
use std::time::SystemTime;

pub const SPEECH_CACHE_LIMIT: u64 = 2 * 1024 * 1024 * 1024;
const CACHE_VERSION: u32 = 1;
const SPEECH_DIR: &str = "speech";
const AUDIO_EXTENSION: &str = "mp3";
const META_EXTENSION: &str = "json";
const SHARD_LENGTH: usize = 2;
const TRIM_TARGET_PERCENT: u64 = 90;

#[derive(Debug, Clone, PartialEq)]
pub struct SpeechOrder {
    pub provider: &'static str,
    pub voice: String,
    pub text: String,
    pub settings: Value,
    pub failure_code: &'static str,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct CloudSpeech {
    pub mp3: Vec<u8>,
    pub subtitles: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CacheStatus {
    pub entries: u64,
    pub bytes: u64,
    pub limit_bytes: u64,
    pub dir: String,
}

#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
struct EntryMeta {
    provider: String,
    subtitles: Option<String>,
    created_at: String,
}

struct Entry {
    audio: PathBuf,
    bytes: u64,
    used: SystemTime,
}

pub struct SpeechCache {
    dir: PathBuf,
    limit: u64,
    gate: Mutex<()>,
}

impl SpeechOrder {
    pub fn key(&self) -> String {
        let identity = json!({
            "v": CACHE_VERSION,
            "provider": self.provider,
            "voice": self.voice,
            "text": self.text,
            "settings": self.settings,
        });
        let digest = Sha256::digest(identity.to_string().as_bytes());
        digest.iter().map(|byte| format!("{byte:02x}")).collect()
    }
}

impl SpeechCache {
    pub fn new(caches_dir: &Path) -> Self {
        Self {
            dir: caches_dir.join(SPEECH_DIR),
            limit: SPEECH_CACHE_LIMIT,
            gate: Mutex::new(()),
        }
    }

    pub fn get(&self, key: &str) -> Option<CloudSpeech> {
        let audio = self.audio_path(key);
        let mp3 = fs::read(&audio).ok()?;
        let meta: EntryMeta = serde_json::from_slice(&fs::read(meta_path(&audio)).ok()?).ok()?;
        touch(&audio);
        Some(CloudSpeech {
            mp3,
            subtitles: meta.subtitles,
        })
    }

    pub fn put(&self, key: &str, provider: &str, speech: &CloudSpeech) -> Result<()> {
        let _guard = self.lock();
        let audio = self.audio_path(key);
        if let Some(parent) = audio.parent() {
            fs::create_dir_all(parent)?;
        }
        let meta = EntryMeta {
            provider: provider.to_string(),
            subtitles: speech.subtitles.clone(),
            created_at: chrono::Utc::now().to_rfc3339(),
        };
        let meta = serde_json::to_vec(&meta).map_err(std::io::Error::other)?;
        write_atomic(&meta_path(&audio), &meta)?;
        write_atomic(&audio, &speech.mp3)?;
        self.trim();
        Ok(())
    }

    pub fn forget(&self, key: &str) {
        let _guard = self.lock();
        remove_entry(&self.audio_path(key));
    }

    pub fn status(&self) -> CacheStatus {
        let entries = self.entries();
        CacheStatus {
            entries: entries.len() as u64,
            bytes: entries.iter().map(|entry| entry.bytes).sum(),
            limit_bytes: self.limit,
            dir: self.dir.to_string_lossy().into_owned(),
        }
    }

    pub fn clear(&self) -> Result<CacheStatus> {
        let _guard = self.lock();
        match fs::remove_dir_all(&self.dir) {
            Err(error) if error.kind() != ErrorKind::NotFound => Err(error),
            _ => Ok(self.status()),
        }
    }

    pub fn dir(&self) -> Result<PathBuf> {
        fs::create_dir_all(&self.dir)?;
        Ok(self.dir.clone())
    }

    fn trim(&self) {
        let mut entries = self.entries();
        let mut total: u64 = entries.iter().map(|entry| entry.bytes).sum();
        if total <= self.limit {
            return;
        }
        let target = self.limit / 100 * TRIM_TARGET_PERCENT;
        entries.sort_by_key(|entry| entry.used);
        for entry in entries {
            if total <= target {
                break;
            }
            remove_entry(&entry.audio);
            total = total.saturating_sub(entry.bytes);
        }
    }

    fn entries(&self) -> Vec<Entry> {
        let Ok(shards) = fs::read_dir(&self.dir) else {
            return Vec::new();
        };
        shards
            .flatten()
            .filter_map(|shard| fs::read_dir(shard.path()).ok())
            .flat_map(|files| files.flatten())
            .filter_map(|file| entry_of(&file.path()))
            .collect()
    }

    fn audio_path(&self, key: &str) -> PathBuf {
        let shard = key.get(..SHARD_LENGTH).unwrap_or(key);
        self.dir
            .join(shard)
            .join(format!("{key}.{AUDIO_EXTENSION}"))
    }

    fn lock(&self) -> MutexGuard<'_, ()> {
        self.gate
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }
}

fn entry_of(path: &Path) -> Option<Entry> {
    if path
        .extension()
        .is_none_or(|extension| extension != AUDIO_EXTENSION)
    {
        return None;
    }
    let audio = fs::metadata(path).ok()?;
    let meta_bytes = fs::metadata(meta_path(path)).map_or(0, |meta| meta.len());
    Some(Entry {
        audio: path.to_path_buf(),
        bytes: audio.len() + meta_bytes,
        used: audio.modified().unwrap_or(SystemTime::UNIX_EPOCH),
    })
}

fn meta_path(audio: &Path) -> PathBuf {
    audio.with_extension(META_EXTENSION)
}

fn touch(audio: &Path) {
    if let Ok(file) = File::options().append(true).open(audio) {
        let _ = file.set_modified(SystemTime::now());
    }
}

fn remove_entry(audio: &Path) {
    let _ = remove_if_exists(audio);
    let _ = remove_if_exists(&meta_path(audio));
}
