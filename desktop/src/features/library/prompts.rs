use crate::features::library::assets;
use crate::features::library::models::AssetRights;
use crate::features::library::models::LibraryError;
use crate::features::library::models::LibraryErrorCode;
use crate::features::library::models::LibraryPrompt;
use crate::features::library::models::LibraryResult;
use crate::features::library::models::PromptKind;
use crate::features::library::models::PromptPatch;
use rusqlite::Connection;
use rusqlite::OptionalExtension;
use rusqlite::params;
use std::fs;
use std::path::PathBuf;

pub const PROMPT_MAX_BYTES: usize = 256 * 1024;
pub const PROMPT_NAME_MAX: usize = 120;

const PROMPT_TAG_TYPE: &str = "library_prompt";

#[derive(Debug, Clone)]
pub struct PromptFiles {
    workspace_dir: PathBuf,
}

impl PromptFiles {
    pub fn new(workspace_dir: PathBuf) -> Self {
        Self { workspace_dir }
    }

    pub fn write(&self, id: i64, text: &str) -> LibraryResult<()> {
        let directory = self.prompts_dir();
        fs::create_dir_all(&directory)?;
        let temporary = self.temporary_path(id);
        fs::write(&temporary, text)?;
        fs::rename(temporary, self.path(id))?;
        Ok(())
    }

    pub fn read(&self, id: i64) -> LibraryResult<String> {
        decode_file(&fs::read(self.path(id))?)
    }

    pub fn read_or_empty(&self, id: i64) -> String {
        self.read(id).unwrap_or_default()
    }

    pub fn remove(&self, id: i64) -> LibraryResult<()> {
        assets::remove_if_exists(&self.path(id))?;
        assets::remove_if_exists(&self.temporary_path(id))
    }

    fn prompts_dir(&self) -> PathBuf {
        self.workspace_dir.join("library").join("prompts")
    }

    fn path(&self, id: i64) -> PathBuf {
        self.prompts_dir().join(format!("{id}.txt"))
    }

