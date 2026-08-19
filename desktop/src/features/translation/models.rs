use crate::infra::storage::StorageError;
use serde::Deserialize;
use serde::Serialize;
use std::fmt;
use std::str::FromStr;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "UPPERCASE")]
pub enum TranslationTarget {
    Vi,
    En,
}

impl TranslationTarget {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Vi => "VI",
            Self::En => "EN",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        match value.trim().to_ascii_uppercase().as_str() {
            "VI" => Some(Self::Vi),
            "EN" => Some(Self::En),
            _ => None,
        }
    }

    pub fn dir_name(self) -> &'static str {
        match self {
            Self::Vi => "vi",
            Self::En => "en",
        }
    }
}

impl FromStr for TranslationTarget {
    type Err = ();

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        Self::parse(value).ok_or(())
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DictEntry {
    pub id: i64,
    pub src: String,
    pub dst: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub note: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DictInput {
    pub src: String,
    pub dst: String,
    #[serde(rename = "type")]
    pub kind: String,
    #[serde(default)]
    pub note: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DictPatch {
    #[serde(default)]
    pub src: Option<String>,
    #[serde(default)]
    pub dst: Option<String>,
    #[serde(default, rename = "type")]
    pub kind: Option<String>,
    #[serde(default)]
    pub note: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChapterFile {
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub paragraphs: Vec<TranslatedParagraph>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TranslatedParagraph {
    #[serde(alias = "orignalHashcheck")]
    pub original_hashcheck: String,
    pub text: String,
    #[serde(default)]
    pub note: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum TranslationErrorCode {
    NoWorkspace,
    NotFound,
    InvalidInput,
    DictionaryDuplicate,
    Io,
    Db,
    Task,
}

impl TranslationErrorCode {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::NoWorkspace => "no_workspace",
            Self::NotFound => "not_found",
            Self::InvalidInput => "invalid_input",
            Self::DictionaryDuplicate => "dictionary_duplicate",
            Self::Io => "io",
            Self::Db => "db",
            Self::Task => "task",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct TranslationError {
    pub code: TranslationErrorCode,
    pub detail: String,
}

impl TranslationError {
    pub fn new(code: TranslationErrorCode, detail: impl Into<String>) -> Self {
        Self {
            code,
            detail: detail.into(),
        }
    }

    pub fn invalid(detail: impl Into<String>) -> Self {
        Self::new(TranslationErrorCode::InvalidInput, detail)
    }

    pub fn not_found(detail: impl Into<String>) -> Self {
        Self::new(TranslationErrorCode::NotFound, detail)
    }
}

pub type TranslationResult<T> = Result<T, TranslationError>;

impl fmt::Display for TranslationError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{} ({})", self.detail, self.code.as_str())
    }
}

impl std::error::Error for TranslationError {}

impl From<std::io::Error> for TranslationError {
    fn from(source: std::io::Error) -> Self {
        Self::new(TranslationErrorCode::Io, source.to_string())
    }
}

impl From<rusqlite::Error> for TranslationError {
    fn from(source: rusqlite::Error) -> Self {
        Self::new(TranslationErrorCode::Db, source.to_string())
    }
}

impl From<StorageError> for TranslationError {
    fn from(source: StorageError) -> Self {
        match source {
            StorageError::Io(error) => Self::new(TranslationErrorCode::Io, error.to_string()),
            other => Self::new(TranslationErrorCode::Db, other.to_string()),
        }
    }
}
