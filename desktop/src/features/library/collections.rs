use crate::features::library::models::CollectionInput;
use crate::features::library::models::CollectionPatch;
use crate::features::library::models::KindCounts;
use crate::features::library::models::LibraryCollection;
use crate::features::library::models::LibraryError;
use crate::features::library::models::LibraryErrorCode;
use crate::features::library::models::LibraryKind;
use crate::features::library::models::LibraryResult;
use crate::features::workspace::repository::format_timestamp;
use crate::infra::storage::database::Database;
use chrono::Utc;
use rusqlite::TransactionBehavior;

#[derive(Debug, Clone, Copy)]
pub struct AssetTable {
    pub kind: LibraryKind,
    pub table: &'static str,
}

pub const ASSET_TABLES: &[AssetTable] = &[AssetTable {
    kind: LibraryKind::Image,
    table: "ws_library_images",
}];

fn now_text() -> String {
    format_timestamp(Utc::now())
}

fn clean_name(raw: &str) -> LibraryResult<String> {
    let name = raw.trim();
    if name.is_empty() || name.chars().count() > 80 {
        return Err(LibraryError::new(
            LibraryErrorCode::InvalidInput,
            "collection name must contain 1 to 80 characters",
        ));
    }
    Ok(name.to_string())
}

fn clean_description(raw: &str) -> LibraryResult<String> {
    let description = raw.trim();
    if description.chars().count() > 500 {
        return Err(LibraryError::new(
            LibraryErrorCode::InvalidInput,
            "collection description must be at most 500 characters",
        ));
    }
    Ok(description.to_string())
}

fn counts_for(
    conn: &rusqlite::Connection,
    id: i64,
    tables: &[AssetTable],
) -> LibraryResult<KindCounts> {
    let mut counts = KindCounts::default();
    for entry in tables {
        let sql = format!(
            "SELECT COUNT(*) FROM {} WHERE collection_id = ?1",
            entry.table
        );
        *counts.get_mut(entry.kind) = conn.query_row(&sql, [id], |row| row.get(0))?;
    }
    Ok(counts)
}

fn map_collection(
    row: &rusqlite::Row<'_>,
    counts: KindCounts,
) -> rusqlite::Result<LibraryCollection> {
    Ok(LibraryCollection {
        id: row.get(0)?,
        name: row.get(1)?,
        description: row.get(2)?,
        created_at: row.get(3)?,
        updated_at: row.get(4)?,
        counts,
    })
}

pub fn list(db: &Database, tables: &[AssetTable]) -> LibraryResult<Vec<LibraryCollection>> {
    let conn = db.connection();
    let mut statement = conn.prepare("SELECT id, name, description, created_at, updated_at FROM ws_library_collections ORDER BY name COLLATE NOCASE, id")?;
    let rows = statement.query_map([], |row| {
        Ok((
            row.get::<_, i64>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, String>(3)?,
            row.get::<_, String>(4)?,
        ))
    })?;
    let mut output = Vec::new();
    for result in rows {
        let (id, name, description, created_at, updated_at) = result?;
        output.push(LibraryCollection {
            id,
            name,
            description,
            created_at,
            updated_at,
            counts: counts_for(conn, id, tables)?,
        });
    }
    Ok(output)
}

pub fn create(
    db: &mut Database,
    input: CollectionInput,
    tables: &[AssetTable],
) -> LibraryResult<LibraryCollection> {
    let name = clean_name(&input.name)?;
    let description = clean_description(&input.description)?;
    let tx = db
        .connection_mut()
        .transaction_with_behavior(TransactionBehavior::Immediate)?;
    let now = now_text();
    let result = tx.execute("INSERT INTO ws_library_collections (name, description, created_at, updated_at) VALUES (?1, ?2, ?3, ?3)", rusqlite::params![name, description, now]);
    if let Err(error) = result {
        if matches!(error, rusqlite::Error::SqliteFailure(ref code, _) if code.code == rusqlite::ErrorCode::ConstraintViolation)
        {
            return Err(LibraryError::new(
                LibraryErrorCode::CollectionExists,
                "collection name already exists",
            ));
        }
        return Err(error.into());
    }
    let id = tx.last_insert_rowid();
    let collection = tx.query_row("SELECT id, name, description, created_at, updated_at FROM ws_library_collections WHERE id = ?1", [id], |row| map_collection(row, KindCounts::default()))?;
    let mut collection = collection;
    collection.counts = counts_for(&tx, id, tables)?;
    tx.commit()?;
    Ok(collection)
}

