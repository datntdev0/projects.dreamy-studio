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

type RangeReader = Box<dyn Fn(u64, u64) -> LibraryResult<Vec<u8>>>;

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
        if let Some(text) = patch.text.as_deref()
            && let Err(error) = files.write(id, text)
        {
            if let Some(previous) = previous.as_deref() {
                let _ = files.write(id, previous);
            }
            return Err(error);
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
        let info = videos::probe(source, format)?;
        let name = assets::file_name(source)?;
        let files = VideoFiles::new(self.dir.clone());
        let staged = files.stage(source)?;
        let poster = poster_frame(&staged, &name, info.duration_ms);
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
            if let Some(bytes) = poster.as_deref()
                && files.write_poster(id, bytes).is_ok()
            {
                videos::mark_poster(&tx, id)?;
            }
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
            if let Some(format) = videos::VideoFormat::from_extension(ext) {
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

    pub fn stream(
        &self,
        kind: StreamKind,
        id: i64,
        range: Option<(u64, Option<u64>)>,
    ) -> LibraryResult<StreamChunk> {
        let (mime, total, read): (String, u64, RangeReader) = match kind {
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

struct AssetRules {
    supported: fn(&Path) -> bool,
    max_bytes: u64,
    unique_name: fn(&rusqlite::Connection, &str, Option<i64>) -> LibraryResult<String>,
}

const IMAGE_RULES: AssetRules = AssetRules {
    supported: |path| image_format(path).is_ok(),
    max_bytes: images::IMAGE_MAX_BYTES as u64,
    unique_name: images::unique_name,
};

const SOUND_RULES: AssetRules = AssetRules {
    supported: |path| sound_format(path).is_ok(),
    max_bytes: sounds::SOUND_MAX_BYTES as u64,
    unique_name: sounds::unique_name,
};

const VIDEO_RULES: AssetRules = AssetRules {
    supported: |path| video_format(path).is_ok(),
    max_bytes: videos::VIDEO_MAX_BYTES,
    unique_name: videos::unique_name,
};

const PROMPT_RULES: AssetRules = AssetRules {
    supported: |path| prompt_extension(path).is_ok(),
    max_bytes: prompts::PROMPT_MAX_BYTES as u64,
    unique_name: prompts::unique_name,
};

enum Screening {
    Rejected(AssetCheck),
    Accepted(i64),
}

fn screen_file(path: &str, name: &str, rules: &AssetRules) -> LibraryResult<Screening> {
    let source = Path::new(path);
    let metadata = match fs::metadata(source) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok(rejected(path, name, 0, "not_found"));
        }
        Err(error) => return Err(error.into()),
    };
    let size = metadata.len() as i64;
    if size == 0 {
        return Ok(rejected(path, name, size, "empty"));
    }
    if !(rules.supported)(source) {
        return Ok(rejected(path, name, size, "unsupported"));
    }
    if metadata.len() > rules.max_bytes {
        return Ok(rejected(path, name, size, "too_large"));
    }
    Ok(Screening::Accepted(size))
}

fn rejected(path: &str, name: &str, size: i64, code: &str) -> Screening {
    Screening::Rejected(assets::check(
        path,
        name.to_string(),
        size,
        AssetCheckStatus::Error,
        code,
    ))
}

fn finish_check(path: &str, name: String, size: i64, duplicate: bool) -> AssetCheck {
    if duplicate {
        assets::check(path, name, size, AssetCheckStatus::Warn, "duplicate_name")
    } else {
        assets::check(path, name, size, AssetCheckStatus::Ok, "")
    }
}

fn inspect_asset(
    conn: &rusqlite::Connection,
    path: &str,
    rules: &AssetRules,
) -> LibraryResult<AssetCheck> {
    let name = assets::display_name(path);
    match screen_file(path, &name, rules)? {
        Screening::Rejected(check) => Ok(check),
        Screening::Accepted(size) => {
            let duplicate = (rules.unique_name)(conn, &name, None)? != name;
            Ok(finish_check(path, name, size, duplicate))
        }
    }
}

fn inspect_image(conn: &rusqlite::Connection, path: &str) -> LibraryResult<AssetCheck> {
    inspect_asset(conn, path, &IMAGE_RULES)
}

fn inspect_sound(conn: &rusqlite::Connection, path: &str) -> LibraryResult<AssetCheck> {
    inspect_asset(conn, path, &SOUND_RULES)
}

fn inspect_video(conn: &rusqlite::Connection, path: &str) -> LibraryResult<AssetCheck> {
    inspect_asset(conn, path, &VIDEO_RULES)
}

fn inspect_prompt(conn: &rusqlite::Connection, path: &str) -> LibraryResult<AssetCheck> {
    let file_name = assets::display_name(path);
    let size = match screen_file(path, &file_name, &PROMPT_RULES)? {
        Screening::Rejected(check) => return Ok(check),
        Screening::Accepted(size) => size,
    };
    if let Err(error) = prompts::decode_file(&fs::read(path)?) {
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
    let name = prompts::normalize_name(&prompts::name_from_file(&file_name))?;
    let duplicate = prompts::unique_name(conn, &name, None)? != name;
    Ok(finish_check(path, name, size, duplicate))
}

fn image_format(path: &Path) -> LibraryResult<ImageFormat> {
    let extension = assets::extension(path);
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
    let extension = assets::extension(path);
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

fn poster_frame(staged: &Path, name: &str, duration_ms: i64) -> Option<Vec<u8>> {
    match videos::extract_poster(staged, duration_ms) {
        Ok(bytes) => Some(bytes),
        Err(error) => {
            eprintln!("video poster skipped for {name}: {error}");
            None
        }
    }
}

fn video_format(path: &Path) -> LibraryResult<videos::VideoFormat> {
    let extension = assets::extension(path);
    video_format_from_extension(extension)
}

fn prompt_extension(path: &Path) -> LibraryResult<()> {
    let extension = assets::extension(path);
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

fn video_format_from_extension(extension: &str) -> LibraryResult<videos::VideoFormat> {
    videos::VideoFormat::from_extension(extension).ok_or_else(|| {
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
#[path = "../../../test/features/library/service.test.rs"]
mod tests;
