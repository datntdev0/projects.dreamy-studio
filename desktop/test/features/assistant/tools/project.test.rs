use super::paging::PAGE_CHARS;
use super::paging::PAGE_PARAGRAPHS;
use super::script::MAX_SEARCH_RESULTS;
use super::*;
use crate::features::audiobook::models::AudioRecord;
use crate::features::project::models::ProjectModuleState;
use crate::features::scripting::models::Script;
use crate::features::scripting::models::ScriptBlock;
use crate::features::scripting::models::ScriptUnit;
use crate::testing::assistant::FakeAudiobooks;
use crate::testing::assistant::FakeKnowledge;
use crate::testing::assistant::FakeNovels;
use crate::testing::assistant::FakeProjects;
use crate::testing::assistant::FakeScripts;
use crate::testing::assistant::FakeTranslation;
use crate::testing::assistant::RecordingSink;
use crate::testing::assistant::audiobook_fixture;
use crate::testing::assistant::project_chapter_fixture;
use crate::testing::assistant::project_summary;
use crate::testing::assistant::script_block;
use crate::testing::assistant::script_fixture;
use crate::testing::assistant::sources_with_project_data;
use crate::testing::script::chapter;
use crate::testing::script::linked_unit;
use crate::testing::script::script;
use crate::testing::script::unit;
use serde_json::from_str;
use serde_json::json;

const PROJECT: i64 = 5;

struct World {
    novels: FakeNovels,
    knowledge: FakeKnowledge,
    translation: FakeTranslation,
    projects: FakeProjects,
    scripts: FakeScripts,
    audiobooks: FakeAudiobooks,
}

impl World {
    fn new() -> Self {
        Self {
            novels: FakeNovels::new().with_novel(1, "First").with_chapter(
                1,
                1,
                "One",
                &["source one", "source two", "source three"],
            ),
            knowledge: FakeKnowledge::new().with_entity(
                "kb-1",
                "character",
                "Lin Mo",
                &[],
                &[],
                &[1],
            ),
            translation: FakeTranslation::new(),
            projects: FakeProjects::with(vec![
                project_summary(PROJECT, Some(1)),
                project_summary(6, None),
            ]),
            scripts: FakeScripts::with_script(script_fixture(), vec![project_chapter_fixture()]),
            audiobooks: FakeAudiobooks::with_book(audiobook_fixture()),
        }
    }

    fn with_blocks(mut self, blocks: Vec<ScriptBlock>) -> Self {
        self.scripts =
            FakeScripts::with_script(unit_script(blocks), vec![project_chapter_fixture()]);
        self
    }

    fn sources(&self) -> Sources {
        sources_with_project_data(
            &self.novels,
            &self.knowledge,
            &self.translation,
            &self.projects,
            &self.scripts,
            &self.audiobooks,
        )
    }

    fn run(&self, name: &str, args: Value, scope: &AssistantScope) -> Result<Value, String> {
        let sink = RecordingSink::new();
        let ctx = ToolContext {
            scope,
            linked_novel: Some(1),
            can_edit: false,
            sink: &sink,
        };
        let output = call(name, &args, &ctx, &self.sources())?;
        Ok(from_str(&output.text).unwrap())
    }

    fn ask(&self, name: &str, args: Value) -> Value {
        self.run(name, args, &AssistantScope::project(PROJECT))
            .unwrap()
    }

    fn fail(&self, name: &str, args: Value) -> String {
        self.run(name, args, &AssistantScope::project(PROJECT))
            .unwrap_err()
    }
}

fn unit_script(blocks: Vec<ScriptBlock>) -> Script {
    script(vec![ScriptUnit {
        blocks: Some(blocks),
        ..linked_unit("c1")
    }])
}

fn numbered_blocks(count: usize) -> Vec<ScriptBlock> {
    (1..=count)
        .map(|n| script_block(&format!("n{n}"), "narration", &format!("line {n}"), ""))
        .collect()
}

fn names(definitions: &Value) -> Vec<&str> {
    definitions
        .as_array()
        .unwrap()
        .iter()
        .map(|tool| tool["name"].as_str().unwrap())
        .collect()
}

