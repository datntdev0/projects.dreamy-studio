use crate::features::library::assets;
use crate::features::library::models::AssetPatch;
use crate::features::library::models::AssetRights;
use crate::features::library::models::LibraryError;
use crate::features::library::models::LibraryErrorCode;
use crate::features::library::models::LibraryImage;
use crate::features::library::models::LibraryResult;
use image::ImageReader;
use image::imageops::FilterType;
use rusqlite::Connection;
use rusqlite::OptionalExtension;
use rusqlite::params;
use std::fs;
use std::io::Cursor;
use std::path::PathBuf;

pub use crate::features::library::assets::data_url;

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
        assets::remove_if_exists(&self.original_path(id, format))?;
        assets::remove_if_exists(&self.thumb_path(id, format))?;
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

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NewImage {
    pub name: String,
    pub ext: String,
    pub size: i64,
    pub width: u32,
    pub height: u32,
    pub rights: AssetRights,
    pub collection_id: Option<i64>,
    pub tags: Vec<String>,
}

pub fn list(conn: &Connection) -> LibraryResult<Vec<LibraryImage>> {
    let mut statement = conn.prepare("SELECT id, name, ext, size, width, height, rights, origin, collection_id, created_at, updated_at FROM ws_library_images ORDER BY created_at DESC, id DESC")?;
    let rows = statement.query_map([], image_from_row)?;
    let mut images = rows.collect::<rusqlite::Result<Vec<_>>>()?;
    for image in &mut images {
        image.tags = assets::tags_for(conn, IMAGE_TAG_TYPE, image.id)?;
    }
    Ok(images)
}

pub fn get(conn: &Connection, id: i64) -> LibraryResult<LibraryImage> {
    let mut image = conn
        .query_row("SELECT id, name, ext, size, width, height, rights, origin, collection_id, created_at, updated_at FROM ws_library_images WHERE id = ?1", [id], image_from_row)
        .optional()?
        .ok_or_else(|| image_not_found(id))?;
    image.tags = assets::tags_for(conn, IMAGE_TAG_TYPE, id)?;
    Ok(image)
}

pub fn unique_name(conn: &Connection, name: &str, except_id: Option<i64>) -> LibraryResult<String> {
    assets::unique_name(conn, "ws_library_images", name, except_id)
}

pub fn insert(conn: &Connection, image: &NewImage, now: &str) -> LibraryResult<i64> {
    let tags = assets::normalized_tags(&image.tags)?;
    assets::require_collection(conn, image.collection_id)?;
    conn.execute("INSERT INTO ws_library_images (name, ext, size, width, height, rights, origin, collection_id, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'upload', ?7, ?8, ?8)", params![image.name, image.ext, image.size, image.width, image.height, image.rights.as_str(), image.collection_id, now])?;
    let id = conn.last_insert_rowid();
    assets::replace_tags(conn, IMAGE_TAG_TYPE, id, &tags)?;
    Ok(id)
}

pub fn update(
    conn: &Connection,
    id: i64,
    patch: &AssetPatch,
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
            params![rights.as_str(), now, id],
        )?;
    }
    if let Some(collection_id) = patch.collection_id {
        assets::require_collection(conn, collection_id)?;
        conn.execute(
            "UPDATE ws_library_images SET collection_id = ?1, updated_at = ?2 WHERE id = ?3",
            params![collection_id, now, id],
        )?;
    }
    if let Some(tags) = patch.tags.as_ref() {
        assets::replace_tags(conn, IMAGE_TAG_TYPE, id, &assets::normalized_tags(tags)?)?;
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
        assets::delete_tags(conn, IMAGE_TAG_TYPE, *id)?;
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
        rights: AssetRights::parse(&rights).ok_or_else(|| {
            rusqlite::Error::FromSqlConversionFailure(
                6,
                rusqlite::types::Type::Text,
                format!("invalid image rights: {rights}").into(),
            )
        })?,
        origin: row.get(7)?,
        collection_id: row.get(8)?,
        tags: Vec::new(),
        created_at: row.get(9)?,
        updated_at: row.get(10)?,
    })
}

fn thumb_extension(format: ImageFormat) -> &'static str {
    if format == ImageFormat::Jpeg {
        "jpg"
    } else {
        "png"
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

#[cfg(test)]
#[path = "../../../test/features/library/images.test.rs"]
mod tests;
