use crate::features::library::assets;
use crate::features::library::collections;
use crate::features::library::images;
use crate::features::library::images::ImageFiles;
use crate::features::library::images::ImageFormat;
use crate::features::library::images::NewImage;
use crate::features::library::models::AssetCheck;
use crate::features::library::models::AssetCheckStatus;
use crate::features::library::models::AssetPatch;
use crate::features::library::models::AssetUploadInput;
use crate::features::library::models::CollectionInput;
use crate::features::library::models::CollectionPatch;
use crate::features::library::models::LibraryCollection;
use crate::features::library::models::LibraryError;
use crate::features::library::models::LibraryErrorCode;
use crate::features::library::models::LibraryImage;
use crate::features::library::models::LibraryPrompt;
use crate::features::library::models::LibraryResult;
use crate::features::library::models::LibrarySound;
use crate::features::library::models::LibrarySummary;
use crate::features::library::models::LibraryTag;
use crate::features::library::models::LibraryVideo;
use crate::features::library::models::PromptCreateInput;
use crate::features::library::models::PromptKind;
use crate::features::library::models::PromptPatch;
use crate::features::library::models::StreamChunk;
use crate::features::library::models::StreamKind;
use crate::features::library::prompts;
use crate::features::library::prompts::NewPrompt;
use crate::features::library::prompts::PromptFiles;
use crate::features::library::sounds;
use crate::features::library::sounds::NewSound;
use crate::features::library::sounds::SoundFiles;
use crate::features::library::sounds::SoundFormat;
use crate::features::library::video_probe;
use crate::features::library::videos;
use crate::features::library::videos::NewVideo;
use crate::features::library::videos::VideoFiles;
use crate::features::workspace::inspector::WORKSPACE_DB_FILE;
use crate::features::workspace::repository::format_timestamp;
use crate::features::workspace::session::WorkspaceSession;
use crate::infra::storage::database::Database;
use base64::Engine;
use chrono::Utc;
use rusqlite::TransactionBehavior;
use std::fs;
use std::path::Path;
use std::path::PathBuf;
use std::sync::Arc;
use std::sync::Mutex;

#[derive(Debug, Clone, Default)]
pub struct LibraryService {
    gate: Arc<Mutex<()>>,
}

impl LibraryService {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn open(&self, session: &WorkspaceSession) -> LibraryResult<LibraryWorkspace> {
        match session.current() {
            Some(current) => Ok(LibraryWorkspace::with_gate(
                PathBuf::from(current.path),
                self.gate.clone(),
            )),
            None => Err(LibraryError::new(
                LibraryErrorCode::NoWorkspace,
                "no workspace is open",
            )),
        }
    }
}

#[derive(Debug, Clone)]
pub struct LibraryWorkspace {
    dir: PathBuf,
    gate: Arc<Mutex<()>>,
}

impl LibraryWorkspace {
    #[cfg(test)]
    fn new(dir: PathBuf) -> Self {
        Self::with_gate(dir, Arc::new(Mutex::new(())))
    }

