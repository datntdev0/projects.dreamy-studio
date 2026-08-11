use crate::features::library::collections;
use crate::features::library::images;
use crate::features::library::images::ImageFiles;
use crate::features::library::images::ImageFormat;
use crate::features::library::images::NewImage;
use crate::features::library::models::CollectionInput;
use crate::features::library::models::CollectionPatch;
use crate::features::library::models::ImageCheck;
use crate::features::library::models::ImageCheckStatus;
use crate::features::library::models::ImagePatch;
use crate::features::library::models::ImageUploadInput;
use crate::features::library::models::LibraryCollection;
use crate::features::library::models::LibraryError;
use crate::features::library::models::LibraryErrorCode;
use crate::features::library::models::LibraryImage;
use crate::features::library::models::LibraryResult;
use crate::features::library::models::LibrarySummary;
use crate::features::library::models::LibraryTag;
use crate::features::workspace::inspector::WORKSPACE_DB_FILE;
use crate::features::workspace::repository::format_timestamp;
use crate::features::workspace::session::WorkspaceSession;
use crate::infra::storage::database::Database;
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

    pub fn image_inspect(&self, paths: &[String]) -> LibraryResult<Vec<ImageCheck>> {
        let db = self.database()?;
        paths
            .iter()
            .map(|path| inspect_image(db.connection(), path))
            .collect()
    }

    pub fn image_upload(&self, path: &str, input: ImageUploadInput) -> LibraryResult<LibraryImage> {
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

    pub fn image_update(&self, id: i64, patch: ImagePatch) -> LibraryResult<LibraryImage> {
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
}

fn inspect_image(conn: &rusqlite::Connection, path: &str) -> LibraryResult<ImageCheck> {
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
                ImageCheckStatus::Error,
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
            ImageCheckStatus::Error,
            "empty",
        ));
    }
    if image_format(source).is_err() {
        return Ok(image_check(
            path,
            name,
            size,
            ImageCheckStatus::Error,
            "unsupported",
        ));
    }
    if metadata.len() > images::IMAGE_MAX_BYTES as u64 {
        return Ok(image_check(
            path,
            name,
            size,
            ImageCheckStatus::Error,
            "too_large",
        ));
    }
    if images::unique_name(conn, &name, None)? != name {
        return Ok(image_check(
            path,
            name,
            size,
            ImageCheckStatus::Warn,
            "duplicate_name",
        ));
    }
    Ok(image_check(path, name, size, ImageCheckStatus::Ok, ""))
}

fn image_check(
    path: &str,
    name: String,
    size: i64,
    status: ImageCheckStatus,
    code: &str,
) -> ImageCheck {
    ImageCheck {
        path: path.to_string(),
        name,
        size,
        status,
        code: (!code.is_empty()).then(|| code.to_string()),
    }
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
    use crate::features::library::models::ImageRights;
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

    fn image_input(collection_id: Option<i64>) -> ImageUploadInput {
        ImageUploadInput {
            collection_id,
            tags: vec!["Example".to_string()],
            rights: ImageRights::Own,
        }
    }

    fn write_png(dir: &TempDir, name: &str) -> PathBuf {
        let path = dir.path().join(name);
        fs::write(&path, png_bytes()).unwrap();
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
