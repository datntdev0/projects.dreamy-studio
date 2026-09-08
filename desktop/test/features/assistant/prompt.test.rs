use super::*;
use crate::features::assistant::models::AssistantScope;
use crate::features::assistant::models::ScopeKind;
use crate::features::assistant::sources::NovelSource;
use crate::features::assistant::tools::definitions;
use crate::testing::assistant::FakeNovels;

const PROJECT_TOOLS: [&str; 10] = [
    "read_project",
    "read_script",
    "search_project",
    "read_audiobook",
    "submit_script_draft",
    "edit_project",
    "edit_script",
    "list_voice",
    "edit_audiobook",
    "flag_audio_segment",
];

const PIPELINE_TOOLS: [&str; 3] = ["start_run", "read_pipeline", "cancel_pipeline"];

const RETIRED_TOOLS: [&str; 13] = [
    "list_novel",
    "list_project",
    "read_script_unit",
    "read_audiobook_unit",
    "list_pipeline",
    "edit_novel_chapter",
    "edit_script_unit",
    "edit_script_cast",
    "edit_audiobook_voices",
    "edit_audiobook_mix",
    "start_translation",
    "start_analysis",
    "start_synthesis",
];

fn workspace() -> AssistantScope {
    AssistantScope {
        kind: ScopeKind::Workspace,
        novel_id: None,
        project_id: None,
    }
}

fn novels() -> Vec<NovelSummary> {
    FakeNovels::new()
        .with_novel(7, "Seven")
        .with_chapter(7, 1, "One", &["a"])
        .with_chapter(7, 2, "Two", &["b"])
        .with_novel(9, "Nine")
        .list()
        .unwrap()
}

fn message(role: Role, text: &str) -> AssistantMessage {
    AssistantMessage {
        id: "m".to_string(),
        role,
        text: text.to_string(),
        created_at: "2026-01-01T00:00:00Z".to_string(),
        activities: Vec::new(),
        citations: Vec::new(),
        attachments: Vec::new(),
    }
}

#[test]
fn a_project_scope_names_the_project_and_its_linked_novel() {
    let prompt = opening(&AssistantScope::project(3), &[], "q", &novels(), Some(7));
    assert!(prompt.contains(
        "- Focus on the project with id 3.
"
    ));
    assert!(prompt.contains("linked to the novel with id 7"));
    assert!(!prompt.contains("Focus on the novel"));
}

#[test]
fn a_project_scope_without_a_linked_novel_says_so() {
    let prompt = opening(&AssistantScope::project(3), &[], "q", &novels(), None);
    assert!(prompt.contains(
        "- Focus on the project with id 3.
"
    ));
    assert!(prompt.contains("no linked novel"));
}

#[test]
fn a_novel_scope_keeps_its_focus_line_and_has_no_project_line() {
    let prompt = opening(&AssistantScope::novel(7), &[], "q", &novels(), None);
    assert!(prompt.contains(
        "- Focus on the novel with id 7.
"
    ));
    assert!(!prompt.contains("Focus on the project"));
}

#[test]
fn workspace_and_project_prompts_describe_every_project_tool() {
    for scope in [workspace(), AssistantScope::project(3)] {
        let prompt = opening(&scope, &[], "q", &novels(), None);
        for tool in PROJECT_TOOLS {
            assert!(prompt.contains(&format!("`{tool}`")), "{tool} missing");
        }
        assert!(prompt.contains("\n\n## Rules\n"));
    }
}

#[test]
fn a_novel_prompt_does_not_mention_project_tools() {
    let prompt = opening(&AssistantScope::novel(7), &[], "q", &novels(), None);
    for tool in PROJECT_TOOLS {
        assert!(!prompt.contains(tool), "{tool} listed");
    }
    assert!(prompt.contains("\n\n## Rules\n"));
}

#[test]
fn a_project_prompt_asks_to_read_scripts_and_cite_blocks() {
    let prompt = opening(&AssistantScope::project(3), &[], "q", &novels(), Some(7));
    assert!(prompt.contains("Read the script with `read_script` (the outline first"));
    assert!(prompt.contains("their id and position `p`"));
    assert!(
        !opening(&workspace(), &[], "q", &novels(), None).contains("before you answer about it")
    );
}

