use flate2::read::GzDecoder;
use serde::Deserialize;
use serde::Serialize;
use std::fs;
use std::fs::File;
use std::io;
use std::path::Component;
use std::path::Path;
use std::path::PathBuf;
use std::process::Command;
use std::process::Stdio;

use crate::infra::startup::manifest::ArchiveFormat;
use crate::infra::startup::manifest::ManifestItem;
use crate::infra::startup::models::SetupError;
use crate::infra::startup::models::SetupErrorCode;
use crate::infra::startup::models::is_disk_full;
use crate::shared::config::AppConfig;
use crate::shared::process::failure_snippet;
use crate::shared::process::hide_window;

pub const MARKER_FILE: &str = ".dreamy-setup.json";
const STAGING_PREFIX: &str = ".staging-";
const RETIRED_PREFIX: &str = ".retired-";
const DLL_EXTENSION: &str = "dll";
const PIP_INSTALL_ARGS: [&str; 9] = [
    "-E",
    "-s",
    "-m",
    "pip",
    "install",
    "--disable-pip-version-check",
    "--no-cache-dir",
    "--no-warn-script-location",
    "--only-binary=:all:",
];

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct InstallMarker {
    pub version: String,
    pub build: String,
    #[serde(alias = "sha256")]
    pub digest: String,
    #[serde(default)]
    pub packages: Vec<String>,
}

impl InstallMarker {
    pub fn of(item: &ManifestItem) -> Self {
        Self {
            version: item.version.clone(),
            build: item.build.clone(),
            digest: item.digest().to_string(),
            packages: item.packages.clone(),
        }
    }
}

pub fn is_installed(item: &ManifestItem, config: &AppConfig) -> bool {
    let marker = item.install_dir(config).join(MARKER_FILE);
    let Ok(text) = fs::read_to_string(marker) else {
        return false;
    };
    let Ok(found) = serde_json::from_str::<InstallMarker>(&text) else {
        return false;
    };
    found == InstallMarker::of(item) && item.executable(config).is_file()
}

pub struct Installation<'a> {
    pub item: &'a ManifestItem,
    pub config: &'a AppConfig,
    pub extra_files: Option<&'a Path>,
}

impl Installation<'_> {
    pub fn install(&self, archive: &Path) -> Result<(), SetupError> {
        let group = self.item.group_dir(self.config);
        let staging = group.join(format!("{STAGING_PREFIX}{}", self.item.id));
        reset_dir(&staging).map_err(|error| SetupError::io(&error))?;
        let result = self.prepare(archive, &staging);
        if let Err(error) = result {
            let _ = fs::remove_dir_all(&staging);
            return Err(error);
        }
        self.swap(&staging)?;
        let _ = fs::remove_file(archive);
        Ok(())
    }

    fn prepare(&self, archive: &Path, staging: &Path) -> Result<(), SetupError> {
        extract(self.item, archive, staging).map_err(extract_error)?;
        if !staging.join(&self.item.entry).is_file() {
            return Err(SetupError::new(
                SetupErrorCode::Extract,
                format!("{} was not found in {}", self.item.entry, self.item.file),
            ));
        }
        if let Some(source) = self.extra_files {
            copy_libraries(source, staging).map_err(|error| SetupError::io(&error))?;
        }
        install_packages(self.item, staging)?;
        let marker = serde_json::to_string_pretty(&InstallMarker::of(self.item))
            .map_err(|error| SetupError::new(SetupErrorCode::Io, error.to_string()))?;
        fs::write(staging.join(MARKER_FILE), marker).map_err(|error| SetupError::io(&error))
    }

    fn swap(&self, staging: &Path) -> Result<(), SetupError> {
        let target = self.item.install_dir(self.config);
        let group = self.item.group_dir(self.config);
        let retired = group.join(format!("{RETIRED_PREFIX}{}", self.item.id));
        let _ = fs::remove_dir_all(&retired);
        if target.exists() {
            fs::rename(&target, &retired).map_err(|error| SetupError::io(&error))?;
        }
        fs::rename(staging, &target).map_err(|error| SetupError::io(&error))?;
        let _ = fs::remove_dir_all(&retired);
        Ok(())
    }
}

fn reset_dir(path: &Path) -> io::Result<()> {
    if path.exists() {
        fs::remove_dir_all(path)?;
    }
    fs::create_dir_all(path)
}