fn block_ids(page: &Value) -> Vec<&str> {
    page["blocks"]
        .as_array()
        .unwrap()
        .iter()
        .map(|block| block["id"].as_str().unwrap())
        .collect()
}

fn lined(texts: &[&str]) -> Vec<ScriptBlock> {
    texts
        .iter()
        .enumerate()
        .map(|(index, text)| script_block(&format!("b{}", index + 1), "narration", text, ""))
        .collect()
}

#[test]
fn workspace_and_project_scopes_offer_the_project_tools() {
    for scope in [
        AssistantScope::workspace(),
        AssistantScope::project(PROJECT),
    ] {
        let tools = definitions(&scope);
        let listed = names(&tools);
        assert_eq!(
            listed.len(),
            14 + PROJECT_TOOLS.len() + PIPELINE_TOOLS.len()
        );
        for tool in PROJECT_TOOLS {
            assert!(listed.contains(&tool), "{tool} missing");
        }
    }
}

#[test]
fn novel_scope_offers_no_project_tool() {
    let tools = definitions(&AssistantScope::novel(1));
    let listed = names(&tools);
    assert_eq!(listed.len(), 14 + 5);
    assert!(PROJECT_TOOLS.iter().all(|tool| !listed.contains(tool)));
}

#[test]
fn project_definitions_match_the_dispatch_list() {
    let tools = definitions(&AssistantScope::workspace());
    let listed = names(&tools);
    let project_names: Vec<&str> = listed[14..14 + PROJECT_TOOLS.len()].to_vec();
    assert_eq!(project_names, PROJECT_TOOLS);
    for tool in tools
        .as_array()
        .unwrap()
        .iter()
        .skip(14)
        .take(PROJECT_TOOLS.len())
    {
        assert!(!tool["description"].as_str().unwrap().is_empty());
        assert_eq!(tool["inputSchema"]["additionalProperties"], json!(false));
    }
}

#[test]
fn project_tools_require_a_project_id_except_the_listing() {
    let tools = definitions(&AssistantScope::workspace());
    for tool in tools
        .as_array()
        .unwrap()
        .iter()
        .skip(14)
        .take(PROJECT_TOOLS.len())
    {
        let required = &tool["inputSchema"]["required"];
        let has_project = required
            .as_array()
            .is_some_and(|items| items.contains(&json!("projectId")));
        assert_eq!(has_project, tool["name"] != "list_project");
    }
}

#[test]
fn a_novel_scope_refuses_every_project_tool() {
    let world = World::new();
    for tool in PROJECT_TOOLS {
        let error = world
            .run(
                tool,
                json!({ "projectId": PROJECT }),
                &AssistantScope::novel(1),
            )
            .unwrap_err();
        assert!(
            error.contains("not available in this scope"),
            "{tool}: {error}"
        );
    }
}

#[test]
fn list_project_lists_every_project_in_the_workspace() {
    let world = World::new();
    let listed = world
        .run("list_project", json!({}), &AssistantScope::workspace())
        .unwrap();
    let items = listed.as_array().unwrap();
    assert_eq!(items.len(), 2);
    assert_eq!(items[0]["projectId"], 5);
    assert_eq!(items[0]["name"], "Project 5");
    assert_eq!(items[0]["template"], "audiobook");
    assert_eq!(items[0]["novelId"], 1);
    assert_eq!(items[0]["archived"], false);
    assert_eq!(items[1]["novelId"], Value::Null);
}

#[test]
fn list_project_in_a_project_scope_returns_only_that_project() {
    let listed = World::new().ask("list_project", json!({}));
    let items = listed.as_array().unwrap();
    assert_eq!(items.len(), 1);
    assert_eq!(items[0]["projectId"], PROJECT);
}

