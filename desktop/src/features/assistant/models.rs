use crate::features::pipeline::usage::ContextUsage;
use rusqlite::Error as SqliteError;
use serde::Deserialize;
use serde::Serialize;
use std::fmt;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ScopeKind {
    Workspace,
    Novel,
    Project,
}

impl ScopeKind {
    pub fn as_str(self) -> &'static str {
        match self {
            ScopeKind::Workspace => "workspace",
            ScopeKind::Novel => "novel",
            ScopeKind::Project => "project",
        }
    }

    pub fn parse(value: &str) -> Self {
        match value {
            "novel" => ScopeKind::Novel,
            "project" => ScopeKind::Project,
            _ => ScopeKind::Workspace,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssistantScope {
    pub kind: ScopeKind,
    #[serde(default)]
    pub novel_id: Option<i64>,
    #[serde(default)]
    pub project_id: Option<i64>,
}

impl AssistantScope {
    pub fn workspace() -> Self {
        Self {
            kind: ScopeKind::Workspace,
            novel_id: None,
            project_id: None,
        }
    }

    pub fn novel(id: i64) -> Self {
        Self {
            kind: ScopeKind::Novel,
            novel_id: Some(id),
            project_id: None,
        }
    }

    pub fn project(id: i64) -> Self {
        Self {
            kind: ScopeKind::Project,
            novel_id: None,
            project_id: Some(id),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Role {
    User,
    Assistant,
}

impl Role {
    pub fn as_str(self) -> &'static str {
        match self {
            Role::User => "user",
            Role::Assistant => "assistant",
        }
    }

    pub fn parse(value: &str) -> Self {
        match value {
            "assistant" => Role::Assistant,
            _ => Role::User,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssistantCitation {
    pub novel_id: i64,
    pub chapter: i64,
    pub p: i64,
    pub quote: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssistantMessage {
    pub id: String,
    pub role: Role,
    pub text: String,
    pub created_at: String,
    pub activities: Vec<String>,
    pub citations: Vec<AssistantCitation>,
    pub attachments: Vec<serde_json::Value>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AssistantSessionSummary {
    pub id: String,
    pub title: String,
    pub scope: AssistantScope,
    pub created_at: String,
    pub updated_at: String,
    pub message_count: i64,
    pub preview: String,
    pub edit_granted: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AssistantSession {
    #[serde(flatten)]
    pub summary: AssistantSessionSummary,
    pub messages: Vec<AssistantMessage>,
    pub context: Option<ContextUsage>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SessionRecord {
    pub summary: AssistantSessionSummary,
    pub provider: Option<String>,
    pub cli_session: Option<String>,
    pub context: Option<ContextUsage>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum AssistantContext {
    #[serde(rename_all = "camelCase")]
    TranslationReview { chapter_id: String, target: String },
    #[serde(rename_all = "camelCase")]
    KnowledgeReview {
        lang: String,
        issue_ids: Vec<String>,
    },
    #[serde(rename_all = "camelCase")]
    ScriptRewrite {
        unit_id: String,
        #[serde(default)]
        note: Option<String>,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Decision {
    Applied,
    Rejected,
}

impl Decision {
    pub fn as_str(self) -> &'static str {
        match self {
            Decision::Applied => "applied",
            Decision::Rejected => "rejected",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "applied" => Some(Decision::Applied),
            "rejected" => Some(Decision::Rejected),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum AssistantEvent {
    Activity { label: String },
    Changed(AssistantChange),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ChangeTarget {
    Novel,
    Chapter,
    Knowledge,
    Translation,
    Script,
    Project,
    Audiobook,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AssistantChange {
    pub target: ChangeTarget,
    pub novel_id: Option<i64>,
    pub project_id: Option<i64>,
    pub chapter_id: Option<String>,
    pub lang: Option<String>,
    pub translation_target: Option<String>,
}

impl AssistantChange {
    pub fn in_project(target: ChangeTarget, project_id: i64, chapter_id: Option<String>) -> Self {
        Self {
            target,
            novel_id: None,
            project_id: Some(project_id),
            chapter_id,
            lang: None,
            translation_target: None,
        }
    }
}

pub trait AssistantEventSink: Send + Sync {
    fn emit(&self, event: AssistantEvent);
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum AssistantErrorCode {
    Invalid,
    NotFound,
    Busy,
    NoWorkspace,
    Llm,
    Storage,
    Conflict,
}

impl AssistantErrorCode {
    pub fn as_str(self) -> &'static str {
        match self {
            AssistantErrorCode::Invalid => "invalid",
            AssistantErrorCode::NotFound => "not_found",
            AssistantErrorCode::Busy => "busy",
            AssistantErrorCode::NoWorkspace => "no_workspace",
            AssistantErrorCode::Llm => "llm",
            AssistantErrorCode::Storage => "storage",
            AssistantErrorCode::Conflict => "conflict",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct AssistantError {
    pub code: AssistantErrorCode,
    pub detail: String,
}

impl AssistantError {
    pub fn new(code: AssistantErrorCode, detail: impl Into<String>) -> Self {
        Self {
            code,
            detail: detail.into(),
        }
    }

    pub fn invalid(detail: impl Into<String>) -> Self {
        Self::new(AssistantErrorCode::Invalid, detail)
    }

    pub fn not_found(detail: impl Into<String>) -> Self {
        Self::new(AssistantErrorCode::NotFound, detail)
    }

    pub fn busy(detail: impl Into<String>) -> Self {
        Self::new(AssistantErrorCode::Busy, detail)
    }

    pub fn no_workspace(detail: impl Into<String>) -> Self {
        Self::new(AssistantErrorCode::NoWorkspace, detail)
    }

    pub fn llm(detail: impl Into<String>) -> Self {
        Self::new(AssistantErrorCode::Llm, detail)
    }

    pub fn storage(detail: impl Into<String>) -> Self {
        Self::new(AssistantErrorCode::Storage, detail)
    }

    pub fn conflict(detail: impl Into<String>) -> Self {
        Self::new(AssistantErrorCode::Conflict, detail)
    }
}

pub type AssistantResult<T> = Result<T, AssistantError>;

impl fmt::Display for AssistantError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{} ({})", self.detail, self.code.as_str())
    }
}

impl std::error::Error for AssistantError {}

impl From<SqliteError> for AssistantError {
    fn from(source: SqliteError) -> Self {
        Self::storage(source.to_string())
    }
}

#[cfg(test)]
#[path = "../../../test/features/assistant/models.test.rs"]
mod tests;
