use super::*;
use serde_json::json;

fn change(target: ChangeTarget) -> AssistantChange {
    AssistantChange {
        target,
        novel_id: 4,
        chapter_id: Some("chapter-1".to_string()),
        lang: None,
        translation_target: None,
    }
}

#[test]
fn changed_event_is_flattened_under_the_changed_kind() {
    let event = AssistantEvent::Changed(change(ChangeTarget::Chapter));

    let value = serde_json::to_value(&event).unwrap();

    assert_eq!(
        value,
        json!({
            "kind": "changed",
            "target": "chapter",
            "novelId": 4,
            "chapterId": "chapter-1",
            "lang": null,
            "translationTarget": null,
        })
    );
}

#[test]
fn change_targets_serialize_in_snake_case() {
    let targets = [
        ChangeTarget::Novel,
        ChangeTarget::Chapter,
        ChangeTarget::Knowledge,
        ChangeTarget::Translation,
    ];

    let values: Vec<_> = targets
        .iter()
        .map(|target| serde_json::to_value(target).unwrap())
        .collect();

    assert_eq!(
        values,
        vec![
            json!("novel"),
            json!("chapter"),
            json!("knowledge"),
            json!("translation")
        ]
    );
}

#[test]
fn knowledge_change_carries_the_lang() {
    let event = AssistantEvent::Changed(AssistantChange {
        target: ChangeTarget::Knowledge,
        novel_id: 2,
        chapter_id: None,
        lang: Some("VI".to_string()),
        translation_target: None,
    });

    let value = serde_json::to_value(&event).unwrap();

    assert_eq!(value["target"], "knowledge");
    assert_eq!(value["chapterId"], serde_json::Value::Null);
    assert_eq!(value["lang"], "VI");
}

#[test]
fn translation_change_carries_the_translation_target() {
    let event = AssistantEvent::Changed(AssistantChange {
        target: ChangeTarget::Translation,
        novel_id: 2,
        chapter_id: Some("chapter-1".to_string()),
        lang: None,
        translation_target: Some("VI".to_string()),
    });

    let value = serde_json::to_value(&event).unwrap();

    assert_eq!(
        value,
        json!({
            "kind": "changed",
            "target": "translation",
            "novelId": 2,
            "chapterId": "chapter-1",
            "lang": null,
            "translationTarget": "VI",
        })
    );
}

#[test]
fn activity_event_keeps_its_shape() {
    let event = AssistantEvent::Activity {
        label: "list_novel()".to_string(),
    };

    let value = serde_json::to_value(&event).unwrap();

    assert_eq!(
        value,
        json!({ "kind": "activity", "label": "list_novel()" })
    );
}

#[test]
fn a_translation_review_context_reads_camel_case_fields() {
    let context: AssistantContext = serde_json::from_value(json!({
        "kind": "translation_review",
        "chapterId": "c1",
        "target": "VI",
    }))
    .unwrap();

    assert_eq!(
        context,
        AssistantContext::TranslationReview {
            chapter_id: "c1".to_string(),
            target: "VI".to_string(),
        }
    );
}

#[test]
fn a_knowledge_review_context_reads_camel_case_fields() {
    let context: AssistantContext = serde_json::from_value(json!({
        "kind": "knowledge_review",
        "lang": "src",
        "issueIds": ["dangling_ref|f1|f1", "evidence|e2|e2"],
    }))
    .unwrap();

    assert_eq!(
        context,
        AssistantContext::KnowledgeReview {
            lang: "src".to_string(),
            issue_ids: vec![
                "dangling_ref|f1|f1".to_string(),
                "evidence|e2|e2".to_string()
            ],
        }
    );
}

#[test]
fn an_unknown_context_kind_is_rejected() {
    let parsed = serde_json::from_value::<AssistantContext>(json!({ "kind": "nope" }));

    assert!(parsed.is_err());
}

#[test]
fn the_conflict_error_code_serializes_in_snake_case() {
    let error = AssistantError::conflict("changed");

    let value = serde_json::to_value(&error).unwrap();

    assert_eq!(error.code.as_str(), "conflict");
    assert_eq!(value, json!({ "code": "conflict", "detail": "changed" }));
}

#[test]
fn a_decision_parses_only_applied_and_rejected() {
    assert_eq!(Decision::parse("applied"), Some(Decision::Applied));
    assert_eq!(Decision::parse("rejected"), Some(Decision::Rejected));
    assert_eq!(Decision::parse("pending"), None);
    assert_eq!(Decision::Applied.as_str(), "applied");
    assert_eq!(Decision::Rejected.as_str(), "rejected");
}

#[test]
fn scope_kinds_parse_and_print_their_names() {
    for (kind, name) in [
        (ScopeKind::Workspace, "workspace"),
        (ScopeKind::Novel, "novel"),
        (ScopeKind::Project, "project"),
    ] {
        assert_eq!(kind.as_str(), name);
        assert_eq!(ScopeKind::parse(name), kind);
    }
    assert_eq!(ScopeKind::parse("unknown"), ScopeKind::Workspace);
}

#[test]
fn a_project_scope_round_trips_in_camel_case() {
    let scope = AssistantScope::project(7);

    let value = serde_json::to_value(&scope).unwrap();
    let parsed: AssistantScope = serde_json::from_value(value.clone()).unwrap();

    assert_eq!(
        value,
        json!({ "kind": "project", "novelId": null, "projectId": 7 })
    );
    assert_eq!(parsed, scope);
}

#[test]
fn a_scope_without_a_project_id_still_deserializes() {
    let parsed: AssistantScope =
        serde_json::from_value(json!({ "kind": "novel", "novelId": 3 })).unwrap();

    assert_eq!(parsed, AssistantScope::novel(3));
}
