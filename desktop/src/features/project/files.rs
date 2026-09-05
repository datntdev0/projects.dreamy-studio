use crate::features::novel::files::CoverKind;
use crate::features::novel::files::read_first_cover;
use crate::features::novel::files::write_atomic;
use crate::features::project::models::DirEntry;
use crate::features::project::models::ProjectError;
use crate::features::project::models::ProjectErrorCode;
use crate::features::project::models::ProjectResult;
use crate::shared::files::read_if_exists;
use crate::shared::files::remove_if_exists;
use serde::Serialize;
use serde::de::DeserializeOwned;
use std::fs;
use std::io::ErrorKind;
use std::path::Component;
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

    pub fn list(&self, folder: &str, relative: &str) -> ProjectResult<Vec<DirEntry>> {
        let base = self.project_dir(folder);
        let requested = Path::new(relative);
        if requested.is_absolute()
            || requested.components().any(|part| {
                matches!(
                    part,
                    Component::ParentDir | Component::RootDir | Component::Prefix(_)
                )
            })
        {
            return Err(path_error(
                "directory path must stay inside the project folder",
            ));
        }
        if relative.is_empty() || relative == "." {
            let metadata = match base.symlink_metadata() {
                Ok(metadata) => metadata,
                Err(error) if error.kind() == ErrorKind::NotFound => return Ok(Vec::new()),
                Err(error) => return Err(error.into()),
            };
            if metadata.file_type().is_symlink() {
                return Err(path_error("project folder must not be a symlink"));
            }
            let canonical_base = base.canonicalize()?;
            return read_entries(&canonical_base);
        }
        let base_metadata = base
            .symlink_metadata()
            .map_err(|_| path_error("project folder does not exist"))?;
        if base_metadata.file_type().is_symlink() {
            return Err(path_error("project folder must not be a symlink"));
        }
        let canonical_base = base.canonicalize()?;
        let mut target = base.clone();
        for component in requested.components() {
            if let Component::Normal(part) = component {
                target.push(part);
                let metadata = target
                    .symlink_metadata()
                    .map_err(|_| path_error("directory path is invalid"))?;
                if metadata.file_type().is_symlink() {
                    return Err(path_error("symlinks cannot be followed"));
                }
                let canonical = target
                    .canonicalize()
                    .map_err(|_| path_error("directory path is invalid"))?;
                if !canonical.starts_with(&canonical_base) {
                    return Err(path_error("directory path escapes the project folder"));
                }
            }
        }
        let canonical_target = target
            .canonicalize()
            .map_err(|_| path_error("directory path is invalid"))?;
        if !canonical_target.is_dir() {
            return Err(path_error("path is not a directory"));
        }
        read_entries(&canonical_target)
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

fn read_entries(path: &Path) -> ProjectResult<Vec<DirEntry>> {
    let mut entries = Vec::new();
    for item in fs::read_dir(path)? {
        let item = item?;
        let kind = item.file_type()?;
        let metadata = item.path().symlink_metadata()?;
        entries.push(DirEntry {
            name: item.file_name().to_string_lossy().into_owned(),
            kind: if kind.is_dir() { "dir" } else { "file" }.to_string(),
            size: if kind.is_symlink() || kind.is_dir() {
                0
            } else {
                metadata.len()
            },
        });
    }
    entries.sort_by(|left, right| {
        (left.kind != "dir")
            .cmp(&(right.kind != "dir"))
            .then_with(|| left.name.to_lowercase().cmp(&right.name.to_lowercase()))
    });
    Ok(entries)
}

fn path_error(detail: &str) -> ProjectError {
    ProjectError::new(ProjectErrorCode::PathInvalid, detail)
}
