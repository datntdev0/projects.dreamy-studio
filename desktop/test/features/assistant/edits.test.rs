use super::*;
use crate::features::assistant::models::AssistantScope;
use crate::features::assistant::models::ScopeKind;
use crate::features::assistant::tools::call;
use crate::testing::assistant::FakeKnowledge;
use crate::testing::assistant::FakeNovels;
use crate::testing::assistant::FakeTranslation;
use crate::testing::assistant::NovelWrite;
use crate::testing::assistant::RecordingSink;
use crate::testing::assistant::TranslationWrite;
use crate::testing::assistant::sources_of;
use crate::testing::assistant::sources_with;
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
            translation_target: None,
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
            translation_target: None,
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

const CHAPTER_ID: &str = "chapter-1-3";

fn translation() -> FakeTranslation {
    FakeTranslation::new()
        .with_translated_chapter(1, "VI", CHAPTER_ID, "Chuong ba", &["dich a", "dich b"])
        .with_entry(1, "VI", "Lin", "Lam", "name", "")
        .with_entry(1, "VI", "Sword", "Kiem", "term", "")
}

fn translation_edit(
    name: &str,
    args: Value,
    scope: &AssistantScope,
    can_edit: bool,
    translation: &FakeTranslation,
) -> (Result<ToolOutput, String>, RecordingSink) {
    let sink = RecordingSink::new();
    let ctx = ToolContext {
        scope,
        can_edit,
        sink: &sink,
    };
    let sources = sources_with(&novels(), &FakeKnowledge::new(), translation);
    let result = call(name, &args, &ctx, &sources);
    (result, sink)
}

fn allowed_translation(
    name: &str,
    args: Value,
    translation: &FakeTranslation,
) -> (Result<ToolOutput, String>, RecordingSink) {
    translation_edit(name, args, &workspace(), true, translation)
}

fn passage_args(p: i64, expected: &str, text: &str) -> Value {
    json!({
        "novelId": 1,
        "target": "VI",
        "chapter": 3,
        "p": p,
        "expected": expected,
        "text": text,
    })
}

fn translation_change(target: &str) -> AssistantChange {
    AssistantChange {
        target: ChangeTarget::Translation,
        novel_id: 1,
        chapter_id: Some(CHAPTER_ID.to_string()),
        lang: None,
        translation_target: Some(target.to_string()),
    }
}

fn dictionary_change() -> AssistantChange {
    AssistantChange {
        target: ChangeTarget::Translation,
        novel_id: 1,
        chapter_id: None,
        lang: None,
        translation_target: Some("VI".to_string()),
    }
}

fn input(src: &str, dst: &str, kind: &str) -> DictInput {
    DictInput {
        src: src.to_string(),
        dst: dst.to_string(),
        kind: kind.to_string(),
        note: String::new(),
    }
}

#[test]
fn every_translation_edit_tool_refuses_when_editing_is_off() {
    let book = translation();
    let cases = [
        ("edit_translation_passage", passage_args(1, "dich a", "moi")),
        (
            "edit_dictionary",
            json!({ "novelId": 1, "target": "VI", "remove": [1] }),
        ),
    ];
    for (name, args) in cases {
        let (result, sink) = translation_edit(name, args, &workspace(), false, &book);
        assert_eq!(result.unwrap_err(), EDIT_DISABLED, "{name}");
        assert!(sink.changes().is_empty());
    }
    assert!(book.writes().is_empty());
}

#[test]
fn edit_translation_passage_writes_and_emits_a_translation_change() {
    let book = translation();

    let (result, sink) = allowed_translation(
        "edit_translation_passage",
        passage_args(2, "dich b", "moi"),
        &book,
    );
    let output = result.unwrap();

    assert_eq!(
        output.label,
        "edit_translation_passage(novel 1, ch 3, VI, ¶2)"
    );
    let value: Value = from_str(&output.text).unwrap();
    assert_eq!(
        value,
        json!({ "novelId": 1, "target": "VI", "chapter": 3, "p": 2 })
    );
    assert_eq!(book.passage_text(1, "VI", CHAPTER_ID, 2), "moi");
    assert_eq!(
        book.writes(),
        vec![TranslationWrite::Passage {
            novel_id: 1,
            target: "VI".to_string(),
            chapter_id: CHAPTER_ID.to_string(),
            n: 2,
            text: "moi".to_string(),
        }]
    );
    assert_eq!(sink.changes(), vec![translation_change("VI")]);
}

