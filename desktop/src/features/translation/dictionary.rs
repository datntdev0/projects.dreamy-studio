use crate::features::translation::models::DictEntry;
use crate::features::translation::models::DictInput;
use crate::features::translation::models::TranslationTarget;
use rusqlite::Connection;
use rusqlite::OptionalExtension;
use rusqlite::Row;
use rusqlite::params;

pub struct DictionaryRepository<'a> {
    conn: &'a Connection,
}

impl<'a> DictionaryRepository<'a> {
    pub fn new(conn: &'a Connection) -> Self {
        Self { conn }
    }

    pub fn list(
        &self,
        novel_id: i64,
        target: TranslationTarget,
    ) -> rusqlite::Result<Vec<DictEntry>> {
        let mut statement = self.conn.prepare(
            "SELECT id, src, dst, type, note FROM ws_novel_translation_dictionary \
             WHERE novel_id = ?1 AND target = ?2 ORDER BY id",
        )?;
        let rows = statement.query_map(params![novel_id, target.as_str()], row_to_entry)?;
        rows.collect()
    }

    pub fn find(&self, novel_id: i64, id: i64) -> rusqlite::Result<Option<DictEntry>> {
        self.conn
            .query_row(
                "SELECT id, src, dst, type, note FROM ws_novel_translation_dictionary \
                 WHERE novel_id = ?1 AND id = ?2",
                params![novel_id, id],
                row_to_entry,
            )
            .optional()
    }

    pub fn insert(
        &self,
        novel_id: i64,
        target: TranslationTarget,
        input: &DictInput,
        now: &str,
    ) -> rusqlite::Result<i64> {
        self.conn.execute(
            "INSERT INTO ws_novel_translation_dictionary \
             (novel_id, target, src, dst, type, note, created_at, updated_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)",
            params![
                novel_id,
                target.as_str(),
                input.src,
                input.dst,
                input.kind,
                input.note,
                now
            ],
        )?;
        Ok(self.conn.last_insert_rowid())
    }

    pub fn update(&self, novel_id: i64, entry: &DictEntry, now: &str) -> rusqlite::Result<bool> {
        let updated = self.conn.execute(
            "UPDATE ws_novel_translation_dictionary \
             SET src = ?3, dst = ?4, type = ?5, note = ?6, updated_at = ?7 \
             WHERE novel_id = ?1 AND id = ?2",
            params![
                novel_id, entry.id, entry.src, entry.dst, entry.kind, entry.note, now
            ],
        )?;
        Ok(updated > 0)
    }

    pub fn delete(&self, novel_id: i64, id: i64) -> rusqlite::Result<bool> {
        let deleted = self.conn.execute(
            "DELETE FROM ws_novel_translation_dictionary WHERE novel_id = ?1 AND id = ?2",
            params![novel_id, id],
        )?;
        Ok(deleted > 0)
    }
}

pub fn is_duplicate(error: &rusqlite::Error) -> bool {
    match error {
        rusqlite::Error::SqliteFailure(sqlite, Some(message)) => {
            sqlite.extended_code == rusqlite::ffi::SQLITE_CONSTRAINT_UNIQUE
                && message.contains("ws_novel_translation_dictionary.novel_id")
                && message.contains("ws_novel_translation_dictionary.target")
                && message.contains("ws_novel_translation_dictionary.src")
        }
        _ => false,
    }
}

fn row_to_entry(row: &Row<'_>) -> rusqlite::Result<DictEntry> {
    Ok(DictEntry {
        id: row.get(0)?,
        src: row.get(1)?,
        dst: row.get(2)?,
        kind: row.get(3)?,
        note: row.get(4)?,
    })
}

#[cfg(test)]
#[path = "../../../test/features/translation/dictionary.test.rs"]
mod tests;
