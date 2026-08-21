use super::*;
use serde_json::Value;
use serde_json::json;

fn decode(value: Value) -> KnowledgeEdit {
    serde_json::from_value(value).expect("edit decodes")
}

fn evidence_json() -> Value {
    json!({ "chapter": 2, "p": 3, "q": "quote" })
}

fn evidence_ref() -> EvidenceRef {
    EvidenceRef {
        chapter: 2,
        p: 3,
        q: "quote".to_string(),
    }
}

#[test]
fn chapter_file_defaults_and_round_trip() {
    let source = json!({
        "ontology": 1,
        "sourceHash": "abc",
        "analyzedAt": "2026-11-18T10:00:00Z",
        "entities": [
            { "id": "E1", "type": "persona", "name": "Wren" },
            { "id": "E2", "type": "character", "name": "Wren Aldous", "ev": [{ "p": 1, "q": "x" }] }
        ],
        "facts": [
            { "id": "F1", "pred": "persona_of", "subject": "E1", "object": "E2" },
            { "id": "F2", "pred": "occupation", "subject": "E1", "ev": [{ "p": 2, "q": "y" }] }
        ]
    });
    let file: ChapterAnalysis = serde_json::from_value(source).expect("file decodes");
    assert_eq!(file.ontology, 1);
    assert_eq!(file.source_hash, "abc");
    assert_eq!(file.analyzed_at, "2026-11-18T10:00:00Z");
    assert_eq!(file.entities[0].kind, "persona");
    assert!(file.entities[0].titles.is_empty());
    assert!(file.entities[0].aliases.is_empty());
    assert!(file.entities[0].ev.is_empty());
    assert_eq!(file.facts[0].object.as_deref(), Some("E2"));
    assert_eq!(file.facts[1].object, None);

    let written = serde_json::to_value(&file).expect("file encodes");
    assert!(written["entities"][0].get("titles").is_none());
    assert!(written["entities"][0].get("aliases").is_none());
    assert_eq!(written["entities"][0]["type"], "persona");
    assert!(written["entities"][0].get("kind").is_none());
    assert!(written["facts"][1].get("object").is_none());
    assert_eq!(written["sourceHash"], "abc");

    let back: ChapterAnalysis = serde_json::from_value(written).expect("round trip");
    assert_eq!(back, file);
}

#[test]
fn chapter_file_without_lists_is_empty() {
    let file: ChapterAnalysis = serde_json::from_value(json!({
        "ontology": 1,
        "sourceHash": "h",
        "analyzedAt": "t"
    }))
    .expect("file decodes");
    assert!(file.entities.is_empty());
    assert!(file.facts.is_empty());
}

#[test]
fn chapter_file_keeps_titles_and_aliases() {
    let entity = AnalysisEntity {
        id: "E1".to_string(),
        kind: "persona".to_string(),
        name: "Wren".to_string(),
        titles: vec!["lamplighter".to_string()],
        aliases: vec!["Wren Aldous".to_string()],
        ev: vec![AnalysisEvidence {
            p: 1,
            q: "q".to_string(),
        }],
    };
    let value = serde_json::to_value(&entity).expect("entity encodes");
    assert_eq!(value["titles"], json!(["lamplighter"]));
    assert_eq!(value["aliases"], json!(["Wren Aldous"]));
    assert_eq!(value["ev"], json!([{ "p": 1, "q": "q" }]));
}

#[test]
fn wire_entity_item_is_tagged_with_kind_and_type() {
    let item = KnowledgeItem::Entity(KnowledgeEntity {
        id: "E1".to_string(),
        entity_type: "persona".to_string(),
        name: "Wren".to_string(),
        titles: Vec::new(),
        aliases: vec!["W".to_string()],
        ev: vec![KnowledgeEvidence {
            chapter: 1,
            p: 2,
            q: "q".to_string(),
            verified: true,
        }],
        stale: vec![3],
    });
    let value = serde_json::to_value(&item).expect("item encodes");
    assert_eq!(value["kind"], "entity");
    assert_eq!(value["type"], "persona");
    assert_eq!(value["titles"], json!([]));
    assert_eq!(value["aliases"], json!(["W"]));
    assert_eq!(value["ev"][0]["verified"], true);
    assert_eq!(value["stale"], json!([3]));
    let back: KnowledgeItem = serde_json::from_value(value).expect("item decodes");
    assert_eq!(back, item);
}

