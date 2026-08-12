use crate::features::library::assets;
use crate::features::library::models::AssetPatch;
use crate::features::library::models::AssetRights;
use crate::features::library::models::LibraryError;
use crate::features::library::models::LibraryErrorCode;
use crate::features::library::models::LibraryResult;
use crate::features::library::models::LibraryVideo;
use crate::features::library::video_probe::VideoFormat;
use rusqlite::Connection;
use rusqlite::OptionalExtension;
use rusqlite::params;
use std::fs;
use std::fs::File;
use std::io::Read;
use std::io::Seek;
use std::io::SeekFrom;
use std::path::Path;
use std::path::PathBuf;
use uuid::Uuid;

pub const VIDEO_MAX_BYTES: u64 = 2 * 1024 * 1024 * 1024;
pub const VIDEO_EXTENSIONS: [&str; 4] = ["mp4", "mov", "webm", "mkv"];
pub const POSTER_MAX_BYTES: usize = 2 * 1024 * 1024;
const VIDEO_TAG_TYPE: &str = "library_video";

#[derive(Debug, Clone)]
pub struct VideoFiles {
    workspace_dir: PathBuf,
}

impl VideoFiles {
    pub fn new(workspace_dir: PathBuf) -> Self {
        Self { workspace_dir }
    }

    pub fn stage(&self, source: &Path) -> LibraryResult<PathBuf> {
        let directory = self.videos_dir();
        fs::create_dir_all(&directory)?;
        let staged = directory.join(format!(".upload-{}.tmp", Uuid::new_v4()));
        fs::copy(source, &staged)?;
        Ok(staged)
    }

    pub fn commit(&self, staged: &Path, id: i64, format: VideoFormat) -> LibraryResult<()> {
        fs::rename(staged, self.original_path(id, format))?;
        Ok(())
    }

    pub fn discard(&self, staged: &Path) -> LibraryResult<()> {
        assets::remove_if_exists(staged)
    }

    pub fn len(&self, id: i64, format: VideoFormat) -> LibraryResult<u64> {
        Ok(fs::metadata(self.original_path(id, format))?.len())
    }

    pub fn read_range(
        &self,
        id: i64,
        format: VideoFormat,
        start: u64,
        len: u64,
    ) -> LibraryResult<Vec<u8>> {
        let mut file = File::open(self.original_path(id, format))?;
        file.seek(SeekFrom::Start(start))?;
        let mut bytes = Vec::new();
        file.take(len).read_to_end(&mut bytes)?;
        Ok(bytes)
    }

    pub fn write_poster(&self, id: i64, bytes: &[u8]) -> LibraryResult<()> {
        if bytes.len() > POSTER_MAX_BYTES || !bytes.starts_with(&[0xff, 0xd8, 0xff]) {
            return Err(video_unreadable("invalid JPEG poster"));
        }
        let directory = self.posters_dir();
        fs::create_dir_all(&directory)?;
        let temporary = directory.join(format!(".{id}.tmp"));
        fs::write(&temporary, bytes)?;
        fs::rename(temporary, self.poster_path(id))?;
        Ok(())
    }

    pub fn read_poster(&self, id: i64) -> LibraryResult<Option<Vec<u8>>> {
        match fs::read(self.poster_path(id)) {
            Ok(bytes) => Ok(Some(bytes)),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
            Err(error) => Err(error.into()),
        }
    }

    pub fn remove(&self, id: i64, format: VideoFormat) -> LibraryResult<()> {
        assets::remove_if_exists(&self.original_path(id, format))?;
        assets::remove_if_exists(&self.poster_path(id))
    }

    fn videos_dir(&self) -> PathBuf {
        self.workspace_dir.join("library").join("videos")
    }

    fn posters_dir(&self) -> PathBuf {
        self.videos_dir().join("posters")
    }

    fn original_path(&self, id: i64, format: VideoFormat) -> PathBuf {
        self.videos_dir()
            .join(format!("{id}.{}", format.extension()))
    }

