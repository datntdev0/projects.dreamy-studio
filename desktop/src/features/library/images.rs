use crate::features::library::models::ImagePatch;
use crate::features::library::models::ImageRights;
use crate::features::library::models::LibraryError;
use crate::features::library::models::LibraryErrorCode;
use crate::features::library::models::LibraryImage;
use crate::features::library::models::LibraryResult;
use crate::shared::tags::normalize_tags;
use base64::Engine;
use image::ImageReader;
use image::imageops::FilterType;
use rusqlite::Connection;
use rusqlite::OptionalExtension;
use rusqlite::params;
use std::fs;
use std::io::Cursor;
use std::path::PathBuf;

pub const IMAGE_MAX_BYTES: usize = 25 * 1024 * 1024;
pub const IMAGE_EXTENSIONS: [&str; 5] = ["png", "jpg", "jpeg", "webp", "gif"];

const IMAGE_TAG_TYPE: &str = "library_image";
const THUMB_MAX_EDGE: u32 = 480;
const MAX_PIXELS: u64 = 100_000_000;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ImageFormat {
    Png,
    Jpeg,
    Webp,
    Gif,
}

impl ImageFormat {
    pub fn from_extension(extension: &str) -> Option<Self> {
        match extension.to_ascii_lowercase().as_str() {
            "png" => Some(Self::Png),
            "jpg" | "jpeg" => Some(Self::Jpeg),
            "webp" => Some(Self::Webp),
            "gif" => Some(Self::Gif),
            _ => None,
        }
    }

    pub fn extension(self) -> &'static str {
        match self {
            Self::Png => "png",
            Self::Jpeg => "jpg",
            Self::Webp => "webp",
            Self::Gif => "gif",
        }
    }

    pub fn mime(self) -> &'static str {
        match self {
            Self::Png => "image/png",
            Self::Jpeg => "image/jpeg",
            Self::Webp => "image/webp",
            Self::Gif => "image/gif",
        }
    }

    pub fn matches(self, bytes: &[u8]) -> bool {
        match self {
            Self::Png => bytes.starts_with(b"\x89PNG\r\n\x1a\n"),
            Self::Jpeg => bytes.starts_with(&[0xff, 0xd8, 0xff]),
            Self::Webp => bytes.len() >= 12 && &bytes[..4] == b"RIFF" && &bytes[8..12] == b"WEBP",
            Self::Gif => bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a"),
        }
    }

    fn image_format(self) -> image::ImageFormat {
        match self {
            Self::Png => image::ImageFormat::Png,
            Self::Jpeg => image::ImageFormat::Jpeg,
            Self::Webp => image::ImageFormat::WebP,
            Self::Gif => image::ImageFormat::Gif,
        }
    }
}

pub fn probe(bytes: &[u8], format: ImageFormat) -> LibraryResult<(u32, u32)> {
    if !format.matches(bytes) {
        return Err(image_error("image extension and file content do not match"));
    }
    let reader = ImageReader::with_format(Cursor::new(bytes), format.image_format());
    let (width, height) = reader.into_dimensions().map_err(image_decode_error)?;
    if width == 0 || height == 0 || u64::from(width) * u64::from(height) > MAX_PIXELS {
        return Err(image_error("image dimensions are invalid or too large"));
    }
    Ok((width, height))
}

#[derive(Debug, Clone)]
pub struct ImageFiles {
    workspace_dir: PathBuf,
}

impl ImageFiles {
    pub fn new(workspace_dir: PathBuf) -> Self {
        Self { workspace_dir }
    }

    pub fn write_original(&self, id: i64, format: ImageFormat, bytes: &[u8]) -> LibraryResult<()> {
        let path = self.original_path(id, format);
        let dir = self.images_dir();
        fs::create_dir_all(&dir)?;
        let temp = dir.join(format!(".{id}.{}.tmp", format.extension()));
        fs::write(&temp, bytes)?;
        if let Err(error) = fs::rename(&temp, &path) {
            let _ = fs::remove_file(&temp);
            return Err(error.into());
        }
        Ok(())
    }

    pub fn write_thumb(&self, id: i64, format: ImageFormat, source: &[u8]) -> LibraryResult<()> {
        probe(source, format)?;
        let image = image::load_from_memory_with_format(source, format.image_format())
            .map_err(image_decode_error)?;
        let thumb = image.resize(THUMB_MAX_EDGE, THUMB_MAX_EDGE, FilterType::Lanczos3);
        let path = self.thumb_path(id, format);
        let parent = path.parent().expect("thumbnail path has a parent");
        fs::create_dir_all(parent)?;
        let mut bytes = Cursor::new(Vec::new());
        let output = if format == ImageFormat::Jpeg {
            image::ImageFormat::Jpeg
        } else {
            image::ImageFormat::Png
        };
        thumb
            .write_to(&mut bytes, output)
            .map_err(image_decode_error)?;
        fs::write(path, bytes.into_inner())?;
        Ok(())
    }

