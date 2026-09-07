use super::run::MAX_RUN_CHAPTERS;
use super::*;
use crate::testing::assistant::ToolWorld;
use serde_json::json;

fn ids(items: &Value) -> Vec<&str> {
    items
        .as_array()
        .unwrap()
        .iter()
        .map(|item| item["id"].as_str().unwrap())
        .collect()
}

fn translate(world: &ToolWorld, args: Value, scope: &AssistantScope) -> Result<Value, String> {
    world.run("start_translation", args, scope).0
}

fn analyze(world: &ToolWorld, args: Value, scope: &AssistantScope) -> Result<Value, String> {
    world.run("start_analysis", args, scope).0
}

#[test]
fn start_translation_attaches_a_pending_card_with_the_contract_shape() {
    let world = ToolWorld::new();
    let args = json!({ "novelId": 1, "target": "VI", "chapters": [2] });

    let (result, sink) = world.run("start_translation", args, &AssistantScope::novel(1));

    let result = result.unwrap();
    assert_eq!(result["cardId"], "pr1");
    assert_eq!(result["job"], "translation");
    assert_eq!(result["totalTasks"], 1);
    assert_eq!(result["status"], "pending");
    assert_eq!(
        result["note"],
        "waiting for the user to confirm on the card"
    );
    assert_eq!(ids(&result["items"]), ["chapter-1-2"]);
    assert_eq!(
        sink.attachments(),
        vec![json!({
            "kind": "pipeline_run",
            "id": "pr1",
            "job": "translation",
            "owner": { "novelId": 1, "projectId": null },
            "title": "First name",
            "target": "VI",
            "mode": null,
            "overwrite": false,
            "items": [{
                "id": "chapter-1-2",
                "seq": 2,
                "title": "Two",
                "tasks": 1,
                "note": null,
                "blockIds": null
            }],
            "skipped": [],
            "warnings": [],
            "totalTasks": 1,
            "status": "pending",
            "pipelineId": null
        })]
    );
}

#[test]
fn every_start_call_makes_its_own_card() {
    let world = ToolWorld::new();
    let sink = crate::testing::assistant::RecordingSink::new();
    let scope = AssistantScope::workspace();
    let first = json!({ "novelId": 1, "target": "VI", "chapters": [2] });
    let second = json!({ "novelId": 1, "lang": "src", "chapters": [3, 2], "overwrite": true });

    let one = world
        .run_in(&sink, "start_translation", first, &scope)
        .unwrap();
    let two = world
        .run_in(&sink, "start_analysis", second, &scope)
        .unwrap();

    assert_eq!(one["cardId"], "pr1");
    assert_eq!(two["cardId"], "pr2");
    let cards = sink.attachments();
    assert_eq!(cards.len(), 2);
    assert_eq!(cards[1]["job"], "analysis");
}

#[test]
fn translation_skips_translated_chapters_unless_overwrite_is_set() {
    let world = ToolWorld::new();
    let scope = AssistantScope::workspace();

    let plain = translate(
        &world,
        json!({ "novelId": 1, "target": "VI", "chapters": [1, 2] }),
        &scope,
    )
    .unwrap();
    assert_eq!(ids(&plain["items"]), ["chapter-1-2"]);
    assert_eq!(ids(&plain["skipped"]), ["chapter-1-1"]);
    let reason = plain["skipped"][0]["reason"].as_str().unwrap();
    assert!(reason.contains("already has a VI translation (2 of 3 paragraphs)"));
    assert_eq!(plain["warnings"], json!([]));

    let forced = translate(
        &world,
        json!({ "novelId": 1, "target": "VI", "chapters": [1, 2], "overwrite": true }),
        &scope,
    )
    .unwrap();
    assert_eq!(ids(&forced["items"]), ["chapter-1-1", "chapter-1-2"]);
    assert_eq!(
        forced["items"][0]["note"],
        "replaces the existing VI translation"
    );
    assert_eq!(forced["totalTasks"], 2);
    assert_eq!(forced["skipped"], json!([]));
    assert_eq!(forced["warnings"].as_array().unwrap().len(), 1);
}