    pub fn with_gate(dir: PathBuf, gate: Arc<Mutex<()>>) -> Self {
        Self { dir, gate }
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, ()> {
        match self.gate.lock() {
            Ok(guard) => guard,
            Err(poisoned) => poisoned.into_inner(),
        }
    }

    pub fn database(&self) -> LibraryResult<Database> {
        Ok(Database::open_read_write(
            &self.dir.join(WORKSPACE_DB_FILE),
        )?)
    }

    pub fn summary(&self) -> LibraryResult<LibrarySummary> {
        let db = self.database()?;
        let (assets, unfiled) = collections::summary(&db, collections::ASSET_TABLES)?;
        Ok(LibrarySummary { assets, unfiled })
    }

    pub fn collection_list(&self) -> LibraryResult<Vec<LibraryCollection>> {
        collections::list(&self.database()?, collections::ASSET_TABLES)
    }

    pub fn collection_create(&self, input: CollectionInput) -> LibraryResult<LibraryCollection> {
        let _guard = self.lock();
        collections::create(&mut self.database()?, input, collections::ASSET_TABLES)
    }

    pub fn collection_update(
        &self,
        id: i64,
        patch: CollectionPatch,
    ) -> LibraryResult<LibraryCollection> {
        let _guard = self.lock();
        collections::update(&mut self.database()?, id, patch, collections::ASSET_TABLES)
    }

    pub fn collection_delete(&self, id: i64) -> LibraryResult<i64> {
        let _guard = self.lock();
        collections::delete(&mut self.database()?, id, collections::ASSET_TABLES)
    }

    pub fn tag_list(&self) -> LibraryResult<Vec<LibraryTag>> {
        crate::features::library::tags::list(&self.database()?)
    }

    pub fn tag_rename(&self, from: &str, to: &str) -> LibraryResult<LibraryTag> {
        let _guard = self.lock();
        crate::features::library::tags::rename(&mut self.database()?, from, to)
    }

    pub fn tag_merge(&self, from: &str, into: &str) -> LibraryResult<LibraryTag> {
        let _guard = self.lock();
        crate::features::library::tags::merge(&mut self.database()?, from, into)
    }

    pub fn tag_delete(&self, tag: &str) -> LibraryResult<i64> {
        let _guard = self.lock();
        crate::features::library::tags::delete(&mut self.database()?, tag)
    }

    pub fn image_inspect(&self, paths: &[String]) -> LibraryResult<Vec<AssetCheck>> {
        let db = self.database()?;
        paths
            .iter()
            .map(|path| inspect_image(db.connection(), path))
            .collect()
    }

    pub fn image_upload(&self, path: &str, input: AssetUploadInput) -> LibraryResult<LibraryImage> {
        let _guard = self.lock();
        let source = Path::new(path);
        let metadata = fs::metadata(source)?;
        let size = metadata.len();
        let format = image_format(source)?;
        if size == 0 {
            return Err(LibraryError::new(
                LibraryErrorCode::ImageUnreadable,
                "image file is empty",
            ));
        }
        if size > images::IMAGE_MAX_BYTES as u64 {
            return Err(LibraryError::new(
                LibraryErrorCode::ImageTooLarge,
                "image file exceeds 25 MiB",
            ));
        }
        let bytes = fs::read(source)?;
        let (width, height) = images::probe(&bytes, format)?;
        let name = image_name(source)?;
        let mut db = self.database()?;
        let tx = db
            .connection_mut()
            .transaction_with_behavior(TransactionBehavior::Immediate)?;
        let name = images::unique_name(&tx, &name, None)?;
        let image = NewImage {
            name,
            ext: format.extension().to_string(),
            size: size as i64,
            width,
            height,
            rights: input.rights,
            collection_id: input.collection_id,
            tags: input.tags,
        };
        let id = images::insert(&tx, &image, &format_timestamp(Utc::now()))?;
        let files = ImageFiles::new(self.dir.clone());
        if let Err(error) = files.write_original(id, format, &bytes) {
            let _ = files.remove(id, format);
            return Err(error);
        }
        if let Err(error) = files.write_thumb(id, format, &bytes) {
            let _ = files.remove(id, format);
            return Err(error);
        }
        if let Err(error) = tx.commit() {
            let _ = files.remove(id, format);
            return Err(error.into());
        }
        images::get(db.connection(), id)
    }

    pub fn image_list(&self) -> LibraryResult<Vec<LibraryImage>> {
        images::list(self.database()?.connection())
    }

    pub fn image_update(&self, id: i64, patch: AssetPatch) -> LibraryResult<LibraryImage> {
        let _guard = self.lock();
        let mut db = self.database()?;
        let tx = db
            .connection_mut()
            .transaction_with_behavior(TransactionBehavior::Immediate)?;
        let image = images::update(&tx, id, &patch, &format_timestamp(Utc::now()))?;
        tx.commit()?;
        Ok(image)
    }

    pub fn image_delete(&self, ids: &[i64]) -> LibraryResult<usize> {
        let _guard = self.lock();
        let mut db = self.database()?;
        let tx = db
            .connection_mut()
            .transaction_with_behavior(TransactionBehavior::Immediate)?;
        let deleted = images::delete(&tx, ids)?;
        tx.commit()?;
        let files = ImageFiles::new(self.dir.clone());
        for (id, ext) in &deleted {
            if let Some(format) = ImageFormat::from_extension(ext) {
                let _ = files.remove(*id, format);
            }
        }
        Ok(deleted.len())
    }

    pub fn image_thumb(&self, id: i64) -> LibraryResult<String> {
        let _guard = self.lock();
        let image = images::get(self.database()?.connection(), id)?;
        let format = image_format_from_extension(&image.ext)?;
        let bytes = ImageFiles::new(self.dir.clone()).read_thumb(id, format)?;
        Ok(images::data_url(thumb_mime(format), &bytes))
    }

    pub fn image_read(&self, id: i64) -> LibraryResult<String> {
        let image = images::get(self.database()?.connection(), id)?;
        let format = image_format_from_extension(&image.ext)?;
        let bytes = ImageFiles::new(self.dir.clone()).read_original(id, format)?;
        Ok(images::data_url(format.mime(), &bytes))
    }

    pub fn sound_inspect(&self, paths: &[String]) -> LibraryResult<Vec<AssetCheck>> {
        let db = self.database()?;
        paths
            .iter()
            .map(|path| inspect_sound(db.connection(), path))
            .collect()
    }

    pub fn sound_upload(&self, path: &str, input: AssetUploadInput) -> LibraryResult<LibrarySound> {
        let source = Path::new(path);
        let metadata = fs::metadata(source)?;
        let size = metadata.len();
        let format = sound_format(source)?;
        if size == 0 {
            return Err(LibraryError::new(
                LibraryErrorCode::SoundUnreadable,
                "sound file is empty",
            ));
        }
        if size > sounds::SOUND_MAX_BYTES as u64 {
            return Err(LibraryError::new(
                LibraryErrorCode::SoundTooLarge,
                "sound file exceeds 200 MiB",
            ));
        }
        let analysis = sounds::analyze(source, format)?;
        let name = assets::file_name(source)?;
        let _guard = self.lock();
        let mut db = self.database()?;
        let tx = db
            .connection_mut()
            .transaction_with_behavior(TransactionBehavior::Immediate)?;
        let name = sounds::unique_name(&tx, &name, None)?;
        let sound = NewSound {
            name,
            ext: format.extension().to_string(),
            size: size as i64,
            duration_ms: analysis.duration_ms,
            sample_rate: analysis.sample_rate,
            channels: analysis.channels,
            peaks: analysis.peaks,
            overview: analysis.overview,
            rights: input.rights,
            collection_id: input.collection_id,
            tags: input.tags,
        };
        let id = sounds::insert(&tx, &sound, &format_timestamp(Utc::now()))?;
        let files = SoundFiles::new(self.dir.clone());
        if let Err(error) = files.write_original(id, format, source) {
            let _ = files.remove(id, format);
            return Err(error);
        }
        if let Err(error) = tx.commit() {
            let _ = files.remove(id, format);
            return Err(error.into());
        }
        sounds::get(db.connection(), id)
    }

    pub fn sound_list(&self) -> LibraryResult<Vec<LibrarySound>> {
        sounds::list(self.database()?.connection())
    }

    pub fn sound_update(&self, id: i64, patch: AssetPatch) -> LibraryResult<LibrarySound> {
        let _guard = self.lock();
        let mut db = self.database()?;
        let tx = db
            .connection_mut()
            .transaction_with_behavior(TransactionBehavior::Immediate)?;
        let sound = sounds::update(&tx, id, &patch, &format_timestamp(Utc::now()))?;
        tx.commit()?;
        Ok(sound)
    }

    pub fn sound_delete(&self, ids: &[i64]) -> LibraryResult<usize> {
        let _guard = self.lock();
        let mut db = self.database()?;
        let tx = db
            .connection_mut()
            .transaction_with_behavior(TransactionBehavior::Immediate)?;
        let deleted = sounds::delete(&tx, ids)?;
        tx.commit()?;
        let files = SoundFiles::new(self.dir.clone());
        for (id, ext) in &deleted {
            if let Some(format) = SoundFormat::from_extension(ext) {
                let _ = files.remove(*id, format);
            }
        }
        Ok(deleted.len())
    }

    pub fn sound_peaks(&self, id: i64) -> LibraryResult<String> {
        Ok(base64::engine::general_purpose::STANDARD
            .encode(sounds::peaks(self.database()?.connection(), id)?))
    }

    pub fn prompt_inspect(&self, paths: &[String]) -> LibraryResult<Vec<AssetCheck>> {
        let db = self.database()?;
        paths
            .iter()
            .map(|path| inspect_prompt(db.connection(), path))
            .collect()
    }

    pub fn prompt_upload(
        &self,
        path: &str,
        input: AssetUploadInput,
    ) -> LibraryResult<LibraryPrompt> {
        let source = Path::new(path);
        let metadata = fs::metadata(source)?;
        let size = metadata.len();
        prompt_extension(source)?;
        if size == 0 {
            return Err(LibraryError::new(
                LibraryErrorCode::PromptEmpty,
                "prompt file is empty",
            ));
        }
        if size > prompts::PROMPT_MAX_BYTES as u64 {
            return Err(LibraryError::new(
                LibraryErrorCode::PromptTooLarge,
                "prompt file exceeds 256 KiB",
            ));
        }
        let text = prompts::decode_file(&fs::read(source)?)?;
        let name = prompts::normalize_name(&prompts::name_from_file(&assets::file_name(source)?))?;
        self.prompt_insert(NewPrompt {
            name,
            kind: PromptKind::General,
            text,
            rights: input.rights,
            origin: "upload",
            collection_id: input.collection_id,
            tags: input.tags,
        })
    }

    pub fn prompt_create(&self, input: PromptCreateInput) -> LibraryResult<LibraryPrompt> {
        self.prompt_insert(NewPrompt {
            name: prompts::normalize_name(&input.name)?,
            kind: input.kind,
            text: prompts::normalize_text(&input.text)?,
            rights: input.rights,
            origin: "app",
            collection_id: input.collection_id,
            tags: input.tags,
        })
    }

    fn prompt_insert(&self, mut prompt: NewPrompt) -> LibraryResult<LibraryPrompt> {
        let _guard = self.lock();
        let files = PromptFiles::new(self.dir.clone());
        let mut db = self.database()?;
        let tx = db
            .connection_mut()
            .transaction_with_behavior(TransactionBehavior::Immediate)?;
        prompt.name = prompts::unique_name(&tx, &prompt.name, None)?;
        let id = prompts::insert(&tx, &prompt, &format_timestamp(Utc::now()))?;
        if let Err(error) = files.write(id, &prompt.text) {
            let _ = files.remove(id);
            return Err(error);
        }
        if let Err(error) = tx.commit() {
            let _ = files.remove(id);
            return Err(error.into());
        }
        prompts::get(db.connection(), &files, id)
    }

    pub fn prompt_list(&self) -> LibraryResult<Vec<LibraryPrompt>> {
        prompts::list(
            self.database()?.connection(),
            &PromptFiles::new(self.dir.clone()),
        )
    }

    pub fn prompt_update(&self, id: i64, patch: PromptPatch) -> LibraryResult<LibraryPrompt> {
        let patch = prompts::normalize_patch(&patch)?;
        let _guard = self.lock();
        let files = PromptFiles::new(self.dir.clone());
        let mut db = self.database()?;
        let previous = if patch.text.is_some() {
            Some(prompts::get(db.connection(), &files, id)?.text)
        } else {
            None
        };
        let tx = db
            .connection_mut()
            .transaction_with_behavior(TransactionBehavior::Immediate)?;
        prompts::update(&tx, id, &patch, &format_timestamp(Utc::now()))?;
        if let Some(text) = patch.text.as_deref() {
            if let Err(error) = files.write(id, text) {
                if let Some(previous) = previous.as_deref() {
                    let _ = files.write(id, previous);
                }
                return Err(error);
            }
        }
        if let Err(error) = tx.commit() {
            if let Some(previous) = previous.as_deref() {
                let _ = files.write(id, previous);
            }
            return Err(error.into());
        }
        prompts::get(db.connection(), &files, id)
    }

    pub fn prompt_delete(&self, ids: &[i64]) -> LibraryResult<usize> {
        let _guard = self.lock();
        let mut db = self.database()?;
        let tx = db
            .connection_mut()
            .transaction_with_behavior(TransactionBehavior::Immediate)?;
        let deleted = prompts::delete(&tx, ids)?;
        tx.commit()?;
        let files = PromptFiles::new(self.dir.clone());
        for id in &deleted {
            let _ = files.remove(*id);
        }
        Ok(deleted.len())
    }

    pub fn video_inspect(&self, paths: &[String]) -> LibraryResult<Vec<AssetCheck>> {
        let db = self.database()?;
        paths
            .iter()
            .map(|path| inspect_video(db.connection(), path))
            .collect()
    }

    pub fn video_upload(&self, path: &str, input: AssetUploadInput) -> LibraryResult<LibraryVideo> {
        let source = Path::new(path);
        let metadata = fs::metadata(source)?;
        let size = metadata.len();
        let format = video_format(source)?;
        if size == 0 {
            return Err(LibraryError::new(
                LibraryErrorCode::VideoUnreadable,
                "video file is empty",
            ));
        }
        if size > videos::VIDEO_MAX_BYTES {
            return Err(LibraryError::new(
                LibraryErrorCode::VideoTooLarge,
                "video file exceeds 2 GiB",
            ));
        }
        let info = video_probe::probe(source, format)?;
        let name = assets::file_name(source)?;
        let files = VideoFiles::new(self.dir.clone());
        let staged = files.stage(source)?;
        let _guard = self.lock();
        let result = (|| -> LibraryResult<LibraryVideo> {
            let mut db = self.database()?;
            let tx = db
                .connection_mut()
                .transaction_with_behavior(TransactionBehavior::Immediate)?;
            let name = videos::unique_name(&tx, &name, None)?;
            let id = videos::insert(
                &tx,
                &NewVideo {
                    name,
                    ext: format.extension().to_string(),
                    size: size as i64,
                    duration_ms: info.duration_ms,
                    width: info.width,
                    height: info.height,
                    fps: info.fps,
                    rights: input.rights,
                    collection_id: input.collection_id,
                    tags: input.tags,
                },
                &format_timestamp(Utc::now()),
            )?;
            files.commit(&staged, id, format)?;
            tx.commit()?;
            videos::get(db.connection(), id)
        })();
        if result.is_err() {
            let _ = files.discard(&staged);
        }
        result
    }

    pub fn video_list(&self) -> LibraryResult<Vec<LibraryVideo>> {
        videos::list(self.database()?.connection())
    }

    pub fn video_update(&self, id: i64, patch: AssetPatch) -> LibraryResult<LibraryVideo> {
        let _guard = self.lock();
        let mut db = self.database()?;
        let tx = db
            .connection_mut()
            .transaction_with_behavior(TransactionBehavior::Immediate)?;
        let video = videos::update(&tx, id, &patch, &format_timestamp(Utc::now()))?;
        tx.commit()?;
        Ok(video)
    }

    pub fn video_delete(&self, ids: &[i64]) -> LibraryResult<usize> {
        let _guard = self.lock();
        let mut db = self.database()?;
        let tx = db
            .connection_mut()
            .transaction_with_behavior(TransactionBehavior::Immediate)?;
        let deleted = videos::delete(&tx, ids)?;
        tx.commit()?;
        let files = VideoFiles::new(self.dir.clone());
        for (id, ext) in &deleted {
            if let Some(format) = video_probe::VideoFormat::from_extension(ext) {
                let _ = files.remove(*id, format);
            }
        }
        Ok(deleted.len())
    }

    pub fn video_poster(&self, id: i64) -> LibraryResult<Option<String>> {
        videos::get(self.database()?.connection(), id)?;
        Ok(VideoFiles::new(self.dir.clone())
            .read_poster(id)?
            .map(|bytes| assets::data_url("image/jpeg", &bytes)))
    }

    pub fn video_poster_set(&self, id: i64, data: &str) -> LibraryResult<()> {
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(data)
            .map_err(|error| {
                LibraryError::new(LibraryErrorCode::InvalidInput, error.to_string())
            })?;
        let _guard = self.lock();
        videos::get(self.database()?.connection(), id)?;
        let files = VideoFiles::new(self.dir.clone());
        files.write_poster(id, &bytes)?;
        videos::mark_poster(self.database()?.connection(), id)
    }

    pub fn stream(
        &self,
        kind: StreamKind,
        id: i64,
        range: Option<(u64, Option<u64>)>,
    ) -> LibraryResult<StreamChunk> {
        let (mime, total, read): (String, u64, Box<dyn Fn(u64, u64) -> LibraryResult<Vec<u8>>>) =
            match kind {
                StreamKind::Sound => {
                    let sound = sounds::get(self.database()?.connection(), id)?;
                    let format = sound_format_from_extension(&sound.ext)?;
                    let files = SoundFiles::new(self.dir.clone());
                    let total = files.len(id, format)?;
                    (
                        format.mime().to_string(),
                        total,
                        Box::new(move |start, len| files.read_range(id, format, start, len)),
                    )
                }
                StreamKind::Video => {
                    let video = videos::get(self.database()?.connection(), id)?;
                    let format = video_format_from_extension(&video.ext)?;
                    let files = VideoFiles::new(self.dir.clone());
                    let total = files.len(id, format)?;
                    (
                        format.mime().to_string(),
                        total,
                        Box::new(move |start, len| files.read_range(id, format, start, len)),
                    )
                }
            };
        if total == 0 {
            return Err(LibraryError::new(
                LibraryErrorCode::InvalidInput,
                "stream file is empty",
            ));
        }
        let (start, requested_end) = range.unwrap_or((0, None));
        if start >= total {
            return Err(LibraryError::new(
                LibraryErrorCode::InvalidInput,
                "stream range starts after the end of the file",
            ));
        }
        let end = requested_end
            .unwrap_or(total - 1)
            .min(total - 1)
            .min(start + kind.max_chunk() - 1);
        if end < start {
            return Err(LibraryError::new(
                LibraryErrorCode::InvalidInput,
                "stream range ends before it starts",
            ));
        }
        let bytes = read(start, end - start + 1)?;
        Ok(StreamChunk {
            mime,
            total,
            start,
            end,
            bytes,
        })
    }
}

fn inspect_image(conn: &rusqlite::Connection, path: &str) -> LibraryResult<AssetCheck> {
    let source = Path::new(path);
    let name = source
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or(path)
        .to_string();
    let metadata = match fs::metadata(source) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok(image_check(
                path,
                name,
                0,
                AssetCheckStatus::Error,
                "not_found",
            ));
        }
        Err(error) => return Err(error.into()),
    };
    let size = metadata.len() as i64;
    if size == 0 {
        return Ok(image_check(
            path,
            name,
            size,
            AssetCheckStatus::Error,
            "empty",
        ));
    }
    if image_format(source).is_err() {
        return Ok(image_check(
            path,
            name,
            size,
            AssetCheckStatus::Error,
            "unsupported",
        ));
    }
    if metadata.len() > images::IMAGE_MAX_BYTES as u64 {
        return Ok(image_check(
            path,
            name,
            size,
            AssetCheckStatus::Error,
            "too_large",
        ));
    }
    if images::unique_name(conn, &name, None)? != name {
        return Ok(image_check(
            path,
            name,
            size,
            AssetCheckStatus::Warn,
            "duplicate_name",
        ));
    }
    Ok(image_check(path, name, size, AssetCheckStatus::Ok, ""))
}

