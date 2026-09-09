use sha2::Digest;
use sha2::Sha256;
use sha2::Sha512;
use std::fs;
use std::fs::File;
use std::fs::OpenOptions;
use std::io::Read;
use std::io::Write;
use std::path::Path;
use std::path::PathBuf;
use std::sync::atomic::AtomicBool;
use std::sync::atomic::Ordering;
use std::time::Duration;
use ureq::Agent;
use ureq::Body;
use ureq::http::Response;

use crate::infra::startup::manifest::HashAlgorithm;
use crate::infra::startup::manifest::ManifestItem;
use crate::infra::startup::models::SetupError;
use crate::infra::startup::models::SetupErrorCode;

const CHUNK_SIZE: usize = 64 * 1024;
const CONNECT_TIMEOUT: Duration = Duration::from_secs(15);
const RESPONSE_TIMEOUT: Duration = Duration::from_secs(30);
const PART_SUFFIX: &str = ".part";
const USER_AGENT: &str = "DreamyStudio-Setup";
const STATUS_OK: u16 = 200;
const STATUS_PARTIAL: u16 = 206;
const STATUS_RANGE_INVALID: u16 = 416;

#[derive(Debug, PartialEq, Eq)]
pub enum FetchStop {
    Cancelled,
    Failed(SetupError),
}

pub struct Fetch<'a> {
    pub item: &'a ManifestItem,
    pub directory: &'a Path,
    pub cancel: &'a AtomicBool,
}

impl Fetch<'_> {
    pub fn archive(&self) -> PathBuf {
        self.directory.join(&self.item.file)
    }

    pub fn part(&self) -> PathBuf {
        self.directory
            .join(format!("{}{PART_SUFFIX}", self.item.file))
    }

    pub fn received(&self) -> u64 {
        if self.archive().is_file() {
            return self.item.size;
        }
        file_len(&self.part())
    }

    pub fn download(&self, progress: &mut dyn FnMut(u64)) -> Result<(), FetchStop> {
        if self.archive().is_file() {
            return Ok(());
        }
        fs::create_dir_all(self.directory).map_err(|error| failed(SetupError::io(&error)))?;
        let mut last = None;
        for url in &self.item.urls {
            match self.download_from(url, progress) {
                Ok(()) => return Ok(()),
                Err(FetchStop::Cancelled) => return Err(FetchStop::Cancelled),
                Err(FetchStop::Failed(error)) => last = Some(error),
            }
        }
        Err(failed(last.unwrap_or_else(no_source)))
    }

    pub fn verify(&self) -> Result<PathBuf, SetupError> {
        let archive = self.archive();
        let source = if archive.is_file() {
            archive.clone()
        } else {
            self.part()
        };
        let algorithm = self.item.algorithm();
        let digest = hash_file(&source, algorithm).map_err(|error| SetupError::io(&error))?;
        if !digest.eq_ignore_ascii_case(self.item.digest()) {
            let _ = fs::remove_file(&source);
            return Err(SetupError::new(
                SetupErrorCode::Checksum,
                format!("{} has {algorithm:?} {digest}", self.item.file),
            ));
        }
        if source != archive {
            fs::rename(&source, &archive).map_err(|error| SetupError::io(&error))?;
        }
        Ok(archive)
    }

    fn download_from(&self, url: &str, progress: &mut dyn FnMut(u64)) -> Result<(), FetchStop> {
        let part = self.part();
        let offset = file_len(&part);
        if offset >= self.item.size {
            return Ok(());
        }
        let response =
            request(url, offset).map_err(|error| failed(connection_error(error, offset)))?;
        let status = response.status().as_u16();
        let (file, start) = match status {
            STATUS_PARTIAL => (open_part(&part, true)?, offset),
            STATUS_OK => (open_part(&part, false)?, 0),
            STATUS_RANGE_INVALID => {
                let _ = fs::remove_file(&part);
                return Err(failed(network(format!("{url} rejected the resume range"))));
            }
            other => return Err(failed(network(format!("{url} answered HTTP {other}")))),
        };
        self.stream(response, file, start, progress)
    }

    fn stream(
        &self,
        response: Response<Body>,
        mut file: File,
        start: u64,
        progress: &mut dyn FnMut(u64),
    ) -> Result<(), FetchStop> {
        let mut reader = response
            .into_body()
            .into_with_config()
            .limit(u64::MAX)
            .reader();
        let mut received = start;
        let mut buffer = vec![0u8; CHUNK_SIZE];
        loop {
            if self.cancel.load(Ordering::SeqCst) {
                return Err(FetchStop::Cancelled);
            }
            let count = reader
                .read(&mut buffer)
                .map_err(|error| failed(network(error.to_string())))?;
            if count == 0 {
                break;
            }
            file.write_all(&buffer[..count])
                .map_err(|error| failed(SetupError::io(&error)))?;
            received += count as u64;
            progress(received);
        }
        file.flush()
            .map_err(|error| failed(SetupError::io(&error)))?;
        if received < self.item.size {
            return Err(failed(network(format!(
                "download ended early at {received} of {} bytes",
                self.item.size
            ))));
        }
        Ok(())
    }
}

fn request(url: &str, offset: u64) -> Result<Response<Body>, ureq::Error> {
    let config = Agent::config_builder()
        .timeout_connect(Some(CONNECT_TIMEOUT))
        .timeout_recv_response(Some(RESPONSE_TIMEOUT))
        .http_status_as_error(false)
        .user_agent(USER_AGENT)
        .build();
    let agent = Agent::new_with_config(config);
    let mut builder = agent.get(url);
    if offset > 0 {
        builder = builder.header("Range", format!("bytes={offset}-"));
    }
    builder.call()
}

fn open_part(path: &Path, append: bool) -> Result<File, FetchStop> {
    let mut options = OpenOptions::new();
    options.create(true).write(true);
    if append {
        options.append(true);
    } else {
        options.truncate(true);
    }
    options
        .open(path)
        .map_err(|error| failed(SetupError::io(&error)))
}

fn connection_error(error: ureq::Error, offset: u64) -> SetupError {
    let unreachable = matches!(
        error,
        ureq::Error::HostNotFound | ureq::Error::ConnectionFailed | ureq::Error::Timeout(_)
    );
    let code = if unreachable && offset == 0 {
        SetupErrorCode::Offline
    } else {
        SetupErrorCode::Network
    };
    SetupError::new(code, error.to_string())
}

fn network(detail: String) -> SetupError {
    SetupError::new(SetupErrorCode::Network, detail)
}

fn no_source() -> SetupError {
    network("no download url is configured".to_string())
}

fn failed(error: SetupError) -> FetchStop {
    FetchStop::Failed(error)
}

fn file_len(path: &Path) -> u64 {
    fs::metadata(path)
        .map(|metadata| metadata.len())
        .unwrap_or(0)
}

pub fn hash_file(path: &Path, algorithm: HashAlgorithm) -> std::io::Result<String> {
    match algorithm {
        HashAlgorithm::Sha256 => digest_file::<Sha256>(path),
        HashAlgorithm::Sha512 => digest_file::<Sha512>(path),
    }
}

fn digest_file<D: Digest>(path: &Path) -> std::io::Result<String> {
    let mut file = File::open(path)?;
    let mut hasher = D::new();
    let mut buffer = vec![0u8; CHUNK_SIZE];
    loop {
        let count = file.read(&mut buffer)?;
        if count == 0 {
            break;
        }
        hasher.update(&buffer[..count]);
    }
    Ok(hasher
        .finalize()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect())
}