#[test]
fn read_project_describes_the_project_its_novel_and_chapters() {
    let mut world = World::new();
    world.scripts.modules = vec![ProjectModuleState {
        id: "scripting".to_string(),
        state: "doing".to_string(),
        done: 1,
        total: 2,
        note: "1/2 chapters".to_string(),
    }];
    world.scripts.chapters.push(chapter("c2", 2));
    let project = world.ask("read_project", json!({ "projectId": PROJECT }));
    assert_eq!(project["projectId"], PROJECT);
    assert_eq!(project["novel"]["novelId"], 1);
    assert_eq!(project["novel"]["title"], "First");
    assert_eq!(project["srcKind"], Value::Null);
    assert_eq!(project["moduleStates"][0]["id"], "scripting");
    assert_eq!(project["moduleStates"][0]["done"], 1);
    assert_eq!(project["chapters"][0]["chapterId"], "c1");
    assert_eq!(project["chapters"][0]["unitId"], "c1");
    assert_eq!(project["chapters"][1]["chapter"], 2);
    assert_eq!(project["chapters"][1]["unitId"], Value::Null);
}

#[test]
fn read_project_reports_the_translation_source() {
    let mut world = World::new();
    let mut summary = project_summary(PROJECT, Some(1));
    summary.src_kind = Some("translation".to_string());
    summary.src_lang = Some("VI".to_string());
    world.projects = FakeProjects::with(vec![summary]);
    let project = world.ask("read_project", json!({ "projectId": PROJECT }));
    assert_eq!(project["srcKind"], "translation");
    assert_eq!(project["srcLang"], "VI");
}

#[test]
fn read_project_without_a_linked_novel_has_a_null_novel() {
    let world = World::new();
    let project = world
        .run(
            "read_project",
            json!({ "projectId": 6 }),
            &AssistantScope::workspace(),
        )
        .unwrap();
    assert_eq!(project["novel"], Value::Null);
}

#[test]
fn read_project_marks_a_linked_novel_that_is_gone() {
    let mut world = World::new();
    world.projects = FakeProjects::with(vec![project_summary(PROJECT, Some(9))]);
    let project = world.ask("read_project", json!({ "projectId": PROJECT }));
    assert_eq!(project["novel"]["novelId"], 9);
    assert_eq!(project["novel"]["missing"], true);
}

#[test]
fn project_tools_reject_other_projects_in_a_project_scope() {
    let world = World::new();
    for tool in PROJECT_TOOLS.iter().filter(|tool| **tool != "list_project") {
        let args = json!({ "projectId": 6, "unitId": "c1", "query": "x" });
        let error = world
            .run(tool, args, &AssistantScope::project(PROJECT))
            .unwrap_err();
        assert!(
            error.contains("outside the current scope"),
            "{tool}: {error}"
        );
    }
}

#[test]
fn project_tools_report_an_unknown_project_in_the_workspace_scope() {
    let world = World::new();
    let error = world
        .run(
            "read_project",
            json!({ "projectId": 99 }),
            &AssistantScope::workspace(),
        )
        .unwrap_err();
    assert_eq!(error, "project 99 not found");
}

#[test]
fn project_tools_need_the_project_id() {
    let error = World::new().fail("read_script", json!({}));
    assert!(error.contains("projectId"));
}

#[test]
fn workspace_scope_reads_any_project() {
    let world = World::new();
    let script = world
        .run(
            "read_script",
            json!({ "projectId": 6 }),
            &AssistantScope::workspace(),
        )
        .unwrap();
    assert_eq!(script["projectId"], 6);
}

#[test]
fn read_script_returns_the_config_the_cast_and_the_outline() {
    let script = World::new().ask("read_script", json!({ "projectId": PROJECT }));
    assert_eq!(script["cfg"]["preset"], "audiobook");
    assert_eq!(script["cfg"]["unit"], "chapter");
    let cast: Vec<&str> = script["cast"]
        .as_array()
        .unwrap()
        .iter()
        .map(|member| member["id"].as_str().unwrap())
        .collect();
    assert_eq!(cast, ["narr", "kb-1", "x1"]);
    assert_eq!(script["cast"][1]["name"], "Lin Mo");
    assert_eq!(script["cast"][1]["kind"], "kb");
    let row = &script["units"][0];
    assert_eq!(row["chapter"]["chapterId"], "c1");
    assert_eq!(row["unit"]["unitId"], "c1");
    assert_eq!(row["unit"]["chapterId"], "c1");
    assert_eq!(row["unit"]["title"], "Title 1");
    assert_eq!(row["unit"]["blocks"], 3);
    assert_eq!(row["unit"]["words"], 9);
    assert_eq!(row["unit"]["hasContent"], true);
}

