use crate::features::novel::models::ChapterRow;
use crate::features::novel::models::NovelSummary;
use rusqlite::Connection;
use rusqlite::OptionalExtension;
use rusqlite::Row;
use rusqlite::params;
use std::collections::HashMap;

pub const TAG_TYPE_NOVEL: &str = "novel";

const SUMMARY_SELECT: &str = "SELECT n.id, n.title, n.name, n.author, n.lang, n.description, \
    n.origin, n.created_at, n.updated_at, COUNT(c.id), COALESCE(SUM(c.word_count), 0), \
    COALESCE(SUM(c.translation_status != 'none'), 0), \
    COALESCE(SUM(c.analysis_status != 'none'), 0) \
    FROM ws_novels n LEFT JOIN ws_novel_chapters c ON c.novel_id = n.id";

const CHAPTER_SELECT: &str = "SELECT id, novel_id, seq, title, word_count, translation_status, \
    analysis_status, created_at, updated_at FROM ws_novel_chapters";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NovelRow {
    pub id: i64,
    pub title: String,
    pub name: String,
    pub author: String,
    pub lang: String,
    pub description: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NewNovel<'a> {
    pub title: &'a str,
    pub name: &'a str,
    pub author: &'a str,
    pub lang: &'a str,
    pub description: &'a str,
    pub origin: &'a str,
    pub now: &'a str,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NewChapter<'a> {
    pub id: &'a str,
    pub novel_id: i64,
    pub seq: i64,
    pub title: &'a str,
    pub word_count: i64,
    pub now: &'a str,
}

pub struct NovelRepository<'a> {
    conn: &'a Connection,
}

impl<'a> NovelRepository<'a> {
    pub fn new(conn: &'a Connection) -> Self {
        Self { conn }
    }

    pub fn insert_novel(&self, novel: &NewNovel) -> rusqlite::Result<i64> {
        self.conn.execute(
            "INSERT INTO ws_novels (title, name, author, lang, description, origin, created_at, \
             updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)",
            params![
                novel.title,
                novel.name,
                novel.author,
                novel.lang,
                novel.description,
                novel.origin,
                novel.now
            ],
        )?;
        Ok(self.conn.last_insert_rowid())
    }

    pub fn find_novel(&self, id: i64) -> rusqlite::Result<Option<NovelRow>> {
        self.conn
            .query_row(
                "SELECT id, title, name, author, lang, description FROM ws_novels WHERE id = ?1",
                [id],
                row_to_novel,
            )
            .optional()
    }

    pub fn update_novel(&self, novel: &NovelRow, now: &str) -> rusqlite::Result<()> {
        self.conn.execute(
            "UPDATE ws_novels SET title = ?2, name = ?3, author = ?4, lang = ?5, \
             description = ?6, updated_at = ?7 WHERE id = ?1",
            params![
                novel.id,
                novel.title,
                novel.name,
                novel.author,
                novel.lang,
                novel.description,
                now
            ],
        )?;
        Ok(())
    }

    pub fn touch_novel(&self, id: i64, now: &str) -> rusqlite::Result<()> {
        self.conn.execute(
            "UPDATE ws_novels SET updated_at = ?2 WHERE id = ?1",
            params![id, now],
        )?;
        Ok(())
    }

    pub fn delete_novel(&self, id: i64) -> rusqlite::Result<bool> {
        self.conn.execute(
            "DELETE FROM ws_tags WHERE type = ?1 AND id = ?2",
            params![TAG_TYPE_NOVEL, id.to_string()],
        )?;
        let removed = self
            .conn
            .execute("DELETE FROM ws_novels WHERE id = ?1", [id])?;
        Ok(removed > 0)
    }

    pub fn replace_tags(&self, id: i64, tags: &[String]) -> rusqlite::Result<()> {
        let key = id.to_string();
        self.conn.execute(
            "DELETE FROM ws_tags WHERE type = ?1 AND id = ?2",
            params![TAG_TYPE_NOVEL, key],
        )?;
        for tag in tags {
            self.conn.execute(
                "INSERT OR IGNORE INTO ws_tags (id, tag, type) VALUES (?1, ?2, ?3)",
                params![key, tag, TAG_TYPE_NOVEL],
            )?;
        }
        Ok(())
    }

    pub fn list_summaries(&self) -> rusqlite::Result<Vec<NovelSummary>> {
        let mut tags = self.tags_by_novel()?;
        let sql = format!("{SUMMARY_SELECT} GROUP BY n.id ORDER BY n.id");
        let mut statement = self.conn.prepare(&sql)?;
        let rows = statement.query_map([], row_to_summary)?;
        let mut summaries = rows.collect::<rusqlite::Result<Vec<_>>>()?;
        for summary in &mut summaries {
            summary.tags = tags.remove(&summary.id).unwrap_or_default();
        }
        Ok(summaries)
    }

    pub fn find_summary(&self, id: i64) -> rusqlite::Result<Option<NovelSummary>> {
        let sql = format!("{SUMMARY_SELECT} WHERE n.id = ?1 GROUP BY n.id");
        let found = self.conn.query_row(&sql, [id], row_to_summary).optional()?;
        match found {
            Some(mut summary) => {
                summary.tags = self.tags_of(id)?;
                Ok(Some(summary))
            }
            None => Ok(None),
        }
    }

