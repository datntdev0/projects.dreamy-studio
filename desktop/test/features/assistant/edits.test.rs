use super::*;
use crate::features::assistant::models::AssistantScope;
use crate::features::assistant::models::ScopeKind;
use crate::features::assistant::tools::call;
use crate::testing::assistant::FakeKnowledge;
use crate::testing::assistant::FakeNovels;
use crate::testing::assistant::NovelWrite;
use crate::testing::assistant::RecordingSink;
use crate::testing::assistant::sources_of;
use serde_json::from_str;

fn workspace() -> AssistantScope {
    AssistantScope {
        kind: ScopeKind::Workspace,
        novel_id: None,
    }
}

fn novel_scope(id: i64) -> AssistantScope {
    AssistantScope {
        kind: ScopeKind::Novel,
        novel_id: Some(id),
    }
}

fn novels() -> FakeNovels {
    FakeNovels::new()
        .with_novel(1, "First")
        .with_chapter(1, 3, "Third", &["alpha", "beta", "gamma"])
        .with_novel(2, "Second")
}

fn invoke(
    name: &str,
    args: &Value,
    scope: &AssistantScope,
    can_edit: bool,
    novels: &FakeNovels,
    knowledge: &FakeKnowledge,
) -> (Result<ToolOutput, String>, RecordingSink) {
    let sink = RecordingSink::new();
    let ctx = ToolContext {
        scope,
        can_edit,
        sink: &sink,
    };
    let result = call(name, args, &ctx, &sources_of(novels, knowledge));
    (result, sink)
}

fn allowed(
    name: &str,
    args: Value,
    novels: &FakeNovels,
) -> (Result<ToolOutput, String>, RecordingSink) {
    invoke(
        name,
        &args,
        &workspace(),
        true,
        novels,
        &FakeKnowledge::new(),
    )
}

fn chapter_args(paragraphs: Value) -> Value {
    json!({ "novelId": 1, "chapter": 3, "paragraphs": paragraphs })
}

#[test]
fn every_edit_tool_refuses_when_editing_is_off() {
    let novels = novels();
    let knowledge = FakeKnowledge::new();
    let cases = [
        ("edit_novel", json!({ "novelId": 1, "title": "New" })),
        (
            "edit_novel_chapter",
            json!({ "novelId": 1, "chapter": 3, "title": "New" }),
        ),
        (
            "edit_novel_knowledge",
            json!({ "novelId": 1, "lang": "src", "edits": [{ "k": "del", "id": "e1" }] }),
        ),
    ];
    for (name, args) in cases {
        let (result, sink) = invoke(name, &args, &workspace(), false, &novels, &knowledge);
        assert_eq!(result.unwrap_err(), EDIT_DISABLED, "{name}");
        assert!(sink.changes().is_empty());
    }
    assert!(novels.writes().is_empty());
    assert!(knowledge.calls().is_empty());
    assert_eq!(
        EDIT_DISABLED,
        "Editing is not enabled for this session. Ask the user to turn on editing in the assistant panel, then try again."
    );
}

#[test]
fn edit_novel_patches_fields_and_emits_novel() {
    let novels = novels();
    let args = json!({ "novelId": 1, "title": "Renamed", "tags": ["a", "b"] });
    let (result, sink) = allowed("edit_novel", args, &novels);
    let output = result.unwrap();
    assert_eq!(output.label, "edit_novel(novel 1: title, tags)");
    let value: Value = from_str(&output.text).unwrap();
    assert_eq!(value["title"], "Renamed");
    assert_eq!(value["tags"], json!(["a", "b"]));
    assert_eq!(
        novels.writes(),
        vec![NovelWrite::Update {
            novel_id: 1,
            patch: NovelPatch {
                title: Some("Renamed".to_string()),
                tags: Some(vec!["a".to_string(), "b".to_string()]),
                ..NovelPatch::default()
            },
        }]
    );
    assert_eq!(
        sink.changes(),
        vec![AssistantChange {
            target: ChangeTarget::Novel,
            novel_id: 1,
            chapter_id: None,
            lang: None,
        }]
    );
}

#[test]
fn edit_novel_needs_a_field_and_valid_tags() {
    let novels = novels();
    let (empty, _) = allowed("edit_novel", json!({ "novelId": 1 }), &novels);
    assert!(empty.unwrap_err().contains("at least one"));
    let (bad, _) = allowed("edit_novel", json!({ "novelId": 1, "tags": [1] }), &novels);
    assert!(bad.unwrap_err().contains("tags"));
    assert!(novels.writes().is_empty());
}

