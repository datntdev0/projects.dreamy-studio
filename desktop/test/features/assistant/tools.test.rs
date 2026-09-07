use super::knowledge::MAX_ISSUES;
use super::paging::PAGE_CHARS;
use super::paging::PAGE_PARAGRAPHS;
use super::*;
use crate::features::translation::warnings::TranslationWarning;
use crate::features::translation::warnings::WarningKind;
use crate::testing::assistant::FakeKnowledge;
use crate::testing::assistant::FakeNovels;
use crate::testing::assistant::FakeTranslation;
use crate::testing::assistant::RecordingSink;
use crate::testing::assistant::sources_of;
use crate::testing::assistant::sources_with;
use serde_json::from_str;
use serde_json::json;

fn workspace() -> AssistantScope {
    AssistantScope::workspace()
}

fn novel_scope(id: i64) -> AssistantScope {
    AssistantScope::novel(id)
}

fn texts(count: usize) -> Vec<String> {
    (1..=count).map(|n| format!("paragraph {n}")).collect()
}

fn novels_with(paragraphs: &[String]) -> FakeNovels {
    let refs: Vec<&str> = paragraphs.iter().map(String::as_str).collect();
    FakeNovels::new()
        .with_novel(1, "First")
        .with_chapter(1, 3, "Third", &refs)
}

fn invoke(
    name: &str,
    args: &Value,
    scope: &AssistantScope,
    novels: &FakeNovels,
) -> Result<ToolOutput, String> {
    invoke_with(name, args, scope, novels, &FakeKnowledge::new())
}

fn invoke_with(
    name: &str,
    args: &Value,
    scope: &AssistantScope,
    novels: &FakeNovels,
    knowledge: &FakeKnowledge,
) -> Result<ToolOutput, String> {
    let sink = RecordingSink::new();
    let ctx = ToolContext {
        scope,
        linked_novel: None,
        can_edit: false,
        sink: &sink,
    };
    call(name, args, &ctx, &sources_of(novels, knowledge))
}

fn invoke_in_project(
    name: &str,
    args: &Value,
    linked_novel: Option<i64>,
    novels: &FakeNovels,
) -> Result<ToolOutput, String> {
    let sink = RecordingSink::new();
    let scope = AssistantScope::project(5);
    let ctx = ToolContext {
        scope: &scope,
        linked_novel,
        can_edit: false,
        sink: &sink,
    };
    call(name, args, &ctx, &sources_of(novels, &FakeKnowledge::new()))
}

fn two_novels() -> FakeNovels {
    FakeNovels::new()
        .with_novel(1, "First")
        .with_chapter(1, 1, "One", &["a"])
        .with_novel(2, "Second")
        .with_chapter(2, 1, "One", &["b"])
}

fn run(
    name: &str,
    args: Value,
    scope: &AssistantScope,
    source: &FakeNovels,
) -> Result<Value, String> {
    let output = invoke(name, &args, scope, source)?;
    Ok(from_str(&output.text).unwrap())
}

fn read_page(source: &FakeNovels, args: Value) -> Value {
    run("read_novel_chapter", args, &workspace(), source).unwrap()
}

fn positions(page: &Value) -> Vec<i64> {
    page["paragraphs"]
        .as_array()
        .unwrap()
        .iter()
        .map(|item| item["p"].as_i64().unwrap())
        .collect()
}

#[test]
fn definitions_describe_the_tools() {
    let tools = definitions(&novel_scope(1));
    let list = tools.as_array().unwrap();
    let names: Vec<&str> = list
        .iter()
        .map(|tool| tool["name"].as_str().unwrap())
        .collect();
    assert_eq!(
        names,
        vec![
            "list_novel",
            "read_novel",
            "read_novel_chapter",
            "read_novel_knowledge",
            "read_translation",
            "read_translation_guide",
            "edit_novel",
            "edit_novel_chapter",
            "edit_novel_knowledge",
            "edit_translation_passage",
            "edit_dictionary",
            "submit_translation_review",
            "read_knowledge_issues",
            "submit_knowledge_changes"
        ]
    );
    for tool in list {
        assert!(tool["description"].as_str().unwrap().len() > 10);
        assert_eq!(tool["inputSchema"]["type"], "object");
    }
    assert_eq!(
        list[2]["inputSchema"]["required"],
        json!(["novelId", "chapter"])
    );
    assert_eq!(
        list[3]["inputSchema"]["required"],
        json!(["novelId", "lang"])
    );
    assert_eq!(
        list[4]["inputSchema"]["required"],
        json!(["novelId", "target", "chapter"])
    );
    assert_eq!(
        list[5]["inputSchema"]["required"],
        json!(["novelId", "target"])
    );
    assert_eq!(
        list[9]["inputSchema"]["required"],
        json!(["novelId", "target", "chapter", "p", "expected", "text"])
    );
    assert_eq!(
        list[10]["inputSchema"]["required"],
        json!(["novelId", "target"])
    );
    assert_eq!(
        list[12]["inputSchema"]["required"],
        json!(["novelId", "lang"])
    );
    assert_eq!(
        list[13]["inputSchema"]["required"],
        json!(["novelId", "lang", "title", "changes"])
    );
}

