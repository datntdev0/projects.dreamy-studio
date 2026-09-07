use crate::features::novel::files::CoverKind;
use crate::features::novel::files::read_first_cover;
use crate::features::novel::files::write_atomic;
use crate::features::project::models::ProjectError;
use crate::features::project::models::ProjectErrorCode;
use crate::features::project::models::ProjectResult;
use crate::shared::files::read_if_exists;
use crate::shared::files::remove_if_exists;
use serde::Serialize;
use serde::de::DeserializeOwned;
use std::fs;
use std::io::ErrorKind;
use std::path::Path;
use std::path::PathBuf;

pub const PROJECTS_DIR: &str = "projects";
const COVERS_DIR: &str = "project-covers";

#[derive(Debug, Clone)]
pub struct ProjectFiles {
    root: PathBuf,
}

impl ProjectFiles {
    pub fn new(root: PathBuf) -> Self {
        Self { root }
    }

    pub fn project_dir(&self, folder: &str) -> PathBuf {
        self.root.join(folder)
    }

    pub fn create_dir(&self, folder: &str) -> ProjectResult<()> {
        fs::create_dir_all(self.project_dir(folder))?;
        Ok(())
    }

    pub fn remove_dir(&self, folder: &str) -> ProjectResult<()> {
        match fs::remove_dir_all(self.project_dir(folder)) {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == ErrorKind::NotFound => Ok(()),
            Err(error) => Err(error.into()),
        }
    }

    pub fn write_cover(&self, id: i64, kind: CoverKind, bytes: &[u8]) -> ProjectResult<()> {
        fs::create_dir_all(self.root.join(COVERS_DIR))?;
        fs::write(self.cover_path(id, kind), bytes)?;
        for other in CoverKind::ALL {
            if other != kind {
                remove_if_exists(&self.cover_path(id, other))?;
            }
        }
        Ok(())
    }

    pub fn read_cover(&self, id: i64) -> ProjectResult<Option<(CoverKind, Vec<u8>)>> {
        Ok(read_first_cover(|kind| self.cover_path(id, kind))?)
    }

    pub fn clear_cover(&self, id: i64) -> ProjectResult<()> {
        for kind in CoverKind::ALL {
            remove_if_exists(&self.cover_path(id, kind))?;
        }
        Ok(())
    }

    fn cover_path(&self, id: i64, kind: CoverKind) -> PathBuf {
        self.root
            .join(COVERS_DIR)
            .join(format!("{id}.{}", kind.extension()))
    }
}

pub fn read_json<T: DeserializeOwned>(path: &Path) -> ProjectResult<Option<T>> {
    match read_if_exists(path)? {
        Some(bytes) => serde_json::from_slice(&bytes).map(Some).map_err(|error| {
            ProjectError::new(
                ProjectErrorCode::Io,
                format!("file {} is not valid: {error}", path.display()),
            )
        }),
        None => Ok(None),
    }
}

pub fn write_json<T: Serialize>(path: &Path, value: &T) -> ProjectResult<()> {
    let bytes = serde_json::to_vec_pretty(value).map_err(|error| {
        ProjectError::new(
            ProjectErrorCode::Io,
            format!("cannot encode {}: {error}", path.display()),
        )
    })?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    write_atomic(path, &bytes)?;
    Ok(())
}