#[test]
fn translation_targets_are_independent() {
    let world = ToolWorld::new();

    let english = translate(
        &world,
        json!({ "novelId": 1, "target": "en", "chapters": [1] }),
        &AssistantScope::workspace(),
    )
    .unwrap();

    assert_eq!(ids(&english["items"]), ["chapter-1-1"]);
}

#[test]
fn chapters_without_paragraphs_are_skipped_with_a_reason() {
    let world = ToolWorld::new();
    let scope = AssistantScope::workspace();

    let mixed = translate(
        &world,
        json!({ "novelId": 1, "target": "VI", "chapters": [2, 3] }),
        &scope,
    )
    .unwrap();
    assert_eq!(
        mixed["skipped"][0]["reason"],
        "the chapter has no paragraphs"
    );

    let error = translate(
        &world,
        json!({ "novelId": 1, "target": "VI", "chapters": [3] }),
        &scope,
    )
    .unwrap_err();
    assert!(error.starts_with("nothing is left to run"));
    assert!(error.contains("Three: the chapter has no paragraphs"));
}

#[test]
fn nothing_left_to_run_is_an_error_and_attaches_nothing() {
    let world = ToolWorld::new();
    let args = json!({ "novelId": 1, "target": "VI", "chapters": [1] });

    let (result, sink) = world.run("start_translation", args, &AssistantScope::workspace());

    assert!(result.unwrap_err().contains("already has a VI translation"));
    assert!(sink.attachments().is_empty());
}

#[test]
fn start_translation_validates_its_arguments() {
    let world = ToolWorld::new();
    let scope = AssistantScope::workspace();
    let cases = [
        (
            json!({ "novelId": 1, "target": "FR", "chapters": [1] }),
            "unsupported target 'FR'",
        ),
        (
            json!({ "novelId": 1, "target": "VI", "chapters": [9] }),
            "chapter 9 not found in novel 1",
        ),
        (
            json!({ "novelId": 1, "target": "VI", "chapters": [] }),
            "must list at least one item",
        ),
        (
            json!({ "novelId": 1, "target": "VI" }),
            "missing array argument 'chapters'",
        ),
        (
            json!({ "novelId": 1, "target": "VI", "chapters": ["one"] }),
            "must be an array of integers",
        ),
        (
            json!({ "novelId": 1, "chapters": [1] }),
            "missing string argument 'target'",
        ),
        (
            json!({ "novelId": 1, "target": "VI", "chapters": [1], "overwrite": "yes" }),
            "must be a boolean",
        ),
        (
            json!({ "novelId": 77, "target": "VI", "chapters": [1] }),
            "novel 77 not found",
        ),
    ];
    for (args, expected) in cases {
        let error = translate(&world, args, &scope).unwrap_err();
        assert!(error.contains(expected), "{expected}: {error}");
    }
}

#[test]
fn a_run_selects_a_bounded_number_of_chapters() {
    let world = ToolWorld::new();
    let chapters: Vec<i64> = (1..=(MAX_RUN_CHAPTERS as i64 + 1)).collect();

    let error = translate(
        &world,
        json!({ "novelId": 1, "target": "VI", "chapters": chapters }),
        &AssistantScope::workspace(),
    )
    .unwrap_err();

    assert!(error.contains("select at most 100 chapters"));
}

#[test]
fn duplicate_chapter_numbers_run_once() {
    let world = ToolWorld::new();

    let result = translate(
        &world,
        json!({ "novelId": 1, "target": "VI", "chapters": [2, 2] }),
        &AssistantScope::workspace(),
    )
    .unwrap();

    assert_eq!(result["totalTasks"], 1);
}

