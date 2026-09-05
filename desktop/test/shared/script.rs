use crate::features::scripting::models::CastMember;
use crate::features::scripting::models::Script;
use crate::features::scripting::models::ScriptBlock;
use crate::features::scripting::models::ScriptConfig;
use crate::features::scripting::models::ScriptUnit;
use crate::features::scripting::models::UnitMeta;

pub fn block(id: &str) -> ScriptBlock {
    ScriptBlock {
        id: id.to_string(),
        kind: "dialogue".to_string(),
        text: "Hello".to_string(),
        who: "kb-1".to_string(),
        paren: "softly".to_string(),
        ms: 0,
        loc: String::new(),
        time: String::new(),
        reference: Some("p-1".to_string()),
        beat: String::new(),
        refs: vec!["p-1".to_string()],
        chars: vec!["kb-1".to_string()],
    }
}

pub fn unit(id: &str, no: i64) -> ScriptUnit {
    ScriptUnit {
        id: id.to_string(),
        no,
        ch: Some(no),
        chs: None,
        title: format!("Chapter {no}"),
        blocks: None,
        meta: None,
        updated: String::new(),
    }
}

pub fn written_unit(id: &str, no: i64) -> ScriptUnit {
    ScriptUnit {
        blocks: Some(vec![block("b1")]),
        meta: Some(UnitMeta {
            blocks: 1,
            words: 1,
        }),
        updated: "2026-11-23T10:00:00Z".to_string(),
        ..unit(id, no)
    }
}

pub fn script(units: Vec<ScriptUnit>) -> Script {
    Script {
        cfg: ScriptConfig {
            preset: "audiobook".to_string(),
            unit: "chapter".to_string(),
            types: vec!["narration".to_string(), "dialogue".to_string()],
            layout: "page".to_string(),
            source: true,
            speakers: true,
            ranges: false,
            free_units: false,
        },
        choose: false,
        extra_cast: vec![CastMember {
            id: "x1".to_string(),
            name: "Tea woman".to_string(),
            kind: "extra".to_string(),
            c: 0,
        }],
        units,
        seq: 4,
        useq: 2,
    }
}