#[test]
fn list_novel_returns_the_metadata_shape() {
    let source = FakeNovels::new()
        .with_novel(1, "First")
        .with_chapter(1, 1, "One", &["a"])
        .with_chapter(1, 2, "Two", &["b"])
        .with_statuses(1, 1, "done", "done")
        .with_novel(2, "Second");
    let value = run("list_novel", json!({}), &workspace(), &source).unwrap();
    let items = value.as_array().unwrap();
    assert_eq!(items.len(), 2);
    assert_eq!(
        items[0],
        json!({
            "novelId": 1,
            "title": "First",
            "name": "First name",
            "author": "Author",
            "lang": "zh",
            "description": "About First",
            "tags": ["tag"],
            "chapterCount": 2,
            "translatedCount": 1,
            "analyzedCount": 1,
        })
    );
    assert_eq!(items[1]["novelId"], 2);
}

#[test]
fn list_novel_label_counts_novels() {
    let source = FakeNovels::new()
        .with_novel(1, "First")
        .with_novel(2, "Second");
    let output = invoke("list_novel", &json!({}), &workspace(), &source).unwrap();
    assert_eq!(output.label, "list_novel() → 2 novel");
}

#[test]
fn read_novel_returns_metadata_and_outline() {
    let source = FakeNovels::new()
        .with_novel(1, "First")
        .with_chapter(1, 1, "One", &["alpha beta", "gamma"])
        .with_chapter(1, 2, "Two", &["delta"])
        .with_statuses(1, 2, "done", "none");
    let output = invoke("read_novel", &json!({"novelId": 1}), &workspace(), &source).unwrap();
    let value: Value = from_str(&output.text).unwrap();
    assert_eq!(value["novelId"], 1);
    assert_eq!(value["title"], "First");
    assert_eq!(value["chapterCount"], 2);
    assert_eq!(
        value["chapters"],
        json!([
            {"chapter": 1, "title": "One", "words": 3, "translation": "none", "analysis": "none"},
            {"chapter": 2, "title": "Two", "words": 1, "translation": "done", "analysis": "none"},
        ])
    );
    assert_eq!(output.label, "read_novel(novel 1) → 2 chương");
}

#[test]
fn read_novel_unknown_novel_is_an_error() {
    let source = FakeNovels::new().with_novel(1, "First");
    let error = invoke("read_novel", &json!({"novelId": 9}), &workspace(), &source).unwrap_err();
    assert!(error.contains("not found"));
}

#[test]
fn read_novel_requires_an_integer_novel_id() {
    let source = FakeNovels::new().with_novel(1, "First");
    assert!(invoke("read_novel", &json!({}), &workspace(), &source).is_err());
    assert!(
        invoke(
            "read_novel",
            &json!({"novelId": "1"}),
            &workspace(),
            &source
        )
        .is_err()
    );
}

#[test]
fn chapter_read_returns_the_whole_short_chapter() {
    let source = novels_with(&texts(5));
    let output = invoke(
        "read_novel_chapter",
        &json!({"novelId": 1, "chapter": 3}),
        &workspace(),
        &source,
    )
    .unwrap();
    let page: Value = from_str(&output.text).unwrap();
    assert_eq!(page["novelId"], 1);
    assert_eq!(page["chapter"], 3);
    assert_eq!(page["title"], "Third");
    assert_eq!(page["total"], 5);
    assert_eq!(page["from"], 1);
    assert_eq!(page["to"], 5);
    assert_eq!(page["next"], Value::Null);
    assert_eq!(positions(&page), vec![1, 2, 3, 4, 5]);
    assert_eq!(page["paragraphs"][0]["text"], "paragraph 1");
    assert_eq!(
        output.label,
        "read_novel_chapter(novel 1, ch 3, ¶1–5) → 5 đoạn"
    );
    assert!(!output.text.contains('\n'));
}

#[test]
fn chapter_read_caps_a_page_at_sixty_paragraphs() {
    let source = novels_with(&texts(100));
    let first = read_page(&source, json!({"novelId": 1, "chapter": 3}));
    assert_eq!(first["paragraphs"].as_array().unwrap().len(), 60);
    assert_eq!(first["to"], 60);
    assert_eq!(first["next"], 61);
    let second = read_page(&source, json!({"novelId": 1, "chapter": 3, "from": 61}));
    assert_eq!(second["from"], 61);
    assert_eq!(second["to"], 100);
    assert_eq!(second["next"], Value::Null);
    assert_eq!(positions(&second).len(), 40);
}

#[test]
fn chapter_read_caps_a_page_at_twelve_thousand_chars() {
    let long = "x".repeat(5_000);
    let paragraphs = vec![long.clone(), long.clone(), long.clone(), long];
    let source = novels_with(&paragraphs);
    let page = read_page(&source, json!({"novelId": 1, "chapter": 3}));
    assert_eq!(positions(&page), vec![1, 2]);
    assert_eq!(page["to"], 2);
    assert_eq!(page["next"], 3);
}