fn image_check(
    path: &str,
    name: String,
    size: i64,
    status: AssetCheckStatus,
    code: &str,
) -> AssetCheck {
    AssetCheck {
        path: path.to_string(),
        name,
        size,
        status,
        code: (!code.is_empty()).then(|| code.to_string()),
    }
}

fn inspect_sound(conn: &rusqlite::Connection, path: &str) -> LibraryResult<AssetCheck> {
    let source = Path::new(path);
    let name = source
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or(path)
        .to_string();
    let metadata = match fs::metadata(source) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok(assets::check(
                path,
                name,
                0,
                AssetCheckStatus::Error,
                "not_found",
            ));
        }
        Err(error) => return Err(error.into()),
    };
    let size = metadata.len() as i64;
    if size == 0 {
        return Ok(assets::check(
            path,
            name,
            size,
            AssetCheckStatus::Error,
            "empty",
        ));
    }
    if sound_format(source).is_err() {
        return Ok(assets::check(
            path,
            name,
            size,
            AssetCheckStatus::Error,
            "unsupported",
        ));
    }
    if metadata.len() > sounds::SOUND_MAX_BYTES as u64 {
        return Ok(assets::check(
            path,
            name,
            size,
            AssetCheckStatus::Error,
            "too_large",
        ));
    }
    if sounds::unique_name(conn, &name, None)? != name {
        return Ok(assets::check(
            path,
            name,
            size,
            AssetCheckStatus::Warn,
            "duplicate_name",
        ));
    }
    Ok(assets::check(path, name, size, AssetCheckStatus::Ok, ""))
}

