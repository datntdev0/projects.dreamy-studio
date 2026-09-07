use crate::features::assistant::models::AssistantCitation;
use crate::features::assistant::models::AssistantMessage;
use crate::features::assistant::models::AssistantScope;
use crate::features::assistant::models::AssistantSessionSummary;
use crate::features::assistant::models::Role;
use crate::features::assistant::models::ScopeKind;
use crate::features::assistant::models::SessionRecord;
use rusqlite::Connection;
use rusqlite::OptionalExtension;
use rusqlite::Row;
use rusqlite::params;
use serde::de::DeserializeOwned;

const SESSION_COLUMNS: &str = "id, title, scope_kind, novel_id, project_id, message_count, \
     preview, created_at, updated_at, edit_granted";

pub struct AssistantRepository<'a> {
    conn: &'a Connection,
}

impl<'a> AssistantRepository<'a> {
    pub fn new(conn: &'a Connection) -> Self {
        Self { conn }
    }

    pub fn insert_session(&self, record: &SessionRecord) -> rusqlite::Result<()> {
        let summary = &record.summary;
        self.conn.execute(
            "INSERT INTO ws_assistant_sessions \
             (id, title, scope_kind, novel_id, project_id, provider, cli_session, message_count, \
              preview, created_at, updated_at, edit_granted) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
            params![
                summary.id,
                summary.title,
                summary.scope.kind.as_str(),
                summary.scope.novel_id,
                summary.scope.project_id,
                record.provider,
                record.cli_session,
                summary.message_count,
                summary.preview,
                summary.created_at,
                summary.updated_at,
                summary.edit_granted
            ],
        )?;
        Ok(())
    }

    pub fn update_session(&self, record: &SessionRecord) -> rusqlite::Result<()> {
        let summary = &record.summary;
        self.conn.execute(
            "UPDATE ws_assistant_sessions \
             SET title = ?2, scope_kind = ?3, novel_id = ?4, project_id = ?5, provider = ?6, \
                 cli_session = ?7, message_count = ?8, preview = ?9, updated_at = ?10, \
                 edit_granted = ?11 \
             WHERE id = ?1",
            params![
                summary.id,
                summary.title,
                summary.scope.kind.as_str(),
                summary.scope.novel_id,
                summary.scope.project_id,
                record.provider,
                record.cli_session,
                summary.message_count,
                summary.preview,
                summary.updated_at,
                summary.edit_granted
            ],
        )?;
        Ok(())
    }

    pub fn list(&self) -> rusqlite::Result<Vec<AssistantSessionSummary>> {
        let mut statement = self.conn.prepare(&format!(
            "SELECT {SESSION_COLUMNS} FROM ws_assistant_sessions \
             WHERE message_count > 0 ORDER BY updated_at DESC, created_at DESC, id"
        ))?;
        let rows = statement.query_map([], row_to_summary)?;
        rows.collect()
    }

    pub fn find(&self, id: &str) -> rusqlite::Result<Option<SessionRecord>> {
        self.conn
            .query_row(
                &format!(
                    "SELECT {SESSION_COLUMNS}, provider, cli_session \
                     FROM ws_assistant_sessions WHERE id = ?1"
                ),
                params![id],
                |row| {
                    Ok(SessionRecord {
                        summary: row_to_summary(row)?,
                        provider: row.get(10)?,
                        cli_session: row.get(11)?,
                    })
                },
            )
            .optional()
    }

    pub fn messages(&self, id: &str) -> rusqlite::Result<Vec<AssistantMessage>> {
        let mut statement = self.conn.prepare(
            "SELECT id, role, text, created_at, activities, citations, attachments \
             FROM ws_assistant_messages WHERE session_id = ?1 ORDER BY seq",
        )?;
        let rows = statement.query_map(params![id], row_to_message)?;
        rows.collect()
    }

    pub fn append(&self, session_id: &str, message: &AssistantMessage) -> rusqlite::Result<i64> {
        let seq: i64 = self.conn.query_row(
            "SELECT COALESCE(MAX(seq), 0) + 1 FROM ws_assistant_messages WHERE session_id = ?1",
            params![session_id],
            |row| row.get(0),
        )?;
        self.conn.execute(
            "INSERT INTO ws_assistant_messages \
             (id, session_id, seq, role, text, activities, citations, attachments, created_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                message.id,
                session_id,
                seq,
                message.role.as_str(),
                message.text,
                to_json(&message.activities),
                to_json(&message.citations),
                to_json(&message.attachments),
                message.created_at
            ],
        )?;
        Ok(seq)
    }

    pub fn find_message(
        &self,
        session_id: &str,
        message_id: &str,
    ) -> rusqlite::Result<Option<AssistantMessage>> {
        self.conn
            .query_row(
                "SELECT id, role, text, created_at, activities, citations, attachments                  FROM ws_assistant_messages WHERE session_id = ?1 AND id = ?2",
                params![session_id, message_id],
                row_to_message,
            )
            .optional()
    }

    pub fn update_attachments(
        &self,
        message_id: &str,
        attachments: &[serde_json::Value],
    ) -> rusqlite::Result<()> {
        self.conn.execute(
            "UPDATE ws_assistant_messages SET attachments = ?2 WHERE id = ?1",
            params![message_id, to_json(attachments)],
        )?;
        Ok(())
    }

    pub fn remove_message(&self, id: &str) -> rusqlite::Result<()> {
        self.conn.execute(
            "DELETE FROM ws_assistant_messages WHERE id = ?1",
            params![id],
        )?;
        Ok(())
    }

    pub fn delete(&self, id: &str) -> rusqlite::Result<bool> {
        let transaction = self.conn.unchecked_transaction()?;
        transaction.execute(
            "DELETE FROM ws_assistant_messages WHERE session_id = ?1",
            params![id],
        )?;
        let deleted = transaction.execute(
            "DELETE FROM ws_assistant_sessions WHERE id = ?1",
            params![id],
        )?;
        transaction.commit()?;
        Ok(deleted > 0)
    }
}

fn row_to_summary(row: &Row<'_>) -> rusqlite::Result<AssistantSessionSummary> {
    let kind: String = row.get(2)?;
    Ok(AssistantSessionSummary {
        id: row.get(0)?,
        title: row.get(1)?,
        scope: AssistantScope {
            kind: ScopeKind::parse(&kind),
            novel_id: row.get(3)?,
            project_id: row.get(4)?,
        },
        message_count: row.get(5)?,
        preview: row.get(6)?,
        created_at: row.get(7)?,
        updated_at: row.get(8)?,
        edit_granted: row.get(9)?,
    })
}

fn row_to_message(row: &Row<'_>) -> rusqlite::Result<AssistantMessage> {
    let role: String = row.get(1)?;
    let activities: String = row.get(4)?;
    let citations: String = row.get(5)?;
    let attachments: String = row.get(6)?;
    Ok(AssistantMessage {
        id: row.get(0)?,
        role: Role::parse(&role),
        text: row.get(2)?,
        created_at: row.get(3)?,
        activities: from_json::<String>(&activities),
        citations: from_json::<AssistantCitation>(&citations),
        attachments: from_json::<serde_json::Value>(&attachments),
    })
}

fn from_json<T: DeserializeOwned>(raw: &str) -> Vec<T> {
    serde_json::from_str(raw).unwrap_or_default()
}

fn to_json<T: serde::Serialize>(items: &[T]) -> String {
    serde_json::to_string(items).unwrap_or_else(|_| "[]".to_string())
}

#[cfg(test)]
#[path = "../../../test/features/assistant/repository.test.rs"]
mod tests;