#[test]
fn chapter_read_always_returns_one_oversized_paragraph() {
    let paragraphs = vec!["y".repeat(PAGE_CHARS + 500), "short".to_string()];
    let source = novels_with(&paragraphs);
    let page = read_page(&source, json!({"novelId": 1, "chapter": 3}));
    assert_eq!(positions(&page), vec![1]);
    assert_eq!(page["next"], 2);
}

#[test]
fn chapter_read_honours_from_and_to() {
    let source = novels_with(&texts(20));
    let page = read_page(
        &source,
        json!({"novelId": 1, "chapter": 3, "from": 5, "to": 8}),
    );
    assert_eq!(positions(&page), vec![5, 6, 7, 8]);
    assert_eq!(page["from"], 5);
    assert_eq!(page["to"], 8);
    assert_eq!(page["next"], 9);
}

#[test]
fn chapter_read_clamps_out_of_range_positions() {
    let source = novels_with(&texts(10));
    let low = read_page(
        &source,
        json!({"novelId": 1, "chapter": 3, "from": -4, "to": 500}),
    );
    assert_eq!(low["from"], 1);
    assert_eq!(low["to"], 10);
    let high = read_page(&source, json!({"novelId": 1, "chapter": 3, "from": 99}));
    assert_eq!(high["from"], 10);
    assert_eq!(positions(&high), vec![10]);
    let inverted = read_page(
        &source,
        json!({"novelId": 1, "chapter": 3, "from": 6, "to": 2}),
    );
    assert_eq!(inverted["from"], 6);
    assert_eq!(inverted["to"], 6);
}

#[test]
fn chapter_read_handles_an_empty_chapter() {
    let source = novels_with(&[]);
    let output = invoke(
        "read_novel_chapter",
        &json!({"novelId": 1, "chapter": 3}),
        &workspace(),
        &source,
    )
    .unwrap();
    let page: Value = from_str(&output.text).unwrap();
    assert_eq!(page["total"], 0);
    assert_eq!(page["paragraphs"], json!([]));
    assert_eq!(page["next"], Value::Null);
    assert!(output.label.ends_with("→ 0 đoạn"));
}

#[test]
fn chapter_read_unknown_chapter_is_an_error() {
    let source = novels_with(&texts(3));
    let error = invoke(
        "read_novel_chapter",
        &json!({"novelId": 1, "chapter": 8}),
        &workspace(),
        &source,
    )
    .unwrap_err();
    assert!(error.contains("chapter 8"));
}

#[test]
fn chapter_read_unknown_novel_is_an_error() {
    let source = novels_with(&texts(3));
    let error = invoke(
        "read_novel_chapter",
        &json!({"novelId": 7, "chapter": 3}),
        &workspace(),
        &source,
    )
    .unwrap_err();
    assert!(error.contains("novel 7"));
}

#[test]
fn chapter_read_rejects_bad_arguments() {
    let source = novels_with(&texts(3));
    let bad = json!({"novelId": 1, "chapter": 3, "from": "two"});
    assert!(invoke("read_novel_chapter", &bad, &workspace(), &source).is_err());
    let missing = json!({"novelId": 1});
    assert!(invoke("read_novel_chapter", &missing, &workspace(), &source).is_err());
}

#[test]
fn novel_scope_lists_only_its_novel() {
    let source = FakeNovels::new()
        .with_novel(1, "First")
        .with_novel(2, "Second");
    let value = run("list_novel", json!({}), &novel_scope(2), &source).unwrap();
    let items = value.as_array().unwrap();
    assert_eq!(items.len(), 1);
    assert_eq!(items[0]["novelId"], 2);
}

#[test]
fn project_scope_lists_only_its_linked_novel() {
    let output = invoke_in_project("list_novel", &json!({}), Some(2), &two_novels()).unwrap();
    let value: Value = serde_json::from_str(&output.text).unwrap();
    let items = value.as_array().unwrap();
    assert_eq!(items.len(), 1);
    assert_eq!(items[0]["novelId"], 2);
}

#[test]
fn project_scope_rejects_novels_other_than_the_linked_one() {
    let source = two_novels();
    let cases = [
        ("read_novel", json!({"novelId": 2})),
        ("read_novel_chapter", json!({"novelId": 2, "chapter": 1})),
        ("read_novel_knowledge", json!({"novelId": 2, "lang": "src"})),
        (
            "read_translation_guide",
            json!({"novelId": 2, "target": "VI"}),
        ),
    ];
    for (name, args) in cases {
        let error = invoke_in_project(name, &args, Some(1), &source).unwrap_err();
        assert!(
            error.contains("outside the current scope"),
            "{name}: {error}"
        );
    }
    let allowed = invoke_in_project("read_novel", &json!({"novelId": 1}), Some(1), &source);
    assert!(allowed.is_ok());
}