pub fn update(
    db: &mut Database,
    id: i64,
    patch: CollectionPatch,
    tables: &[AssetTable],
) -> LibraryResult<LibraryCollection> {
    let name = patch.name.as_deref().map(clean_name).transpose()?;
    let description = patch
        .description
        .as_deref()
        .map(clean_description)
        .transpose()?;
    let tx = db
        .connection_mut()
        .transaction_with_behavior(TransactionBehavior::Immediate)?;
    let exists: bool = tx.query_row(
        "SELECT EXISTS(SELECT 1 FROM ws_library_collections WHERE id = ?1)",
        [id],
        |row| row.get(0),
    )?;
    if !exists {
        return Err(LibraryError::new(
            LibraryErrorCode::CollectionNotFound,
            format!("collection {id} does not exist"),
        ));
    }
    if let Some(value) = name.as_deref() {
        let result = tx.execute(
            "UPDATE ws_library_collections SET name = ?1, updated_at = ?2 WHERE id = ?3",
            rusqlite::params![value, now_text(), id],
        );
        if let Err(error) = result {
            if matches!(error, rusqlite::Error::SqliteFailure(ref code, _) if code.code == rusqlite::ErrorCode::ConstraintViolation)
            {
                return Err(LibraryError::new(
                    LibraryErrorCode::CollectionExists,
                    "collection name already exists",
                ));
            }
            return Err(error.into());
        }
    }
    if let Some(value) = description.as_deref() {
        tx.execute(
            "UPDATE ws_library_collections SET description = ?1, updated_at = ?2 WHERE id = ?3",
            rusqlite::params![value, now_text(), id],
        )?;
    }
    let row = tx.query_row("SELECT id, name, description, created_at, updated_at FROM ws_library_collections WHERE id = ?1", [id], |row| map_collection(row, KindCounts::default()))?;
    let mut row = row;
    row.counts = counts_for(&tx, id, tables)?;
    tx.commit()?;
    Ok(row)
}

pub fn delete(db: &mut Database, id: i64, tables: &[AssetTable]) -> LibraryResult<i64> {
    let tx = db
        .connection_mut()
        .transaction_with_behavior(TransactionBehavior::Immediate)?;
    let exists: bool = tx.query_row(
        "SELECT EXISTS(SELECT 1 FROM ws_library_collections WHERE id = ?1)",
        [id],
        |row| row.get(0),
    )?;
    if !exists {
        return Err(LibraryError::new(
            LibraryErrorCode::CollectionNotFound,
            format!("collection {id} does not exist"),
        ));
    }
    let mut unlinked = 0;
    for entry in tables {
        let sql = format!(
            "UPDATE {} SET collection_id = NULL WHERE collection_id = ?1",
            entry.table
        );
        unlinked += tx.execute(&sql, [id])? as i64;
    }
    tx.execute("DELETE FROM ws_library_collections WHERE id = ?1", [id])?;
    tx.commit()?;
    Ok(unlinked)
}

pub fn summary(db: &Database, tables: &[AssetTable]) -> LibraryResult<(KindCounts, KindCounts)> {
    let mut assets = KindCounts::default();
    let mut unfiled = KindCounts::default();
    for entry in tables {
        let total = format!("SELECT COUNT(*) FROM {}", entry.table);
        let no_collection = format!(
            "SELECT COUNT(*) FROM {} WHERE collection_id IS NULL",
            entry.table
        );
        *assets.get_mut(entry.kind) = db.connection().query_row(&total, [], |row| row.get(0))?;
        *unfiled.get_mut(entry.kind) = db
            .connection()
            .query_row(&no_collection, [], |row| row.get(0))?;
    }
    Ok((assets, unfiled))
}