#[test]
fn wire_fact_item_keeps_null_object() {
    let item = KnowledgeItem::Fact(KnowledgeFact {
        id: "F1".to_string(),
        pred: "occupation".to_string(),
        subject: "E1".to_string(),
        object: None,
        ev: Vec::new(),
        stale: Vec::new(),
    });
    let value = serde_json::to_value(&item).expect("item encodes");
    assert_eq!(value["kind"], "fact");
    assert!(value["object"].is_null());
    let back: KnowledgeItem = serde_json::from_value(value).expect("item decodes");
    assert_eq!(back, item);
}

#[test]
fn wire_knowledge_and_edit_result_use_camel_case() {
    let mut analyzed = BTreeMap::new();
    analyzed.insert(
        4,
        AnalyzedChapter {
            at: "t".to_string(),
            entities: 2,
            facts: 1,
            stale: false,
        },
    );
    let knowledge = WireKnowledge {
        lang: "VI".to_string(),
        items: Vec::new(),
        analyzed,
    };
    let mut remap = BTreeMap::new();
    remap.insert("new1".to_string(), "E9".to_string());
    let result = KnowledgeEditResult { knowledge, remap };
    let value = serde_json::to_value(&result).expect("result encodes");
    assert_eq!(value["knowledge"]["lang"], "VI");
    assert_eq!(value["knowledge"]["analyzed"]["4"]["entities"], 2);
    assert_eq!(value["remap"]["new1"], "E9");
}

#[test]
fn edit_rename_retype_del_merge_decode() {
    assert_eq!(
        decode(json!({ "k": "rename", "id": "E1", "name": "Wren" })),
        KnowledgeEdit::Rename {
            id: "E1".to_string(),
            name: "Wren".to_string()
        }
    );
    assert_eq!(
        decode(json!({ "k": "retype", "id": "E1", "type": "location" })),
        KnowledgeEdit::Retype {
            id: "E1".to_string(),
            entity_type: "location".to_string()
        }
    );
    assert_eq!(
        decode(json!({ "k": "del", "id": "F1" })),
        KnowledgeEdit::Del {
            id: "F1".to_string()
        }
    );
    assert_eq!(
        decode(json!({ "k": "merge", "sources": ["E1", "E2"], "target": "E3" })),
        KnowledgeEdit::Merge {
            sources: vec!["E1".to_string(), "E2".to_string()],
            target: "E3".to_string()
        }
    );
}

#[test]
fn edit_fact_props_evidence_decode() {
    assert_eq!(
        decode(json!({ "k": "fact", "id": "F1", "object": "E2" })),
        KnowledgeEdit::Fact {
            id: "F1".to_string(),
            pred: None,
            subject: None,
            object: Some("E2".to_string())
        }
    );
    assert_eq!(
        decode(json!({ "k": "fact", "id": "F1", "pred": "ally_of", "subject": "E1" })),
        KnowledgeEdit::Fact {
            id: "F1".to_string(),
            pred: Some("ally_of".to_string()),
            subject: Some("E1".to_string()),
            object: None
        }
    );
    assert_eq!(
        decode(json!({ "k": "props", "id": "E1", "titles": ["t"] })),
        KnowledgeEdit::Props {
            id: "E1".to_string(),
            titles: Some(vec!["t".to_string()]),
            aliases: None
        }
    );
    assert_eq!(
        decode(json!({ "k": "evidence", "id": "E1", "add": [evidence_json()] })),
        KnowledgeEdit::Evidence {
            id: "E1".to_string(),
            add: Some(vec![evidence_ref()]),
            remove: None
        }
    );
    assert_eq!(
        decode(json!({ "k": "evidence", "id": "E1", "remove": [evidence_json()] })),
        KnowledgeEdit::Evidence {
            id: "E1".to_string(),
            add: None,
            remove: Some(vec![evidence_ref()])
        }
    );
}