#[test]
fn read_script_lists_chapters_without_a_unit_and_free_units() {
    let mut world = World::new();
    world.scripts = FakeScripts::with_script(
        script(vec![linked_unit("c1"), unit("free", 7)]),
        vec![chapter("c1", 1), chapter("c2", 2)],
    );
    let script = world.ask("read_script", json!({ "projectId": PROJECT }));
    let rows = script["units"].as_array().unwrap();
    assert_eq!(rows.len(), 3);
    assert_eq!(rows[0]["unit"]["unitId"], "c1");
    assert_eq!(rows[0]["unit"]["hasContent"], false);
    assert_eq!(rows[1]["chapter"]["chapter"], 2);
    assert_eq!(rows[1]["unit"], Value::Null);
    assert_eq!(rows[2]["chapter"], Value::Null);
    assert_eq!(rows[2]["unit"]["unitId"], "free");
    assert_eq!(rows[2]["unit"]["no"], 7);
}

#[test]
fn read_script_before_any_script_exists_lists_the_chapters_only() {
    let mut world = World::new();
    world.scripts = FakeScripts::with_chapters(vec![chapter("c1", 1)]);
    let script = world.ask("read_script", json!({ "projectId": PROJECT }));
    assert_eq!(script["cfg"], Value::Null);
    assert_eq!(script["cast"], json!([]));
    assert_eq!(script["units"][0]["chapter"]["chapterId"], "c1");
    assert_eq!(script["units"][0]["unit"], Value::Null);
}

#[test]
fn read_script_without_a_linked_novel_has_no_knowledge_characters() {
    let world = World::new();
    let script = world
        .run(
            "read_script",
            json!({ "projectId": 6 }),
            &AssistantScope::workspace(),
        )
        .unwrap();
    let cast: Vec<&str> = script["cast"]
        .as_array()
        .unwrap()
        .iter()
        .map(|member| member["id"].as_str().unwrap())
        .collect();
    assert_eq!(cast, ["narr", "x1"]);
}

#[test]
fn read_script_unit_returns_every_block_field_with_positions() {
    let page = World::new().ask(
        "read_script_unit",
        json!({ "projectId": PROJECT, "unitId": "c1" }),
    );
    assert_eq!(page["projectId"], PROJECT);
    assert_eq!(page["unitId"], "c1");
    assert_eq!(page["title"], "Title 1");
    assert_eq!(page["total"], 3);
    assert_eq!(page["from"], 1);
    assert_eq!(page["to"], 3);
    assert_eq!(page["next"], Value::Null);
    assert_eq!(block_ids(&page), ["b1", "b2", "b3"]);
    let dialogue = &page["blocks"][1];
    assert_eq!(dialogue["p"], 2);
    assert_eq!(dialogue["type"], "dialogue");
    assert_eq!(dialogue["text"], "Who goes there?");
    assert_eq!(dialogue["who"], "kb-1");
    for key in ["paren", "ms", "loc", "time", "ref", "beat", "refs", "chars"] {
        assert!(dialogue.get(key).is_some(), "{key} missing");
    }
    assert!(dialogue.get("source").is_none());
}