#[test]
fn opening_names_tools_rules_and_format() {
    let prompt = opening(&workspace(), &[], "Hello?", &novels(), None);
    assert!(prompt.contains("`read_novel`: without `novelId` list every novel"));
    assert!(prompt.contains("read_novel_chapter"));
    assert!(prompt.contains("read_novel_knowledge"));
    assert!(prompt.contains("`edit_novel`"));
    assert!(prompt.contains("with `chapter` that chapter"));
    assert!(prompt.contains("edit_novel_knowledge"));
    assert!(prompt.contains("expected"));
    assert!(prompt.contains("Edit only when the user asks you to change something."));
    assert!(prompt.contains("Read before you edit."));
    assert!(prompt.contains("editing is not enabled"));
    assert!(prompt.contains("turn it on in the assistant panel"));
    assert!(!prompt.contains("read-only"));
    assert!(prompt.contains("`next`") || prompt.contains("next"));
    assert!(prompt.contains("user's language"));
    assert!(prompt.contains("<citations>["));
    assert!(prompt.contains("</citations>"));
    assert!(prompt.contains("120"));
    assert!(prompt.trim_end().ends_with("Hello?"));
}

#[test]
fn opening_lists_novels_with_display_name_and_chapters() {
    let prompt = opening(&workspace(), &[], "q", &novels(), None);
    assert!(prompt.contains("id 7: Seven name (2 chapters)"));
    assert!(prompt.contains("id 9: Nine name (0 chapters)"));
}

#[test]
fn opening_handles_empty_workspace() {
    let prompt = opening(&workspace(), &[], "q", &[], None);
    assert!(prompt.contains("(no novels)"));
}

#[test]
fn opening_includes_history_when_given() {
    let history = vec![
        message(Role::User, "first question"),
        message(Role::Assistant, "first answer"),
    ];
    let prompt = opening(&workspace(), &history, "next", &novels(), None);
    assert!(prompt.contains("Conversation so far"));
    assert!(prompt.contains("User: first question"));
    assert!(prompt.contains("Assistant: first answer"));
    assert!(prompt.find("first answer").unwrap() < prompt.find("next\n").unwrap());
}

#[test]
fn opening_omits_history_section_when_empty() {
    let prompt = opening(&workspace(), &[], "next", &novels(), None);
    assert!(!prompt.contains("Conversation so far"));
}

#[test]
fn opening_truncates_long_history_messages() {
    let long = "x".repeat(2_000);
    let prompt = opening(
        &workspace(),
        &[message(Role::User, &long)],
        "q",
        &novels(),
        None,
    );
    assert!(prompt.contains(&format!("{}…", "x".repeat(600))));
    assert!(!prompt.contains(&"x".repeat(601)));
}

#[test]
fn follow_up_is_short_and_reminds_the_format() {
    let prompt = follow_up("  And then?  ");
    assert!(prompt.starts_with("And then?"));
    assert!(prompt.contains("<citations>"));
    assert!(prompt.contains("</citations>"));
    assert!(prompt.len() < 400);
    assert!(!prompt.contains("list_novel"));
}

#[test]
fn every_scope_describes_the_run_and_status_tools() {
    for scope in [
        workspace(),
        AssistantScope::novel(7),
        AssistantScope::project(3),
    ] {
        let prompt = opening(&scope, &[], "q", &novels(), None);
        for tool in PIPELINE_TOOLS {
            assert!(prompt.contains(&format!("`{tool}`")), "{tool} missing");
        }
    }
}

#[test]
fn synthesis_runs_are_described_outside_a_novel_scope_only() {
    for scope in [workspace(), AssistantScope::project(3)] {
        let prompt = opening(&scope, &[], "q", &novels(), None);
        assert!(prompt.contains("- `start_run` with `kind` `synthesis`:"));
    }
    let prompt = opening(&AssistantScope::novel(7), &[], "q", &novels(), None);
    assert!(!prompt.contains("synthesis"));
}

#[test]
fn the_prompt_never_names_a_retired_tool() {
    for scope in [
        workspace(),
        AssistantScope::novel(7),
        AssistantScope::project(3),
    ] {
        let prompt = opening(&scope, &[], "q", &novels(), Some(7));
        for tool in RETIRED_TOOLS {
            assert!(!prompt.contains(tool), "{tool} still named");
        }
    }
}