#[test]
fn project_scope_without_a_linked_novel_refuses_every_novel_tool() {
    let source = two_novels();
    let listed = invoke_in_project("list_novel", &json!({}), None, &source).unwrap_err();
    assert!(listed.contains("no linked novel"));
    let read = invoke_in_project("read_novel", &json!({"novelId": 1}), None, &source).unwrap_err();
    assert!(read.contains("no linked novel"));
}

#[test]
fn novel_scope_rejects_other_novels() {
    let source = FakeNovels::new()
        .with_novel(1, "First")
        .with_chapter(1, 1, "One", &["a"])
        .with_novel(2, "Second")
        .with_chapter(2, 1, "One", &["b"]);
    let scope = novel_scope(1);
    let outline = invoke("read_novel", &json!({"novelId": 2}), &scope, &source).unwrap_err();
    assert!(outline.contains("scope"));
    let chapter = invoke(
        "read_novel_chapter",
        &json!({"novelId": 2, "chapter": 1}),
        &scope,
        &source,
    )
    .unwrap_err();
    assert!(chapter.contains("scope"));
    assert!(invoke("read_novel", &json!({"novelId": 1}), &scope, &source).is_ok());
}

#[test]
fn unknown_tool_is_an_error() {
    let source = FakeNovels::new();
    let error = invoke("delete_novel", &json!({}), &workspace(), &source).unwrap_err();
    assert!(error.contains("delete_novel"));
}

fn lore() -> FakeKnowledge {
    FakeKnowledge::new()
        .with_entity(
            "p1",
            "persona",
            "Lan Anh",
            &["Princess"],
            &["Little Lan"],
            &[3, 1, 3],
        )
        .with_entity("p2", "persona", "Minh", &[], &["Dragon"], &[2])
        .with_entity("l1", "location", "Lanzhou", &[], &[], &[1])
        .with_entity("c1", "character", "Real Lan", &[], &[], &[])
        .with_fact("f1", "persona_of", "p1", Some("c1"), &[1])
        .with_fact("f2", "ally_of", "p1", Some("p2"), &[2, 3])
        .with_fact("f3", "resides_at", "p2", Some("l1"), &[2])
        .with_fact("f4", "occupation", "p2", Some("smith"), &[2])
}

fn read_knowledge(knowledge: &FakeKnowledge, args: Value) -> Result<Value, String> {
    let novels = FakeNovels::new().with_novel(1, "First");
    let output = invoke_with(
        "read_novel_knowledge",
        &args,
        &workspace(),
        &novels,
        knowledge,
    )?;
    Ok(from_str(&output.text).unwrap())
}

fn ids(value: &Value, key: &str) -> Vec<String> {
    value[key]
        .as_array()
        .unwrap()
        .iter()
        .map(|item| item["id"].as_str().unwrap().to_string())
        .collect()
}

#[test]
fn read_novel_knowledge_returns_entities_facts_and_ontology_keys() {
    let value = read_knowledge(&lore(), json!({"novelId": 1, "lang": "src"})).unwrap();
    assert_eq!(value["lang"], "src");
    assert_eq!(value["total"], 4);
    assert_eq!(value["next"], Value::Null);
    assert_eq!(ids(&value, "entities"), vec!["p1", "p2", "l1", "c1"]);
    assert_eq!(ids(&value, "facts"), vec!["f1", "f2", "f3", "f4"]);
    let types = value["types"].as_array().unwrap();
    assert!(types.contains(&json!("persona")));
    assert!(
        value["predicates"]
            .as_array()
            .unwrap()
            .contains(&json!("ally_of"))
    );
    assert_eq!(
        value["entities"][0],
        json!({
            "id": "p1",
            "type": "persona",
            "name": "Lan Anh",
            "titles": ["Princess"],
            "aliases": ["Little Lan"],
            "chapters": [1, 3],
        })
    );
    assert_eq!(
        value["facts"][3],
        json!({
            "id": "f4",
            "pred": "occupation",
            "subject": "p2",
            "object": "smith",
            "chapters": [2],
        })
    );
}

#[test]
fn read_novel_knowledge_filters_by_type() {
    let value = read_knowledge(
        &lore(),
        json!({"novelId": 1, "lang": "src", "type": "persona"}),
    )
    .unwrap();
    assert_eq!(ids(&value, "entities"), vec!["p1", "p2"]);
    assert_eq!(value["total"], 2);
}