#[test]
fn read_script_unit_pages_through_long_units() {
    let world = World::new().with_blocks(numbered_blocks(130));
    let args = json!({ "projectId": PROJECT, "unitId": "c1" });
    let first = world.ask("read_script_unit", args);
    assert_eq!(first["blocks"].as_array().unwrap().len(), PAGE_PARAGRAPHS);
    assert_eq!(first["next"], 61);
    let second = world.ask(
        "read_script_unit",
        json!({ "projectId": PROJECT, "unitId": "c1", "from": 61 }),
    );
    assert_eq!(second["blocks"][0]["p"], 61);
    assert_eq!(second["next"], 121);
    let last = world.ask(
        "read_script_unit",
        json!({ "projectId": PROJECT, "unitId": "c1", "from": 121 }),
    );
    assert_eq!(last["blocks"].as_array().unwrap().len(), 10);
    assert_eq!(last["next"], Value::Null);
}

#[test]
fn read_script_unit_pages_by_characters() {
    let long = "x".repeat(PAGE_CHARS - 5);
    let world = World::new().with_blocks(vec![
        script_block("b1", "narration", &long, ""),
        script_block("b2", "narration", "tail text", ""),
    ]);
    let page = world.ask(
        "read_script_unit",
        json!({ "projectId": PROJECT, "unitId": "c1" }),
    );
    assert_eq!(block_ids(&page), ["b1"]);
    assert_eq!(page["next"], 2);
}

#[test]
fn read_script_unit_reads_a_requested_range() {
    let world = World::new().with_blocks(numbered_blocks(10));
    let page = world.ask(
        "read_script_unit",
        json!({ "projectId": PROJECT, "unitId": "c1", "from": 3, "to": 5 }),
    );
    assert_eq!(block_ids(&page), ["n3", "n4", "n5"]);
    assert_eq!(page["next"], 6);
}

#[test]
fn read_script_unit_rejects_unknown_units_and_missing_scripts() {
    let mut world = World::new();
    let error = world.fail(
        "read_script_unit",
        json!({ "projectId": PROJECT, "unitId": "nope" }),
    );
    assert_eq!(error, "unit nope not found in project 5");
    world.scripts = FakeScripts::default();
    let error = world.fail(
        "read_script_unit",
        json!({ "projectId": PROJECT, "unitId": "c1" }),
    );
    assert_eq!(error, "project 5 has no script yet");
}

fn referencing(refs: &[&str]) -> Vec<ScriptBlock> {
    let mut block = script_block("b1", "narration", "adapted", "");
    block.reference = refs.first().map(|text| text.to_string());
    block.refs = refs.iter().map(|text| text.to_string()).collect();
    vec![block, script_block("b2", "narration", "free", "")]
}

#[test]
fn read_script_unit_attaches_the_original_source_paragraphs() {
    let world = World::new().with_blocks(referencing(&["1.2", "1.3", "1.2"]));
    let page = world.ask(
        "read_script_unit",
        json!({ "projectId": PROJECT, "unitId": "c1", "withSource": true }),
    );
    let source = page["blocks"][0]["source"].as_array().unwrap();
    assert_eq!(source.len(), 2);
    assert_eq!(source[0], json!({ "ref": "1.2", "text": "source two" }));
    assert_eq!(source[1], json!({ "ref": "1.3", "text": "source three" }));
    assert_eq!(page["blocks"][1]["source"], json!([]));
}

#[test]
fn read_script_unit_attaches_the_translation_when_the_project_translates() {
    let mut world = World::new().with_blocks(referencing(&["1.1"]));
    let mut summary = project_summary(PROJECT, Some(1));
    summary.src_kind = Some("translation".to_string());
    summary.src_lang = Some("VI".to_string());
    world.projects = FakeProjects::with(vec![summary]);
    world.translation = FakeTranslation::new().with_translated_chapter(
        1,
        "VI",
        "chapter-1-1",
        "Mot",
        &["ban dich mot"],
    );
    let page = world.ask(
        "read_script_unit",
        json!({ "projectId": PROJECT, "unitId": "c1", "withSource": true }),
    );
    assert_eq!(
        page["blocks"][0]["source"],
        json!([{ "ref": "1.1", "text": "ban dich mot" }])
    );
}

#[test]
fn read_script_unit_skips_references_it_cannot_resolve() {
    let world = World::new().with_blocks(referencing(&["9.9", "bad", "1.40"]));
    let page = world.ask(
        "read_script_unit",
        json!({ "projectId": PROJECT, "unitId": "c1", "withSource": true }),
    );
    assert_eq!(page["blocks"][0]["source"], json!([]));
}

