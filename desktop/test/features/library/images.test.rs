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
        rights: AssetRights::Own,
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
    let patch = AssetPatch {
        name: Some("forest.png".to_string()),
        rights: Some(AssetRights::Free),
        collection_id: Some(None),
        tags: Some(vec!["green".to_string()]),
    };
    let image = update(&conn, id, &patch, "2026-01-02T00:00:00Z").unwrap();
    assert_eq!(image.rights, AssetRights::Free);
    assert_eq!(image.tags, ["green"]);
    assert_eq!(list(&conn).unwrap().len(), 1);
    assert_eq!(delete(&conn, &[id]).unwrap(), vec![(id, "png".to_string())]);
    assert!(list(&conn).unwrap().is_empty());
}