#[test]
fn edit_add_and_character_decode() {
    assert_eq!(
        decode(json!({
            "k": "add_entity",
            "ref": "new1",
            "type": "persona",
            "name": "Wren",
            "aliases": ["W"],
            "ev": [evidence_json()]
        })),
        KnowledgeEdit::AddEntity {
            reference: "new1".to_string(),
            entity_type: "persona".to_string(),
            name: "Wren".to_string(),
            titles: None,
            aliases: Some(vec!["W".to_string()]),
            ev: vec![evidence_ref()]
        }
    );
    assert_eq!(
        decode(json!({
            "k": "add_fact",
            "ref": "new2",
            "pred": "occupation",
            "subject": "E1",
            "ev": [evidence_json()]
        })),
        KnowledgeEdit::AddFact {
            reference: "new2".to_string(),
            pred: "occupation".to_string(),
            subject: "E1".to_string(),
            object: None,
            ev: vec![evidence_ref()]
        }
    );
    assert_eq!(
        decode(json!({ "k": "character", "persona": "E1" })),
        KnowledgeEdit::Character {
            persona: "E1".to_string()
        }
    );
}

#[test]
fn edit_rejects_unknown_kind_and_missing_evidence() {
    assert!(serde_json::from_value::<KnowledgeEdit>(json!({ "k": "split", "id": "E1" })).is_err());
    assert!(
        serde_json::from_value::<KnowledgeEdit>(json!({
            "k": "add_entity",
            "ref": "new1",
            "type": "persona",
            "name": "Wren"
        }))
        .is_err()
    );
    assert!(
        serde_json::from_value::<KnowledgeEdit>(json!({
            "k": "add_fact",
            "ref": "new1",
            "pred": "occupation",
            "subject": "E1"
        }))
        .is_err()
    );
}

#[test]
fn lang_parses_exact_values() {
    assert_eq!(KnowledgeLang::parse("src"), Some(KnowledgeLang::Src));
    assert_eq!(KnowledgeLang::parse("VI"), Some(KnowledgeLang::Vi));
    assert_eq!(KnowledgeLang::parse("EN"), Some(KnowledgeLang::En));
    assert_eq!(KnowledgeLang::parse("vi"), None);
    assert_eq!(KnowledgeLang::parse("en"), None);
    assert_eq!(KnowledgeLang::parse("SRC"), None);
    assert_eq!(KnowledgeLang::parse("fr"), None);
    assert_eq!(KnowledgeLang::parse(""), None);
}

#[test]
fn lang_names() {
    assert_eq!(KnowledgeLang::Src.as_str(), "src");
    assert_eq!(KnowledgeLang::Vi.as_str(), "VI");
    assert_eq!(KnowledgeLang::En.as_str(), "EN");
    assert_eq!(KnowledgeLang::Src.dir_name(), "src");
    assert_eq!(KnowledgeLang::Vi.dir_name(), "vi");
    assert_eq!(KnowledgeLang::En.dir_name(), "en");
}

#[test]
fn error_serializes_code_and_detail() {
    let error = KnowledgeError::new(KnowledgeErrorCode::TextNotFound, "chapters 1, 2");
    let value = serde_json::to_value(&error).expect("error encodes");
    assert_eq!(
        value,
        json!({ "code": "text_not_found", "detail": "chapters 1, 2" })
    );
    assert_eq!(error.to_string(), "chapters 1, 2 (text_not_found)");
}

#[test]
fn error_codes_serialize_as_their_names() {
    let codes = [
        KnowledgeErrorCode::NoWorkspace,
        KnowledgeErrorCode::NotFound,
        KnowledgeErrorCode::InvalidInput,
        KnowledgeErrorCode::TextNotFound,
        KnowledgeErrorCode::RefNotFound,
        KnowledgeErrorCode::EvidenceInvalid,
        KnowledgeErrorCode::Io,
        KnowledgeErrorCode::Db,
        KnowledgeErrorCode::Task,
    ];
    for code in codes {
        assert_eq!(
            serde_json::to_value(code).expect("code encodes"),
            json!(code.as_str())
        );
    }
}

#[test]
fn error_helpers_and_conversions() {
    assert_eq!(
        KnowledgeError::invalid("x").code,
        KnowledgeErrorCode::InvalidInput
    );
    assert_eq!(
        KnowledgeError::not_found("x").code,
        KnowledgeErrorCode::NotFound
    );
    let io = std::io::Error::other("disk");
    assert_eq!(KnowledgeError::from(io).code, KnowledgeErrorCode::Io);
    let db = rusqlite::Error::QueryReturnedNoRows;
    assert_eq!(KnowledgeError::from(db).code, KnowledgeErrorCode::Db);
    let storage = StorageError::Io(std::io::Error::other("disk"));
    assert_eq!(KnowledgeError::from(storage).code, KnowledgeErrorCode::Io);
}
