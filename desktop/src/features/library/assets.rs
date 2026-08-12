use crate::features::library::models::AssetCheck;
use crate::features::library::models::AssetCheckStatus;
use crate::features::library::models::LibraryError;
use crate::features::library::models::LibraryErrorCode;
use crate::features::library::models::LibraryResult;
use crate::shared::tags::normalize_tags;
use base64::Engine;
use rusqlite::Connection;
use rusqlite::params;
use std::fs;
use std::path::Path;

pub fn data_url(mime: &str, bytes: &[u8]) -> String {
    format!(
        "data:{mime};base64,{}",
        base64::engine::general_purpose::STANDARD.encode(bytes)
    )
}

pub fn tags_for(conn: &Connection, tag_type: &str, id: i64) -> LibraryResult<Vec<String>> {
    let mut statement = conn.prepare(
        "SELECT tag FROM ws_tags WHERE type = ?1 AND id = ?2 ORDER BY tag COLLATE NOCASE",
    )?;
    let rows = statement.query_map(params![tag_type, id.to_string()], |row| row.get(0))?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

pub fn replace_tags(
    conn: &Connection,
    tag_type: &str,
    id: i64,
    tags: &[String],
) -> LibraryResult<()> {
    delete_tags(conn, tag_type, id)?;
    for tag in tags {
        conn.execute(
            "INSERT INTO ws_tags (id, tag, type) VALUES (?1, ?2, ?3)",
            params![id.to_string(), tag, tag_type],
        )?;
    }
    Ok(())
}

pub fn delete_tags(conn: &Connection, tag_type: &str, id: i64) -> LibraryResult<()> {
    conn.execute(
        "DELETE FROM ws_tags WHERE type = ?1 AND id = ?2",
        params![tag_type, id.to_string()],
    )?;
    Ok(())
}

pub fn normalized_tags(tags: &[String]) -> LibraryResult<Vec<String>> {
    normalize_tags(tags).map_err(|count| {
        LibraryError::new(
            LibraryErrorCode::TagLimit,
            format!("asset has {count} tags; maximum is 12"),
        )
    })
}

pub fn require_collection(conn: &Connection, collection_id: Option<i64>) -> LibraryResult<()> {
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

pub fn unique_name(
    conn: &Connection,
    table: &str,
    name: &str,
    except_id: Option<i64>,
) -> LibraryResult<String> {
    let (stem, extension) = split_name(name);
    let mut number = 1;
    let query = match except_id {
        Some(_) => format!(
            "SELECT EXISTS(SELECT 1 FROM {table} WHERE name = ?1 COLLATE NOCASE AND id != ?2)"
        ),
        None => format!("SELECT EXISTS(SELECT 1 FROM {table} WHERE name = ?1 COLLATE NOCASE)"),
    };
    loop {
        let candidate = if number == 1 {
            name.to_string()
        } else {
            format!("{stem} ({number}){extension}")
        };
        let exists: bool = match except_id {
            Some(id) => conn.query_row(&query, params![candidate, id], |row| row.get(0))?,
            None => conn.query_row(&query, [candidate.as_str()], |row| row.get(0))?,
        };
        if !exists {
            return Ok(candidate);
        }
        number += 1;
    }
}

pub fn remove_if_exists(path: &Path) -> LibraryResult<()> {
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error.into()),
    }
}

pub fn file_name(path: &Path) -> LibraryResult<String> {
    path.file_name()
        .and_then(|name| name.to_str())
        .map(ToOwned::to_owned)
        .ok_or_else(|| {
            LibraryError::new(
                LibraryErrorCode::InvalidInput,
                format!("path has no valid file name: {}", path.display()),
            )
        })
}

pub fn check(
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

fn split_name(name: &str) -> (&str, &str) {
    match name.rfind('.') {
        Some(index) if index > 0 => (&name[..index], &name[index..]),
        _ => (name, ""),
    }
}
