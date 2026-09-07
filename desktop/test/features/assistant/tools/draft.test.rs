use super::*;
use crate::features::scripting::models::Script;
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
use crate::testing::assistant::script_fixture;
use crate::testing::assistant::sources_with_project_data;
use crate::testing::script::chapter;
use crate::testing::script::script;
use crate::testing::script::unit;
use serde_json::from_str;
use serde_json::json;

const PROJECT: i64 = 5;

struct World {
    novels: FakeNovels,
    knowledge: FakeKnowledge,
    projects: FakeProjects,
    scripts: FakeScripts,
    audiobooks: FakeAudiobooks,
}

struct Answer {
    value: Value,
    cards: Vec<Value>,
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
            projects: FakeProjects::with(vec![
                project_summary(PROJECT, Some(1)),
                project_summary(6, None),
            ]),
            scripts: FakeScripts::with_script(script_fixture(), vec![project_chapter_fixture()]),
            audiobooks: FakeAudiobooks::with_book(audiobook_fixture()),
        }
    }

    fn with_script(
        mut self,
        script: Script,
        chapters: Vec<crate::features::scripting::chapters::ProjectChapter>,
    ) -> Self {
        self.scripts = FakeScripts::with_script(script, chapters);
        self
    }

    fn sources(&self) -> Sources {
        sources_with_project_data(
            &self.novels,
            &self.knowledge,
            &FakeTranslation::new(),
            &self.projects,
            &self.scripts,
            &self.audiobooks,
        )
    }

    fn submit_in(&self, args: Value, scope: &AssistantScope) -> Result<Answer, String> {
        let sink = RecordingSink::new();
        let ctx = ToolContext {
            scope,
            linked_novel: Some(1),
            can_edit: false,
            sink: &sink,
        };
        let output = call("submit_script_draft", &args, &ctx, &self.sources())?;
        Ok(Answer {
            value: from_str(&output.text).unwrap(),
            cards: sink.attachments(),
        })
    }

    fn submit(&self, args: Value) -> Result<Answer, String> {
        self.submit_in(args, &AssistantScope::project(PROJECT))
    }

    fn accept(&self, args: Value) -> Answer {
        self.submit(args).unwrap()
    }
}

fn draft(blocks: Value) -> Value {
    json!({ "projectId": PROJECT, "unitId": "c1", "blocks": blocks })
}

fn film_script() -> Script {
    let mut script = script(vec![ScriptUnit {
        blocks: Some(Vec::new()),
        ..unit("U01", 1)
    }]);
    script.cfg.preset = "film".to_string();
    script.cfg.types = ["scene", "action", "dialogue", "note"]
        .iter()
        .map(|kind| kind.to_string())
        .collect();
    script
}

fn names(definitions: &Value) -> Vec<&str> {
    definitions
        .as_array()
        .unwrap()
        .iter()
        .map(|tool| tool["name"].as_str().unwrap())
        .collect()
}

#[test]
fn the_tool_is_offered_in_the_workspace_and_project_scopes_only() {
    for scope in [
        AssistantScope::workspace(),
        AssistantScope::project(PROJECT),
    ] {
        assert!(names(&definitions(&scope)).contains(&"submit_script_draft"));
    }
    assert!(!names(&definitions(&AssistantScope::novel(1))).contains(&"submit_script_draft"));
    assert!(PROJECT_TOOLS.contains(&"submit_script_draft"));
}

#[test]
fn the_definition_requires_the_project_the_unit_and_the_blocks() {
    let definition = definitions(&AssistantScope::project(PROJECT))
        .as_array()
        .unwrap()
        .iter()
        .find(|tool| tool["name"] == "submit_script_draft")
        .unwrap()
        .clone();

    let schema = &definition["inputSchema"];

    assert_eq!(schema["required"], json!(["projectId", "unitId", "blocks"]));
    assert_eq!(schema["properties"]["blocks"]["maxItems"], 400);
    assert_eq!(
        schema["properties"]["blocks"]["items"]["properties"]["type"]["enum"],
        json!([
            "heading",
            "narration",
            "dialogue",
            "pause",
            "note",
            "scene",
            "action"
        ])
    );
}

