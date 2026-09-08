use super::*;
use crate::testing::assistant::ToolWorld;
use serde_json::json;

fn handler_of(name: &str, args: Value) -> Result<String, String> {
    route::handler(name, &args).map(str::to_string)
}

#[test]
fn a_list_and_a_detail_tool_share_one_name_chosen_by_the_id() {
    let cases = [
        ("read_novel", "novelId", "read_novel", "list_novel"),
        ("read_project", "projectId", "read_project", "list_project"),
        ("read_script", "unitId", "read_script_unit", "read_script"),
        (
            "read_audiobook",
            "unitId",
            "read_audiobook_unit",
            "read_audiobook",
        ),
        (
            "read_pipeline",
            "pipelineId",
            "read_pipeline",
            "list_pipeline",
        ),
        ("edit_novel", "chapter", "edit_novel_chapter", "edit_novel"),
    ];
    for (name, key, with_key, without_key) in cases {
        assert_eq!(handler_of(name, json!({ key: 1 })).unwrap(), with_key);
        assert_eq!(handler_of(name, json!({})).unwrap(), without_key);
        assert_eq!(
            handler_of(name, json!({ key: null })).unwrap(),
            without_key,
            "{name} with a null {key}"
        );
    }
}

#[test]
fn read_translation_picks_the_text_or_the_guide_by_part() {
    assert_eq!(
        handler_of("read_translation", json!({})).unwrap(),
        "read_translation"
    );
    assert_eq!(
        handler_of("read_translation", json!({ "part": "text" })).unwrap(),
        "read_translation"
    );
    assert_eq!(
        handler_of("read_translation", json!({ "part": "guide" })).unwrap(),
        "read_translation_guide"
    );
    let error = handler_of("read_translation", json!({ "part": "diff" })).unwrap_err();
    assert!(error.contains("use text or guide"), "{error}");
    assert!(handler_of("read_translation", json!({ "part": 3 })).is_err());
}

#[test]
fn start_run_picks_the_job_by_kind() {
    for (kind, expected) in [
        ("translation", "start_translation"),
        ("analysis", "start_analysis"),
        ("synthesis", "start_synthesis"),
    ] {
        assert_eq!(
            handler_of("start_run", json!({ "kind": kind })).unwrap(),
            expected
        );
    }
    assert!(
        handler_of("start_run", json!({}))
            .unwrap_err()
            .contains("missing string argument 'kind'")
    );
    assert!(
        handler_of("start_run", json!({ "kind": "audio" }))
            .unwrap_err()
            .contains("unsupported kind 'audio'")
    );
}

#[test]
fn an_edit_tool_picks_its_handler_by_the_arguments_given() {
    let cases = [
        (
            "edit_translation",
            json!({ "chapter": 1, "p": 2, "expected": "a", "text": "b" }),
            "edit_translation_passage",
        ),
        ("edit_translation", json!({ "add": [] }), "edit_dictionary"),
        (
            "edit_translation",
            json!({ "remove": [1] }),
            "edit_dictionary",
        ),
        (
            "edit_audiobook",
            json!({ "voices": [] }),
            "edit_audiobook_voices",
        ),
        ("edit_audiobook", json!({ "vol": 1 }), "edit_audiobook_mix"),
        (
            "edit_script",
            json!({ "unitId": "u", "ops": [] }),
            "edit_script_unit",
        ),
        ("edit_script", json!({ "rename": [] }), "edit_script_cast"),
    ];
    for (name, args, expected) in cases {
        assert_eq!(handler_of(name, args.clone()).unwrap(), expected, "{args}");
    }
}

#[test]
fn an_edit_tool_refuses_no_change_and_two_changes_at_once() {
    let none = [
        ("edit_translation", json!({ "novelId": 1, "target": "VI" })),
        ("edit_audiobook", json!({ "projectId": 5 })),
        ("edit_script", json!({ "projectId": 5, "unitId": "u" })),
    ];
    for (name, args) in none {
        let error = handler_of(name, args).unwrap_err();
        assert!(error.contains(&format!("tool '{name}' needs")), "{error}");
    }

    let both = [
        ("edit_translation", json!({ "p": 1, "add": [] })),
        ("edit_audiobook", json!({ "voices": [], "gap": 1 })),
        ("edit_script", json!({ "ops": [], "add": ["x"] })),
    ];
    for (name, args) in both {
        let error = handler_of(name, args).unwrap_err();
        assert!(error.contains("one kind of change per call"), "{error}");
    }
}

#[test]
fn every_other_name_passes_through_so_the_retired_names_still_answer() {
    for name in [
        "list_novel",
        "read_translation_guide",
        "list_project",
        "read_script_unit",
        "list_pipeline",
        "start_translation",
        "edit_script_cast",
        "read_novel_chapter",
        "submit_translation_review",
        "unknown_tool",
    ] {
        assert_eq!(handler_of(name, json!({})).unwrap(), name);
    }
}

#[test]
fn every_handler_a_name_can_reach_is_dispatched() {
    let handlers = [
        "list_novel",
        "read_novel",
        "read_translation",
        "read_translation_guide",
        "edit_novel",
        "edit_novel_chapter",
        "edit_translation_passage",
        "edit_dictionary",
        "list_project",
        "read_project",
        "read_script",
        "read_script_unit",
        "read_audiobook",
        "read_audiobook_unit",
        "edit_script_unit",
        "edit_script_cast",
        "edit_audiobook_voices",
        "edit_audiobook_mix",
        "list_pipeline",
        "read_pipeline",
        "start_translation",
        "start_analysis",
        "start_synthesis",
    ];
    let world = ToolWorld::new();
    for handler in handlers {
        let (result, _) = world.run(handler, json!({}), &AssistantScope::workspace());
        if let Err(error) = result {
            assert!(!error.contains("unknown tool"), "{handler}: {error}");
        }
    }
}

#[test]
fn an_unknown_name_is_refused() {
    let world = ToolWorld::new();
    let (result, _) = world.run("unknown_tool", json!({}), &AssistantScope::workspace());
    assert!(result.unwrap_err().contains("unknown tool 'unknown_tool'"));
}