#[test]
fn read_novel_knowledge_matches_the_query_on_name_titles_and_aliases() {
    let knowledge = lore();
    let by_name = read_knowledge(
        &knowledge,
        json!({"novelId": 1, "lang": "src", "query": "MINH"}),
    )
    .unwrap();
    let by_title = read_knowledge(
        &knowledge,
        json!({"novelId": 1, "lang": "src", "query": "princess"}),
    )
    .unwrap();
    let by_alias = read_knowledge(
        &knowledge,
        json!({"novelId": 1, "lang": "src", "query": "dRaGoN"}),
    )
    .unwrap();
    let shared = read_knowledge(
        &knowledge,
        json!({"novelId": 1, "lang": "src", "query": "lan"}),
    )
    .unwrap();
    let blank = read_knowledge(
        &knowledge,
        json!({"novelId": 1, "lang": "src", "query": "  "}),
    )
    .unwrap();
    assert_eq!(ids(&by_name, "entities"), vec!["p2"]);
    assert_eq!(ids(&by_title, "entities"), vec!["p1"]);
    assert_eq!(ids(&by_alias, "entities"), vec!["p2"]);
    assert_eq!(ids(&shared, "entities"), vec!["p1", "l1", "c1"]);
    assert_eq!(blank["total"], 4);
}

#[test]
fn read_novel_knowledge_keeps_only_facts_touching_returned_entities() {
    let value = read_knowledge(
        &lore(),
        json!({"novelId": 1, "lang": "src", "query": "lanzhou"}),
    )
    .unwrap();
    assert_eq!(ids(&value, "entities"), vec!["l1"]);
    assert_eq!(ids(&value, "facts"), vec!["f3"]);
    let none = read_knowledge(
        &lore(),
        json!({"novelId": 1, "lang": "src", "query": "nobody"}),
    )
    .unwrap();
    assert!(none["entities"].as_array().unwrap().is_empty());
    assert!(none["facts"].as_array().unwrap().is_empty());
    assert_eq!(none["total"], 0);
}

#[test]
fn read_novel_knowledge_pages_by_entity() {
    let knowledge = lore();
    let first =
        read_knowledge(&knowledge, json!({"novelId": 1, "lang": "src", "limit": 3})).unwrap();
    let second = read_knowledge(
        &knowledge,
        json!({"novelId": 1, "lang": "src", "limit": 3, "offset": 3}),
    )
    .unwrap();
    assert_eq!(ids(&first, "entities"), vec!["p1", "p2", "l1"]);
    assert_eq!(first["next"], 3);
    assert_eq!(first["total"], 4);
    assert_eq!(ids(&first, "facts"), vec!["f1", "f2", "f3", "f4"]);
    assert_eq!(ids(&second, "entities"), vec!["c1"]);
    assert_eq!(second["next"], Value::Null);
    assert_eq!(ids(&second, "facts"), vec!["f1"]);
}

#[test]
fn read_novel_knowledge_defaults_to_eighty_entities_per_page() {
    let mut knowledge = FakeKnowledge::new();
    for index in 0..100 {
        knowledge = knowledge.with_entity(
            &format!("e{index}"),
            "term",
            &format!("Term {index}"),
            &[],
            &[],
            &[1],
        );
    }
    let first = read_knowledge(&knowledge, json!({"novelId": 1, "lang": "VI"})).unwrap();
    let second = read_knowledge(
        &knowledge,
        json!({"novelId": 1, "lang": "VI", "offset": 80}),
    )
    .unwrap();
    assert_eq!(first["lang"], "VI");
    assert_eq!(first["entities"].as_array().unwrap().len(), 80);
    assert_eq!(first["next"], 80);
    assert_eq!(second["entities"].as_array().unwrap().len(), 20);
    assert_eq!(second["next"], Value::Null);
    assert_eq!(second["total"], 100);
}

#[test]
fn read_novel_knowledge_rejects_a_bad_lang_and_bad_arguments() {
    let knowledge = lore();
    let bad = read_knowledge(&knowledge, json!({"novelId": 1, "lang": "fr"})).unwrap_err();
    let lower = read_knowledge(&knowledge, json!({"novelId": 1, "lang": "vi"})).unwrap_err();
    let missing = read_knowledge(&knowledge, json!({"novelId": 1}));
    let numeric = read_knowledge(&knowledge, json!({"novelId": 1, "lang": "src", "query": 5}));
    let unknown = read_knowledge(&knowledge, json!({"novelId": 9, "lang": "src"})).unwrap_err();
    assert!(bad.contains("fr"));
    assert!(lower.contains("vi"));
    assert!(missing.is_err());
    assert!(numeric.is_err());
    assert!(unknown.contains("not found"));
}

#[test]
fn read_novel_knowledge_reports_source_errors() {
    let knowledge = FakeKnowledge::new().failing("knowledge is unavailable");
    let error = read_knowledge(&knowledge, json!({"novelId": 1, "lang": "src"})).unwrap_err();
    assert_eq!(error, "knowledge is unavailable");
}

#[test]
fn read_novel_knowledge_label_counts_entities_and_facts() {
    let novels = FakeNovels::new().with_novel(1, "First");
    let output = invoke_with(
        "read_novel_knowledge",
        &json!({"novelId": 1, "lang": "EN", "type": "persona"}),
        &workspace(),
        &novels,
        &lore(),
    )
    .unwrap();
    assert_eq!(
        output.label,
        "read_novel_knowledge(novel 1, EN) → 2 thực thể, 4 sự kiện"
    );
}