    fn temporary_path(&self, id: i64) -> PathBuf {
        self.prompts_dir().join(format!(".{id}.txt.tmp"))
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NewPrompt {
    pub name: String,
    pub kind: PromptKind,
    pub text: String,
    pub rights: AssetRights,
    pub collection_id: Option<i64>,
    pub tags: Vec<String>,
}

pub fn decode_file(bytes: &[u8]) -> LibraryResult<String> {
    let text = std::str::from_utf8(bytes)
        .map_err(|error| prompt_error(LibraryErrorCode::PromptUnreadable, error.to_string()))?;
    normalize_text(text)
}

pub fn normalize_text(text: &str) -> LibraryResult<String> {
    if text.len() > PROMPT_MAX_BYTES {
        return Err(prompt_error(
            LibraryErrorCode::PromptTooLarge,
            "prompt text exceeds 256 KiB",
        ));
    }
    let text = text.strip_prefix('\u{feff}').unwrap_or(text);
    let text = text.replace("\r\n", "\n");
    let text = text.trim().to_string();
    if text.is_empty() {
        return Err(prompt_error(
            LibraryErrorCode::PromptEmpty,
            "prompt text is empty",
        ));
    }
    Ok(text)
}

pub fn normalize_name(name: &str) -> LibraryResult<String> {
    let name = name.trim();
    if name.is_empty() || name.chars().count() > PROMPT_NAME_MAX {
        return Err(prompt_error(
            LibraryErrorCode::PromptNameInvalid,
            "prompt name must contain 1 to 120 characters",
        ));
    }
    Ok(name.to_string())
}

pub fn normalize_patch(patch: &PromptPatch) -> LibraryResult<PromptPatch> {
    Ok(PromptPatch {
        name: patch.name.as_deref().map(normalize_name).transpose()?,
        kind: patch.kind,
        text: patch.text.as_deref().map(normalize_text).transpose()?,
        rights: patch.rights,
        collection_id: patch.collection_id,
        tags: patch.tags.clone(),
    })
}

pub fn list(conn: &Connection, files: &PromptFiles) -> LibraryResult<Vec<LibraryPrompt>> {
    let mut statement = conn.prepare("SELECT id, name, kind, size, rights, origin, collection_id, created_at, updated_at FROM ws_library_prompts ORDER BY created_at DESC, id DESC")?;
    let rows = statement.query_map([], prompt_from_row)?;
    let mut prompts = rows.collect::<rusqlite::Result<Vec<_>>>()?;
    for prompt in &mut prompts {
        prompt.text = files.read_or_empty(prompt.id);
        prompt.tags = assets::tags_for(conn, PROMPT_TAG_TYPE, prompt.id)?;
    }
    Ok(prompts)
}

pub fn get(conn: &Connection, files: &PromptFiles, id: i64) -> LibraryResult<LibraryPrompt> {
    let mut prompt = get_row(conn, id)?;
    prompt.text = files.read_or_empty(id);
    prompt.tags = assets::tags_for(conn, PROMPT_TAG_TYPE, id)?;
    Ok(prompt)
}

pub fn unique_name(conn: &Connection, name: &str, except: Option<i64>) -> LibraryResult<String> {
    let mut number = 1;
    loop {
        let candidate = if number == 1 {
            name.to_string()
        } else {
            format!("{name} ({number})")
        };
        let exists: bool = match except {
            Some(id) => conn.query_row("SELECT EXISTS(SELECT 1 FROM ws_library_prompts WHERE name = ?1 COLLATE NOCASE AND id != ?2)", params![candidate, id], |row| row.get(0))?,
            None => conn.query_row("SELECT EXISTS(SELECT 1 FROM ws_library_prompts WHERE name = ?1 COLLATE NOCASE)", [candidate.as_str()], |row| row.get(0))?,
        };
        if !exists {
            return Ok(candidate);
        }
        number += 1;
    }
}

pub fn insert(conn: &Connection, prompt: &NewPrompt, now: &str) -> LibraryResult<i64> {
    let tags = assets::normalized_tags(&prompt.tags)?;
    assets::require_collection(conn, prompt.collection_id)?;
    conn.execute("INSERT INTO ws_library_prompts (name, kind, size, rights, origin, collection_id, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, 'app', ?5, ?6, ?6)", params![prompt.name, prompt.kind.as_str(), prompt.text.len() as i64, prompt.rights.as_str(), prompt.collection_id, now])?;
    let id = conn.last_insert_rowid();
    assets::replace_tags(conn, PROMPT_TAG_TYPE, id, &tags)?;
    Ok(id)
}

pub fn update(conn: &Connection, id: i64, patch: &PromptPatch, now: &str) -> LibraryResult<()> {
    get_row(conn, id)?;
    if let Some(name) = patch.name.as_deref() {
        let name = unique_name(conn, name, Some(id))?;
        conn.execute(
            "UPDATE ws_library_prompts SET name = ?1, updated_at = ?2 WHERE id = ?3",
            params![name, now, id],
        )?;
    }
    if let Some(kind) = patch.kind {
        conn.execute(
            "UPDATE ws_library_prompts SET kind = ?1, updated_at = ?2 WHERE id = ?3",
            params![kind.as_str(), now, id],
        )?;
    }
    if let Some(text) = patch.text.as_deref() {
        conn.execute(
            "UPDATE ws_library_prompts SET size = ?1, updated_at = ?2 WHERE id = ?3",
            params![text.len() as i64, now, id],
        )?;
    }
    if let Some(rights) = patch.rights {
        conn.execute(
            "UPDATE ws_library_prompts SET rights = ?1, updated_at = ?2 WHERE id = ?3",
            params![rights.as_str(), now, id],
        )?;
    }
    if let Some(collection_id) = patch.collection_id {
        assets::require_collection(conn, collection_id)?;
        conn.execute(
            "UPDATE ws_library_prompts SET collection_id = ?1, updated_at = ?2 WHERE id = ?3",
            params![collection_id, now, id],
        )?;
    }
    if let Some(tags) = patch.tags.as_ref() {
        assets::replace_tags(conn, PROMPT_TAG_TYPE, id, &assets::normalized_tags(tags)?)?;
        conn.execute(
            "UPDATE ws_library_prompts SET updated_at = ?1 WHERE id = ?2",
            params![now, id],
        )?;
    }
    Ok(())
}

pub fn delete(conn: &Connection, ids: &[i64]) -> LibraryResult<Vec<i64>> {
    let mut removed = Vec::new();
    for id in ids {
        if conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM ws_library_prompts WHERE id = ?1)",
            [id],
            |row| row.get::<_, bool>(0),
        )? {
            assets::delete_tags(conn, PROMPT_TAG_TYPE, *id)?;
            conn.execute("DELETE FROM ws_library_prompts WHERE id = ?1", [id])?;
            removed.push(*id);
        }
    }
    Ok(removed)
}

fn get_row(conn: &Connection, id: i64) -> LibraryResult<LibraryPrompt> {
    conn.query_row("SELECT id, name, kind, size, rights, origin, collection_id, created_at, updated_at FROM ws_library_prompts WHERE id = ?1", [id], prompt_from_row)
        .optional()?
        .ok_or_else(|| prompt_error(LibraryErrorCode::PromptNotFound, format!("prompt {id} does not exist")))
}

fn prompt_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<LibraryPrompt> {
    let kind = row.get::<_, String>(2)?;
    let kind = PromptKind::parse(&kind).ok_or_else(|| {
        rusqlite::Error::FromSqlConversionFailure(
            2,
            rusqlite::types::Type::Text,
            format!("invalid prompt kind: {kind}").into(),
        )
    })?;
    let rights = row.get::<_, String>(4)?;
    let rights = AssetRights::parse(&rights).ok_or_else(|| {
        rusqlite::Error::FromSqlConversionFailure(
            4,
            rusqlite::types::Type::Text,
            format!("invalid prompt rights: {rights}").into(),
        )
    })?;
    Ok(LibraryPrompt {
        id: row.get(0)?,
        name: row.get(1)?,
        kind,
        text: String::new(),
        size: row.get(3)?,
        rights,
        origin: row.get(5)?,
        collection_id: row.get(6)?,
        tags: Vec::new(),
        created_at: row.get(7)?,
        updated_at: row.get(8)?,
    })
}

fn prompt_error(code: LibraryErrorCode, detail: impl Into<String>) -> LibraryError {
    LibraryError::new(code, detail)
}

#[cfg(test)]
#[path = "../../../test/features/library/prompts.test.rs"]
mod tests;