fn inspect_video(conn: &rusqlite::Connection, path: &str) -> LibraryResult<AssetCheck> {
    let source = Path::new(path);
    let name = source
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or(path)
        .to_string();
    let metadata = match fs::metadata(source) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok(assets::check(
                path,
                name,
                0,
                AssetCheckStatus::Error,
                "not_found",
            ));
        }
        Err(error) => return Err(error.into()),
    };
    let size = metadata.len() as i64;
    if size == 0 {
        return Ok(assets::check(
            path,
            name,
            size,
            AssetCheckStatus::Error,
            "empty",
        ));
    }
    if video_format(source).is_err() {
        return Ok(assets::check(
            path,
            name,
            size,
            AssetCheckStatus::Error,
            "unsupported",
        ));
    }
    if metadata.len() > videos::VIDEO_MAX_BYTES {
        return Ok(assets::check(
            path,
            name,
            size,
            AssetCheckStatus::Error,
            "too_large",
        ));
    }
    if videos::unique_name(conn, &name, None)? != name {
        return Ok(assets::check(
            path,
            name,
            size,
            AssetCheckStatus::Warn,
            "duplicate_name",
        ));
    }
    Ok(assets::check(path, name, size, AssetCheckStatus::Ok, ""))
}

fn inspect_prompt(conn: &rusqlite::Connection, path: &str) -> LibraryResult<AssetCheck> {
    let source = Path::new(path);
    let file_name = source
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or(path)
        .to_string();
    let metadata = match fs::metadata(source) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok(assets::check(
                path,
                file_name,
                0,
                AssetCheckStatus::Error,
                "not_found",
            ));
        }
        Err(error) => return Err(error.into()),
    };
    let size = metadata.len() as i64;
    if size == 0 {
        return Ok(assets::check(
            path,
            file_name,
            size,
            AssetCheckStatus::Error,
            "empty",
        ));
    }
    if prompt_extension(source).is_err() {
        return Ok(assets::check(
            path,
            file_name,
            size,
            AssetCheckStatus::Error,
            "unsupported",
        ));
    }
    if metadata.len() > prompts::PROMPT_MAX_BYTES as u64 {
        return Ok(assets::check(
            path,
            file_name,
            size,
            AssetCheckStatus::Error,
            "too_large",
        ));
    }
    match prompts::decode_file(&fs::read(source)?) {
        Ok(_) => {}
        Err(error) => {
            let code = match error.code {
                LibraryErrorCode::PromptEmpty => "empty",
                LibraryErrorCode::PromptUnreadable => "unreadable",
                LibraryErrorCode::PromptTooLarge => "too_large",
                _ => return Err(error),
            };
            return Ok(assets::check(
                path,
                file_name,
                size,
                AssetCheckStatus::Error,
                code,
            ));
        }
    }
    let name = prompts::normalize_name(&prompts::name_from_file(&file_name))?;
    if prompts::unique_name(conn, &name, None)? != name {
        return Ok(assets::check(
            path,
            name,
            size,
            AssetCheckStatus::Warn,
            "duplicate_name",
        ));
    }
    Ok(assets::check(path, name, size, AssetCheckStatus::Ok, ""))
}

fn image_format(path: &Path) -> LibraryResult<ImageFormat> {
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("");
    image_format_from_extension(extension)
}

fn image_format_from_extension(extension: &str) -> LibraryResult<ImageFormat> {
    ImageFormat::from_extension(extension).ok_or_else(|| {
        LibraryError::new(
            LibraryErrorCode::ImageUnsupported,
            format!("unsupported image extension: {extension}"),
        )
    })
}

fn sound_format(path: &Path) -> LibraryResult<SoundFormat> {
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("");
    sound_format_from_extension(extension)
}

fn sound_format_from_extension(extension: &str) -> LibraryResult<SoundFormat> {
    SoundFormat::from_extension(extension).ok_or_else(|| {
        LibraryError::new(
            LibraryErrorCode::SoundUnsupported,
            format!("unsupported sound extension: {extension}"),
        )
    })
}

fn video_format(path: &Path) -> LibraryResult<video_probe::VideoFormat> {
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("");
    video_format_from_extension(extension)
}

fn prompt_extension(path: &Path) -> LibraryResult<()> {
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("");
    if prompts::PROMPT_EXTENSIONS
        .iter()
        .any(|supported| extension.eq_ignore_ascii_case(supported))
    {
        Ok(())
    } else {
        Err(LibraryError::new(
            LibraryErrorCode::PromptUnsupported,
            format!("unsupported prompt extension: {extension}"),
        ))
    }
}

fn video_format_from_extension(extension: &str) -> LibraryResult<video_probe::VideoFormat> {
    video_probe::VideoFormat::from_extension(extension).ok_or_else(|| {
        LibraryError::new(
            LibraryErrorCode::VideoUnsupported,
            format!("unsupported video extension: {extension}"),
        )
    })
}

fn image_name(path: &Path) -> LibraryResult<String> {
    path.file_name()
        .and_then(|value| value.to_str())
        .map(str::to_string)
        .filter(|name| !name.is_empty())
        .ok_or_else(|| {
            LibraryError::new(
                LibraryErrorCode::InvalidInput,
                "image path has no file name",
            )
        })
}

