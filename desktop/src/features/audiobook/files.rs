use crate::features::audiobook::models::Audiobook;
use crate::features::audiobook::models::AudiobookConfig;
use crate::features::audiobook::models::MixSettings;
use crate::features::audiobook::models::UnitAudioFile;
use crate::features::project::files::read_json;
use crate::features::project::files::write_json;
use crate::features::project::models::ProjectResult;
use crate::features::scripting::files::is_safe_id;
use crate::features::scripting::files::require_safe_id;
use crate::features::scripting::files::require_unit_id;
use std::collections::BTreeMap;
use std::fs;
use std::io::ErrorKind;
use std::path::Path;
use std::path::PathBuf;

const AUDIOBOOK_DIR: &str = "audiobook";
const CONFIG_FILE: &str = "audiobook.json";
const UNITS_DIR: &str = "units";
const AUDIO_DIR: &str = "audio";
const EXPORTS_DIR: &str = "exports";

#[derive(Debug, Clone)]
pub struct AudiobookFiles {
    dir: PathBuf,
}

impl AudiobookFiles {
    pub fn new(project_dir: &Path) -> Self {
        Self {
            dir: project_dir.join(AUDIOBOOK_DIR),
        }
    }

    pub fn config_path(&self) -> PathBuf {
        self.dir.join(CONFIG_FILE)
    }

    pub fn read_config(&self) -> ProjectResult<Option<AudiobookConfig>> {
        read_json(&self.config_path())
    }

    pub fn update_config(
        &self,
        change: impl FnOnce(&mut AudiobookConfig),
    ) -> ProjectResult<AudiobookConfig> {
        let mut config = self.read_config()?.unwrap_or_default();
        change(&mut config);
        self.write_config(&config)?;
        Ok(config)
    }

    pub fn mix(&self) -> ProjectResult<MixSettings> {
        Ok(self.read_config()?.unwrap_or_default().mix.clamped())
    }

    pub fn write_config(&self, config: &AudiobookConfig) -> ProjectResult<()> {
        write_json(&self.config_path(), config)
    }

    pub fn read_unit(&self, unit_id: &str) -> ProjectResult<UnitAudioFile> {
        Ok(read_json(&self.unit_path(unit_id)?)?.unwrap_or_default())
    }

    pub fn write_unit(&self, unit_id: &str, unit: &UnitAudioFile) -> ProjectResult<()> {
        write_json(&self.unit_path(unit_id)?, unit)
    }

    pub fn read_book(&self) -> ProjectResult<Option<Audiobook>> {
        let config = self.read_config()?;
        let unit_ids = self.unit_ids()?;
        if config.is_none() && unit_ids.is_empty() {
            return Ok(None);
        }
        let mut units = BTreeMap::new();
        for unit_id in unit_ids {
            let unit = self.read_unit(&unit_id)?;
            units.insert(unit_id, unit.into());
        }
        let config = config.unwrap_or_default();
        Ok(Some(Audiobook {
            voices: config.voices,
            mix: config.mix.clamped(),
            units,
        }))
    }

    pub fn segment_path(&self, unit_id: &str, block_id: &str) -> ProjectResult<PathBuf> {
        require_safe_id("block", block_id)?;
        Ok(self.audio_dir(unit_id)?.join(format!("{block_id}.wav")))
    }

    pub fn segment_srt_path(&self, unit_id: &str, block_id: &str) -> ProjectResult<PathBuf> {
        Ok(self.segment_path(unit_id, block_id)?.with_extension("srt"))
    }

    pub fn audio_dir(&self, unit_id: &str) -> ProjectResult<PathBuf> {
        require_unit_id(unit_id)?;
        Ok(self.dir.join(AUDIO_DIR).join(unit_id))
    }

    pub fn scratch_dir(&self) -> PathBuf {
        self.dir.join(AUDIO_DIR)
    }

    pub fn exports_dir(&self) -> PathBuf {
        self.dir.join(EXPORTS_DIR)
    }

    fn unit_path(&self, unit_id: &str) -> ProjectResult<PathBuf> {
        require_unit_id(unit_id)?;
        Ok(self.dir.join(UNITS_DIR).join(format!("{unit_id}.json")))
    }

    fn unit_ids(&self) -> ProjectResult<Vec<String>> {
        let entries = match fs::read_dir(self.dir.join(UNITS_DIR)) {
            Ok(entries) => entries,
            Err(error) if error.kind() == ErrorKind::NotFound => return Ok(Vec::new()),
            Err(error) => return Err(error.into()),
        };
        let mut ids = Vec::new();
        for entry in entries {
            if let Some(id) = unit_file_id(&entry?.path()) {
                ids.push(id);
            }
        }
        ids.sort();
        Ok(ids)
    }
}

fn unit_file_id(path: &Path) -> Option<String> {
    if !path.is_file() || path.extension().is_none_or(|extension| extension != "json") {
        return None;
    }
    let stem = path.file_stem()?.to_str()?;
    is_safe_id(stem).then(|| stem.to_string())
}

#[cfg(test)]
#[path = "../../../test/features/audiobook/files.test.rs"]
mod tests;