#[test]
fn edit_novel_chapter_applies_paragraphs_and_rename() {
    let novels = novels();
    let args = json!({
        "novelId": 1,
        "chapter": 3,
        "title": "Renamed",
        "paragraphs": [
            { "p": 3, "expected": "gamma", "text": "GAMMA" },
            { "p": 1, "expected": "alpha", "text": "ALPHA" }
        ]
    });
    let (result, sink) = allowed("edit_novel_chapter", args, &novels);
    let output = result.unwrap();
    assert_eq!(
        output.label,
        "edit_novel_chapter(novel 1, ch 3, ¶3 ¶1, title)"
    );
    assert_eq!(
        novels.paragraph_texts("chapter-1-3"),
        vec!["ALPHA", "beta", "GAMMA"]
    );
    assert_eq!(novels.writes().len(), 3);
    assert_eq!(
        novels.writes()[2],
        NovelWrite::Rename {
            novel_id: 1,
            chapter_id: "chapter-1-3".to_string(),
            title: "Renamed".to_string(),
        }
    );
    let changes = sink.changes();
    assert_eq!(changes.len(), 2);
    assert_eq!(changes[0].target, ChangeTarget::Chapter);
    assert_eq!(changes[0].chapter_id.as_deref(), Some("chapter-1-3"));
    assert_eq!(changes[1].target, ChangeTarget::Novel);
    assert_eq!(changes[1].chapter_id, None);
}

#[test]
fn edit_novel_chapter_without_rename_emits_only_chapter() {
    let novels = novels();
    let args = chapter_args(json!([{ "p": 2, "expected": "beta", "text": "BETA" }]));
    let (result, sink) = allowed("edit_novel_chapter", args, &novels);
    assert_eq!(
        result.unwrap().label,
        "edit_novel_chapter(novel 1, ch 3, ¶2)"
    );
    let changes = sink.changes();
    assert_eq!(changes.len(), 1);
    assert_eq!(changes[0].target, ChangeTarget::Chapter);
    assert_eq!(changes[0].novel_id, 1);
}

#[test]
fn edit_novel_chapter_rename_only() {
    let novels = novels();
    let args = json!({ "novelId": 1, "chapter": 3, "title": "Solo" });
    let (result, sink) = allowed("edit_novel_chapter", args, &novels);
    assert_eq!(
        result.unwrap().label,
        "edit_novel_chapter(novel 1, ch 3, title)"
    );
    assert_eq!(novels.writes().len(), 1);
    assert_eq!(sink.changes().len(), 2);
}

#[test]
fn edit_novel_chapter_rejects_everything_on_one_mismatch() {
    let novels = novels();
    let args = chapter_args(json!([
        { "p": 1, "expected": "alpha", "text": "ALPHA" },
        { "p": 2, "expected": "stale", "text": "BETA" }
    ]));
    let mut args = args;
    args["title"] = json!("Renamed");
    let (result, sink) = allowed("edit_novel_chapter", args, &novels);
    let error = result.unwrap_err();
    assert!(error.contains("paragraph 2"));
    assert!(error.contains("beta"));
    assert!(novels.writes().is_empty());
    assert_eq!(
        novels.paragraph_texts("chapter-1-3"),
        vec!["alpha", "beta", "gamma"]
    );
    assert!(sink.changes().is_empty());
}

#[test]
fn edit_novel_chapter_validates_its_arguments() {
    let novels = novels();
    let cases = [
        (
            json!({ "novelId": 1, "chapter": 3 }),
            "title or at least one",
        ),
        (
            json!({ "novelId": 1, "chapter": 9, "title": "x" }),
            "chapter 9",
        ),
        (
            json!({ "novelId": 1, "chapter": 3, "title": "  " }),
            "empty",
        ),
        (
            chapter_args(json!([{ "p": 9, "expected": "x", "text": "y" }])),
            "paragraph 9 not found",
        ),
        (
            chapter_args(json!([
                { "p": 1, "expected": "alpha", "text": "a" },
                { "p": 1, "expected": "alpha", "text": "b" }
            ])),
            "more than once",
        ),
        (
            chapter_args(json!([{ "p": 0, "expected": "x", "text": "y" }])),
            "at least 1",
        ),
        (chapter_args(json!([{ "p": 1, "text": "y" }])), "expected"),
    ];
    for (args, needle) in cases {
        let (result, _) = allowed("edit_novel_chapter", args, &novels);
        let error = result.unwrap_err();
        assert!(error.contains(needle), "{error} should contain {needle}");
    }
    assert!(novels.writes().is_empty());
}