#[test]
fn read_novel_knowledge_respects_the_novel_scope() {
    let novels = FakeNovels::new()
        .with_novel(1, "First")
        .with_novel(2, "Second");
    let args = json!({"novelId": 2, "lang": "src"});
    let outside = invoke_with(
        "read_novel_knowledge",
        &args,
        &novel_scope(1),
        &novels,
        &lore(),
    )
    .unwrap_err();
    let inside = invoke_with(
        "read_novel_knowledge",
        &args,
        &novel_scope(2),
        &novels,
        &lore(),
    );
    assert!(outside.contains("scope"));
    assert!(inside.is_ok());
}

const CHAPTER_ID: &str = "chapter-1-3";

fn translated_novels() -> FakeNovels {
    FakeNovels::new()
        .with_novel(1, "First")
        .with_chapter(1, 3, "Third", &["source a", "source b"])
        .with_chapter(1, 4, "Fourth", &["source c"])
        .with_novel(2, "Second")
}

fn translated_book() -> FakeTranslation {
    FakeTranslation::new()
        .with_translated_chapter(1, "VI", CHAPTER_ID, "Chuong ba", &["dich a", "dich b"])
        .with_note(1, "VI", CHAPTER_ID, 2, "ghi chu")
}

fn translation_tool(
    name: &str,
    args: Value,
    scope: &AssistantScope,
    novels: &FakeNovels,
    translation: &FakeTranslation,
) -> Result<ToolOutput, String> {
    let sink = RecordingSink::new();
    let ctx = ToolContext {
        scope,
        linked_novel: None,
        can_edit: false,
        sink: &sink,
    };
    let sources = sources_with(novels, &FakeKnowledge::new(), translation);
    call(name, &args, &ctx, &sources)
}

fn read_translated(args: Value) -> Result<Value, String> {
    let output = translation_tool(
        "read_translation",
        args,
        &workspace(),
        &translated_novels(),
        &translated_book(),
    )?;
    Ok(from_str(&output.text).unwrap())
}

#[test]
fn read_translation_pairs_source_and_translation_per_paragraph() {
    let value = read_translated(json!({"novelId": 1, "target": "vi", "chapter": 3})).unwrap();

    assert_eq!(
        value,
        json!({
            "novelId": 1,
            "chapter": 3,
            "title": "Chuong ba",
            "target": "VI",
            "total": 2,
            "from": 1,
            "to": 2,
            "paragraphs": [
                {"p": 1, "source": "source a", "translation": "dich a", "note": ""},
                {"p": 2, "source": "source b", "translation": "dich b", "note": "ghi chu"},
            ],
            "next": null,
        })
    );
}

#[test]
fn read_translation_label_names_the_range() {
    let output = translation_tool(
        "read_translation",
        json!({"novelId": 1, "target": "VI", "chapter": 3, "from": 2}),
        &workspace(),
        &translated_novels(),
        &translated_book(),
    )
    .unwrap();

    assert_eq!(
        output.label,
        "read_translation(novel 1, ch 3, VI, ¶2–2) → 1 đoạn"
    );
}

#[test]
fn read_translation_pages_like_a_chapter() {
    let source = novels_with(&texts(70));
    let own: Vec<String> = (1..=70).map(|n| format!("dich {n}")).collect();
    let refs: Vec<&str> = own.iter().map(String::as_str).collect();
    let translation =
        FakeTranslation::new().with_translated_chapter(1, "VI", CHAPTER_ID, "Ba", &refs);
    let read = |args: Value| -> Value {
        let output = translation_tool(
            "read_translation",
            args,
            &workspace(),
            &source,
            &translation,
        )
        .unwrap();
        from_str(&output.text).unwrap()
    };

    let first = read(json!({"novelId": 1, "target": "VI", "chapter": 3}));
    let second = read(json!({"novelId": 1, "target": "VI", "chapter": 3, "from": 61}));

    assert_eq!(positions(&first).len(), PAGE_PARAGRAPHS);
    assert_eq!(first["next"], 61);
    assert_eq!(first["total"], 70);
    assert_eq!(positions(&second), (61..=70).collect::<Vec<i64>>());
    assert!(second["next"].is_null());
}

#[test]
fn read_translation_caps_a_page_by_source_and_translation_characters() {
    let long = "x".repeat(4000);
    let source = novels_with(&[long.clone(), long.clone(), long.clone(), long.clone()]);
    let translation = FakeTranslation::new().with_translated_chapter(
        1,
        "VI",
        CHAPTER_ID,
        "Ba",
        &[&long, &long, &long, &long],
    );
    let output = translation_tool(
        "read_translation",
        json!({"novelId": 1, "target": "VI", "chapter": 3}),
        &workspace(),
        &source,
        &translation,
    )
    .unwrap();
    let value: Value = from_str(&output.text).unwrap();

    assert_eq!(positions(&value), vec![1]);
    assert_eq!(value["next"], 2);
}