    pub fn read_original(&self, id: i64, format: ImageFormat) -> LibraryResult<Vec<u8>> {
        Ok(fs::read(self.original_path(id, format))?)
    }

    pub fn read_thumb(&self, id: i64, format: ImageFormat) -> LibraryResult<Vec<u8>> {
        let path = self.thumb_path(id, format);
        match fs::read(&path) {
            Ok(bytes) => Ok(bytes),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                let original = self.read_original(id, format)?;
                self.write_thumb(id, format, &original)?;
                Ok(fs::read(path)?)
            }
            Err(error) => Err(error.into()),
        }
    }

    pub fn remove(&self, id: i64, format: ImageFormat) -> LibraryResult<()> {
        remove_if_exists(&self.original_path(id, format))?;
        remove_if_exists(&self.thumb_path(id, format))?;
        Ok(())
    }

    fn images_dir(&self) -> PathBuf {
        self.workspace_dir.join("library").join("images")
    }

    fn original_path(&self, id: i64, format: ImageFormat) -> PathBuf {
        self.images_dir()
            .join(format!("{id}.{}", format.extension()))
    }

    fn thumb_path(&self, id: i64, format: ImageFormat) -> PathBuf {
        self.images_dir()
            .join("thumbs")
            .join(format!("{id}.{}", thumb_extension(format)))
    }
}

