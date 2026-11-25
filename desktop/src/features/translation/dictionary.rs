use crate::features::novel::files::write_atomic;
use crate::features::translation::files::TranslationFiles;
use crate::features::translation::files::encode_error;
use crate::features::translation::files::invalid_file;
use crate::features::translation::models::DictEntry;
use crate::features::translation::models::DictInput;
use crate::features::translation::models::TranslationError;
use crate::features::translation::models::TranslationErrorCode;
use crate::features::translation::models::TranslationResult;
use crate::features::translation::models::TranslationTarget;
use crate::shared::files::read_if_exists;
use serde::Deserialize;
use serde::Serialize;
use std::fs;
use std::path::Path;
use std::path::PathBuf;

const DICTIONARY_FILE: &str = "dictionary.jsonl";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredEntry {
    #[serde(flatten)]
    entry: DictEntry,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Clone)]
pub struct DictionaryFiles {
    root: PathBuf,
}

impl DictionaryFiles {
    pub fn new(root: PathBuf) -> Self {
        Self { root }
    }

    pub fn list(
        &self,
        novel_id: i64,
        target: TranslationTarget,
    ) -> TranslationResult<Vec<DictEntry>> {
        let mut entries: Vec<DictEntry> = self
            .read(novel_id, target)?
            .into_iter()
            .map(|stored| stored.entry)
            .collect();
        entries.sort_by_key(|entry| entry.id);
        Ok(entries)
    }

    pub fn find(
        &self,
        novel_id: i64,
        id: i64,
    ) -> TranslationResult<Option<(TranslationTarget, DictEntry)>> {
        for target in TranslationTarget::ALL {
            if let Some(stored) = self
                .read(novel_id, target)?
                .into_iter()
                .find(|stored| stored.entry.id == id)
            {
                return Ok(Some((target, stored.entry)));
            }
        }
        Ok(None)
    }

    pub fn insert(
        &self,
        novel_id: i64,
        target: TranslationTarget,
        input: &DictInput,
        now: &str,
    ) -> TranslationResult<DictEntry> {
        let mut stored = self.read(novel_id, target)?;
        ensure_unique(&stored, &input.src, None)?;
        let entry = DictEntry {
            id: self.next_id(novel_id)?,
            src: input.src.clone(),
            dst: input.dst.clone(),
            kind: input.kind.clone(),
            note: input.note.clone(),
        };
        stored.push(StoredEntry {
            entry: entry.clone(),
            created_at: now.to_string(),
            updated_at: now.to_string(),
        });
        self.write(novel_id, target, &stored)?;
        Ok(entry)
    }

    pub fn update(
        &self,
        novel_id: i64,
        target: TranslationTarget,
        entry: &DictEntry,
        now: &str,
    ) -> TranslationResult<bool> {
        let mut stored = self.read(novel_id, target)?;
        ensure_unique(&stored, &entry.src, Some(entry.id))?;
        let Some(current) = stored.iter_mut().find(|item| item.entry.id == entry.id) else {
            return Ok(false);
        };
        current.entry = entry.clone();
        current.updated_at = now.to_string();
        self.write(novel_id, target, &stored)?;
        Ok(true)
    }

    pub fn delete(&self, novel_id: i64, id: i64) -> TranslationResult<bool> {
        for target in TranslationTarget::ALL {
            let mut stored = self.read(novel_id, target)?;
            let before = stored.len();
            stored.retain(|item| item.entry.id != id);
            if stored.len() != before {
                self.write(novel_id, target, &stored)?;
                return Ok(true);
            }
        }
        Ok(false)
    }

    fn next_id(&self, novel_id: i64) -> TranslationResult<i64> {
        let mut max = 0;
        for target in TranslationTarget::ALL {
            for stored in self.read(novel_id, target)? {
                max = max.max(stored.entry.id);
            }
        }
        Ok(max + 1)
    }

    fn path(&self, novel_id: i64, target: TranslationTarget) -> PathBuf {
        TranslationFiles::new(self.root.clone())
            .translation_dir(novel_id, target)
            .join(DICTIONARY_FILE)
    }

    fn read(
        &self,
        novel_id: i64,
        target: TranslationTarget,
    ) -> TranslationResult<Vec<StoredEntry>> {
        let path = self.path(novel_id, target);
        match read_if_exists(&path)? {
            Some(bytes) => decode_lines(&path, &bytes),
            None => Ok(Vec::new()),
        }
    }

    fn write(
        &self,
        novel_id: i64,
        target: TranslationTarget,
        stored: &[StoredEntry],
    ) -> TranslationResult<()> {
        let path = self.path(novel_id, target);
        let mut bytes = Vec::new();
        for item in stored {
            bytes.extend(serde_json::to_vec(item).map_err(encode_error)?);
            bytes.push(b'\n');
        }
        if let Some(dir) = path.parent() {
            fs::create_dir_all(dir)?;
        }
        write_atomic(&path, &bytes)?;
        Ok(())
    }
}

fn decode_lines(path: &Path, bytes: &[u8]) -> TranslationResult<Vec<StoredEntry>> {
    bytes
        .split(|byte| *byte == b'\n')
        .filter(|line| !line.trim_ascii().is_empty())
        .map(|line| serde_json::from_slice(line).map_err(|error| invalid_file(path, error)))
        .collect()
}

fn ensure_unique(stored: &[StoredEntry], src: &str, except: Option<i64>) -> TranslationResult<()> {
    let taken = stored
        .iter()
        .any(|item| item.entry.src == src && Some(item.entry.id) != except);
    if taken {
        return Err(TranslationError::new(
            TranslationErrorCode::DictionaryDuplicate,
            "a dictionary entry with this source already exists",
        ));
    }
    Ok(())
}