#[test]
fn read_script_unit_with_source_needs_a_linked_novel() {
    let mut world = World::new().with_blocks(referencing(&["1.1"]));
    world.projects = FakeProjects::with(vec![project_summary(PROJECT, None)]);
    let error = world.fail(
        "read_script_unit",
        json!({ "projectId": PROJECT, "unitId": "c1", "withSource": true }),
    );
    assert_eq!(error, "the project has no linked novel");
}

#[test]
fn read_script_unit_with_source_needs_a_valid_translation_language() {
    let mut world = World::new().with_blocks(referencing(&["1.1"]));
    let mut summary = project_summary(PROJECT, Some(1));
    summary.src_kind = Some("translation".to_string());
    world.projects = FakeProjects::with(vec![summary]);
    let error = world.fail(
        "read_script_unit",
        json!({ "projectId": PROJECT, "unitId": "c1", "withSource": true }),
    );
    assert_eq!(error, "the project has no valid translation language");
}

#[test]
fn read_script_unit_checks_argument_types() {
    let error = World::new().fail(
        "read_script_unit",
        json!({ "projectId": PROJECT, "unitId": "c1", "withSource": "yes" }),
    );
    assert_eq!(error, "argument 'withSource' must be a boolean");
}

#[test]
fn search_project_matches_text_case_insensitively() {
    let found = World::new().ask(
        "search_project",
        json!({ "projectId": PROJECT, "query": "  WHO GOES " }),
    );
    assert_eq!(found["query"], "WHO GOES");
    assert_eq!(found["truncated"], false);
    let results = found["results"].as_array().unwrap();
    assert_eq!(results.len(), 1);
    assert_eq!(results[0]["unitId"], "c1");
    assert_eq!(results[0]["blockId"], "b2");
    assert_eq!(results[0]["p"], 2);
    assert_eq!(results[0]["who"], "kb-1");
    assert_eq!(results[0]["snippet"], "Who goes there?");
}

#[test]
fn search_project_matches_the_speaker_and_the_location() {
    let mut located = script_block("b1", "narration", "Rain fell.", "");
    located.loc = "Black Gate".to_string();
    let world = World::new().with_blocks(vec![
        located,
        script_block("b2", "dialogue", "Halt.", "lin-mo"),
    ]);
    let by_loc = world.ask(
        "search_project",
        json!({ "projectId": PROJECT, "query": "black gate" }),
    );
    assert_eq!(by_loc["results"][0]["blockId"], "b1");
    assert_eq!(by_loc["results"][0]["snippet"], "Rain fell.");
    let by_who = world.ask(
        "search_project",
        json!({ "projectId": PROJECT, "query": "LIN-MO" }),
    );
    assert_eq!(by_who["results"][0]["blockId"], "b2");
}

#[test]
fn search_project_can_be_limited_to_one_unit() {
    let mut world = World::new();
    world.scripts = FakeScripts::with_script(
        script(vec![
            ScriptUnit {
                blocks: Some(lined(&["alpha one"])),
                ..linked_unit("c1")
            },
            ScriptUnit {
                blocks: Some(lined(&["alpha two"])),
                ..unit("free", 2)
            },
        ]),
        vec![chapter("c1", 1)],
    );
    let all = world.ask(
        "search_project",
        json!({ "projectId": PROJECT, "query": "alpha" }),
    );
    assert_eq!(all["results"].as_array().unwrap().len(), 2);
    let one = world.ask(
        "search_project",
        json!({ "projectId": PROJECT, "query": "alpha", "unitId": "free" }),
    );
    assert_eq!(one["results"].as_array().unwrap().len(), 1);
    assert_eq!(one["results"][0]["unitId"], "free");
    let error = world.fail(
        "search_project",
        json!({ "projectId": PROJECT, "query": "alpha", "unitId": "nope" }),
    );
    assert_eq!(error, "unit nope not found in project 5");
}

