use super::*;
use crate::features::assistant::models::AssistantScope;
use crate::features::assistant::models::ScopeKind;
use crate::features::assistant::sources::NovelSource;
use crate::testing::assistant::FakeNovels;

fn workspace() -> AssistantScope {
    AssistantScope {
        kind: ScopeKind::Workspace,
        novel_id: None,
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
fn opening_names_tools_rules_and_format() {
    let prompt = opening(&workspace(), &[], "Hello?", &novels());
    assert!(prompt.contains("list_novel"));
    assert!(prompt.contains("read_novel"));
    assert!(prompt.contains("read_novel_chapter"));
    assert!(prompt.contains("read_novel_knowledge"));
    assert!(prompt.contains("`edit_novel`"));
    assert!(prompt.contains("edit_novel_chapter"));
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
    let prompt = opening(&workspace(), &[], "q", &novels());
    assert!(prompt.contains("id 7: Seven name (2 chapters)"));
    assert!(prompt.contains("id 9: Nine name (0 chapters)"));
}

#[test]
fn opening_handles_empty_workspace() {
    let prompt = opening(&workspace(), &[], "q", &[]);
    assert!(prompt.contains("(no novels)"));
}

#[test]
fn opening_includes_history_when_given() {
    let history = vec![
        message(Role::User, "first question"),
        message(Role::Assistant, "first answer"),
    ];
    let prompt = opening(&workspace(), &history, "next", &novels());
    assert!(prompt.contains("Conversation so far"));
    assert!(prompt.contains("User: first question"));
    assert!(prompt.contains("Assistant: first answer"));
    assert!(prompt.find("first answer").unwrap() < prompt.find("next\n").unwrap());
}

#[test]
fn opening_omits_history_section_when_empty() {
    let prompt = opening(&workspace(), &[], "next", &novels());
    assert!(!prompt.contains("Conversation so far"));
}

#[test]
fn opening_truncates_long_history_messages() {
    let long = "x".repeat(2_000);
    let prompt = opening(&workspace(), &[message(Role::User, &long)], "q", &novels());
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
