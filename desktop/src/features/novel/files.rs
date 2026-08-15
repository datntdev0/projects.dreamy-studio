use crate::features::novel::models::NovelError;
use crate::features::novel::models::NovelErrorCode;
use crate::features::novel::models::NovelResult;
use std::fs;
use std::io::ErrorKind;
use std::io::Write;
use std::path::Path;
use std::path::PathBuf;

pub const NOVELS_DIR: &str = "novels";
pub const COVER_MAX_BYTES: usize = 8 * 1024 * 1024;

const COVER_STEM: &str = "cover";
const JPEG_MAGIC: [u8; 3] = [0xFF, 0xD8, 0xFF];
const PNG_MAGIC: [u8; 4] = [0x89, 0x50, 0x4E, 0x47];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CoverKind {
    Jpeg,
    Png,
}

impl CoverKind {
    pub const ALL: [CoverKind; 2] = [CoverKind::Jpeg, CoverKind::Png];

    pub fn extension(self) -> &'static str {
        match self {
            CoverKind::Jpeg => "jpg",
            CoverKind::Png => "png",
        }
    }

    pub fn mime(self) -> &'static str {
        match self {
            CoverKind::Jpeg => "image/jpeg",
            CoverKind::Png => "image/png",
        }
    }

    pub fn from_mime(mime: &str) -> Option<Self> {
        match mime {
            "image/jpeg" => Some(CoverKind::Jpeg),
            "image/png" => Some(CoverKind::Png),
            _ => None,
        }
    }

    pub fn from_extension(name: &str) -> Option<Self> {
        let extension = name.rsplit_once('.')?.1.to_ascii_lowercase();
        match extension.as_str() {
            "jpg" | "jpeg" => Some(CoverKind::Jpeg),
            "png" => Some(CoverKind::Png),
            _ => None,
        }
    }

    pub fn matches(self, bytes: &[u8]) -> bool {
        match self {
            CoverKind::Jpeg => bytes.starts_with(&JPEG_MAGIC),
            CoverKind::Png => bytes.starts_with(&PNG_MAGIC),
        }
    }
}

#[derive(Debug, Clone)]
pub struct NovelFiles {
    root: PathBuf,
}

impl NovelFiles {
    pub fn new(root: PathBuf) -> Self {
        Self { root }
    }

    pub fn novel_dir(&self, novel_id: i64) -> PathBuf {
        self.root.join(NOVELS_DIR).join(novel_id.to_string())
    }

    pub fn ensure_dir(&self, novel_id: i64) -> NovelResult<PathBuf> {
        let dir = self.novel_dir(novel_id);
        fs::create_dir_all(&dir)?;
        Ok(dir)
    }

    pub fn reset_dir(&self, novel_id: i64) -> NovelResult<PathBuf> {
        self.remove_novel_dir(novel_id)?;
        self.ensure_dir(novel_id)
    }

    pub fn remove_novel_dir(&self, novel_id: i64) -> NovelResult<()> {
        match fs::remove_dir_all(self.novel_dir(novel_id)) {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == ErrorKind::NotFound => Ok(()),
            Err(error) => Err(error.into()),
        }
    }

    pub fn write_cover(&self, novel_id: i64, kind: CoverKind, bytes: &[u8]) -> NovelResult<()> {
        let dir = self.ensure_dir(novel_id)?;
        write_atomic(&dir.join(cover_name(kind)), bytes)?;
        for other in CoverKind::ALL {
            if other != kind {
                remove_file_quietly(&dir.join(cover_name(other)))?;
            }
        }
        Ok(())
    }

    pub fn read_cover(&self, novel_id: i64) -> NovelResult<Option<(CoverKind, Vec<u8>)>> {
        let dir = self.novel_dir(novel_id);
        for kind in CoverKind::ALL {
            match fs::read(dir.join(cover_name(kind))) {
                Ok(bytes) => return Ok(Some((kind, bytes))),
                Err(error) if error.kind() == ErrorKind::NotFound => continue,
                Err(error) => return Err(error.into()),
            }
        }
        Ok(None)
    }

    pub fn clear_cover(&self, novel_id: i64) -> NovelResult<()> {
        let dir = self.novel_dir(novel_id);
        for kind in CoverKind::ALL {
            remove_file_quietly(&dir.join(cover_name(kind)))?;
        }
        Ok(())
    }

    pub fn write_chapter(&self, novel_id: i64, chapter_id: &str, text: &str) -> NovelResult<()> {
        let dir = self.ensure_dir(novel_id)?;
        write_atomic(&dir.join(chapter_name(chapter_id)?), text.as_bytes())?;
        Ok(())
    }

    pub fn remove_chapter(&self, novel_id: i64, chapter_id: &str) -> NovelResult<()> {
        remove_file_quietly(&self.novel_dir(novel_id).join(chapter_name(chapter_id)?))
    }

    pub fn read_chapter(&self, novel_id: i64, chapter_id: &str) -> NovelResult<String> {
        let path = self.novel_dir(novel_id).join(chapter_name(chapter_id)?);
        match fs::read(&path) {
            Ok(bytes) => decode_chapter(&path, bytes),
            Err(error) if error.kind() == ErrorKind::NotFound => Err(NovelError::new(
                NovelErrorCode::ChapterFileMissing,
                format!("chapter file {} is missing", path.display()),
            )),
            Err(error) => Err(error.into()),
        }
    }
}