pub fn data_url(mime: &str, bytes: &[u8]) -> String {
    format!(
        "data:{mime};base64,{}",
        base64::engine::general_purpose::STANDARD.encode(bytes)
    )
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NewImage {
    pub name: String,
    pub ext: String,
    pub size: i64,
    pub width: u32,
    pub height: u32,
    pub rights: ImageRights,
    pub collection_id: Option<i64>,
    pub tags: Vec<String>,
}

pub fn list(conn: &Connection) -> LibraryResult<Vec<LibraryImage>> {
    let mut statement = conn.prepare("SELECT id, name, ext, size, width, height, rights, origin, collection_id, created_at, updated_at FROM ws_library_images ORDER BY created_at DESC, id DESC")?;
    let rows = statement.query_map([], image_from_row)?;
    let mut images = rows.collect::<rusqlite::Result<Vec<_>>>()?;
    for image in &mut images {
        image.tags = tags_for(conn, image.id)?;
    }
    Ok(images)
}

pub fn get(conn: &Connection, id: i64) -> LibraryResult<LibraryImage> {
    let mut image = conn
        .query_row("SELECT id, name, ext, size, width, height, rights, origin, collection_id, created_at, updated_at FROM ws_library_images WHERE id = ?1", [id], image_from_row)
        .optional()?
        .ok_or_else(|| image_not_found(id))?;
    image.tags = tags_for(conn, id)?;
    Ok(image)
}

pub fn unique_name(conn: &Connection, name: &str, except_id: Option<i64>) -> LibraryResult<String> {
    let (stem, extension) = split_name(name);
    let mut number = 1;
    loop {
        let candidate = if number == 1 {
            name.to_string()
        } else {
            format!("{stem} ({number}){extension}")
        };
        let exists: bool = match except_id {
            Some(id) => conn.query_row("SELECT EXISTS(SELECT 1 FROM ws_library_images WHERE name = ?1 COLLATE NOCASE AND id != ?2)", params![&candidate, id], |row| row.get(0))?,
            None => conn.query_row("SELECT EXISTS(SELECT 1 FROM ws_library_images WHERE name = ?1 COLLATE NOCASE)", [&candidate], |row| row.get(0))?,
        };
        if !exists {
            return Ok(candidate);
        }
        number += 1;
    }
}

pub fn insert(conn: &Connection, image: &NewImage, now: &str) -> LibraryResult<i64> {
    let tags = normalized_tags(&image.tags)?;
    require_collection(conn, image.collection_id)?;
    conn.execute("INSERT INTO ws_library_images (name, ext, size, width, height, rights, origin, collection_id, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'upload', ?7, ?8, ?8)", params![image.name, image.ext, image.size, image.width, image.height, rights_text(image.rights), image.collection_id, now])?;
    let id = conn.last_insert_rowid();
    replace_tags(conn, id, &tags)?;
    Ok(id)
}

pub fn update(
    conn: &Connection,
    id: i64,
    patch: &ImagePatch,
    now: &str,
) -> LibraryResult<LibraryImage> {
    get(conn, id)?;
    if let Some(name) = patch.name.as_deref() {
        let name = unique_name(conn, name, Some(id))?;
        conn.execute(
            "UPDATE ws_library_images SET name = ?1, updated_at = ?2 WHERE id = ?3",
            params![name, now, id],
        )?;
    }
    if let Some(rights) = patch.rights {
        conn.execute(
            "UPDATE ws_library_images SET rights = ?1, updated_at = ?2 WHERE id = ?3",
            params![rights_text(rights), now, id],
        )?;
    }
    if let Some(collection_id) = patch.collection_id {
        require_collection(conn, collection_id)?;
        conn.execute(
            "UPDATE ws_library_images SET collection_id = ?1, updated_at = ?2 WHERE id = ?3",
            params![collection_id, now, id],
        )?;
    }
    if let Some(tags) = patch.tags.as_ref() {
        replace_tags(conn, id, &normalized_tags(tags)?)?;
        conn.execute(
            "UPDATE ws_library_images SET updated_at = ?1 WHERE id = ?2",
            params![now, id],
        )?;
    }
    get(conn, id)
}

pub fn delete(conn: &Connection, ids: &[i64]) -> LibraryResult<Vec<(i64, String)>> {
    let mut removed = Vec::new();
    for id in ids {
        let ext = conn
            .query_row(
                "SELECT ext FROM ws_library_images WHERE id = ?1",
                [id],
                |row| row.get::<_, String>(0),
            )
            .optional()?;
        let Some(ext) = ext else {
            continue;
        };
        conn.execute(
            "DELETE FROM ws_tags WHERE type = ?1 AND id = ?2",
            params![IMAGE_TAG_TYPE, id.to_string()],
        )?;
        conn.execute("DELETE FROM ws_library_images WHERE id = ?1", [id])?;
        removed.push((*id, ext));
    }
    Ok(removed)
}

fn image_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<LibraryImage> {
    let rights = row.get::<_, String>(6)?;
    Ok(LibraryImage {
        id: row.get(0)?,
        name: row.get(1)?,
        ext: row.get(2)?,
        size: row.get(3)?,
        width: row.get(4)?,
        height: row.get(5)?,
        rights: image_rights(&rights)?,
        origin: row.get(7)?,
        collection_id: row.get(8)?,
        tags: Vec::new(),
        created_at: row.get(9)?,
        updated_at: row.get(10)?,
    })
}

fn tags_for(conn: &Connection, id: i64) -> LibraryResult<Vec<String>> {
    let mut statement = conn.prepare(
        "SELECT tag FROM ws_tags WHERE type = ?1 AND id = ?2 ORDER BY tag COLLATE NOCASE",
    )?;
    let rows = statement.query_map(params![IMAGE_TAG_TYPE, id.to_string()], |row| row.get(0))?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

fn replace_tags(conn: &Connection, id: i64, tags: &[String]) -> LibraryResult<()> {
    conn.execute(
        "DELETE FROM ws_tags WHERE type = ?1 AND id = ?2",
        params![IMAGE_TAG_TYPE, id.to_string()],
    )?;
    for tag in tags {
        conn.execute(
            "INSERT INTO ws_tags (id, tag, type) VALUES (?1, ?2, ?3)",
            params![id.to_string(), tag, IMAGE_TAG_TYPE],
        )?;
    }
    Ok(())
}

fn normalized_tags(tags: &[String]) -> LibraryResult<Vec<String>> {
    normalize_tags(tags).map_err(|count| {
        LibraryError::new(
            LibraryErrorCode::TagLimit,
            format!("image has {count} tags; maximum is 12"),
        )
    })
}

fn require_collection(conn: &Connection, collection_id: Option<i64>) -> LibraryResult<()> {
    let Some(collection_id) = collection_id else {
        return Ok(());
    };
    let exists: bool = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM ws_library_collections WHERE id = ?1)",
        [collection_id],
        |row| row.get(0),
    )?;
    if exists {
        Ok(())
    } else {
        Err(LibraryError::new(
            LibraryErrorCode::CollectionNotFound,
            format!("collection {collection_id} does not exist"),
        ))
    }
}

fn split_name(name: &str) -> (&str, &str) {
    match name.rfind('.') {
        Some(index) if index > 0 => (&name[..index], &name[index..]),
        _ => (name, ""),
    }
}

fn thumb_extension(format: ImageFormat) -> &'static str {
    if format == ImageFormat::Jpeg {
        "jpg"
    } else {
        "png"
    }
}

fn remove_if_exists(path: &PathBuf) -> LibraryResult<()> {
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error.into()),
    }
}

fn image_not_found(id: i64) -> LibraryError {
    LibraryError::new(
        LibraryErrorCode::ImageNotFound,
        format!("image {id} does not exist"),
    )
}