#[test]
fn a_novel_scope_refuses_the_tool() {
    let error = World::new()
        .submit_in(
            draft(json!([{ "type": "narration", "text": "x" }])),
            &AssistantScope::novel(1),
        )
        .err()
        .unwrap();

    assert_eq!(
        error,
        "tool 'submit_script_draft' is not available in this scope"
    );
}

#[test]
fn a_draft_becomes_a_pending_card_and_a_summary() {
    let world = World::new();

    let answer = world.accept(json!({
        "projectId": PROJECT,
        "unitId": "c1",
        "summary": "  Rewritten with a gatekeeper.  ",
        "extraCast": [{ "ref": "gate", "name": "Gatekeeper" }],
        "blocks": [
            { "type": "narration", "text": "The gate opened at dawn." },
            { "type": "dialogue", "text": "Halt!", "who": "gate", "paren": "gruff", "refs": ["1.1"] },
            { "type": "dialogue", "text": "Who goes there?", "who": "kb-1" }
        ]
    }));

    assert_eq!(answer.value["cardId"], "sd1");
    assert_eq!(answer.value["unitId"], "c1");
    assert_eq!(answer.value["accepted"], 3);
    assert_eq!(answer.value["dropped"], json!([]));
    assert_eq!(answer.value["warnings"], json!([]));
    assert_eq!(answer.value["unresolved"], 0);
    assert_eq!(answer.value["status"], "pending");
    assert_eq!(
        answer.value["note"],
        "waiting for the user to confirm on the card"
    );
    assert_eq!(answer.value["stats"]["blocks"], 3);
    assert_eq!(answer.value["stats"]["kept"], 2);
    assert_eq!(answer.cards.len(), 1);
    let card = &answer.cards[0];
    assert_eq!(card["kind"], "script_draft");
    assert_eq!(card["id"], "sd1");
    assert_eq!(card["status"], "pending");
    assert_eq!(card["projectId"], PROJECT);
    assert_eq!(card["title"], "Project 5");
    assert_eq!(card["unitId"], "c1");
    assert_eq!(card["unitTitle"], "Title 1");
    assert_eq!(card["chapter"], 1);
    assert_eq!(card["summary"], "Rewritten with a gatekeeper.");
    assert_eq!(
        card["extraCast"],
        json!([{ "id": "gate", "name": "Gatekeeper" }])
    );
    assert_eq!(card["speakers"][0]["name"], "Gatekeeper");
    assert_eq!(card["blocks"][1]["refs"], json!(["1.1"]));
    assert!(!card["baseRev"].as_str().unwrap().is_empty());
}

#[test]
fn identical_blocks_keep_their_ids_and_new_ones_have_none() {
    let answer = World::new().accept(draft(json!([
        { "type": "narration", "text": "The gate opened at dawn." },
        { "type": "narration", "text": "A cold wind blew." },
        { "type": "dialogue", "text": "A friend.", "who": "x1" }
    ])));

    let blocks = &answer.cards[0]["blocks"];

    assert_eq!(blocks[0]["id"], "b1");
    assert_eq!(blocks[0]["kept"], true);
    assert_eq!(blocks[1]["id"], Value::Null);
    assert_eq!(blocks[1]["kept"], false);
    assert_eq!(blocks[2]["id"], "b3");
}

#[test]
fn the_card_shows_the_current_blocks_of_the_unit() {
    let answer = World::new().accept(draft(json!([{ "type": "narration", "text": "x" }])));

    let card = &answer.cards[0];

    assert_eq!(card["currentTruncated"], false);
    assert_eq!(card["current"].as_array().unwrap().len(), 3);
    assert_eq!(card["current"][1]["id"], "b2");
    assert_eq!(card["current"][1]["who"], "kb-1");
}

#[test]
fn audio_that_would_no_longer_match_is_counted() {
    let world = World::new();
    let kept = world.accept(draft(json!([
        { "type": "dialogue", "text": "Who goes there?", "who": "kb-1" }
    ])));
    let changed = world.accept(draft(json!([
        { "type": "dialogue", "text": "Who is there?", "who": "kb-1" }
    ])));

    assert_eq!(kept.value["stats"]["staleAudio"], 0);
    assert_eq!(changed.value["stats"]["staleAudio"], 1);
}