    fn poster_path(&self, id: i64) -> PathBuf {
        self.posters_dir().join(format!("{id}.jpg"))
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct NewVideo {
    pub name: String,
    pub ext: String,
    pub size: i64,
    pub duration_ms: i64,
    pub width: u32,
    pub height: u32,
    pub fps: Option<f64>,
    pub rights: AssetRights,
    pub collection_id: Option<i64>,
    pub tags: Vec<String>,
}

pub fn list(conn: &Connection) -> LibraryResult<Vec<LibraryVideo>> {
    let mut statement = conn.prepare("SELECT id, name, ext, size, duration_ms, width, height, fps, rights, origin, collection_id, has_poster, created_at, updated_at FROM ws_library_videos ORDER BY created_at DESC, id DESC")?;
    let rows = statement.query_map([], video_from_row)?;
    let mut videos = rows.collect::<rusqlite::Result<Vec<_>>>()?;
    for video in &mut videos {
        video.tags = assets::tags_for(conn, VIDEO_TAG_TYPE, video.id)?;
    }
    Ok(videos)
}

pub fn get(conn: &Connection, id: i64) -> LibraryResult<LibraryVideo> {
    let mut video = conn.query_row("SELECT id, name, ext, size, duration_ms, width, height, fps, rights, origin, collection_id, has_poster, created_at, updated_at FROM ws_library_videos WHERE id = ?1", [id], video_from_row).optional()?.ok_or_else(|| video_not_found(id))?;
    video.tags = assets::tags_for(conn, VIDEO_TAG_TYPE, id)?;
    Ok(video)
}

pub fn unique_name(conn: &Connection, name: &str, except_id: Option<i64>) -> LibraryResult<String> {
    assets::unique_name(conn, "ws_library_videos", name, except_id)
}

pub fn insert(conn: &Connection, video: &NewVideo, now: &str) -> LibraryResult<i64> {
    let tags = assets::normalized_tags(&video.tags)?;
    assets::require_collection(conn, video.collection_id)?;
    conn.execute("INSERT INTO ws_library_videos (name, ext, size, duration_ms, width, height, fps, rights, origin, collection_id, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'upload', ?9, ?10, ?10)", params![video.name, video.ext, video.size, video.duration_ms, video.width, video.height, video.fps, video.rights.as_str(), video.collection_id, now])?;
    let id = conn.last_insert_rowid();
    assets::replace_tags(conn, VIDEO_TAG_TYPE, id, &tags)?;
    Ok(id)
}

pub fn update(
    conn: &Connection,
    id: i64,
    patch: &AssetPatch,
    now: &str,
) -> LibraryResult<LibraryVideo> {
    get(conn, id)?;
    if let Some(name) = patch.name.as_deref() {
        let name = unique_name(conn, name, Some(id))?;
        conn.execute(
            "UPDATE ws_library_videos SET name = ?1, updated_at = ?2 WHERE id = ?3",
            params![name, now, id],
        )?;
    }
    if let Some(rights) = patch.rights {
        conn.execute(
            "UPDATE ws_library_videos SET rights = ?1, updated_at = ?2 WHERE id = ?3",
            params![rights.as_str(), now, id],
        )?;
    }
    if let Some(collection_id) = patch.collection_id {
        assets::require_collection(conn, collection_id)?;
        conn.execute(
            "UPDATE ws_library_videos SET collection_id = ?1, updated_at = ?2 WHERE id = ?3",
            params![collection_id, now, id],
        )?;
    }
    if let Some(tags) = patch.tags.as_ref() {
        assets::replace_tags(conn, VIDEO_TAG_TYPE, id, &assets::normalized_tags(tags)?)?;
        conn.execute(
            "UPDATE ws_library_videos SET updated_at = ?1 WHERE id = ?2",
            params![now, id],
        )?;
    }
    get(conn, id)
}

pub fn mark_poster(conn: &Connection, id: i64) -> LibraryResult<()> {
    conn.execute(
        "UPDATE ws_library_videos SET has_poster = 1 WHERE id = ?1",
        [id],
    )?;
    Ok(())
}

pub fn delete(conn: &Connection, ids: &[i64]) -> LibraryResult<Vec<(i64, String)>> {
    let mut removed = Vec::new();
    for id in ids {
        let ext = conn
            .query_row(
                "SELECT ext FROM ws_library_videos WHERE id = ?1",
                [id],
                |row| row.get::<_, String>(0),
            )
            .optional()?;
        let Some(ext) = ext else {
            continue;
        };
        assets::delete_tags(conn, VIDEO_TAG_TYPE, *id)?;
        conn.execute("DELETE FROM ws_library_videos WHERE id = ?1", [id])?;
        removed.push((*id, ext));
    }
    Ok(removed)
}

fn video_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<LibraryVideo> {
    let rights = row.get::<_, String>(8)?;
    let rights = AssetRights::parse(&rights).ok_or_else(|| {
        rusqlite::Error::FromSqlConversionFailure(
            8,
            rusqlite::types::Type::Text,
            format!("invalid video rights: {rights}").into(),
        )
    })?;
    Ok(LibraryVideo {
        id: row.get(0)?,
        name: row.get(1)?,
        ext: row.get(2)?,
        size: row.get(3)?,
        duration_ms: row.get(4)?,
        width: row.get(5)?,
        height: row.get(6)?,
        fps: row.get(7)?,
        rights,
        origin: row.get(9)?,
        collection_id: row.get(10)?,
        tags: Vec::new(),
        has_poster: row.get::<_, i64>(11)? != 0,
        created_at: row.get(12)?,
        updated_at: row.get(13)?,
    })
}

fn video_not_found(id: i64) -> LibraryError {
    LibraryError::new(
        LibraryErrorCode::VideoNotFound,
        format!("video {id} does not exist"),
    )
}

fn video_unreadable(detail: impl Into<String>) -> LibraryError {
    LibraryError::new(LibraryErrorCode::VideoUnreadable, detail)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::infra::storage::migrator::Migrator;
    use crate::infra::storage::migrator::workspace_scripts;
    use std::sync::atomic::AtomicBool;
    use tempfile::TempDir;

    fn test_connection() -> Connection {
        let mut conn = Connection::open_in_memory().unwrap();
        Migrator::migrate(
            &mut conn,
            &workspace_scripts().unwrap(),
            &AtomicBool::new(false),
        )
        .unwrap();
        conn
    }

    fn new_video(name: &str) -> NewVideo {
        NewVideo {
            name: name.to_string(),
            ext: "mp4".to_string(),
            size: 12,
            duration_ms: 2_000,
            width: 1_920,
            height: 1_080,
            fps: None,
            rights: AssetRights::Own,
            collection_id: None,
            tags: vec!["Example".to_string()],
        }
    }

    #[test]
    fn stages_commits_discards_and_reads_video_files() {
        let directory = TempDir::new().unwrap();
        let source = directory.path().join("source.mp4");
        let bytes = b"video data";
        fs::write(&source, bytes).unwrap();
        let files = VideoFiles::new(directory.path().to_path_buf());
        let staged = files.stage(&source).unwrap();
        assert!(staged.exists());
        files.commit(&staged, 7, VideoFormat::Mp4).unwrap();
        assert!(!staged.exists());
        assert_eq!(files.len(7, VideoFormat::Mp4).unwrap(), bytes.len() as u64);
        assert_eq!(
            files.read_range(7, VideoFormat::Mp4, 2, 5).unwrap(),
            bytes[2..7]
        );
        files.discard(&staged).unwrap();
        files.discard(&staged).unwrap();
    }

    #[test]
    fn stores_and_removes_posters_and_videos() {
        let directory = TempDir::new().unwrap();
        let source = directory.path().join("source.mp4");
        fs::write(&source, b"video").unwrap();
        let files = VideoFiles::new(directory.path().to_path_buf());
        let staged = files.stage(&source).unwrap();
        files.commit(&staged, 4, VideoFormat::Mp4).unwrap();
        assert_eq!(files.read_poster(4).unwrap(), None);
        assert_eq!(
            files.write_poster(4, b"not-jpeg").unwrap_err().code,
            LibraryErrorCode::VideoUnreadable
        );
        let oversized = vec![0xff; POSTER_MAX_BYTES + 1];
        assert_eq!(
            files.write_poster(4, &oversized).unwrap_err().code,
            LibraryErrorCode::VideoUnreadable
        );
        let poster = vec![0xff, 0xd8, 0xff, 0xdb];
        files.write_poster(4, &poster).unwrap();
        assert_eq!(files.read_poster(4).unwrap(), Some(poster));
        files.remove(4, VideoFormat::Mp4).unwrap();
        files.remove(4, VideoFormat::Mp4).unwrap();
        assert_eq!(files.read_poster(4).unwrap(), None);
    }

    #[test]
    fn stores_updates_marks_and_deletes_videos() {
        let conn = test_connection();
        let id = insert(&conn, &new_video("clip.mp4"), "2026-01-01T00:00:00Z").unwrap();
        let duplicate = unique_name(&conn, "CLIP.mp4", None).unwrap();
        let patch = AssetPatch {
            name: Some("renamed.mp4".to_string()),
            rights: Some(AssetRights::Licensed),
            collection_id: None,
            tags: Some((0..12).map(|index| format!("tag-{index}")).collect()),
        };
        let videos = list(&conn).unwrap();
        assert_eq!(videos[0].tags, vec!["example"]);
        assert_eq!(videos[0].fps, None);
        assert_eq!(duplicate, "CLIP (2).mp4");
        let tag_limit = AssetPatch {
            tags: Some((0..13).map(|index| format!("too-many-{index}")).collect()),
            ..AssetPatch::default()
        };
        assert_eq!(
            update(&conn, id, &tag_limit, "2026-01-02T00:00:00Z")
                .unwrap_err()
                .code,
            LibraryErrorCode::TagLimit
        );
        let updated = update(&conn, id, &patch, "2026-01-02T00:00:00Z").unwrap();
        assert_eq!(updated.name, "renamed.mp4");
        assert_eq!(updated.rights, AssetRights::Licensed);
        assert_eq!(updated.tags.len(), 12);
        let missing_collection = AssetPatch {
            collection_id: Some(Some(99)),
            ..AssetPatch::default()
        };
        assert_eq!(
            update(&conn, id, &missing_collection, "2026-01-02T00:00:00Z")
                .unwrap_err()
                .code,
            LibraryErrorCode::CollectionNotFound
        );
        mark_poster(&conn, id).unwrap();
        assert!(get(&conn, id).unwrap().has_poster);
        assert_eq!(delete(&conn, &[id]).unwrap(), vec![(id, "mp4".to_string())]);
        assert_eq!(
            conn.query_row(
                "SELECT COUNT(*) FROM ws_tags WHERE type = 'library_video'",
                [],
                |row| row.get::<_, i64>(0)
            )
            .unwrap(),
            0
        );
    }
}
