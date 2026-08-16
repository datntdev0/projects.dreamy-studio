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