#[test]
fn invalid_blocks_are_dropped_and_reported_for_a_second_try() {
    let answer = World::new().accept(draft(json!([
        { "type": "narration", "text": "Fine." },
        { "type": "dialogue", "text": "Hi", "who": "ghost" },
        { "type": "pause" },
        { "type": "narration", "text": "Also fine." }
    ])));

    assert_eq!(answer.value["accepted"], 2);
    let dropped = answer.value["dropped"].as_array().unwrap();
    assert_eq!(dropped.len(), 2);
    assert_eq!(dropped[0]["index"], 1);
    assert!(
        dropped[0]["reason"]
            .as_str()
            .unwrap()
            .contains("unknown speaker 'ghost'")
    );
    assert_eq!(dropped[1]["index"], 2);
    assert!(
        dropped[1]["reason"]
            .as_str()
            .unwrap()
            .contains("not allowed")
    );
    assert_eq!(answer.cards[0]["blocks"].as_array().unwrap().len(), 2);
}

#[test]
fn dialogue_without_a_speaker_is_counted_as_unresolved() {
    let answer = World::new().accept(draft(json!([
        { "type": "dialogue", "text": "Who?", "who": "kb-1" },
        { "type": "dialogue", "text": "Hm." }
    ])));

    assert_eq!(answer.value["unresolved"], 1);
    assert_eq!(answer.cards[0]["unresolved"], 1);
}

#[test]
fn source_references_are_checked_against_the_novel() {
    let answer = World::new().accept(draft(json!([
        { "type": "narration", "text": "x", "refs": ["1.2", "1.9", "7.1"] }
    ])));

    assert_eq!(answer.cards[0]["blocks"][0]["refs"], json!(["1.2"]));
    assert_eq!(
        answer.value["warnings"],
        json!(["2 source reference(s) were removed because they point to no paragraph"])
    );
}

#[test]
fn a_project_without_a_novel_drops_every_reference() {
    let mut world = World::new();
    world.projects = FakeProjects::with(vec![project_summary(PROJECT, None)]);

    let answer = world.accept(draft(json!([
        { "type": "narration", "text": "x", "refs": ["1.1"] }
    ])));

    assert_eq!(answer.cards[0]["blocks"][0]["refs"], json!([]));
    assert!(
        answer.value["warnings"][0]
            .as_str()
            .unwrap()
            .contains("no linked novel text")
    );
}

#[test]
fn a_new_speaker_must_not_repeat_a_cast_member() {
    let error = World::new()
        .submit(json!({
            "projectId": PROJECT,
            "unitId": "c1",
            "extraCast": [{ "ref": "lin", "name": "Lin Mo" }],
            "blocks": [{ "type": "narration", "text": "x" }]
        }))
        .err()
        .unwrap();

    assert!(error.contains("already exists in the cast with id 'kb-1'"));
}

#[test]
fn an_unused_new_speaker_is_left_out_of_the_card() {
    let answer = World::new().accept(json!({
        "projectId": PROJECT,
        "unitId": "c1",
        "extraCast": [{ "ref": "cook", "name": "Cook" }],
        "blocks": [{ "type": "narration", "text": "x" }]
    }));

    assert_eq!(answer.cards[0]["extraCast"], json!([]));
    assert!(
        answer.value["warnings"][0]
            .as_str()
            .unwrap()
            .contains("'Cook'")
    );
}

#[test]
fn a_project_without_a_script_asks_to_open_the_scripting_module() {
    let mut world = World::new();
    world.scripts = FakeScripts::with_chapters(vec![project_chapter_fixture()]);

    let error = world
        .submit(draft(json!([{ "type": "narration", "text": "x" }])))
        .err()
        .unwrap();

    assert!(error.contains("has no script yet"));
    assert!(error.contains("open the scripting module"));
}

#[test]
fn an_unknown_unit_is_rejected() {
    let error = World::new()
        .submit(json!({
            "projectId": PROJECT,
            "unitId": "u9",
            "blocks": [{ "type": "narration", "text": "x" }]
        }))
        .err()
        .unwrap();

    assert_eq!(error, "unit u9 not found in project 5");
}

#[test]
fn a_chapter_without_a_stored_unit_can_be_drafted() {
    let world =
        World::new().with_script(script(Vec::new()), vec![chapter("c1", 1), chapter("c2", 2)]);

    let answer = world.accept(json!({
        "projectId": PROJECT,
        "unitId": "c2",
        "blocks": [{ "type": "narration", "text": "Chapter two." }]
    }));

    let card = &answer.cards[0];
    assert_eq!(card["unitId"], "c2");
    assert_eq!(card["unitTitle"], "Title 2");
    assert_eq!(card["chapter"], 2);
    assert_eq!(card["current"], json!([]));
    assert_eq!(card["blocks"][0]["id"], Value::Null);
}