#[test]
fn search_project_rejects_an_empty_query_and_a_missing_script() {
    let mut world = World::new();
    let error = world.fail(
        "search_project",
        json!({ "projectId": PROJECT, "query": "   " }),
    );
    assert_eq!(error, "argument 'query' must not be empty");
    world.scripts = FakeScripts::default();
    let error = world.fail(
        "search_project",
        json!({ "projectId": PROJECT, "query": "x" }),
    );
    assert_eq!(error, "project 5 has no script yet");
}

#[test]
fn search_project_caps_the_number_of_results() {
    let world = World::new().with_blocks(numbered_blocks(MAX_SEARCH_RESULTS + 5));
    let found = world.ask(
        "search_project",
        json!({ "projectId": PROJECT, "query": "line" }),
    );
    assert_eq!(
        found["results"].as_array().unwrap().len(),
        MAX_SEARCH_RESULTS
    );
    assert_eq!(found["truncated"], true);
    let exact = World::new().with_blocks(numbered_blocks(MAX_SEARCH_RESULTS));
    let found = exact.ask(
        "search_project",
        json!({ "projectId": PROJECT, "query": "line" }),
    );
    assert_eq!(found["truncated"], false);
}

#[test]
fn search_project_shortens_long_texts_around_the_match() {
    let text = format!("{}needle{}", "a".repeat(100), "b".repeat(100));
    let world = World::new().with_blocks(vec![script_block("b1", "narration", &text, "")]);
    let found = world.ask(
        "search_project",
        json!({ "projectId": PROJECT, "query": "needle" }),
    );
    let snippet = found["results"][0]["snippet"].as_str().unwrap();
    assert!(snippet.starts_with('…'));
    assert!(snippet.ends_with('…'));
    assert!(snippet.contains("needle"));
    assert!(snippet.chars().count() < text.chars().count());
}

#[test]
fn read_audiobook_returns_voices_mix_and_unit_stats() {
    let audiobook = World::new().ask("read_audiobook", json!({ "projectId": PROJECT }));
    assert_eq!(audiobook["voices"]["kb-1"]["voice"], 7);
    assert_eq!(audiobook["voices"]["kb-1"]["speed"], 1.0);
    assert_eq!(audiobook["mix"]["gap"], 0.6);
    let unit = &audiobook["units"][0];
    assert_eq!(unit["unitId"], "c1");
    assert_eq!(unit["title"], "Title 1");
    assert_eq!(unit["voiced"], 3);
    assert_eq!(unit["done"], 1);
    assert_eq!(unit["stale"], 0);
    assert_eq!(unit["missing"], 2);
    assert_eq!(unit["duration"], 1.5);
    assert_eq!(unit["state"], "doing");
}

#[test]
fn read_audiobook_without_any_audio_reports_idle_units() {
    let mut world = World::new();
    world.audiobooks = FakeAudiobooks::default();
    let audiobook = world.ask("read_audiobook", json!({ "projectId": PROJECT }));
    assert_eq!(audiobook["voices"], json!({}));
    assert_eq!(audiobook["units"][0]["state"], "none");
    assert_eq!(audiobook["units"][0]["missing"], 3);
}

#[test]
fn read_audiobook_without_a_script_has_no_units() {
    let mut world = World::new();
    world.scripts = FakeScripts::default();
    let audiobook = world.ask("read_audiobook", json!({ "projectId": PROJECT }));
    assert_eq!(audiobook["units"], json!([]));
}

#[test]
fn read_audiobook_counts_outdated_audio_as_stale() {
    let world = World::new().with_blocks(vec![
        script_block("b1", "narration", "The gate opened at dawn.", ""),
        script_block("b2", "dialogue", "Who is there?", "kb-1"),
    ]);
    let audiobook = world.ask("read_audiobook", json!({ "projectId": PROJECT }));
    assert_eq!(audiobook["units"][0]["stale"], 1);
    assert_eq!(audiobook["units"][0]["done"], 0);
    assert_eq!(audiobook["units"][0]["state"], "stale");
}