    pub fn tags_of(&self, id: i64) -> rusqlite::Result<Vec<String>> {
        let mut statement = self
            .conn
            .prepare("SELECT tag FROM ws_tags WHERE type = ?1 AND id = ?2 ORDER BY tag")?;
        let rows = statement.query_map(params![TAG_TYPE_NOVEL, id.to_string()], first_text)?;
        rows.collect()
    }

    pub fn insert_chapter(&self, chapter: &NewChapter) -> rusqlite::Result<()> {
        self.conn.execute(
            "INSERT INTO ws_novel_chapters (id, novel_id, seq, title, word_count, created_at, \
             updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)",
            params![
                chapter.id,
                chapter.novel_id,
                chapter.seq,
                chapter.title,
                chapter.word_count,
                chapter.now
            ],
        )?;
        Ok(())
    }

    pub fn list_chapters(&self, novel_id: i64) -> rusqlite::Result<Vec<ChapterRow>> {
        let sql = format!("{CHAPTER_SELECT} WHERE novel_id = ?1 ORDER BY seq");
        let mut statement = self.conn.prepare(&sql)?;
        let rows = statement.query_map([novel_id], row_to_chapter)?;
        rows.collect()
    }

    pub fn max_seq(&self, novel_id: i64) -> rusqlite::Result<i64> {
        self.conn.query_row(
            "SELECT COALESCE(MAX(seq), 0) FROM ws_novel_chapters WHERE novel_id = ?1",
            [novel_id],
            |row| row.get(0),
        )
    }

    pub fn find_chapter(
        &self,
        novel_id: i64,
        chapter_id: &str,
    ) -> rusqlite::Result<Option<ChapterRow>> {
        let sql = format!("{CHAPTER_SELECT} WHERE novel_id = ?1 AND id = ?2");
        self.conn
            .query_row(&sql, params![novel_id, chapter_id], row_to_chapter)
            .optional()
    }

    pub fn update_chapter_text(
        &self,
        chapter_id: &str,
        word_count: i64,
        now: &str,
    ) -> rusqlite::Result<()> {
        self.conn.execute(
            "UPDATE ws_novel_chapters SET word_count = ?2, updated_at = ?3 WHERE id = ?1",
            params![chapter_id, word_count, now],
        )?;
        Ok(())
    }

    pub fn rename_chapter(&self, chapter_id: &str, title: &str, now: &str) -> rusqlite::Result<()> {
        self.conn.execute(
            "UPDATE ws_novel_chapters SET title = ?2, updated_at = ?3 WHERE id = ?1",
            params![chapter_id, title, now],
        )?;
        Ok(())
    }

    pub fn delete_chapter(&self, chapter_id: &str) -> rusqlite::Result<()> {
        self.conn
            .execute("DELETE FROM ws_novel_chapters WHERE id = ?1", [chapter_id])?;
        Ok(())
    }

    pub fn set_chapter_seq(&self, chapter_id: &str, seq: i64, now: &str) -> rusqlite::Result<()> {
        self.conn.execute(
            "UPDATE ws_novel_chapters SET seq = ?2, updated_at = ?3 WHERE id = ?1",
            params![chapter_id, seq, now],
        )?;
        Ok(())
    }

    fn tags_by_novel(&self) -> rusqlite::Result<HashMap<i64, Vec<String>>> {
        let mut statement = self
            .conn
            .prepare("SELECT id, tag FROM ws_tags WHERE type = ?1 ORDER BY id, tag")?;
        let rows = statement.query_map([TAG_TYPE_NOVEL], row_to_tag)?;
        let mut grouped: HashMap<i64, Vec<String>> = HashMap::new();
        for row in rows {
            let (key, tag) = row?;
            if let Ok(id) = key.parse::<i64>() {
                grouped.entry(id).or_default().push(tag);
            }
        }
        Ok(grouped)
    }
}

fn first_text(row: &Row) -> rusqlite::Result<String> {
    row.get(0)
}

fn row_to_tag(row: &Row) -> rusqlite::Result<(String, String)> {
    Ok((row.get(0)?, row.get(1)?))
}

fn row_to_novel(row: &Row) -> rusqlite::Result<NovelRow> {
    Ok(NovelRow {
        id: row.get(0)?,
        title: row.get(1)?,
        name: row.get(2)?,
        author: row.get(3)?,
        lang: row.get(4)?,
        description: row.get(5)?,
    })
}

fn row_to_summary(row: &Row) -> rusqlite::Result<NovelSummary> {
    Ok(NovelSummary {
        id: row.get(0)?,
        title: row.get(1)?,
        name: row.get(2)?,
        author: row.get(3)?,
        lang: row.get(4)?,
        description: row.get(5)?,
        origin: row.get(6)?,
        created_at: row.get(7)?,
        updated_at: row.get(8)?,
        chapter_count: row.get(9)?,
        word_count: row.get(10)?,
        translated_count: row.get(11)?,
        analyzed_count: row.get(12)?,
        tags: Vec::new(),
    })
}

fn row_to_chapter(row: &Row) -> rusqlite::Result<ChapterRow> {
    Ok(ChapterRow {
        id: row.get(0)?,
        novel_id: row.get(1)?,
        seq: row.get(2)?,
        title: row.get(3)?,
        word_count: row.get(4)?,
        translation_status: row.get(5)?,
        analysis_status: row.get(6)?,
        created_at: row.get(7)?,
        updated_at: row.get(8)?,
    })
}
