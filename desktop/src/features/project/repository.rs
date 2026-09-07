use crate::features::project::models::ProjectSummary;
use crate::features::project::modules::decode_modules;
use crate::features::project::modules::effective_modules;
use crate::features::project::modules::encode_modules;
use rusqlite::Connection;
use rusqlite::OptionalExtension;
use rusqlite::Row;
use rusqlite::params;

const SUMMARY: &str = "SELECT p.id, p.name, 'projects/' || p.id, p.template, p.description, p.novel_id, \
    CASE WHEN p.novel_id IS NOT NULL AND n.id IS NULL THEN 1 ELSE 0 END, p.src_kind, p.src_lang, \
    p.archived, p.created_at, p.updated_at, p.opened_at, p.modules \
    FROM ws_projects p LEFT JOIN ws_novels n ON n.id = p.novel_id";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProjectRow {
    pub id: i64,
    pub name: String,
    pub folder: String,
    pub template: String,
    pub description: String,
    pub modules: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NewProject<'a> {
    pub name: &'a str,
    pub template: &'a str,
    pub description: &'a str,
    pub novel_id: Option<i64>,
    pub src_kind: Option<&'a str>,
    pub src_lang: Option<&'a str>,
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
                "SELECT id, name, 'projects/' || id, template, description, modules FROM ws_projects WHERE id = ?1",
                [id],
                |row| {
                    Ok(ProjectRow {
                        id: row.get(0)?,
                        name: row.get(1)?,
                        folder: row.get(2)?,
                        template: row.get(3)?,
                        description: row.get(4)?,
                        modules: decode_modules(&row.get::<_, String>(5)?),
                    })
                },
            )
            .optional()
    }

    pub fn novel_lang(&self, id: i64) -> rusqlite::Result<Option<String>> {
        self.conn
            .query_row("SELECT lang FROM ws_novels WHERE id = ?1", [id], |row| {
                row.get(0)
            })
            .optional()
    }

    pub fn insert(&self, project: &NewProject) -> rusqlite::Result<i64> {
        self.conn.execute(
            "INSERT INTO ws_projects (name, template, description, novel_id, src_kind, src_lang, created_at, updated_at, opened_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7, ?7)",
            params![project.name, project.template, project.description, project.novel_id, project.src_kind, project.src_lang, project.now],
        )?;
        Ok(self.conn.last_insert_rowid())
    }

    pub fn update(&self, row: &ProjectRow, now: &str) -> rusqlite::Result<()> {
        self.conn.execute(
            "UPDATE ws_projects SET name = ?2, description = ?3, modules = ?4, updated_at = ?5 WHERE id = ?1",
            params![row.id, row.name, row.description, encode_modules(&row.modules), now],
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
    let template: String = row.get(3)?;
    let modules = effective_modules(&template, &decode_modules(&row.get::<_, String>(13)?));
    Ok(ProjectSummary {
        id: row.get(0)?,
        name: row.get(1)?,
        folder: row.get(2)?,
        template,
        description: row.get(4)?,
        novel_id: row.get(5)?,
        novel_missing: row.get::<_, i64>(6)? != 0,
        src_kind: row.get(7)?,
        src_lang: row.get(8)?,
        archived: row.get::<_, i64>(9)? != 0,
        modules,
        created_at: row.get(10)?,
        updated_at: row.get(11)?,
        opened_at: row.get(12)?,
    })
}