fn extract_error(error: io::Error) -> SetupError {
    if is_disk_full(&error) {
        SetupError::new(SetupErrorCode::DiskFull, error.to_string())
    } else {
        SetupError::new(SetupErrorCode::Extract, error.to_string())
    }
}

pub fn extract(item: &ManifestItem, archive: &Path, target: &Path) -> io::Result<()> {
    match item.format {
        ArchiveFormat::TarGz => extract_tar(item, archive, target),
        ArchiveFormat::Zip => extract_zip(item, archive, target),
        ArchiveFormat::Raw => copy_raw(item, archive, target),
    }
}

fn copy_raw(item: &ManifestItem, archive: &Path, target: &Path) -> io::Result<()> {
    let destination = target.join(&item.entry);
    create_parent(&destination)?;
    fs::copy(archive, destination).map(|_| ())
}

pub fn relative_target(item: &ManifestItem, name: &Path) -> Option<PathBuf> {
    let relative = name.strip_prefix(&item.root).ok()?;
    if relative.as_os_str().is_empty() {
        return None;
    }
    if !relative
        .components()
        .all(|component| matches!(component, Component::Normal(_)))
    {
        return None;
    }
    if item.include.is_empty() {
        return Some(relative.to_path_buf());
    }
    let file_name = relative.file_name()?.to_string_lossy();
    item.include
        .iter()
        .any(|included| included.eq_ignore_ascii_case(&file_name))
        .then(|| relative.to_path_buf())
}

fn extract_tar(item: &ManifestItem, archive: &Path, target: &Path) -> io::Result<()> {
    let mut tar = tar::Archive::new(GzDecoder::new(File::open(archive)?));
    for entry in tar.entries()? {
        let mut entry = entry?;
        let name = entry.path()?.into_owned();
        let Some(relative) = relative_target(item, &name) else {
            continue;
        };
        let destination = target.join(relative);
        let kind = entry.header().entry_type();
        if kind.is_dir() {
            fs::create_dir_all(&destination)?;
        } else if kind.is_file() {
            create_parent(&destination)?;
            entry.unpack(&destination)?;
        }
    }
    Ok(())
}

fn extract_zip(item: &ManifestItem, archive: &Path, target: &Path) -> io::Result<()> {
    let mut zip = zip::ZipArchive::new(File::open(archive)?).map_err(io::Error::other)?;
    for index in 0..zip.len() {
        let mut file = zip.by_index(index).map_err(io::Error::other)?;
        let Some(name) = file.enclosed_name() else {
            continue;
        };
        let Some(relative) = relative_target(item, &name) else {
            continue;
        };
        let destination = target.join(relative);
        if file.is_dir() {
            fs::create_dir_all(&destination)?;
            continue;
        }
        create_parent(&destination)?;
        io::copy(&mut file, &mut File::create(&destination)?)?;
    }
    Ok(())
}

fn create_parent(path: &Path) -> io::Result<()> {
    match path.parent() {
        Some(parent) => fs::create_dir_all(parent),
        None => Ok(()),
    }
}

fn copy_libraries(source: &Path, target: &Path) -> io::Result<()> {
    if !source.is_dir() {
        return Ok(());
    }
    for entry in fs::read_dir(source)? {
        let path = entry?.path();
        let is_library = path
            .extension()
            .is_some_and(|extension| extension.eq_ignore_ascii_case(DLL_EXTENSION));
        if is_library && let Some(name) = path.file_name() {
            fs::copy(&path, target.join(name))?;
        }
    }
    Ok(())
}

fn install_packages(item: &ManifestItem, staging: &Path) -> Result<(), SetupError> {
    if item.packages.is_empty() {
        return Ok(());
    }
    let mut command = Command::new(staging.join(&item.entry));
    command
        .args(PIP_INSTALL_ARGS)
        .args(&item.packages)
        .stdin(Stdio::null());
    hide_window(&mut command);
    let output = command.output().map_err(|error| SetupError::io(&error))?;
    if output.status.success() {
        return Ok(());
    }
    let detail = failure_snippet(
        &String::from_utf8_lossy(&output.stdout),
        &String::from_utf8_lossy(&output.stderr),
    );
    Err(SetupError::new(
        SetupErrorCode::Network,
        format!("installing {} failed: {detail}", item.packages.join(", ")),
    ))
}