fn image_error(detail: impl Into<String>) -> LibraryError {
    LibraryError::new(LibraryErrorCode::ImageUnreadable, detail)
}

fn image_decode_error(error: image::ImageError) -> LibraryError {
    image_error(error.to_string())
}

fn rights_text(rights: ImageRights) -> &'static str {
    match rights {
        ImageRights::Own => "own",
        ImageRights::Licensed => "licensed",
        ImageRights::Free => "free",
        ImageRights::Other => "other",
    }
}

fn image_rights(value: &str) -> rusqlite::Result<ImageRights> {
    match value {
        "own" => Ok(ImageRights::Own),
        "licensed" => Ok(ImageRights::Licensed),
        "free" => Ok(ImageRights::Free),
        "other" => Ok(ImageRights::Other),
        _ => Err(rusqlite::Error::FromSqlConversionFailure(
            6,
            rusqlite::types::Type::Text,
            format!("invalid image rights: {value}").into(),
        )),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::infra::storage::migrator::Migrator;
    use crate::infra::storage::migrator::workspace_scripts;
    use std::sync::atomic::AtomicBool;
    use tempfile::TempDir;

    fn png_bytes() -> Vec<u8> {
        let image = image::DynamicImage::new_rgb8(2, 1);
        let mut bytes = Cursor::new(Vec::new());
        image.write_to(&mut bytes, image::ImageFormat::Png).unwrap();
        bytes.into_inner()
    }

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

    fn new_image(name: &str) -> NewImage {
        NewImage {
            name: name.to_string(),
            ext: "png".to_string(),
            size: 12,
            width: 2,
            height: 1,
            rights: ImageRights::Own,
            collection_id: None,
            tags: vec!["Example".to_string()],
        }
    }

    #[test]
    fn writes_and_reads_original_and_thumb() {
        let dir = TempDir::new().unwrap();
        let files = ImageFiles::new(dir.path().to_path_buf());
        let source = png_bytes();
        files.write_original(1, ImageFormat::Png, &source).unwrap();
        files.write_thumb(1, ImageFormat::Png, &source).unwrap();
        assert_eq!(files.read_original(1, ImageFormat::Png).unwrap(), source);
        assert!(
            files
                .read_thumb(1, ImageFormat::Png)
                .unwrap()
                .starts_with(b"\x89PNG")
        );
    }

    #[test]
    fn missing_thumb_is_rebuilt() {
        let dir = TempDir::new().unwrap();
        let files = ImageFiles::new(dir.path().to_path_buf());
        let source = png_bytes();
        files.write_original(1, ImageFormat::Png, &source).unwrap();
        let thumb = files.read_thumb(1, ImageFormat::Png).unwrap();
        assert!(thumb.starts_with(b"\x89PNG"));
    }

    #[test]
    fn rejects_corrupt_and_mismatched_images() {
        assert_eq!(
            probe(b"not an image", ImageFormat::Png).unwrap_err().code,
            LibraryErrorCode::ImageUnreadable
        );
        assert_eq!(
            probe(&png_bytes(), ImageFormat::Jpeg).unwrap_err().code,
            LibraryErrorCode::ImageUnreadable
        );
    }

    #[test]
    fn remove_is_tolerant_of_missing_files() {
        let dir = TempDir::new().unwrap();
        let files = ImageFiles::new(dir.path().to_path_buf());
        let source = png_bytes();
        files.write_original(1, ImageFormat::Png, &source).unwrap();
        files.write_thumb(1, ImageFormat::Png, &source).unwrap();
        files.remove(1, ImageFormat::Png).unwrap();
        files.remove(1, ImageFormat::Png).unwrap();
    }

    #[test]
    fn repository_stores_images_and_tags() {
        let conn = test_connection();
        let id = insert(&conn, &new_image("forest.png"), "2026-01-01T00:00:00Z").unwrap();
        assert_eq!(
            unique_name(&conn, "forest.png", None).unwrap(),
            "forest (2).png"
        );
        let image = get(&conn, id).unwrap();
        assert_eq!(image.tags, ["example"]);
        let patch = ImagePatch {
            name: Some("forest.png".to_string()),
            rights: Some(ImageRights::Free),
            collection_id: Some(None),
            tags: Some(vec!["green".to_string()]),
        };
        let image = update(&conn, id, &patch, "2026-01-02T00:00:00Z").unwrap();
        assert_eq!(image.rights, ImageRights::Free);
        assert_eq!(image.tags, ["green"]);
        assert_eq!(list(&conn).unwrap().len(), 1);
        assert_eq!(delete(&conn, &[id]).unwrap(), vec![(id, "png".to_string())]);
        assert!(list(&conn).unwrap().is_empty());
    }
}
