use super::*;
use crate::features::assistant::sources::KnowledgeSource;
use crate::features::assistant::sources::NovelSource;
use crate::features::knowledge::check::check;
use crate::features::knowledge::ontology::Ontology;
use crate::testing::assistant::FakeKnowledge;
use crate::testing::assistant::FakeNovels;
use crate::testing::assistant::project_summary;

fn fixture() -> (NovelSummary, ChapterRow) {
    let novels = FakeNovels::new()
        .with_novel(7, "Seven")
        .with_chapter(7, 4, "The Fog", &["a"]);
    let novel = novels.list().unwrap().remove(0);
    let chapter = novels.chapters(7).unwrap().remove(0);
    (novel, chapter)
}

#[test]
fn the_prompt_names_the_tools_the_chapter_and_the_target() {
    let (novel, chapter) = fixture();

    let prompt = review_translation(&novel, &chapter, "VI", None);

    for tool in [
        "read_translation",
        "read_novel_knowledge",
        "submit_translation_review",
    ] {
        assert!(prompt.contains(tool), "missing {tool}");
    }
    assert!(prompt.contains("part \"guide\""));
    assert!(!prompt.contains("read_translation_guide"));
    assert!(prompt.contains("chapter 4"));
    assert!(prompt.contains("The Fog"));
    assert!(prompt.contains("novelId 7"));
    assert!(prompt.contains("target \"VI\""));
    assert!(prompt.contains("exactly once"));
    assert!(prompt.contains("verbatim"));
    assert!(prompt.contains("two or three sentences"));
}

#[test]
fn the_prompt_without_an_opening_starts_with_the_skill() {
    let (novel, chapter) = fixture();

    let prompt = review_translation(&novel, &chapter, "EN", None);

    assert!(prompt.starts_with("## Skill: review_translation"));
}

#[test]
fn the_opening_comes_first_when_given() {
    let (novel, chapter) = fixture();

    let prompt = review_translation(&novel, &chapter, "EN", Some("OPENING\n".to_string()));

    assert!(prompt.starts_with("OPENING\n"));
    assert!(prompt.contains("## Skill: review_translation"));
    assert!(prompt.find("OPENING").unwrap() < prompt.find("## Skill").unwrap());
}

fn issues() -> Vec<KnowledgeIssue> {
    let knowledge = FakeKnowledge::new()
        .with_entity("e2", "persona", "Wren", &[], &[], &[2])
        .with_fact("f1", "located_at", "gone", None, &[1]);
    let items = knowledge.get(7, "src").unwrap().items;
    check(Ontology::get(), &items)
}

#[test]
fn the_knowledge_prompt_names_the_tools_the_novel_and_the_issues() {
    let (novel, _) = fixture();
    let issues = issues();

    let prompt = review_knowledgebase(&novel, "src", &issues, None);

    for tool in [
        "read_knowledge_issues",
        "read_novel_chapter",
        "submit_knowledge_changes",
    ] {
        assert!(prompt.contains(tool), "missing {tool}");
    }
    assert!(prompt.starts_with("## Skill: review_knowledgebase"));
    assert!(prompt.contains("novelId 7"));
    assert!(prompt.contains("lang \"src\""));
    assert!(prompt.contains(&format!("selected {} issue(s)", issues.len())));
    for issue in &issues {
        assert!(prompt.contains(&issue.id), "missing {}", issue.id);
        assert!(prompt.contains(&issue.message));
    }
    assert!(prompt.contains("rule dangling_ref, error"));
    assert!(prompt.contains("smallest set of edits"));
    assert!(prompt.contains("exactly once"));
    assert!(prompt.contains("validation.ok"));
    assert!(prompt.contains("Leave out issues"));
    assert!(prompt.contains("in the user's language"));
}

