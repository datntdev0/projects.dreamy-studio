use serde::Deserialize;
use serde::Serialize;

fn is_zero(value: &i64) -> bool {
    *value == 0
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ScriptConfig {
    pub preset: String,
    pub unit: String,
    pub types: Vec<String>,
    pub layout: String,
    pub source: bool,
    pub speakers: bool,
    pub ranges: bool,
    pub free_units: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ScriptBlock {
    pub id: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub text: String,
    pub who: String,
    pub paren: String,
    pub ms: i64,
    pub loc: String,
    pub time: String,
    #[serde(rename = "ref")]
    pub reference: Option<String>,
    pub beat: String,
    pub refs: Vec<String>,
    pub chars: Vec<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct UnitMeta {
    pub blocks: i64,
    pub words: i64,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct UnitHead {
    pub id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub chapter_id: Option<String>,
    #[serde(skip_serializing_if = "is_zero")]
    pub no: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ch: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub chs: Option<[i64; 2]>,
    #[serde(skip_serializing_if = "String::is_empty")]
    pub title: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct UnitBody {
    pub blocks: Option<Vec<ScriptBlock>>,
    pub meta: Option<UnitMeta>,
    pub updated: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ScriptUnit {
    pub id: String,
    pub chapter_id: Option<String>,
    pub no: i64,
    pub ch: Option<i64>,
    pub chs: Option<[i64; 2]>,
    pub title: String,
    pub blocks: Option<Vec<ScriptBlock>>,
    pub meta: Option<UnitMeta>,
    pub updated: String,
}

impl ScriptUnit {
    pub fn join(head: UnitHead, body: UnitBody) -> Self {
        Self {
            id: head.id,
            chapter_id: head.chapter_id,
            no: head.no,
            ch: head.ch,
            chs: head.chs,
            title: head.title,
            blocks: body.blocks,
            meta: body.meta,
            updated: body.updated,
        }
    }

    pub fn split(self) -> (UnitHead, UnitBody) {
        let head = match self.chapter_id {
            Some(chapter_id) => UnitHead {
                id: self.id,
                chapter_id: Some(chapter_id),
                ..UnitHead::default()
            },
            None => UnitHead {
                id: self.id,
                chapter_id: None,
                no: self.no,
                ch: self.ch,
                chs: self.chs,
                title: self.title,
            },
        };
        let body = UnitBody {
            blocks: self.blocks,
            meta: self.meta,
            updated: self.updated,
        };
        (head, body)
    }

    pub fn is_persisted(&self) -> bool {
        self.chapter_id.is_none() || self.blocks.is_some()
    }

    pub fn has_content(&self) -> bool {
        self.blocks
            .as_ref()
            .is_some_and(|blocks| !blocks.is_empty())
            || self.meta.is_some()
    }
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct CastMember {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub c: i64,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Script {
    pub cfg: ScriptConfig,
    pub choose: bool,
    pub extra_cast: Vec<CastMember>,
    pub units: Vec<ScriptUnit>,
    pub seq: i64,
    pub useq: i64,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ScriptFile {
    pub cfg: ScriptConfig,
    pub choose: bool,
    pub extra_cast: Vec<CastMember>,
    pub units: Vec<UnitHead>,
    pub seq: i64,
    pub useq: i64,
}
