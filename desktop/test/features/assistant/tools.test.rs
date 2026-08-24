use super::*;
use crate::testing::assistant::FakeNovels;
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

fn run(
    name: &str,
    args: Value,
    scope: &AssistantScope,
    source: &FakeNovels,
) -> Result<Value, String> {
    let output = call(name, &args, scope, source)?;
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
fn definitions_describe_the_three_tools() {
    let tools = definitions();
    let list = tools.as_array().unwrap();
    let names: Vec<&str> = list
        .iter()
        .map(|tool| tool["name"].as_str().unwrap())
        .collect();
    assert_eq!(
        names,
        vec!["list_novel", "read_novel", "read_novel_chapter"]
    );
    for tool in list {
        assert!(tool["description"].as_str().unwrap().len() > 10);
        assert_eq!(tool["inputSchema"]["type"], "object");
    }
    assert_eq!(
        list[2]["inputSchema"]["required"],
        json!(["novelId", "chapter"])
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
    let output = call("list_novel", &json!({}), &workspace(), &source).unwrap();
    assert_eq!(output.label, "list_novel() → 2 novel");
}

#[test]
fn read_novel_returns_metadata_and_outline() {
    let source = FakeNovels::new()
        .with_novel(1, "First")
        .with_chapter(1, 1, "One", &["alpha beta", "gamma"])
        .with_chapter(1, 2, "Two", &["delta"])
        .with_statuses(1, 2, "done", "none");
    let output = call("read_novel", &json!({"novelId": 1}), &workspace(), &source).unwrap();
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
    let error = call("read_novel", &json!({"novelId": 9}), &workspace(), &source).unwrap_err();
    assert!(error.contains("not found"));
}

#[test]
fn read_novel_requires_an_integer_novel_id() {
    let source = FakeNovels::new().with_novel(1, "First");
    assert!(call("read_novel", &json!({}), &workspace(), &source).is_err());
    assert!(
        call(
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
    let output = call(
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
    let output = call(
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
    let error = call(
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
    let error = call(
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
    assert!(call("read_novel_chapter", &bad, &workspace(), &source).is_err());
    let missing = json!({"novelId": 1});
    assert!(call("read_novel_chapter", &missing, &workspace(), &source).is_err());
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
    let outline = call("read_novel", &json!({"novelId": 2}), &scope, &source).unwrap_err();
    assert!(outline.contains("scope"));
    let chapter = call(
        "read_novel_chapter",
        &json!({"novelId": 2, "chapter": 1}),
        &scope,
        &source,
    )
    .unwrap_err();
    assert!(chapter.contains("scope"));
    assert!(call("read_novel", &json!({"novelId": 1}), &scope, &source).is_ok());
}

#[test]
fn unknown_tool_is_an_error() {
    let source = FakeNovels::new();
    let error = call("delete_novel", &json!({}), &workspace(), &source).unwrap_err();
    assert!(error.contains("delete_novel"));
}