#[test]
fn edit_novel_knowledge_applies_edits_and_emits_knowledge() {
    let novels = novels();
    let knowledge = FakeKnowledge::new();
    let args = json!({
        "novelId": 1,
        "lang": "VI",
        "edits": [
            { "k": "rename", "id": "e1", "name": "Alice" },
            { "k": "merge", "sources": ["e2"], "target": "e1" }
        ]
    });
    let (result, sink) = invoke(
        "edit_novel_knowledge",
        &args,
        &workspace(),
        true,
        &novels,
        &knowledge,
    );
    let output = result.unwrap();
    assert_eq!(output.label, "edit_novel_knowledge(novel 1, VI, 2 sửa)");
    let value: Value = from_str(&output.text).unwrap();
    assert_eq!(value, json!({ "applied": 2, "remap": {} }));
    let calls = knowledge.calls();
    assert_eq!(calls.len(), 1);
    assert_eq!(calls[0].lang, "VI");
    assert_eq!(
        calls[0].edits[0],
        KnowledgeEdit::Rename {
            id: "e1".to_string(),
            name: "Alice".to_string(),
        }
    );
    assert_eq!(
        sink.changes(),
        vec![AssistantChange {
            target: ChangeTarget::Knowledge,
            novel_id: 1,
            chapter_id: None,
            lang: Some("VI".to_string()),
        }]
    );
}

#[test]
fn edit_novel_knowledge_rejects_malformed_edits() {
    let novels = novels();
    let knowledge = FakeKnowledge::new();
    let cases = [
        json!({ "novelId": 1, "lang": "src" }),
        json!({ "novelId": 1, "lang": "src", "edits": [] }),
        json!({ "novelId": 1, "lang": "src", "edits": "rename" }),
        json!({ "novelId": 1, "lang": "src", "edits": [{ "id": "e1" }] }),
        json!({ "novelId": 1, "lang": "src", "edits": [{ "k": "explode", "id": "e1" }] }),
        json!({ "novelId": 1, "lang": "src", "edits": [{ "k": "rename", "id": "e1" }] }),
        json!({ "novelId": 1, "lang": "fr", "edits": [{ "k": "del", "id": "e1" }] }),
    ];
    for args in cases {
        let (result, sink) = invoke(
            "edit_novel_knowledge",
            &args,
            &workspace(),
            true,
            &novels,
            &knowledge,
        );
        assert!(result.is_err(), "{args}");
        assert!(sink.changes().is_empty());
    }
    assert!(knowledge.calls().is_empty());
}

#[test]
fn edit_novel_knowledge_surfaces_a_failed_apply_without_a_change() {
    let novels = novels();
    let knowledge = FakeKnowledge::new().failing("unknown entity e9");
    let args = json!({ "novelId": 1, "lang": "src", "edits": [{ "k": "del", "id": "e9" }] });
    let (result, sink) = invoke(
        "edit_novel_knowledge",
        &args,
        &workspace(),
        true,
        &novels,
        &knowledge,
    );
    assert_eq!(result.unwrap_err(), "unknown entity e9");
    assert!(sink.changes().is_empty());
}

#[test]
fn edit_tools_respect_the_novel_scope() {
    let novels = novels();
    let knowledge = FakeKnowledge::new();
    let cases = [
        ("edit_novel", json!({ "novelId": 2, "title": "x" })),
        (
            "edit_novel_chapter",
            json!({ "novelId": 2, "chapter": 1, "title": "x" }),
        ),
        (
            "edit_novel_knowledge",
            json!({ "novelId": 2, "lang": "src", "edits": [{ "k": "del", "id": "e1" }] }),
        ),
    ];
    for (name, args) in cases {
        let (result, sink) = invoke(name, &args, &novel_scope(1), true, &novels, &knowledge);
        assert!(
            result.unwrap_err().contains("outside the current scope"),
            "{name}"
        );
        assert!(sink.changes().is_empty());
    }
    assert!(novels.writes().is_empty());
    assert!(knowledge.calls().is_empty());
    let own = json!({ "novelId": 1, "title": "x" });
    let (result, _) = invoke(
        "edit_novel",
        &own,
        &novel_scope(1),
        true,
        &novels,
        &knowledge,
    );
    assert!(result.is_ok());
}