#[test]
fn a_film_script_takes_scenes_and_actions_in_a_free_unit() {
    let world = World::new().with_script(film_script(), Vec::new());

    let answer = world.accept(json!({
        "projectId": PROJECT,
        "unitId": "U01",
        "blocks": [
            { "type": "scene", "loc": "Gate", "time": "dawn", "chars": ["kb-1"] },
            { "type": "action", "text": "The gate opens." },
            { "type": "narration", "text": "Not allowed in a film." }
        ]
    }));

    assert_eq!(answer.value["accepted"], 2);
    assert_eq!(answer.value["dropped"][0]["index"], 2);
    let blocks = &answer.cards[0]["blocks"];
    assert_eq!(blocks[0]["loc"], "Gate");
    assert_eq!(blocks[0]["time"], "DAWN");
    assert_eq!(blocks[0]["chars"], json!(["kb-1"]));
    assert_eq!(answer.cards[0]["chapter"], 1);
}

#[test]
fn a_missing_free_unit_of_a_film_script_is_rejected() {
    let world = World::new().with_script(film_script(), Vec::new());

    let error = world
        .submit(json!({
            "projectId": PROJECT,
            "unitId": "U09",
            "blocks": [{ "type": "action", "text": "x" }]
        }))
        .err()
        .unwrap();

    assert_eq!(error, "unit U09 not found in project 5");
}

#[test]
fn the_number_of_blocks_is_limited_and_required() {
    let world = World::new();
    let many: Vec<Value> = (0..401)
        .map(|_| json!({ "type": "narration", "text": "x" }))
        .collect();

    let too_many = world.submit(draft(Value::Array(many))).err().unwrap();
    let none = world.submit(draft(json!([]))).err().unwrap();
    let missing = world
        .submit(json!({ "projectId": PROJECT, "unitId": "c1" }))
        .err()
        .unwrap();

    assert_eq!(too_many, "a draft holds at most 400 blocks, got 401");
    assert_eq!(none, "argument 'blocks' must list at least one block");
    assert_eq!(missing, none);
}

#[test]
fn a_draft_without_any_valid_block_is_an_error() {
    let error = World::new()
        .submit(draft(json!([{ "type": "narration" }])))
        .err()
        .unwrap();

    assert!(error.starts_with("no valid block is left"));
}

#[test]
fn a_project_scope_cannot_draft_for_another_project() {
    let error = World::new()
        .submit(json!({
            "projectId": 6,
            "unitId": "c1",
            "blocks": [{ "type": "narration", "text": "x" }]
        }))
        .err()
        .unwrap();

    assert_eq!(error, "project 6 is outside the current scope");
}

#[test]
fn the_workspace_scope_can_draft_for_any_project() {
    let answer = World::new()
        .submit_in(
            draft(json!([{ "type": "narration", "text": "x" }])),
            &AssistantScope::workspace(),
        )
        .unwrap();

    assert_eq!(answer.cards.len(), 1);
}

#[test]
fn required_arguments_are_checked() {
    let world = World::new();

    assert_eq!(
        world
            .submit(json!({ "unitId": "c1", "blocks": [] }))
            .err()
            .unwrap(),
        "missing integer argument 'projectId'"
    );
    assert_eq!(
        world
            .submit(json!({ "projectId": PROJECT, "blocks": [] }))
            .err()
            .unwrap(),
        "missing string argument 'unitId'"
    );
}

#[test]
fn the_activity_label_names_the_unit_and_the_block_count() {
    let sink = RecordingSink::new();
    let scope = AssistantScope::project(PROJECT);
    let ctx = ToolContext {
        scope: &scope,
        linked_novel: Some(1),
        can_edit: false,
        sink: &sink,
    };

    let output = call(
        "submit_script_draft",
        &draft(json!([{ "type": "narration", "text": "x" }])),
        &ctx,
        &World::new().sources(),
    )
    .unwrap();

    assert_eq!(
        output.label,
        "submit_script_draft(project 5, unit c1) → 1 khối, chờ xác nhận"
    );
}