#[test]
fn read_translation_reports_a_missing_translation_for_unfinished_paragraphs() {
    let translation =
        FakeTranslation::new().with_translated_chapter(1, "VI", CHAPTER_ID, "Ba", &["dich a"]);
    let output = translation_tool(
        "read_translation",
        json!({"novelId": 1, "target": "VI", "chapter": 3}),
        &workspace(),
        &translated_novels(),
        &translation,
    )
    .unwrap();
    let value: Value = from_str(&output.text).unwrap();

    assert_eq!(value["paragraphs"][1]["translation"], Value::Null);
    assert_eq!(value["paragraphs"][1]["source"], "source b");
}

#[test]
fn read_translation_of_an_untranslated_chapter_is_an_error() {
    let error = read_translated(json!({"novelId": 1, "target": "VI", "chapter": 4})).unwrap_err();
    let other = read_translated(json!({"novelId": 1, "target": "EN", "chapter": 3})).unwrap_err();

    assert!(error.contains("has no VI translation yet"));
    assert!(other.contains("has no EN translation yet"));
}

#[test]
fn read_translation_validates_its_arguments() {
    let target = read_translated(json!({"novelId": 1, "target": "FR", "chapter": 3}));
    let missing = read_translated(json!({"novelId": 1, "chapter": 3}));
    let chapter = read_translated(json!({"novelId": 1, "target": "VI", "chapter": 9}));
    let novel = read_translated(json!({"novelId": 9, "target": "VI", "chapter": 3}));

    assert!(target.unwrap_err().contains("unsupported target 'FR'"));
    assert!(missing.unwrap_err().contains("target"));
    assert!(chapter.unwrap_err().contains("chapter 9 not found"));
    assert!(novel.unwrap_err().contains("not found"));
}

#[test]
fn read_translation_tools_respect_the_novel_scope() {
    let args = json!({"novelId": 2, "target": "VI", "chapter": 1});
    let guide = json!({"novelId": 2, "target": "VI"});
    let novels = translated_novels();
    let translation = translated_book();

    let read = translation_tool(
        "read_translation",
        args,
        &novel_scope(1),
        &novels,
        &translation,
    );
    let read_guide = translation_tool(
        "read_translation_guide",
        guide,
        &novel_scope(1),
        &novels,
        &translation,
    );

    assert!(read.unwrap_err().contains("outside the current scope"));
    assert!(
        read_guide
            .unwrap_err()
            .contains("outside the current scope")
    );
}

#[test]
fn read_translation_reports_source_errors() {
    let translation = translated_book().failing("disk on fire");

    let error = translation_tool(
        "read_translation",
        json!({"novelId": 1, "target": "VI", "chapter": 3}),
        &workspace(),
        &translated_novels(),
        &translation,
    )
    .unwrap_err();

    assert_eq!(error, "disk on fire");
}

#[test]
fn read_translation_guide_returns_guidelines_dictionary_and_warnings() {
    let translation = translated_book()
        .with_guidelines(1, "VI", "Dich tu nhien")
        .with_entry(1, "VI", "Lin", "Lam", "name", "nhan vat")
        .with_entry(1, "VI", "Sword", "Kiem", "term", "")
        .with_entry(1, "EN", "Lin", "Lin", "name", "")
        .with_warning(
            1,
            "VI",
            TranslationWarning {
                kind: WarningKind::Dict,
                chapter_id: CHAPTER_ID.to_string(),
                n: 2,
                entry_id: Some(1),
            },
        )
        .with_warning(
            1,
            "VI",
            TranslationWarning {
                kind: WarningKind::Source,
                chapter_id: "unknown".to_string(),
                n: 1,
                entry_id: None,
            },
        );

    let output = translation_tool(
        "read_translation_guide",
        json!({"novelId": 1, "target": "vi"}),
        &workspace(),
        &translated_novels(),
        &translation,
    )
    .unwrap();
    let value: Value = from_str(&output.text).unwrap();

    assert_eq!(
        value,
        json!({
            "novelId": 1,
            "target": "VI",
            "guidelines": "Dich tu nhien",
            "dictionary": [
                {"id": 1, "src": "Lin", "dst": "Lam", "type": "name", "note": "nhan vat"},
                {"id": 2, "src": "Sword", "dst": "Kiem", "type": "term", "note": ""},
            ],
            "warnings": [
                {"kind": "dict", "chapter": 3, "p": 2, "entryId": 1},
                {"kind": "source", "chapter": null, "p": 1, "entryId": null},
            ],
        })
    );
    assert_eq!(
        output.label,
        "read_translation_guide(novel 1, VI) → 2 mục từ, 2 cảnh báo"
    );
}

#[test]
fn read_translation_guide_is_empty_for_a_fresh_target() {
    let output = translation_tool(
        "read_translation_guide",
        json!({"novelId": 1, "target": "EN"}),
        &workspace(),
        &translated_novels(),
        &FakeTranslation::new(),
    )
    .unwrap();
    let value: Value = from_str(&output.text).unwrap();

    assert_eq!(value["guidelines"], "");
    assert_eq!(value["dictionary"], json!([]));
    assert_eq!(value["warnings"], json!([]));
}

