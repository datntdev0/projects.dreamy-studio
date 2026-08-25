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