#[test]
fn the_knowledge_opening_comes_first_when_given() {
    let (novel, _) = fixture();

    let prompt = review_knowledgebase(
        &novel,
        "VI",
        &issues(),
        Some(
            "OPENING
"
            .to_string(),
        ),
    );

    assert!(prompt.starts_with(
        "OPENING
"
    ));
    assert!(prompt.find("OPENING").unwrap() < prompt.find("## Skill").unwrap());
    assert!(prompt.contains("lang \"VI\""));
}

fn rewrite<'a>(project: &'a ProjectSummary, note: Option<&'a str>) -> ScriptRewrite<'a> {
    ScriptRewrite {
        project,
        unit_id: "U01",
        unit_title: "The Gate",
        chapter: Some(3),
        note,
    }
}

#[test]
fn the_rewrite_prompt_names_the_tools_the_project_and_the_unit() {
    let project = project_summary(5, Some(1));

    let prompt = rewrite_script_unit(&rewrite(&project, None), None);

    for tool in ["read_script", "read_novel_knowledge", "submit_script_draft"] {
        assert!(prompt.contains(tool), "missing {tool}");
    }
    assert!(!prompt.contains("read_script_unit"));
    assert!(prompt.contains("## Skill: rewrite_script_unit"));
    assert!(prompt.contains("unit `U01` (\"The Gate\", chapter 3)"));
    assert!(prompt.contains("project with id 5 (\"Project 5\")"));
    assert!(prompt.contains("projectId 5"));
    assert!(prompt.contains("unitId \"U01\""));
    assert!(prompt.contains("`withSource` true"));
    assert!(prompt.contains("exactly once"));
}

#[test]
fn the_rewrite_prompt_sets_the_speaker_and_cast_rules() {
    let project = project_summary(5, Some(1));

    let prompt = rewrite_script_unit(&rewrite(&project, None), None);

    assert!(prompt.contains("`cfg.types`"));
    assert!(prompt.contains("`narration` blocks"));
    assert!(prompt.contains("`dialogue` block with the speaker in `who`"));
    assert!(prompt.contains("leave `who` empty"));
    assert!(prompt.contains("never guess"));
    assert!(prompt.contains("`extraCast`"));
    assert!(prompt.contains("`refs`"));
    assert!(prompt.contains("keeps its generated audio"));
    assert!(prompt.contains("`dropped`"));
    assert!(prompt.contains("Do not edit the script yourself"));
    assert!(prompt.contains("two or three sentences in the user's language"));
}

#[test]
fn the_knowledge_step_uses_the_linked_novel_and_the_project_language() {
    let mut project = project_summary(5, Some(8));
    project.src_kind = Some("translation".to_string());
    project.src_lang = Some("EN".to_string());

    let prompt = rewrite_script_unit(&rewrite(&project, None), None);

    assert!(prompt.contains("novelId 8 and lang \"EN\""));
    assert!(prompt.contains("\"character\""));
}

#[test]
fn a_project_without_a_novel_has_no_knowledge_step() {
    let project = project_summary(5, None);

    let prompt = rewrite_script_unit(&rewrite(&project, None), None);

    assert!(!prompt.contains("read_novel_knowledge"));
    assert!(prompt.contains("no linked novel"));
}

#[test]
fn the_user_note_and_the_opening_are_included() {
    let project = project_summary(5, Some(1));

    let prompt = rewrite_script_unit(
        &rewrite(&project, Some("keep the dialogue short")),
        Some(
            "OPENING
"
            .to_string(),
        ),
    );

    assert!(prompt.starts_with(
        "OPENING
"
    ));
    assert!(prompt.contains("The user adds: keep the dialogue short"));
    assert!(prompt.find("OPENING").unwrap() < prompt.find("## Skill").unwrap());
}

#[test]
fn a_unit_without_a_chapter_has_no_chapter_label() {
    let project = project_summary(5, Some(1));
    let mut rewrite = rewrite(&project, None);
    rewrite.chapter = None;

    let prompt = rewrite_script_unit(&rewrite, None);

    assert!(prompt.contains("unit `U01` (\"The Gate\")"));
}