#[test]
fn edit_translation_passage_normalizes_the_target() {
    let book = translation();
    let mut args = passage_args(1, "dich a", "moi");
    args["target"] = json!("vi");

    let (result, sink) = allowed_translation("edit_translation_passage", args, &book);

    result.unwrap();
    assert_eq!(sink.changes(), vec![translation_change("VI")]);
}

#[test]
fn edit_translation_passage_refuses_a_stale_expected_text() {
    let book = translation();

    let (result, sink) = allowed_translation(
        "edit_translation_passage",
        passage_args(1, "old", "moi"),
        &book,
    );

    let error = result.unwrap_err();
    assert!(error.contains("does not match `expected`"));
    assert!(error.contains("Current text: dich a"));
    assert!(book.writes().is_empty());
    assert!(sink.changes().is_empty());
}

#[test]
fn edit_translation_passage_rejects_bad_targets_chapters_and_positions() {
    let book = translation();
    let mut bad_target = passage_args(1, "dich a", "moi");
    bad_target["target"] = json!("FR");
    let mut untranslated = passage_args(1, "x", "moi");
    untranslated["target"] = json!("EN");
    let mut no_chapter = passage_args(1, "dich a", "moi");
    no_chapter["chapter"] = json!(9);
    let cases = [
        (bad_target, "unsupported target 'FR'"),
        (untranslated, "no EN translation yet"),
        (no_chapter, "chapter 9 not found"),
        (passage_args(0, "dich a", "moi"), "at least 1"),
        (passage_args(5, "dich a", "moi"), "paragraph 5 not found"),
    ];

    for (args, message) in cases {
        let (result, sink) = allowed_translation("edit_translation_passage", args, &book);
        assert!(result.unwrap_err().contains(message), "{message}");
        assert!(sink.changes().is_empty());
    }
    assert!(book.writes().is_empty());
}

#[test]
fn edit_dictionary_adds_updates_and_removes_then_emits_once() {
    let book = translation();
    let args = json!({
        "novelId": 1,
        "target": "VI",
        "add": [{ "src": "Moon", "dst": "Trang", "type": "term", "note": "n" }],
        "update": [{ "id": 1, "dst": "Lam Mo", "note": "hero" }],
        "remove": [2],
    });

    let (result, sink) = allowed_translation("edit_dictionary", args, &book);
    let output = result.unwrap();

    assert_eq!(output.label, "edit_dictionary(novel 1, VI, +1 ~1 -1)");
    let value: Value = from_str(&output.text).unwrap();
    assert_eq!(value["added"][0]["src"], "Moon");
    assert_eq!(value["added"][0]["type"], "term");
    assert_eq!(value["updated"][0]["dst"], "Lam Mo");
    assert_eq!(value["removed"], json!([2]));
    let dict = book.book(1, "VI").dict;
    let srcs: Vec<&str> = dict.iter().map(|entry| entry.src.as_str()).collect();
    assert_eq!(srcs, vec!["Lin", "Moon"]);
    assert_eq!(dict[0].dst, "Lam Mo");
    assert_eq!(dict[0].note, "hero");
    assert_eq!(book.writes().len(), 3);
    assert_eq!(sink.changes(), vec![dictionary_change()]);
}

#[test]
fn edit_dictionary_refuses_a_duplicate_source_without_writing() {
    let book = translation();
    let existing = json!({
        "novelId": 1,
        "target": "VI",
        "add": [{ "src": "Moon", "dst": "Trang", "type": "term" }, { "src": "Lin", "dst": "x", "type": "name" }],
    });
    let twice = json!({
        "novelId": 1,
        "target": "VI",
        "add": [{ "src": "Moon", "dst": "Trang", "type": "term" }, { "src": " Moon ", "dst": "x", "type": "term" }],
    });

    for args in [existing, twice] {
        let (result, sink) = allowed_translation("edit_dictionary", args, &book);
        assert!(result.unwrap_err().contains("already has an entry"));
        assert!(sink.changes().is_empty());
    }
    assert!(book.writes().is_empty());
}