#[test]
fn start_tools_respect_the_novel_and_project_scopes() {
    let mut world = ToolWorld::new();
    let args = json!({ "novelId": 1, "target": "VI", "chapters": [2] });

    let other = translate(&world, args.clone(), &AssistantScope::novel(2)).unwrap_err();
    assert!(other.contains("outside the current scope"));
    assert!(translate(&world, args.clone(), &AssistantScope::novel(1)).is_ok());
    assert!(translate(&world, args.clone(), &AssistantScope::project(5)).is_ok());

    let foreign = json!({ "novelId": 2, "target": "VI", "chapters": [1] });
    let error = translate(&world, foreign, &AssistantScope::project(5)).unwrap_err();
    assert!(error.contains("outside the current scope"));

    world.linked_novel = None;
    let error = translate(&world, args, &AssistantScope::project(6)).unwrap_err();
    assert!(error.contains("the project has no linked novel"));
}

#[test]
fn start_analysis_skips_analyzed_chapters_and_replaces_stale_ones() {
    let world = ToolWorld::new();
    let scope = AssistantScope::novel(1);

    let result = analyze(
        &world,
        json!({ "novelId": 1, "lang": "src", "chapters": [1, 2, 3] }),
        &scope,
    )
    .unwrap();

    assert_eq!(result["job"], "analysis");
    assert_eq!(ids(&result["items"]), ["chapter-1-2"]);
    assert_eq!(
        result["items"][0]["note"],
        "the analysis is out of date and will be replaced"
    );
    assert_eq!(ids(&result["skipped"]), ["chapter-1-1", "chapter-1-3"]);
    assert_eq!(
        result["skipped"][0]["reason"],
        "already analyzed (4 entities, 6 facts); set overwrite to analyze it again"
    );
    assert_eq!(
        result["skipped"][1]["reason"],
        "the chapter has no paragraphs"
    );
    assert_eq!(result["warnings"].as_array().unwrap().len(), 1);
}

#[test]
fn start_analysis_overwrite_runs_analyzed_chapters_again() {
    let world = ToolWorld::new();

    let (result, sink) = world.run(
        "start_analysis",
        json!({ "novelId": 1, "lang": "src", "chapters": [1], "overwrite": true }),
        &AssistantScope::novel(1),
    );

    let result = result.unwrap();
    assert_eq!(result["items"][0]["note"], "replaces the existing analysis");
    let card = &sink.attachments()[0];
    assert_eq!(card["target"], "src");
    assert_eq!(card["overwrite"], true);
    assert_eq!(card["owner"], json!({ "novelId": 1, "projectId": null }));
}

#[test]
fn start_analysis_of_a_translation_needs_that_translation() {
    let world = ToolWorld::new();

    let result = analyze(
        &world,
        json!({ "novelId": 1, "lang": "VI", "chapters": [1, 2], "overwrite": true }),
        &AssistantScope::workspace(),
    )
    .unwrap();

    assert_eq!(ids(&result["items"]), ["chapter-1-1"]);
    assert_eq!(
        result["skipped"][0]["reason"],
        "has no VI translation to analyze"
    );
}

#[test]
fn start_analysis_validates_its_arguments() {
    let world = ToolWorld::new();
    let scope = AssistantScope::workspace();
    let cases = [
        (
            json!({ "novelId": 1, "lang": "FR", "chapters": [1] }),
            "unsupported lang 'FR'",
        ),
        (
            json!({ "novelId": 1, "chapters": [1] }),
            "missing string argument 'lang'",
        ),
        (
            json!({ "novelId": 1, "lang": "src", "chapters": [9] }),
            "chapter 9 not found",
        ),
    ];
    for (args, expected) in cases {
        let error = analyze(&world, args, &scope).unwrap_err();
        assert!(error.contains(expected), "{expected}: {error}");
    }
}

#[test]
fn the_start_tools_are_offered_per_scope() {
    let novel = definitions(&AssistantScope::novel(1));
    let listed: Vec<&str> = novel
        .as_array()
        .unwrap()
        .iter()
        .map(|tool| tool["name"].as_str().unwrap())
        .collect();
    assert!(listed.contains(&"start_translation"));
    assert!(listed.contains(&"start_analysis"));
    assert!(!listed.contains(&"start_synthesis"));
    for tool in definitions(&AssistantScope::project(5)).as_array().unwrap() {
        assert!(!tool["description"].as_str().unwrap().is_empty());
        assert_eq!(tool["inputSchema"]["additionalProperties"], json!(false));
    }
}
