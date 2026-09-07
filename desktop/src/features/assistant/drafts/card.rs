use crate::features::scripting::models::ScriptBlock;
use serde::Deserialize;
use serde::Serialize;

pub const DRAFT_KIND: &str = "script_draft";
pub const MAX_BLOCKS: usize = 400;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DraftBlock {
    pub id: Option<String>,
    #[serde(rename = "type")]
    pub kind: String,
    pub text: String,
    pub who: String,
    pub paren: String,
    pub ms: i64,
    pub loc: String,
    pub time: String,
    pub beat: String,
    pub refs: Vec<String>,
    pub chars: Vec<String>,
    pub kept: bool,
}

impl DraftBlock {
    pub fn to_script(&self, id: String) -> ScriptBlock {
        ScriptBlock {
            id,
            kind: self.kind.clone(),
            text: self.text.clone(),
            who: self.who.clone(),
            paren: self.paren.clone(),
            ms: self.ms,
            loc: self.loc.clone(),
            time: self.time.clone(),
            reference: self.refs.first().cloned(),
            beat: self.beat.clone(),
            refs: self.refs.clone(),
            chars: self.chars.clone(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CurrentBlock {
    pub id: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub text: String,
    pub who: String,
    pub paren: String,
}

impl From<&ScriptBlock> for CurrentBlock {
    fn from(block: &ScriptBlock) -> Self {
        Self {
            id: block.id.clone(),
            kind: block.kind.clone(),
            text: block.text.clone(),
            who: block.who.clone(),
            paren: block.paren.clone(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DraftMember {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Speaker {
    pub id: String,
    pub name: String,
    pub blocks: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DraftStats {
    pub blocks: usize,
    pub voiced: usize,
    pub words: usize,
    pub narration: usize,
    pub dialogue: usize,
    pub kept: usize,
    pub stale_audio: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DraftCard {
    pub kind: String,
    pub id: String,
    pub project_id: i64,
    pub title: String,
    pub unit_id: String,
    pub unit_title: String,
    pub chapter: Option<i64>,
    pub summary: String,
    pub base_rev: String,
    pub current: Vec<CurrentBlock>,
    pub current_truncated: bool,
    pub blocks: Vec<DraftBlock>,
    pub extra_cast: Vec<DraftMember>,
    pub speakers: Vec<Speaker>,
    pub stats: DraftStats,
    pub unresolved: usize,
    pub warnings: Vec<String>,
    pub status: String,
}