#[test]
fn edit_dictionary_refuses_unknown_ids_and_empty_requests() {
    let book = translation();
    let cases = [
        (
            json!({ "novelId": 1, "target": "VI", "update": [{ "id": 9, "dst": "x" }] }),
            "dictionary entry 9 does not exist",
        ),
        (
            json!({ "novelId": 1, "target": "VI", "remove": [9] }),
            "dictionary entry 9 does not exist",
        ),
        (
            json!({ "novelId": 1, "target": "VI" }),
            "pass at least one of add, update or remove",
        ),
        (
            json!({ "novelId": 1, "target": "VI", "add": [{ "src": "a" }] }),
            "invalid entry in 'add'",
        ),
        (
            json!({ "novelId": 1, "target": "VI", "add": "nope" }),
            "'add' must be an array",
        ),
        (
            json!({ "novelId": 1, "target": "VI", "remove": ["x"] }),
            "array of integers",
        ),
    ];

    for (args, message) in cases {
        let (result, sink) = allowed_translation("edit_dictionary", args, &book);
        assert!(result.unwrap_err().contains(message), "{message}");
        assert!(sink.changes().is_empty());
    }
    assert!(book.writes().is_empty());
}

#[test]
fn edit_dictionary_reports_progress_when_a_later_step_fails() {
    let book = translation();
    let args = json!({
        "novelId": 1,
        "target": "VI",
        "add": [{ "src": "Moon", "dst": "Trang", "type": "term" }],
        "update": [{ "id": 1, "src": "Sword" }],
    });

    let (result, sink) = allowed_translation("edit_dictionary", args, &book);

    let error = result.unwrap_err();
    assert!(error.contains("already exists"));
    assert!(error.contains("1 added, 0 updated, 0 removed"));
    assert_eq!(book.writes().len(), 1);
    assert_eq!(sink.changes(), vec![dictionary_change()]);
}

#[test]
fn translation_edit_tools_respect_the_novel_scope() {
    let book = translation();
    let passage = {
        let mut args = passage_args(1, "dich a", "moi");
        args["novelId"] = json!(2);
        args
    };
    let cases = [
        ("edit_translation_passage", passage),
        (
            "edit_dictionary",
            json!({ "novelId": 2, "target": "VI", "remove": [1] }),
        ),
    ];

    for (name, args) in cases {
        let (result, sink) = translation_edit(name, args, &novel_scope(1), true, &book);
        assert!(
            result.unwrap_err().contains("outside the current scope"),
            "{name}"
        );
        assert!(sink.changes().is_empty());
    }
    assert!(book.writes().is_empty());
}

#[test]
fn replace_in_passage_swaps_the_first_occurrence_from_a_fresh_read() {
    let book = FakeTranslation::new().with_translated_chapter(
        1,
        "VI",
        CHAPTER_ID,
        "Ba",
        &["Lin Mo gap Lin Mo"],
    );
    let sources = sources_with(&novels(), &FakeKnowledge::new(), &book);

    replace_in_passage(&sources, 1, "VI", CHAPTER_ID, 1, "Lin Mo", "Lam Mo").unwrap();

    assert_eq!(
        book.passage_text(1, "VI", CHAPTER_ID, 1),
        "Lam Mo gap Lin Mo"
    );
}

#[test]
fn replace_in_passage_refuses_a_missing_snippet_and_bad_positions() {
    let book = translation();
    let sources = sources_with(&novels(), &FakeKnowledge::new(), &book);

    let missing = replace_in_passage(&sources, 1, "VI", CHAPTER_ID, 1, "nope", "x").unwrap_err();
    let empty = replace_in_passage(&sources, 1, "VI", CHAPTER_ID, 1, "", "x").unwrap_err();
    let range = replace_in_passage(&sources, 1, "VI", CHAPTER_ID, 9, "a", "x").unwrap_err();
    let chapter = replace_in_passage(&sources, 1, "VI", "other", 1, "a", "x").unwrap_err();

    assert!(missing.contains("no longer contains `nope`"));
    assert!(empty.contains("must not be empty"));
    assert!(range.contains("paragraph 9 not found"));
    assert!(chapter.contains("no VI translation yet"));
    assert!(book.writes().is_empty());
}

#[test]
fn add_dictionary_returns_the_new_entry_and_refuses_a_duplicate() {
    let book = translation();
    let sources = sources_with(&novels(), &FakeKnowledge::new(), &book);

    let entry = add_dictionary(&sources, 1, "VI", input("Moon", "Trang", "term")).unwrap();
    let duplicate = add_dictionary(&sources, 1, "VI", input("Moon", "Y", "term")).unwrap_err();

    assert_eq!(entry.src, "Moon");
    assert_eq!(entry.dst, "Trang");
    assert!(duplicate.contains("already exists"));
    assert_eq!(book.book(1, "VI").dict.len(), 3);
}