#[test]
fn read_audiobook_unit_reports_the_state_of_every_voiced_block() {
    let page = World::new().ask(
        "read_audiobook_unit",
        json!({ "projectId": PROJECT, "unitId": "c1" }),
    );
    assert_eq!(page["title"], "Title 1");
    assert_eq!(page["total"], 3);
    assert_eq!(page["next"], Value::Null);
    let segments = page["segments"].as_array().unwrap();
    assert_eq!(segments.len(), 3);
    assert_eq!(segments[0]["id"], "b1");
    assert_eq!(segments[0]["speaker"], "narr");
    assert_eq!(segments[0]["state"], "none");
    assert_eq!(segments[0]["voice"], Value::Null);
    assert_eq!(segments[0]["duration"], Value::Null);
    assert_eq!(segments[1]["id"], "b2");
    assert_eq!(segments[1]["p"], 2);
    assert_eq!(segments[1]["speaker"], "kb-1");
    assert_eq!(segments[1]["state"], "done");
    assert_eq!(segments[1]["voice"], 7);
    assert_eq!(segments[1]["speed"], 1.0);
    assert_eq!(segments[1]["duration"], 1.5);
    assert_eq!(segments[1]["flag"], Value::Null);
    assert_eq!(segments[2]["state"], "none");
}

#[test]
fn read_audiobook_unit_shows_stale_and_flagged_segments() {
    let mut world = World::new().with_blocks(vec![
        script_block("b2", "dialogue", "Who is there?", "kb-1"),
        script_block("b3", "dialogue", "Who goes there?", "kb-1"),
    ]);
    let mut book = audiobook_fixture();
    let record = book.units["c1"].audio["b2"].clone();
    let flagged = AudioRecord {
        flag: "wrong voice".to_string(),
        ..record.clone()
    };
    book.units
        .get_mut("c1")
        .unwrap()
        .audio
        .insert("b3".to_string(), flagged);
    world.audiobooks = FakeAudiobooks::with_book(book);
    let page = world.ask(
        "read_audiobook_unit",
        json!({ "projectId": PROJECT, "unitId": "c1" }),
    );
    assert_eq!(page["segments"][0]["state"], "stale");
    assert_eq!(page["segments"][1]["state"], "flag");
    assert_eq!(page["segments"][1]["flag"], "wrong voice");
}

#[test]
fn read_audiobook_unit_skips_blocks_that_are_not_voiced() {
    let world = World::new().with_blocks(vec![
        script_block("b1", "pause", "", ""),
        script_block("b2", "note", "remember this", ""),
        script_block("b3", "narration", "   ", ""),
        script_block("b4", "heading", "Chapter One", ""),
    ]);
    let page = world.ask(
        "read_audiobook_unit",
        json!({ "projectId": PROJECT, "unitId": "c1" }),
    );
    let segments = page["segments"].as_array().unwrap();
    assert_eq!(segments.len(), 1);
    assert_eq!(segments[0]["id"], "b4");
    assert_eq!(segments[0]["p"], 4);
}

#[test]
fn read_audiobook_unit_pages_over_block_positions() {
    let world = World::new().with_blocks(numbered_blocks(130));
    let first = world.ask(
        "read_audiobook_unit",
        json!({ "projectId": PROJECT, "unitId": "c1" }),
    );
    assert_eq!(first["segments"].as_array().unwrap().len(), PAGE_PARAGRAPHS);
    assert_eq!(first["next"], 61);
    let second = world.ask(
        "read_audiobook_unit",
        json!({ "projectId": PROJECT, "unitId": "c1", "from": 61, "to": 70 }),
    );
    assert_eq!(second["segments"][0]["p"], 61);
    assert_eq!(second["segments"].as_array().unwrap().len(), 10);
    assert_eq!(second["next"], 71);
}

#[test]
fn read_audiobook_unit_rejects_unknown_units() {
    let error = World::new().fail(
        "read_audiobook_unit",
        json!({ "projectId": PROJECT, "unitId": "nope" }),
    );
    assert_eq!(error, "unit nope not found in project 5");
}