#[test]
fn the_prompt_names_every_advertised_tool_it_describes() {
    let scope = project_scope();
    let prompt = opening(&scope, &[], "q", &novels(), Some(7));
    let advertised = definitions(&scope);
    for tool in PROJECT_TOOLS.iter().chain(&PIPELINE_TOOLS) {
        assert!(
            advertised
                .as_array()
                .unwrap()
                .iter()
                .any(|item| item["name"] == *tool),
            "{tool} is not advertised"
        );
        assert!(prompt.contains(&format!("`{tool}`")), "{tool} missing");
    }
}

#[test]
fn the_prompt_requires_the_user_to_confirm_every_run() {
    let prompt = opening(&workspace(), &[], "q", &novels(), None);
    assert!(prompt.contains("never starts a job"));
    assert!(prompt.contains("confirmation card"));
    assert!(
        prompt
            .contains("Never say that a job has started or finished before the user confirmed it")
    );
    assert!(prompt.contains("only when the user asks about the status of a run"));
    assert!(prompt.contains("Queue only the chapters or units the user asked for"));
    assert!(prompt.find("## Tools").unwrap() < prompt.find("`start_run`").unwrap());
    assert!(prompt.find("`cancel_pipeline`").unwrap() < prompt.find("## Rules").unwrap());
}

fn project_scope() -> AssistantScope {
    AssistantScope::project(5)
}

#[test]
fn a_project_prompt_explains_how_script_drafts_work() {
    let prompt = opening(
        &project_scope(),
        &[],
        "Rewrite chapter 1",
        &novels(),
        Some(7),
    );

    assert!(prompt.contains("`submit_script_draft`: propose a rewrite of one script unit"));
    assert!(prompt.contains("send the whole new unit once with `submit_script_draft`"));
    assert!(prompt.contains("the script changes only when the user applies it"));
    assert!(prompt.contains("never say the script has changed before that"));
    assert!(prompt.contains("ask which one"));
    assert!(prompt.contains("leave `who` empty when unsure"));
}

#[test]
fn a_project_prompt_explains_edits_voices_and_outdated_audio() {
    let prompt = opening(&project_scope(), &[], "q", &novels(), Some(7));

    assert!(prompt.contains("use `edit_script`"));
    assert!(prompt.contains("change only what the user asked for"));
    assert!(prompt.contains("To assign voices, read `read_audiobook`"));
    assert!(prompt.contains("read `read_novel_knowledge` for the traits of the characters"));
    assert!(prompt.contains("Use only voice ids from `list_voice`, never invent one"));
    assert!(prompt.contains("`staleAudio` or `outdatedAudio`"));
    assert!(prompt.contains("the audio must be generated again"));
    assert!(!prompt.contains("Never edit the script any other way"));
}

#[test]
fn project_and_workspace_prompts_list_every_edit_tool_but_only_a_project_adds_the_rules() {
    let edit_tools = [
        "edit_project",
        "edit_script",
        "list_voice",
        "edit_audiobook",
        "flag_audio_segment",
    ];

    let workspace_prompt = opening(&workspace(), &[], "q", &novels(), None);
    let project_prompt = opening(&project_scope(), &[], "q", &novels(), Some(7));

    for tool in edit_tools {
        assert!(workspace_prompt.contains(&format!("`{tool}`")), "{tool}");
        assert!(project_prompt.contains(&format!("`{tool}`")), "{tool}");
    }
    assert!(!workspace_prompt.contains("To assign voices"));
    assert!(!workspace_prompt.contains("use `edit_script`"));
}

#[test]
fn a_workspace_prompt_lists_the_draft_tool_without_the_project_rules() {
    let prompt = opening(&workspace(), &[], "hi", &novels(), None);

    assert!(prompt.contains("`submit_script_draft`"));
    assert!(prompt.contains("nothing is written until the user applies it"));
    assert!(!prompt.contains("send the whole new unit once"));
}

#[test]
fn a_novel_prompt_never_mentions_script_drafts() {
    let scope = AssistantScope {
        kind: ScopeKind::Novel,
        novel_id: Some(7),
        project_id: None,
    };

    let prompt = opening(&scope, &[], "hi", &novels(), None);

    assert!(!prompt.contains("submit_script_draft"));
    assert!(!prompt.contains("script draft"));
}