fn issue_knowledge() -> FakeKnowledge {
    FakeKnowledge::new()
        .with_entity("e1", "location", "Harbor", &[], &[], &[1])
        .with_entity("e2", "persona", "Wren", &[], &[], &[2])
        .with_fact("f1", "located_at", "gone", None, &[1])
        .with_fact("f2", "bogus", "e1", Some("e1"), &[3])
}

fn issues_of(args: Value, scope: &AssistantScope, knowledge: &FakeKnowledge) -> Vec<Value> {
    let novels = novels_with(&texts(1));
    let output = invoke_with("read_knowledge_issues", &args, scope, &novels, knowledge).unwrap();
    from_str::<Value>(&output.text)
        .unwrap()
        .as_array()
        .unwrap()
        .clone()
}

fn issue_ids(issues: &[Value]) -> Vec<&str> {
    issues
        .iter()
        .map(|issue| issue["id"].as_str().unwrap())
        .collect()
}

#[test]
fn read_knowledge_issues_returns_every_issue_with_its_items() {
    let knowledge = issue_knowledge();

    let issues = issues_of(
        json!({ "novelId": 1, "lang": "src" }),
        &workspace(),
        &knowledge,
    );

    let ids = issue_ids(&issues);
    assert!(ids.contains(&"dangling_ref|f1|f1"));
    assert!(ids.contains(&"persona_link|none|e2|e2"));
    assert!(ids.contains(&"relation_signature|unknown|bogus|f2|f2"));
    let dangling = issues
        .iter()
        .find(|issue| issue["id"] == "dangling_ref|f1|f1")
        .unwrap();
    assert_eq!(dangling["rule"], "dangling_ref");
    assert_eq!(dangling["severity"], "error");
    assert!(dangling["message"].as_str().unwrap().contains("\"gone\""));
    assert_eq!(
        dangling["items"],
        json!([{
            "id": "f1",
            "kind": "fact",
            "pred": "located_at",
            "subject": "gone",
            "object": null,
            "ev": [{ "chapter": 1, "p": 1, "q": "quote" }],
        }])
    );
    let persona = issues
        .iter()
        .find(|issue| issue["id"] == "persona_link|none|e2|e2")
        .unwrap();
    assert_eq!(
        persona["items"],
        json!([{
            "id": "e2",
            "kind": "entity",
            "type": "persona",
            "name": "Wren",
            "ev": [{ "chapter": 2, "p": 1, "q": "quote" }],
        }])
    );
}

#[test]
fn read_knowledge_issues_filters_by_ids_and_by_rule() {
    let knowledge = issue_knowledge();

    let by_id = issues_of(
        json!({
            "novelId": 1,
            "lang": "src",
            "issueIds": ["persona_link|none|e2|e2", "unknown|id"],
        }),
        &workspace(),
        &knowledge,
    );
    let by_rule = issues_of(
        json!({ "novelId": 1, "lang": "src", "rule": "dangling_ref" }),
        &workspace(),
        &knowledge,
    );

    assert_eq!(issue_ids(&by_id), ["persona_link|none|e2|e2"]);
    assert_eq!(issue_ids(&by_rule), ["dangling_ref|f1|f1"]);
}

#[test]
fn read_knowledge_issues_returns_at_most_fifty_issues() {
    let mut knowledge = FakeKnowledge::new();
    for n in 0..60 {
        knowledge = knowledge.with_fact(&format!("f{n}"), "located_at", "gone", None, &[1]);
    }

    let issues = issues_of(
        json!({ "novelId": 1, "lang": "src", "rule": "dangling_ref" }),
        &workspace(),
        &knowledge,
    );

    assert_eq!(issues.len(), MAX_ISSUES);
}

#[test]
fn read_knowledge_issues_rejects_bad_arguments_and_foreign_novels() {
    let novels = novels_with(&texts(1));
    let knowledge = issue_knowledge();
    let failing = |args: Value, scope: &AssistantScope| {
        invoke_with("read_knowledge_issues", &args, scope, &novels, &knowledge).unwrap_err()
    };

    assert!(failing(json!({ "lang": "src" }), &workspace()).contains("novelId"));
    assert!(failing(json!({ "novelId": 1, "lang": "FR" }), &workspace()).contains("FR"));
    assert!(
        failing(
            json!({ "novelId": 1, "lang": "src", "issueIds": "x" }),
            &workspace()
        )
        .contains("issueIds")
    );
    assert!(failing(json!({ "novelId": 1, "lang": "src" }), &novel_scope(2)).contains("outside"));
}

#[test]
fn read_knowledge_issues_labels_the_activity() {
    let novels = novels_with(&texts(1));

    let output = invoke_with(
        "read_knowledge_issues",
        &json!({ "novelId": 1, "lang": "src", "rule": "dangling_ref" }),
        &workspace(),
        &novels,
        &issue_knowledge(),
    )
    .unwrap();

    assert!(
        output
            .label
            .starts_with("read_knowledge_issues(novel 1, src)")
    );
}
