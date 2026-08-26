use super::*;
use crate::features::assistant::sources::NovelSource;
use crate::testing::assistant::FakeNovels;

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
        "read_translation_guide",
        "read_translation",
        "read_novel_knowledge",
        "submit_translation_review",
    ] {
        assert!(prompt.contains(tool), "missing {tool}");
    }
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