fn decode_chapter(path: &Path, bytes: Vec<u8>) -> NovelResult<String> {
    String::from_utf8(bytes).map_err(|_| {
        NovelError::new(
            NovelErrorCode::Io,
            format!("chapter file {} is not valid UTF-8", path.display()),
        )
    })
}

fn cover_name(kind: CoverKind) -> String {
    format!("{COVER_STEM}.{}", kind.extension())
}

fn chapter_name(chapter_id: &str) -> NovelResult<String> {
    if !is_chapter_id(chapter_id) {
        return Err(NovelError::invalid("chapter id is malformed"));
    }
    Ok(format!("chapter_{chapter_id}.txt"))
}

fn is_chapter_id(value: &str) -> bool {
    value.len() == 32
        && value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}

fn remove_file_quietly(path: &Path) -> NovelResult<()> {
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error.into()),
    }
}

fn write_atomic(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    let temp = temp_path(path);
    let written = write_file(&temp, bytes);
    if written.is_err() {
        let _ = fs::remove_file(&temp);
        return written;
    }
    let renamed = fs::rename(&temp, path);
    if renamed.is_err() {
        let _ = fs::remove_file(&temp);
    }
    renamed
}

fn write_file(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    let mut file = fs::File::create(path)?;
    file.write_all(bytes)
}

fn temp_path(path: &Path) -> PathBuf {
    let mut name = path.file_name().unwrap_or_default().to_os_string();
    name.push(".tmp");
    path.with_file_name(name)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    const CHAPTER: &str = "0123456789abcdef0123456789abcdef";

    #[test]
    fn writes_and_reads_a_chapter_without_leaving_temp_files() {
        let dir = tempdir().unwrap();
        let files = NovelFiles::new(dir.path().to_path_buf());

        files.write_chapter(7, CHAPTER, "one\ntwo\n").unwrap();
        files.write_chapter(7, CHAPTER, "three\n").unwrap();

        assert_eq!(files.read_chapter(7, CHAPTER).unwrap(), "three\n");
        let names: Vec<_> = fs::read_dir(files.novel_dir(7))
            .unwrap()
            .map(|entry| entry.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        assert_eq!(names, vec![format!("chapter_{CHAPTER}.txt")]);
    }

    #[test]
    fn missing_chapter_file_is_a_typed_error() {
        let dir = tempdir().unwrap();
        let files = NovelFiles::new(dir.path().to_path_buf());

        let error = files.read_chapter(7, CHAPTER).unwrap_err();

        assert_eq!(error.code, NovelErrorCode::ChapterFileMissing);
    }

    #[test]
    fn rejects_malformed_chapter_ids() {
        let dir = tempdir().unwrap();
        let files = NovelFiles::new(dir.path().to_path_buf());

        let error = files.read_chapter(7, "../escape").unwrap_err();

        assert_eq!(error.code, NovelErrorCode::InvalidInput);
    }

    #[test]
    fn cover_replaces_the_other_extension_and_clears() {
        let dir = tempdir().unwrap();
        let files = NovelFiles::new(dir.path().to_path_buf());

        files.write_cover(3, CoverKind::Jpeg, b"jpeg").unwrap();
        files.write_cover(3, CoverKind::Png, b"png").unwrap();

        let (kind, bytes) = files.read_cover(3).unwrap().unwrap();
        assert_eq!(kind, CoverKind::Png);
        assert_eq!(bytes, b"png");
        assert!(!files.novel_dir(3).join("cover.jpg").exists());

        files.clear_cover(3).unwrap();
        assert!(files.read_cover(3).unwrap().is_none());
    }

    #[test]
    fn detects_cover_kinds_by_magic_bytes_and_names() {
        assert!(CoverKind::Jpeg.matches(&[0xFF, 0xD8, 0xFF, 0xE0]));
        assert!(!CoverKind::Jpeg.matches(&[0x89, 0x50, 0x4E, 0x47]));
        assert!(CoverKind::Png.matches(&[0x89, 0x50, 0x4E, 0x47, 0x0D]));
        assert_eq!(
            CoverKind::from_extension("a/Cover.JPEG"),
            Some(CoverKind::Jpeg)
        );
        assert_eq!(CoverKind::from_extension("cover.gif"), None);
        assert_eq!(CoverKind::from_mime("image/png"), Some(CoverKind::Png));
        assert_eq!(CoverKind::from_mime("image/gif"), None);
    }

    #[test]
    fn reset_and_remove_novel_dir() {
        let dir = tempdir().unwrap();
        let files = NovelFiles::new(dir.path().to_path_buf());
        files.write_chapter(5, CHAPTER, "x").unwrap();

        files.reset_dir(5).unwrap();
        assert!(files.novel_dir(5).is_dir());
        assert!(
            !files
                .novel_dir(5)
                .join(format!("chapter_{CHAPTER}.txt"))
                .exists()
        );

        files.remove_novel_dir(5).unwrap();
        files.remove_novel_dir(5).unwrap();
        assert!(!files.novel_dir(5).exists());
    }
}
