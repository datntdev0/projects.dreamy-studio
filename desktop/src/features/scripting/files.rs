use crate::features::project::files::read_json;
use crate::features::project::files::write_json;
use crate::features::project::models::ProjectError;
use crate::features::project::models::ProjectResult;
use crate::features::scripting::models::ScriptFile;
use crate::features::scripting::models::UnitBody;
use crate::shared::files::remove_if_exists;
use std::collections::BTreeSet;
use std::fs;
use std::io::ErrorKind;
use std::path::Path;
use std::path::PathBuf;

const SCRIPTING_DIR: &str = "scripting";
const SCRIPT_FILE: &str = "script.json";
const UNITS_DIR: &str = "units";
const UNIT_ID_MAX: usize = 64;

#[derive(Debug, Clone)]
pub struct ScriptFiles {
    dir: PathBuf,
}

impl ScriptFiles {
    pub fn new(project_dir: &Path) -> Self {
        Self {
            dir: project_dir.join(SCRIPTING_DIR),
        }
    }

    pub fn read_script(&self) -> ProjectResult<Option<ScriptFile>> {
        read_json(&self.dir.join(SCRIPT_FILE))
    }

    pub fn write_script(&self, script: &ScriptFile) -> ProjectResult<()> {
        write_json(&self.dir.join(SCRIPT_FILE), script)
    }

    pub fn read_unit(&self, unit_id: &str) -> ProjectResult<UnitBody> {
        Ok(read_json(&self.unit_path(unit_id)?)?.unwrap_or_default())
    }

    pub fn write_unit(&self, unit_id: &str, body: &UnitBody) -> ProjectResult<()> {
        write_json(&self.unit_path(unit_id)?, body)
    }

    pub fn remove_orphans(&self, keep: &BTreeSet<String>) -> ProjectResult<()> {
        let entries = match fs::read_dir(self.units_dir()) {
            Ok(entries) => entries,
            Err(error) if error.kind() == ErrorKind::NotFound => return Ok(()),
            Err(error) => return Err(error.into()),
        };
        for entry in entries {
            let path = entry?.path();
            if is_orphan(&path, keep) {
                remove_if_exists(&path)?;
            }
        }
        Ok(())
    }

    fn units_dir(&self) -> PathBuf {
        self.dir.join(UNITS_DIR)
    }

    fn unit_path(&self, unit_id: &str) -> ProjectResult<PathBuf> {
        require_unit_id(unit_id)?;
        Ok(self.units_dir().join(format!("{unit_id}.json")))
    }
}

pub fn require_unit_id(unit_id: &str) -> ProjectResult<()> {
    if is_unit_id(unit_id) {
        Ok(())
    } else {
        Err(ProjectError::invalid(format!(
            "unit id {unit_id:?} is malformed"
        )))
    }
}

fn is_unit_id(value: &str) -> bool {
    (1..=UNIT_ID_MAX).contains(&value.len())
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'_' || byte == b'-')
}

fn is_orphan(path: &Path, keep: &BTreeSet<String>) -> bool {
    path.is_file()
        && path
            .extension()
            .is_some_and(|extension| extension == "json")
        && path
            .file_stem()
            .and_then(|stem| stem.to_str())
            .is_none_or(|stem| !keep.contains(stem))
}

#[cfg(test)]
#[path = "../../../test/features/scripting/files.test.rs"]
mod tests;
