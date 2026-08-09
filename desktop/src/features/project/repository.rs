use crate::features::project::models::ProjectSummary;
use rusqlite::Connection;
use rusqlite::OptionalExtension;
use rusqlite::Row;
use rusqlite::params;

const SUMMARY: &str = "SELECT p.id, p.name, p.folder, p.template, p.description, p.novel_id, \
    CASE WHEN p.novel_id IS NOT NULL AND n.id IS NULL THEN 1 ELSE 0 END, p.src_kind, p.src_lang, \
    p.range_from, p.range_to, p.archived, p.created_at, p.updated_at, p.opened_at \
    FROM ws_projects p LEFT JOIN ws_novels n ON n.id = p.novel_id";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProjectRow {
    pub id: i64,
    pub name: String,
    pub folder: String,
    pub template: String,
    pub description: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NewProject<'a> {
    pub name: &'a str,
    pub folder: &'a str,
    pub template: &'a str,
    pub description: &'a str,
    pub novel_id: Option<i64>,
    pub src_kind: Option<&'a str>,
    pub src_lang: Option<&'a str>,
    pub range_from: Option<i64>,
    pub range_to: Option<i64>,
    pub now: &'a str,
}

pub struct ProjectRepository<'a> {
    conn: &'a Connection,
}

impl<'a> ProjectRepository<'a> {
    pub fn new(conn: &'a Connection) -> Self {
        Self { conn }
    }

    pub fn list(&self) -> rusqlite::Result<Vec<ProjectSummary>> {
        let mut statement = self.conn.prepare(&format!("{SUMMARY} ORDER BY p.id"))?;
        statement.query_map([], row_to_summary)?.collect()
    }

    pub fn find_summary(&self, id: i64) -> rusqlite::Result<Option<ProjectSummary>> {
        self.conn
            .query_row(&format!("{SUMMARY} WHERE p.id = ?1"), [id], row_to_summary)
            .optional()
    }

    pub fn find_project(&self, id: i64) -> rusqlite::Result<Option<ProjectRow>> {
        self.conn
            .query_row(
                "SELECT id, name, folder, template, description FROM ws_projects WHERE id = ?1",
                [id],
                |row| {
                    Ok(ProjectRow {
                        id: row.get(0)?,
                        name: row.get(1)?,
                        folder: row.get(2)?,
                        template: row.get(3)?,
                        description: row.get(4)?,
                    })
                },
            )
            .optional()
    }

    pub fn novel(&self, id: i64) -> rusqlite::Result<Option<(String, i64)>> {
        self.conn.query_row(
            "SELECT n.lang, COUNT(c.id) FROM ws_novels n LEFT JOIN ws_novel_chapters c ON c.novel_id = n.id WHERE n.id = ?1 GROUP BY n.id",
            [id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        ).optional()
    }

    pub fn insert(&self, project: &NewProject) -> rusqlite::Result<i64> {
        self.conn.execute(
            "INSERT INTO ws_projects (name, folder, template, description, novel_id, src_kind, src_lang, range_from, range_to, created_at, updated_at, opened_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10, ?10)",
            params![project.name, project.folder, project.template, project.description, project.novel_id, project.src_kind, project.src_lang, project.range_from, project.range_to, project.now],
        )?;
        Ok(self.conn.last_insert_rowid())
    }

    pub fn update(&self, row: &ProjectRow, now: &str) -> rusqlite::Result<()> {
        self.conn.execute(
            "UPDATE ws_projects SET name = ?2, description = ?3, updated_at = ?4 WHERE id = ?1",
            params![row.id, row.name, row.description, now],
        )?;
        Ok(())
    }

    pub fn archive(&self, id: i64, archived: bool, now: &str) -> rusqlite::Result<()> {
        self.conn.execute(
            "UPDATE ws_projects SET archived = ?2, updated_at = ?3 WHERE id = ?1",
            params![id, archived, now],
        )?;
        Ok(())
    }

    pub fn touch_opened(&self, id: i64, now: &str) -> rusqlite::Result<()> {
        self.conn.execute(
            "UPDATE ws_projects SET opened_at = ?2 WHERE id = ?1",
            params![id, now],
        )?;
        Ok(())
    }

    pub fn delete(&self, id: i64) -> rusqlite::Result<bool> {
        Ok(self
            .conn
            .execute("DELETE FROM ws_projects WHERE id = ?1", [id])?
            > 0)
    }
}

fn row_to_summary(row: &Row<'_>) -> rusqlite::Result<ProjectSummary> {
    Ok(ProjectSummary {
        id: row.get(0)?,
        name: row.get(1)?,
        folder: row.get(2)?,
        template: row.get(3)?,
        description: row.get(4)?,
        novel_id: row.get(5)?,
        novel_missing: row.get::<_, i64>(6)? != 0,
        src_kind: row.get(7)?,
        src_lang: row.get(8)?,
        range_from: row.get(9)?,
        range_to: row.get(10)?,
        archived: row.get::<_, i64>(11)? != 0,
        created_at: row.get(12)?,
        updated_at: row.get(13)?,
        opened_at: row.get(14)?,
    })
}
