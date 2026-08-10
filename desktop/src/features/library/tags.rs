use crate::features::library::models::KindCounts;
use crate::features::library::models::LibraryError;
use crate::features::library::models::LibraryErrorCode;
use crate::features::library::models::LibraryKind;
use crate::features::library::models::LibraryResult;
use crate::features::library::models::LibraryTag;
use crate::infra::storage::database::Database;
use crate::shared::tags::normalize_tag;
use rusqlite::TransactionBehavior;

fn library_tag_query() -> &'static str {
    r"SELECT tag, type, COUNT(*) FROM ws_tags WHERE type LIKE 'library\_%' ESCAPE '\' GROUP BY tag, type ORDER BY tag COLLATE NOCASE, type"
}

pub fn list(db: &Database) -> LibraryResult<Vec<LibraryTag>> {
    let mut statement = db.connection().prepare(library_tag_query())?;
    let rows = statement.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, i64>(2)?,
        ))
    })?;
    let mut tags: Vec<LibraryTag> = Vec::new();
    for result in rows {
        let (tag, kind_name, count) = result?;
        let Some(kind) = LibraryKind::ALL
            .into_iter()
            .find(|kind| kind_name == format!("library_{}", kind.as_str()))
        else {
            continue;
        };
        if let Some(existing) = tags.iter_mut().find(|item| item.tag == tag) {
            *existing.counts.get_mut(kind) = count;
        } else {
            let mut counts = KindCounts::default();
            *counts.get_mut(kind) = count;
            tags.push(LibraryTag { tag, counts });
        }
    }
    Ok(tags)
}

pub fn rename(db: &mut Database, from: &str, to: &str) -> LibraryResult<LibraryTag> {
    let to = normalize_tag(to);
    if to.is_empty() {
        return Err(LibraryError::new(
            LibraryErrorCode::InvalidTag,
            "tag name must not be empty",
        ));
    }
    let tx = db
        .connection_mut()
        .transaction_with_behavior(TransactionBehavior::Immediate)?;
    require_tag_conn(&tx, from)?;
    let target_exists: bool = tx.query_row(r"SELECT EXISTS(SELECT 1 FROM ws_tags WHERE tag = ?1 AND type LIKE 'library\_%' ESCAPE '\')", [&to], |row| row.get(0))?;
    if target_exists {
        return Err(LibraryError::new(
            LibraryErrorCode::TagExists,
            format!("tag '{to}' already exists"),
        ));
    }
    tx.execute(
        r"UPDATE ws_tags SET tag = ?1 WHERE tag = ?2 AND type LIKE 'library\_%' ESCAPE '\'",
        rusqlite::params![to, from],
    )?;
    tx.commit()?;
    list(db)?
        .into_iter()
        .find(|item| item.tag == to)
        .ok_or_else(|| {
            LibraryError::new(
                LibraryErrorCode::TagNotFound,
                format!("tag '{to}' does not exist"),
            )
        })
}

fn require_tag_conn(conn: &rusqlite::Connection, tag: &str) -> LibraryResult<()> {
    let found: bool = conn.query_row(r"SELECT EXISTS(SELECT 1 FROM ws_tags WHERE tag = ?1 AND type LIKE 'library\_%' ESCAPE '\')", [tag], |row| row.get(0))?;
    if found {
        Ok(())
    } else {
        Err(LibraryError::new(
            LibraryErrorCode::TagNotFound,
            format!("tag '{tag}' does not exist"),
        ))
    }
}

pub fn merge(db: &mut Database, from: &str, into: &str) -> LibraryResult<LibraryTag> {
    let into = normalize_tag(into);
    if into.is_empty() {
        return Err(LibraryError::new(
            LibraryErrorCode::InvalidTag,
            "tag name must not be empty",
        ));
    }
    let tx = db
        .connection_mut()
        .transaction_with_behavior(TransactionBehavior::Immediate)?;
    require_tag_conn(&tx, from)?;
    require_tag_conn(&tx, &into)?;
    tx.execute(r"INSERT OR IGNORE INTO ws_tags (id, tag, type) SELECT source.id, ?1, source.type FROM ws_tags source WHERE source.tag = ?2 AND source.type LIKE 'library\_%' ESCAPE '\' AND (SELECT COUNT(*) FROM ws_tags existing WHERE existing.id = source.id AND existing.type = source.type) < 12", rusqlite::params![into, from])?;
    tx.execute(
        r"DELETE FROM ws_tags WHERE tag = ?1 AND type LIKE 'library\_%' ESCAPE '\'",
        [from],
    )?;
    tx.commit()?;
    list(db)?
        .into_iter()
        .find(|item| item.tag == into)
        .ok_or_else(|| {
            LibraryError::new(
                LibraryErrorCode::TagNotFound,
                format!("tag '{into}' does not exist"),
            )
        })
}

pub fn delete(db: &mut Database, tag: &str) -> LibraryResult<i64> {
    let tx = db
        .connection_mut()
        .transaction_with_behavior(TransactionBehavior::Immediate)?;
    require_tag_conn(&tx, tag)?;
    let removed = tx.execute(
        r"DELETE FROM ws_tags WHERE tag = ?1 AND type LIKE 'library\_%' ESCAPE '\'",
        [tag],
    )? as i64;
    tx.commit()?;
    Ok(removed)
}
