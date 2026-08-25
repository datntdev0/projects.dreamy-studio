use super::*;
use crate::testing::assistant::FakeKnowledge;
use crate::testing::assistant::FakeNovels;
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
        can_edit: false,
        sink: &sink,
    };
    call(name, args, &ctx, &sources_of(novels, knowledge))
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
fn definitions_describe_the_read_tools() {
    let tools = definitions();
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
            "read_novel_knowledge"
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
