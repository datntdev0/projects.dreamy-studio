use crate::infra::storage::StorageError;
use serde::Deserialize;
use serde::Serialize;
use std::collections::BTreeMap;
use std::fmt;

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChapterAnalysis {
    pub ontology: u32,
    pub source_hash: String,
    pub analyzed_at: String,
    #[serde(default)]
    pub entities: Vec<AnalysisEntity>,
    #[serde(default)]
    pub facts: Vec<AnalysisFact>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalysisEntity {
    pub id: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub name: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub titles: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub aliases: Vec<String>,
    #[serde(default)]
    pub ev: Vec<AnalysisEvidence>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalysisFact {
    pub id: String,
    pub pred: String,
    pub subject: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub object: Option<String>,
    #[serde(default)]
    pub ev: Vec<AnalysisEvidence>,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalysisEvidence {
    pub p: usize,
    pub q: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct KnownEntity {
    pub kind: String,
    pub name: String,
    pub titles: Vec<String>,
    pub aliases: Vec<String>,
    pub character: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeEvidence {
    pub chapter: i64,
    pub p: usize,
    pub q: String,
    pub verified: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EvidenceRef {
    pub chapter: i64,
    pub p: usize,
    pub q: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeEntity {
    pub id: String,
    #[serde(rename = "type")]
    pub entity_type: String,
    pub name: String,
    pub titles: Vec<String>,
    pub aliases: Vec<String>,
    pub ev: Vec<KnowledgeEvidence>,
    pub stale: Vec<i64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeFact {
    pub id: String,
    pub pred: String,
    pub subject: String,
    pub object: Option<String>,
    pub ev: Vec<KnowledgeEvidence>,
    pub stale: Vec<i64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum KnowledgeItem {
    Entity(KnowledgeEntity),
    Fact(KnowledgeFact),
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalyzedChapter {
    pub at: String,
    pub entities: usize,
    pub facts: usize,
    pub stale: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WireKnowledge {
    pub lang: String,
    pub items: Vec<KnowledgeItem>,
    pub analyzed: BTreeMap<i64, AnalyzedChapter>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeEditResult {
    pub knowledge: WireKnowledge,
    pub remap: BTreeMap<String, String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(tag = "k", rename_all = "snake_case")]
pub enum KnowledgeEdit {
    Rename {
        id: String,
        name: String,
    },
    Retype {
        id: String,
        #[serde(rename = "type")]
        entity_type: String,
    },
    Del {
        id: String,
    },
    Merge {
        sources: Vec<String>,
        target: String,
    },
    Fact {
        id: String,
        #[serde(default)]
        pred: Option<String>,
        #[serde(default)]
        subject: Option<String>,
        #[serde(default)]
        object: Option<String>,
    },
    Props {
        id: String,
        #[serde(default)]
        titles: Option<Vec<String>>,
        #[serde(default)]
        aliases: Option<Vec<String>>,
    },
    Evidence {
        id: String,
        #[serde(default)]
        add: Option<Vec<EvidenceRef>>,
        #[serde(default)]
        remove: Option<Vec<EvidenceRef>>,
    },
    AddEntity {
        #[serde(rename = "ref")]
        reference: String,
        #[serde(rename = "type")]
        entity_type: String,
        name: String,
        #[serde(default)]
        titles: Option<Vec<String>>,
        #[serde(default)]
        aliases: Option<Vec<String>>,
        ev: Vec<EvidenceRef>,
    },
    AddFact {
        #[serde(rename = "ref")]
        reference: String,
        pred: String,
        subject: String,
        #[serde(default)]
        object: Option<String>,
        ev: Vec<EvidenceRef>,
    },
    Character {
        persona: String,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum KnowledgeLang {
    Src,
    Vi,
    En,
}

impl KnowledgeLang {
    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "src" => Some(Self::Src),
            "VI" => Some(Self::Vi),
            "EN" => Some(Self::En),
            _ => None,
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Src => "src",
            Self::Vi => "VI",
            Self::En => "EN",
        }
    }

    pub fn dir_name(self) -> &'static str {
        match self {
            Self::Src => "src",
            Self::Vi => "vi",
            Self::En => "en",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum KnowledgeErrorCode {
    NoWorkspace,
    NotFound,
    InvalidInput,
    TextNotFound,
    RefNotFound,
    EvidenceInvalid,
    Io,
    Db,
    Task,
}

impl KnowledgeErrorCode {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::NoWorkspace => "no_workspace",
            Self::NotFound => "not_found",
            Self::InvalidInput => "invalid_input",
            Self::TextNotFound => "text_not_found",
            Self::RefNotFound => "ref_not_found",
            Self::EvidenceInvalid => "evidence_invalid",
            Self::Io => "io",
            Self::Db => "db",
            Self::Task => "task",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct KnowledgeError {
    pub code: KnowledgeErrorCode,
    pub detail: String,
}

impl KnowledgeError {
    pub fn new(code: KnowledgeErrorCode, detail: impl Into<String>) -> Self {
        Self {
            code,
            detail: detail.into(),
        }
    }

    pub fn invalid(detail: impl Into<String>) -> Self {
        Self::new(KnowledgeErrorCode::InvalidInput, detail)
    }

    pub fn not_found(detail: impl Into<String>) -> Self {
        Self::new(KnowledgeErrorCode::NotFound, detail)
    }
}

pub type KnowledgeResult<T> = Result<T, KnowledgeError>;

impl fmt::Display for KnowledgeError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{} ({})", self.detail, self.code.as_str())
    }
}

impl std::error::Error for KnowledgeError {}

impl From<std::io::Error> for KnowledgeError {
    fn from(source: std::io::Error) -> Self {
        Self::new(KnowledgeErrorCode::Io, source.to_string())
    }
}

impl From<rusqlite::Error> for KnowledgeError {
    fn from(source: rusqlite::Error) -> Self {
        Self::new(KnowledgeErrorCode::Db, source.to_string())
    }
}

impl From<StorageError> for KnowledgeError {
    fn from(source: StorageError) -> Self {
        match source {
            StorageError::Io(error) => Self::new(KnowledgeErrorCode::Io, error.to_string()),
            other => Self::new(KnowledgeErrorCode::Db, other.to_string()),
        }
    }
}

#[cfg(test)]
#[path = "../../../test/features/knowledge/models.test.rs"]
mod tests;