fn thumb_mime(format: ImageFormat) -> &'static str {
    if format == ImageFormat::Jpeg {
        "image/jpeg"
    } else {
        "image/png"
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::features::library::collections::AssetTable;
    use crate::features::library::models::AssetRights;
    use crate::features::library::models::LibraryKind;
    use crate::infra::storage::migrator::Migrator;
    use crate::infra::storage::migrator::workspace_scripts;
    use rusqlite::Connection;
    use std::fs;
    use std::io::Cursor;
    use std::sync::atomic::AtomicBool;
    use tempfile::TempDir;

    fn fixture() -> (TempDir, LibraryWorkspace) {
        let dir = TempDir::new().unwrap();
        let mut db = Database::create(&dir.path().join(WORKSPACE_DB_FILE)).unwrap();
        Migrator::migrate(
            db.connection_mut(),
            &workspace_scripts().unwrap(),
            &AtomicBool::new(false),
        )
        .unwrap();
        let workspace = LibraryWorkspace::new(dir.path().to_path_buf());
        (dir, workspace)
    }

    fn asset_table(kind: LibraryKind) -> AssetTable {
        let table = match kind {
            LibraryKind::Image => "test_image_assets",
            LibraryKind::Sound => "test_sound_assets",
            LibraryKind::Video => "test_video_assets",
            LibraryKind::Prompt => "test_prompt_assets",
        };
        AssetTable { kind, table }
    }

    fn setup_assets(dir: &TempDir) -> Connection {
        let conn = Connection::open(dir.path().join(WORKSPACE_DB_FILE)).unwrap();
        conn.execute_batch("CREATE TABLE test_image_assets (id INTEGER PRIMARY KEY, collection_id INTEGER); CREATE TABLE test_sound_assets (id INTEGER PRIMARY KEY, collection_id INTEGER); CREATE TABLE test_video_assets (id INTEGER PRIMARY KEY, collection_id INTEGER); CREATE TABLE test_prompt_assets (id INTEGER PRIMARY KEY, collection_id INTEGER);").unwrap();
        conn
    }

    fn collection(name: &str) -> CollectionInput {
        CollectionInput {
            name: name.to_string(),
            description: String::new(),
        }
    }

    fn png_bytes() -> Vec<u8> {
        let image = image::DynamicImage::new_rgb8(2, 1);
        let mut bytes = Cursor::new(Vec::new());
        image.write_to(&mut bytes, image::ImageFormat::Png).unwrap();
        bytes.into_inner()
    }

    fn wav_bytes() -> Vec<u8> {
        let sample_rate = 8_000_u32;
        let sample_count = sample_rate as usize;
        let data_len = sample_count * 2;
        let mut bytes = Vec::with_capacity(44 + data_len);
        bytes.extend_from_slice(b"RIFF");
        bytes.extend_from_slice(&(36 + data_len as u32).to_le_bytes());
        bytes.extend_from_slice(b"WAVEfmt ");
        bytes.extend_from_slice(&16_u32.to_le_bytes());
        bytes.extend_from_slice(&1_u16.to_le_bytes());
        bytes.extend_from_slice(&1_u16.to_le_bytes());
        bytes.extend_from_slice(&sample_rate.to_le_bytes());
        bytes.extend_from_slice(&(sample_rate * 2).to_le_bytes());
        bytes.extend_from_slice(&2_u16.to_le_bytes());
        bytes.extend_from_slice(&16_u16.to_le_bytes());
        bytes.extend_from_slice(b"data");
        bytes.extend_from_slice(&(data_len as u32).to_le_bytes());
        for _ in 0..sample_count {
            bytes.extend_from_slice(&i16::MAX.to_le_bytes());
        }
        bytes
    }

    fn image_input(collection_id: Option<i64>) -> AssetUploadInput {
        AssetUploadInput {
            collection_id,
            tags: vec!["Example".to_string()],
            rights: AssetRights::Own,
        }
    }

    fn sound_input(collection_id: Option<i64>) -> AssetUploadInput {
        AssetUploadInput {
            collection_id,
            tags: vec!["Example".to_string()],
            rights: AssetRights::Own,
        }
    }

    fn write_png(dir: &TempDir, name: &str) -> PathBuf {
        let path = dir.path().join(name);
        fs::write(&path, png_bytes()).unwrap();
        path
    }

    fn write_wav(dir: &TempDir, name: &str) -> PathBuf {
        let path = dir.path().join(name);
        fs::write(&path, wav_bytes()).unwrap();
        path
    }

    fn iso_box(kind: &[u8; 4], payload: Vec<u8>) -> Vec<u8> {
        let mut bytes = Vec::with_capacity(payload.len() + 8);
        bytes.extend_from_slice(&((payload.len() + 8) as u32).to_be_bytes());
        bytes.extend_from_slice(kind);
        bytes.extend_from_slice(&payload);
        bytes
    }

    fn synthetic_mp4() -> Vec<u8> {
        let mut mvhd = vec![0; 20];
        mvhd[12..16].copy_from_slice(&1_000_u32.to_be_bytes());
        mvhd[16..20].copy_from_slice(&2_000_u32.to_be_bytes());
        let mut tkhd = vec![0; 84];
        tkhd[40..44].copy_from_slice(&0x0001_0000_i32.to_be_bytes());
        tkhd[56..60].copy_from_slice(&0x0001_0000_i32.to_be_bytes());
        tkhd[76..80].copy_from_slice(&(1_920_u32 << 16).to_be_bytes());
        tkhd[80..84].copy_from_slice(&(1_080_u32 << 16).to_be_bytes());
        let mut mdhd = vec![0; 20];
        mdhd[12..16].copy_from_slice(&1_000_u32.to_be_bytes());
        mdhd[16..20].copy_from_slice(&2_000_u32.to_be_bytes());
        let mut hdlr = vec![0; 12];
        hdlr[8..12].copy_from_slice(b"vide");
        let mut stts = vec![0; 16];
        stts[4..8].copy_from_slice(&1_u32.to_be_bytes());
        stts[8..12].copy_from_slice(&60_u32.to_be_bytes());
        stts[12..16].copy_from_slice(&33_u32.to_be_bytes());
        let stbl = iso_box(b"stbl", iso_box(b"stts", stts));
        let minf = iso_box(b"minf", stbl);
        let mdia = iso_box(
            b"mdia",
            [iso_box(b"mdhd", mdhd), iso_box(b"hdlr", hdlr), minf].concat(),
        );
        let trak = iso_box(b"trak", [iso_box(b"tkhd", tkhd), mdia].concat());
        [
            iso_box(b"ftyp", b"isom\0\0\0\0isom".to_vec()),
            iso_box(b"moov", [iso_box(b"mvhd", mvhd), trak].concat()),
        ]
        .concat()
    }

    fn video_input(collection_id: Option<i64>) -> AssetUploadInput {
        AssetUploadInput {
            collection_id,
            tags: vec!["Example".to_string()],
            rights: AssetRights::Own,
        }
    }

    fn write_mp4(dir: &TempDir, name: &str) -> PathBuf {
        let path = dir.path().join(name);
        fs::write(&path, synthetic_mp4()).unwrap();
        path
    }

    #[test]
    fn uploads_lists_and_renames_duplicate_images() {
        let (dir, workspace) = fixture();
        let path = write_png(&dir, "forest.png");
        let first = workspace
            .image_upload(path.to_str().unwrap(), image_input(None))
            .unwrap();
        let second = workspace
            .image_upload(path.to_str().unwrap(), image_input(None))
            .unwrap();
        assert_eq!(first.name, "forest.png");
        assert_eq!(second.name, "forest (2).png");
        assert_eq!(workspace.image_list().unwrap().len(), 2);
        assert!(
            workspace
                .image_thumb(first.id)
                .unwrap()
                .starts_with("data:image/png;base64,")
        );
        assert!(
            workspace
                .image_read(first.id)
                .unwrap()
                .starts_with("data:image/png;base64,")
        );
    }

    #[test]
    fn uploads_reject_unsupported_and_oversize_images() {
        let (dir, workspace) = fixture();
        let unsupported = dir.path().join("image.bmp");
        fs::write(&unsupported, b"bitmap").unwrap();
        assert_eq!(
            workspace
                .image_upload(unsupported.to_str().unwrap(), image_input(None))
                .unwrap_err()
                .code,
            LibraryErrorCode::ImageUnsupported
        );
        let large = dir.path().join("large.png");
        fs::write(&large, vec![0; images::IMAGE_MAX_BYTES + 1]).unwrap();
        assert_eq!(
            workspace
                .image_upload(large.to_str().unwrap(), image_input(None))
                .unwrap_err()
                .code,
            LibraryErrorCode::ImageTooLarge
        );
    }

    #[test]
    fn failed_upload_removes_its_row_and_files() {
        let (dir, workspace) = fixture();
        let path = write_png(&dir, "blocked.png");
        fs::write(dir.path().join("library"), b"not a directory").unwrap();
        assert_eq!(
            workspace
                .image_upload(path.to_str().unwrap(), image_input(None))
                .unwrap_err()
                .code,
            LibraryErrorCode::Io
        );
        assert!(workspace.image_list().unwrap().is_empty());
        assert!(!dir.path().join("library").join("images").exists());
    }

    #[test]
    fn deleting_images_removes_workspace_files() {
        let (dir, workspace) = fixture();
        let path = write_png(&dir, "remove.png");
        let image = workspace
            .image_upload(path.to_str().unwrap(), image_input(None))
            .unwrap();
        let original = dir
            .path()
            .join("library")
            .join("images")
            .join(format!("{}.png", image.id));
        assert!(original.exists());
        assert_eq!(workspace.image_delete(&[image.id]).unwrap(), 1);
        assert!(!original.exists());
        assert!(workspace.image_list().unwrap().is_empty());
    }

    #[test]
    fn image_counts_appear_in_summary_and_collections() {
        let (dir, workspace) = fixture();
        let collection = workspace.collection_create(collection("Images")).unwrap();
        let filed = write_png(&dir, "filed.png");
        let unfiled = write_png(&dir, "unfiled.png");
        workspace
            .image_upload(filed.to_str().unwrap(), image_input(Some(collection.id)))
            .unwrap();
        workspace
            .image_upload(unfiled.to_str().unwrap(), image_input(None))
            .unwrap();
        let summary = workspace.summary().unwrap();
        assert_eq!(summary.assets.image, 2);
        assert_eq!(summary.unfiled.image, 1);
        assert_eq!(workspace.collection_list().unwrap()[0].counts.image, 1);
    }

    #[test]
    fn uploads_streams_and_deletes_sounds() {
        let (dir, workspace) = fixture();
        let path = write_wav(&dir, "harbor.wav");
        let check = workspace
            .sound_inspect(&[path.to_string_lossy().to_string()])
            .unwrap();
        assert_eq!(check[0].status, AssetCheckStatus::Ok);
        let first = workspace
            .sound_upload(path.to_str().unwrap(), sound_input(None))
            .unwrap();
        let second = workspace
            .sound_upload(path.to_str().unwrap(), sound_input(None))
            .unwrap();
        assert_eq!(first.name, "harbor.wav");
        assert_eq!(second.name, "harbor (2).wav");
        assert_eq!(workspace.sound_list().unwrap().len(), 2);
        assert!(!workspace.sound_peaks(first.id).unwrap().is_empty());
        let chunk = workspace
            .stream(StreamKind::Sound, first.id, Some((4, Some(11))))
            .unwrap();
        assert_eq!((chunk.start, chunk.end, chunk.bytes.len()), (4, 11, 8));
        assert_eq!(chunk.total as usize, wav_bytes().len());
        let stored = dir
            .path()
            .join("library")
            .join("sounds")
            .join(format!("{}.wav", first.id));
        assert!(stored.exists());
        assert_eq!(workspace.sound_delete(&[first.id]).unwrap(), 1);
        assert!(!stored.exists());
    }

    #[test]
    fn sound_upload_rejects_invalid_files_and_rolls_back_failed_copies() {
        let (dir, workspace) = fixture();
        let unsupported = dir.path().join("sound.flac");
        fs::write(&unsupported, b"not flac").unwrap();
        assert_eq!(
            workspace
                .sound_upload(unsupported.to_str().unwrap(), sound_input(None))
                .unwrap_err()
                .code,
            LibraryErrorCode::SoundUnsupported
        );
        let oversized = dir.path().join("large.wav");
        std::fs::File::create(&oversized)
            .unwrap()
            .set_len(sounds::SOUND_MAX_BYTES as u64 + 1)
            .unwrap();
        assert_eq!(
            workspace
                .sound_upload(oversized.to_str().unwrap(), sound_input(None))
                .unwrap_err()
                .code,
            LibraryErrorCode::SoundTooLarge
        );
        let source = write_wav(&dir, "blocked.wav");
        fs::write(dir.path().join("library"), b"not a directory").unwrap();
        assert_eq!(
            workspace
                .sound_upload(source.to_str().unwrap(), sound_input(None))
                .unwrap_err()
                .code,
            LibraryErrorCode::Io
        );
        assert!(workspace.sound_list().unwrap().is_empty());
    }

    #[test]
    fn sounds_count_unfile_and_tags_follow_library_operations() {
        let (dir, workspace) = fixture();
        let collection = workspace.collection_create(collection("Sounds")).unwrap();
        let filed = write_wav(&dir, "filed.wav");
        let unfiled = write_wav(&dir, "unfiled.wav");
        let filed = workspace
            .sound_upload(filed.to_str().unwrap(), sound_input(Some(collection.id)))
            .unwrap();
        workspace
            .sound_upload(unfiled.to_str().unwrap(), sound_input(None))
            .unwrap();
        let summary = workspace.summary().unwrap();
        assert_eq!((summary.assets.sound, summary.unfiled.sound), (2, 1));
        assert_eq!(workspace.collection_list().unwrap()[0].counts.sound, 1);
        workspace.tag_rename("example", "renamed").unwrap();
        workspace
            .sound_update(
                filed.id,
                AssetPatch {
                    tags: Some(vec!["renamed".to_string(), "target".to_string()]),
                    ..AssetPatch::default()
                },
            )
            .unwrap();
        let tag = workspace.tag_merge("renamed", "target").unwrap();
        assert_eq!(tag.counts.sound, 2);
        assert_eq!(workspace.collection_delete(collection.id).unwrap(), 1);
        assert_eq!(workspace.sound_list().unwrap()[0].collection_id, None);
        assert_eq!(filed.tags, vec!["example"]);
    }

    #[test]
    fn collection_name_and_description_rules_are_enforced() {
        let (_dir, workspace) = fixture();
        assert_eq!(
            workspace
                .collection_create(collection(" "))
                .unwrap_err()
                .code,
            LibraryErrorCode::InvalidInput
        );
        assert_eq!(
            workspace
                .collection_create(collection(&"x".repeat(81)))
                .unwrap_err()
                .code,
            LibraryErrorCode::InvalidInput
        );
        let mut too_long = collection("Valid");
        too_long.description = "x".repeat(501);
        assert_eq!(
            workspace.collection_create(too_long).unwrap_err().code,
            LibraryErrorCode::InvalidInput
        );
        let first = workspace
            .collection_create(collection(" My Collection "))
            .unwrap();
        assert_eq!(
            workspace
                .collection_create(collection("my collection"))
                .unwrap_err()
                .code,
            LibraryErrorCode::CollectionExists
        );
        assert_eq!(
            workspace
                .collection_update(
                    first.id,
                    CollectionPatch {
                        name: Some("MY COLLECTION".into()),
                        description: None
                    }
                )
                .unwrap()
                .name,
            "MY COLLECTION"
        );
    }

    #[test]
    fn collections_create_update_list_counts_and_summary_include_all_kinds() {
        let (dir, workspace) = fixture();
        let conn = setup_assets(&dir);
        let tables = [
            asset_table(LibraryKind::Image),
            asset_table(LibraryKind::Sound),
        ];
        let first = workspace.collection_create(collection("First")).unwrap();
        conn.execute(
            "INSERT INTO test_image_assets (collection_id) VALUES (?1), (?1), (NULL)",
            [first.id],
        )
        .unwrap();
        let mut db = workspace.database().unwrap();
        let listed = collections::list(&db, &tables).unwrap();
        assert_eq!(listed[0].counts.image, 2);
        assert_eq!(listed[0].counts.sound, 0);
        assert_eq!(listed[0].counts.video, 0);
        assert_eq!(listed[0].counts.prompt, 0);
        let (assets, unfiled) = collections::summary(&db, &tables).unwrap();
        assert_eq!(
            (assets.image, assets.sound, assets.video, assets.prompt),
            (3, 0, 0, 0)
        );
        assert_eq!(
            (unfiled.image, unfiled.sound, unfiled.video, unfiled.prompt),
            (1, 0, 0, 0)
        );
        let updated = collections::update(
            &mut db,
            first.id,
            CollectionPatch {
                name: Some("Renamed".into()),
                description: Some(" Description ".into()),
            },
            &tables,
        )
        .unwrap();
        assert_eq!(
            (
                updated.name.as_str(),
                updated.description.as_str(),
                updated.counts.image
            ),
            ("Renamed", "Description", 2)
        );
        assert_eq!(workspace.collection_list().unwrap().len(), 1);
        let empty_registry = workspace.summary().unwrap();
        assert_eq!(
            (
                empty_registry.assets.image,
                empty_registry.assets.sound,
                empty_registry.assets.video,
                empty_registry.assets.prompt
            ),
            (0, 0, 0, 0)
        );
    }

    #[test]
    fn collection_delete_unlinks_assets_and_missing_rows_are_reported() {
        let (dir, workspace) = fixture();
        let conn = setup_assets(&dir);
        let collection = workspace
            .collection_create(collection("Delete me"))
            .unwrap();
        conn.execute(
            "INSERT INTO test_image_assets (collection_id) VALUES (?1), (?1), (NULL)",
            [collection.id],
        )
        .unwrap();
        let removed = collections::delete(
            &mut workspace.database().unwrap(),
            collection.id,
            &[asset_table(LibraryKind::Image)],
        )
        .unwrap();
        assert_eq!(removed, 2);
        assert_eq!(
            conn.query_row(
                "SELECT COUNT(*) FROM test_image_assets WHERE collection_id IS NULL",
                [],
                |row| row.get::<_, i64>(0)
            )
            .unwrap(),
            3
        );
        assert_eq!(
            workspace.collection_delete(collection.id).unwrap_err().code,
            LibraryErrorCode::CollectionNotFound
        );
    }

    fn insert_tag(conn: &Connection, id: &str, tag: &str, kind: &str) {
        conn.execute(
            "INSERT INTO ws_tags (id, tag, type) VALUES (?1, ?2, ?3)",
            [id, tag, kind],
        )
        .unwrap();
    }

    #[test]
    fn tags_group_by_kind_and_leave_novel_tags_untouched() {
        let (dir, workspace) = fixture();
        let conn = Connection::open(dir.path().join(WORKSPACE_DB_FILE)).unwrap();
        insert_tag(&conn, "1", "harbor", "library_image");
        insert_tag(&conn, "2", "harbor", "library_image");
        insert_tag(&conn, "3", "harbor", "library_sound");
        insert_tag(&conn, "4", "story", "novel");
        let items = workspace.tag_list().unwrap();
        assert_eq!(items.len(), 1);
        assert_eq!(
            (
                items[0].counts.image,
                items[0].counts.sound,
                items[0].counts.video,
                items[0].counts.prompt
            ),
            (2, 1, 0, 0)
        );
        assert_eq!(workspace.tag_delete("harbor").unwrap(), 3);
        assert_eq!(
            conn.query_row(
                "SELECT COUNT(*) FROM ws_tags WHERE type = 'novel'",
                [],
                |row| row.get::<_, i64>(0)
            )
            .unwrap(),
            1
        );
    }

    #[test]
    fn tag_rename_rejects_existing_and_invalid_targets() {
        let (dir, workspace) = fixture();
        let conn = Connection::open(dir.path().join(WORKSPACE_DB_FILE)).unwrap();
        insert_tag(&conn, "1", "old", "library_image");
        insert_tag(&conn, "2", "used", "library_sound");
        assert_eq!(
            workspace.tag_rename("old", "used").unwrap_err().code,
            LibraryErrorCode::TagExists
        );
        assert_eq!(
            workspace.tag_rename("old", "###").unwrap_err().code,
            LibraryErrorCode::InvalidTag
        );
        let renamed = workspace.tag_rename("old", " New Name ").unwrap();
        assert_eq!(renamed.tag, "new-name");
        assert_eq!(
            conn.query_row("SELECT tag FROM ws_tags WHERE id = '1'", [], |row| row
                .get::<_, String>(
                0
            ))
            .unwrap(),
            "new-name"
        );
    }

    #[test]
    fn tag_merge_respects_cap_and_removes_source() {
        let (dir, workspace) = fixture();
        let conn = Connection::open(dir.path().join(WORKSPACE_DB_FILE)).unwrap();
        insert_tag(&conn, "1", "source", "library_image");
        insert_tag(&conn, "1", "target", "library_image");
        for index in 0..11 {
            insert_tag(&conn, "2", &format!("other{index}"), "library_image");
        }
        insert_tag(&conn, "2", "source", "library_image");
        insert_tag(&conn, "9", "novel-source", "novel");
        let merged = workspace.tag_merge("source", "target").unwrap();
        assert_eq!(merged.tag, "target");
        let total: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM ws_tags WHERE id = '2' AND type = 'library_image'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert!(total <= 12);
        assert_eq!(
            conn.query_row(
                "SELECT COUNT(*) FROM ws_tags WHERE tag = 'source' AND type LIKE 'library_%'",
                [],
                |row| row.get::<_, i64>(0)
            )
            .unwrap(),
            0
        );
        assert_eq!(
            conn.query_row(
                "SELECT COUNT(*) FROM ws_tags WHERE type = 'novel'",
                [],
                |row| row.get::<_, i64>(0)
            )
            .unwrap(),
            1
        );
    }

    #[test]
    fn migration_applies_to_an_existing_workspace() {
        let dir = TempDir::new().unwrap();
        let scripts = workspace_scripts().unwrap();
        let mut db = Database::create(&dir.path().join(WORKSPACE_DB_FILE)).unwrap();
        Migrator::migrate(db.connection_mut(), &scripts[..5], &AtomicBool::new(false)).unwrap();
        assert!(
            db.connection()
                .query_row(
                    "SELECT name FROM sqlite_master WHERE name = 'ws_tags'",
                    [],
                    |row| row.get::<_, String>(0)
                )
                .is_ok()
        );
        Migrator::migrate(db.connection_mut(), &scripts, &AtomicBool::new(false)).unwrap();
        assert!(
            db.connection()
                .query_row(
                    "SELECT name FROM sqlite_master WHERE name = 'ws_library_collections'",
                    [],
                    |row| row.get::<_, String>(0)
                )
                .is_ok()
        );
        assert!(
            db.connection()
                .query_row(
                    "SELECT name FROM sqlite_master WHERE name = 'ws_library_images'",
                    [],
                    |row| row.get::<_, String>(0)
                )
                .is_ok()
        );
    }

    #[test]
    fn uploads_lists_posters_and_deletes_videos() {
        let (dir, workspace) = fixture();
        let path = write_mp4(&dir, "harbor.mp4");
        let checks = workspace
            .video_inspect(&[path.to_string_lossy().to_string()])
            .unwrap();
        assert_eq!(checks[0].status, AssetCheckStatus::Ok);
        let first = workspace
            .video_upload(path.to_str().unwrap(), video_input(None))
            .unwrap();
        let second = workspace
            .video_upload(path.to_str().unwrap(), video_input(None))
            .unwrap();
        assert_eq!(first.name, "harbor.mp4");
        assert_eq!(second.name, "harbor (2).mp4");
        assert_eq!(workspace.video_list().unwrap().len(), 2);
        let original = dir
            .path()
            .join("library")
            .join("videos")
            .join(format!("{}.mp4", first.id));
        let poster = dir
            .path()
            .join("library")
            .join("videos")
            .join("posters")
            .join(format!("{}.jpg", first.id));
        let jpeg = base64::engine::general_purpose::STANDARD.encode([0xff, 0xd8, 0xff, 0xdb]);
        workspace.video_poster_set(first.id, &jpeg).unwrap();
        assert!(
            workspace
                .video_poster(first.id)
                .unwrap()
                .unwrap()
                .starts_with("data:image/jpeg;base64,")
        );
        assert!(workspace.video_list().unwrap()[1].has_poster);
        assert!(original.exists());
        assert!(poster.exists());
        assert_eq!(workspace.video_delete(&[first.id]).unwrap(), 1);
        assert!(!original.exists());
        assert!(!poster.exists());
    }

    #[test]
    fn video_inspection_rejects_unsupported_and_oversize_files() {
        let (dir, workspace) = fixture();
        let unsupported = dir.path().join("clip.avi");
        fs::write(&unsupported, b"not an AVI").unwrap();
        let unsupported = workspace
            .video_inspect(&[unsupported.to_string_lossy().to_string()])
            .unwrap();
        assert_eq!(unsupported[0].status, AssetCheckStatus::Error);
        assert_eq!(unsupported[0].code.as_deref(), Some("unsupported"));
        let oversized = dir.path().join("large.mp4");
        fs::File::create(&oversized)
            .unwrap()
            .set_len(videos::VIDEO_MAX_BYTES + 1)
            .unwrap();
        let oversized = workspace
            .video_inspect(&[oversized.to_string_lossy().to_string()])
            .unwrap();
        assert_eq!(oversized[0].status, AssetCheckStatus::Error);
        assert_eq!(oversized[0].code.as_deref(), Some("too_large"));
    }

    #[test]
    fn unreadable_and_failed_commit_videos_leave_no_database_rows_or_temp_files() {
        let (dir, workspace) = fixture();
        let unreadable = dir.path().join("broken.mp4");
        fs::write(&unreadable, b"not a video").unwrap();
        assert_eq!(
            workspace
                .video_upload(unreadable.to_str().unwrap(), video_input(None))
                .unwrap_err()
                .code,
            LibraryErrorCode::VideoUnreadable
        );
        assert!(workspace.video_list().unwrap().is_empty());
        assert!(!dir.path().join("library").join("videos").exists());
        let valid = write_mp4(&dir, "blocked.mp4");
        let target = dir.path().join("library").join("videos").join("1.mp4");
        fs::create_dir_all(&target).unwrap();
        assert_eq!(
            workspace
                .video_upload(valid.to_str().unwrap(), video_input(None))
                .unwrap_err()
                .code,
            LibraryErrorCode::Io
        );
        assert!(workspace.video_list().unwrap().is_empty());
        assert!(
            fs::read_dir(target.parent().unwrap())
                .unwrap()
                .all(|entry| !entry
                    .unwrap()
                    .file_name()
                    .to_string_lossy()
                    .starts_with(".upload-"))
        );
    }

    #[test]
    fn videos_count_unfile_and_tags_follow_library_operations() {
        let (dir, workspace) = fixture();
        let collection = workspace.collection_create(collection("Videos")).unwrap();
        let filed_path = write_mp4(&dir, "filed.mp4");
        let unfiled_path = write_mp4(&dir, "unfiled.mp4");
        let filed = workspace
            .video_upload(
                filed_path.to_str().unwrap(),
                video_input(Some(collection.id)),
            )
            .unwrap();
        workspace
            .video_upload(unfiled_path.to_str().unwrap(), video_input(None))
            .unwrap();
        let summary = workspace.summary().unwrap();
        assert_eq!((summary.assets.video, summary.unfiled.video), (2, 1));
        assert_eq!(workspace.collection_list().unwrap()[0].counts.video, 1);
        workspace.tag_rename("example", "renamed").unwrap();
        workspace
            .video_update(
                filed.id,
                AssetPatch {
                    tags: Some(vec!["renamed".to_string(), "target".to_string()]),
                    ..AssetPatch::default()
                },
            )
            .unwrap();
        let tag = workspace.tag_merge("renamed", "target").unwrap();
        assert_eq!(tag.counts.video, 2);
        assert_eq!(workspace.collection_delete(collection.id).unwrap(), 1);
        assert!(
            workspace
                .video_list()
                .unwrap()
                .iter()
                .all(|video| video.collection_id.is_none())
        );
    }

    #[test]
    fn streams_sound_and_video_ranges_with_kind_specific_clamps() {
        let (dir, workspace) = fixture();
        let sound_path = write_wav(&dir, "long.wav");
        let mut sound_bytes = fs::read(&sound_path).unwrap();
        sound_bytes.resize(StreamKind::Sound.max_chunk() as usize + 9, 0);
        fs::write(&sound_path, sound_bytes).unwrap();
        let sound = workspace
            .sound_upload(sound_path.to_str().unwrap(), sound_input(None))
            .unwrap();
        let video_path = write_mp4(&dir, "long.mp4");
        let mut video_bytes = fs::read(&video_path).unwrap();
        video_bytes.resize(StreamKind::Video.max_chunk() as usize + 9, 0);
        fs::write(&video_path, video_bytes).unwrap();
        let video = workspace
            .video_upload(video_path.to_str().unwrap(), video_input(None))
            .unwrap();
        let sound_chunk = workspace.stream(StreamKind::Sound, sound.id, None).unwrap();
        assert_eq!(sound_chunk.total, StreamKind::Sound.max_chunk() + 9);
        assert_eq!(sound_chunk.start, 0);
        assert_eq!(sound_chunk.end, StreamKind::Sound.max_chunk() - 1);
        assert_eq!(
            sound_chunk.bytes.len() as u64,
            StreamKind::Sound.max_chunk()
        );
        let video_chunk = workspace
            .stream(StreamKind::Video, video.id, Some((4, Some(11))))
            .unwrap();
        assert_eq!(video_chunk.total, StreamKind::Video.max_chunk() + 9);
        assert_eq!((video_chunk.start, video_chunk.end), (4, 11));
        assert_eq!(video_chunk.bytes.len(), 8);
        let clamped = workspace.stream(StreamKind::Video, video.id, None).unwrap();
        assert_eq!(clamped.end, StreamKind::Video.max_chunk() - 1);
        assert_eq!(clamped.bytes.len() as u64, StreamKind::Video.max_chunk());
    }

    fn prompt_input(collection_id: Option<i64>) -> AssetUploadInput {
        AssetUploadInput {
            collection_id,
            tags: vec!["Example".to_string()],
            rights: AssetRights::Own,
        }
    }

    #[test]
    fn prompts_upload_create_update_list_and_delete() {
        let (dir, workspace) = fixture();
        let source = dir.path().join("Harbor v1.2.md");
        fs::write(&source, "\u{feff} hello\r\nworld \n").unwrap();
        let uploaded = workspace
            .prompt_upload(source.to_str().unwrap(), prompt_input(None))
            .unwrap();
        assert_eq!(
            (
                uploaded.name.as_str(),
                uploaded.kind,
                uploaded.origin.as_str(),
                uploaded.text.as_str()
            ),
            ("Harbor v1.2", PromptKind::General, "upload", "hello\nworld")
        );
        assert!(
            dir.path()
                .join(format!("library/prompts/{}.txt", uploaded.id))
                .is_file()
        );
        let duplicate = workspace
            .prompt_upload(source.to_str().unwrap(), prompt_input(None))
            .unwrap();
        assert_eq!(duplicate.name, "Harbor v1.2 (2)");
        let created = workspace
            .prompt_create(PromptCreateInput {
                name: "Written".into(),
                kind: PromptKind::Image,
                text: "old".into(),
                collection_id: None,
                tags: vec![],
                rights: AssetRights::Free,
            })
            .unwrap();
        assert_eq!(created.origin, "app");
        let updated = workspace
            .prompt_update(
                created.id,
                PromptPatch {
                    text: Some("new\r\ntext".into()),
                    ..PromptPatch::default()
                },
            )
            .unwrap();
        assert_eq!(updated.text, "new\ntext");
        assert_eq!(
            fs::read_to_string(
                dir.path()
                    .join(format!("library/prompts/{}.txt", created.id))
            )
            .unwrap(),
            "new\ntext"
        );
        fs::remove_file(
            dir.path()
                .join(format!("library/prompts/{}.txt", uploaded.id)),
        )
        .unwrap();
        assert_eq!(
            workspace
                .prompt_list()
                .unwrap()
                .iter()
                .find(|prompt| prompt.id == uploaded.id)
                .unwrap()
                .text,
            ""
        );
        assert_eq!(workspace.prompt_delete(&[created.id]).unwrap(), 1);
        assert!(
            !dir.path()
                .join(format!("library/prompts/{}.txt", created.id))
                .exists()
        );
    }

    #[test]
    fn prompt_inspection_reports_all_file_errors_and_duplicate_warning() {
        let (dir, workspace) = fixture();
        let valid = dir.path().join("same.txt");
        fs::write(&valid, "text").unwrap();
        workspace
            .prompt_upload(valid.to_str().unwrap(), prompt_input(None))
            .unwrap();
        let empty = dir.path().join("empty.txt");
        fs::write(&empty, []).unwrap();
        let png = dir.path().join("bad.png");
        fs::write(&png, "x").unwrap();
        let invalid = dir.path().join("invalid.txt");
        fs::write(&invalid, [0xff]).unwrap();
        let large = dir.path().join("large.txt");
        fs::write(&large, vec![b'x'; prompts::PROMPT_MAX_BYTES + 1]).unwrap();
        let checks = workspace
            .prompt_inspect(&[
                valid.to_string_lossy().to_string(),
                empty.to_string_lossy().to_string(),
                png.to_string_lossy().to_string(),
                invalid.to_string_lossy().to_string(),
                large.to_string_lossy().to_string(),
                dir.path().join("missing.txt").to_string_lossy().to_string(),
            ])
            .unwrap();
        let codes = checks
            .iter()
            .map(|check| check.code.as_deref().unwrap_or(""))
            .collect::<Vec<_>>();
        assert_eq!(
            codes,
            [
                "duplicate_name",
                "empty",
                "unsupported",
                "unreadable",
                "too_large",
                "not_found"
            ]
        );
        assert_eq!(workspace.prompt_list().unwrap().len(), 1);
    }

    #[test]
    fn prompt_counts_collections_and_tags_include_prompts() {
        let (dir, workspace) = fixture();
        let collection = workspace.collection_create(collection("Prompts")).unwrap();
        let source = dir.path().join("file.txt");
        fs::write(&source, "body").unwrap();
        let prompt = workspace
            .prompt_upload(source.to_str().unwrap(), prompt_input(Some(collection.id)))
            .unwrap();
        assert_eq!(workspace.summary().unwrap().assets.prompt, 1);
        assert_eq!(workspace.collection_list().unwrap()[0].counts.prompt, 1);
        workspace.tag_rename("example", "renamed").unwrap();
        workspace
            .prompt_update(
                prompt.id,
                PromptPatch {
                    tags: Some(vec!["renamed".into(), "target".into()]),
                    ..PromptPatch::default()
                },
            )
            .unwrap();
        assert_eq!(
            workspace
                .tag_merge("renamed", "target")
                .unwrap()
                .counts
                .prompt,
            1
        );
        workspace.collection_delete(collection.id).unwrap();
        assert!(workspace.prompt_list().unwrap()[0].collection_id.is_none());
    }

    #[test]
    fn prompt_failures_leave_insert_clean_and_preserve_previous_update_text() {
        let (dir, workspace) = fixture();
        let source = dir.path().join("clean.txt");
        fs::write(&source, "before").unwrap();
        assert_eq!(
            workspace
                .prompt_upload(source.to_str().unwrap(), prompt_input(Some(99_999)))
                .unwrap_err()
                .code,
            LibraryErrorCode::CollectionNotFound
        );
        assert!(workspace.prompt_list().unwrap().is_empty());
        let prompt = workspace
            .prompt_upload(source.to_str().unwrap(), prompt_input(None))
            .unwrap();
        let error = workspace
            .prompt_update(
                prompt.id,
                PromptPatch {
                    text: Some("after".into()),
                    collection_id: Some(Some(99_999)),
                    ..PromptPatch::default()
                },
            )
            .unwrap_err();
        assert_eq!(error.code, LibraryErrorCode::CollectionNotFound);
        assert_eq!(workspace.prompt_list().unwrap()[0].text, "before");
        assert_eq!(
            fs::read_to_string(
                dir.path()
                    .join(format!("library/prompts/{}.txt", prompt.id))
            )
            .unwrap(),
            "before"
        );
    }

    #[test]
    fn service_reports_no_workspace() {
        assert_eq!(
            LibraryService::new()
                .open(&WorkspaceSession::new())
                .unwrap_err()
                .code,
            LibraryErrorCode::NoWorkspace
        );
    }
}
