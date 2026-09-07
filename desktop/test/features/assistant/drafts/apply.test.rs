use super::*;
use crate::features::assistant::drafts::card::DRAFT_KIND;
use crate::features::assistant::drafts::card::DraftStats;
use crate::features::assistant::models::AssistantErrorCode;
use crate::testing::assistant::FakeAudiobooks;
use crate::testing::assistant::FakeKnowledge;
use crate::testing::assistant::FakeNovels;
use crate::testing::assistant::FakeProjects;
use crate::testing::assistant::FakeScripts;
use crate::testing::assistant::FakeTranslation;
use crate::testing::assistant::project_chapter_fixture;
use crate::testing::assistant::project_summary;
use crate::testing::assistant::script_fixture;
use crate::testing::assistant::sources_with_project_data;
use crate::testing::script::chapter;
use crate::testing::script::script;

const PROJECT: i64 = 5;

fn sources_for(scripts: &FakeScripts) -> Sources {
    sources_with_project_data(
        &FakeNovels::new(),
        &FakeKnowledge::new(),
        &FakeTranslation::new(),
        &FakeProjects::with(vec![project_summary(PROJECT, Some(1))]),
        scripts,
        &FakeAudiobooks::default(),
    )
}

fn stored() -> (FakeScripts, Script) {
    let script = script_fixture();
    let scripts = FakeScripts::with_script(script.clone(), vec![project_chapter_fixture()]);
    (scripts, script)
}

fn draft(id: Option<&str>, kind: &str, text: &str, who: &str) -> DraftBlock {
    DraftBlock {
        id: id.map(str::to_string),
        kind: kind.to_string(),
        text: text.to_string(),
        who: who.to_string(),
        paren: String::new(),
        ms: 0,
        loc: String::new(),
        time: "MORNING".to_string(),
        beat: String::new(),
        refs: Vec::new(),
        chars: Vec::new(),
        kept: id.is_some(),
    }
}

fn current_of(script: &Script, unit_id: &str) -> Vec<ScriptBlock> {
    script
        .units
        .iter()
        .find(|unit| unit.id == unit_id)
        .and_then(|unit| unit.blocks.clone())
        .unwrap_or_default()
}

fn card_for(
    script: &Script,
    unit_id: &str,
    blocks: Vec<DraftBlock>,
    extra_cast: Vec<DraftMember>,
) -> DraftCard {
    DraftCard {
        kind: DRAFT_KIND.to_string(),
        id: "sd1".to_string(),
        project_id: PROJECT,
        title: "Project 5".to_string(),
        unit_id: unit_id.to_string(),
        unit_title: "Title".to_string(),
        chapter: Some(1),
        summary: String::new(),
        base_rev: base_rev(&current_of(script, unit_id), &script.extra_cast),
        current: Vec::new(),
        current_truncated: false,
        blocks,
        extra_cast,
        speakers: Vec::new(),
        stats: DraftStats {
            blocks: 0,
            voiced: 0,
            words: 0,
            narration: 0,
            dialogue: 0,
            kept: 0,
            stale_audio: 0,
        },
        unresolved: 0,
        warnings: Vec::new(),
        status: "pending".to_string(),
    }
}

fn member(reference: &str, name: &str) -> DraftMember {
    DraftMember {
        id: reference.to_string(),
        name: name.to_string(),
    }
}

#[test]
fn applying_keeps_kept_ids_and_numbers_new_blocks_from_the_script_counter() {
    let (scripts, script) = stored();
    let mut line = draft(None, "dialogue", "Who is there?", "kb-1");
    line.refs = vec!["1.2".to_string(), "1.3".to_string()];
    line.paren = "softly".to_string();
    let card = card_for(
        &script,
        "c1",
        vec![
            draft(Some("b1"), "narration", "The gate opened at dawn.", ""),
            draft(None, "narration", "A cold wind blew.", ""),
            draft(Some("b3"), "dialogue", "A friend.", "x1"),
            line,
        ],
        Vec::new(),
    );

    let change = apply(&card, &sources_for(&scripts)).unwrap();

    let saved = scripts.saved_units();
    assert_eq!(saved.len(), 1);
    let (unit, seq) = &saved[0];
    assert_eq!(*seq, 6);
    let ids: Vec<&str> = unit
        .blocks
        .iter()
        .flatten()
        .map(|block| block.id.as_str())
        .collect();
    assert_eq!(ids, ["b1", "B5", "b3", "B6"]);
    let written = &unit.blocks.as_ref().unwrap()[3];
    assert_eq!(written.reference.as_deref(), Some("1.2"));
    assert_eq!(written.refs, ["1.2", "1.3"]);
    assert_eq!(written.paren, "softly");
    assert_eq!(unit.chapter_id.as_deref(), Some("c1"));
    assert_eq!(unit.meta, None);
    assert!(chrono::DateTime::parse_from_rfc3339(&unit.updated).is_ok());
    assert!(scripts.saved_casts().is_empty());
    assert_eq!(
        change,
        AssistantChange {
            target: ChangeTarget::Script,
            novel_id: None,
            project_id: Some(PROJECT),
            chapter_id: Some("c1".to_string()),
            lang: None,
            translation_target: None,
        }
    );
}

#[test]
fn new_extra_members_are_saved_before_the_unit_and_replace_their_refs() {
    let (scripts, script) = stored();
    let mut present = draft(None, "scene", "", "");
    present.chars = vec!["new1".to_string(), "kb-1".to_string()];
    let card = card_for(
        &script,
        "c1",
        vec![
            draft(None, "dialogue", "Halt!", "new1"),
            draft(None, "dialogue", "Hello.", "new2"),
            present,
        ],
        vec![member("new1", "Gatekeeper"), member("new2", "Cook")],
    );

    apply(&card, &sources_for(&scripts)).unwrap();

    assert_eq!(scripts.write_order(), ["cast", "unit"]);
    let casts = scripts.saved_casts();
    let extra = &casts[0];
    assert_eq!(extra.len(), 3);
    assert_eq!(extra[0].id, "x1");
    assert!(extra[1].id.starts_with("spk") && extra[2].id.starts_with("spk"));
    assert_ne!(extra[1].id, extra[2].id);
    assert_eq!(extra[1].name, "Gatekeeper");
    assert_eq!(extra[1].kind, "extra");
    assert_eq!(extra[2].name, "Cook");
    let saved = scripts.saved_units();
    let blocks = saved[0].0.blocks.as_ref().unwrap();
    assert_eq!(blocks[0].who, extra[1].id);
    assert_eq!(blocks[1].who, extra[2].id);
    assert_eq!(blocks[2].chars, [extra[1].id.clone(), "kb-1".to_string()]);
}

#[test]
fn a_unit_changed_since_the_draft_is_a_conflict_and_nothing_is_written() {
    let (scripts, script) = stored();
    let mut card = card_for(
        &script,
        "c1",
        vec![draft(None, "narration", "New.", "")],
        Vec::new(),
    );
    card.base_rev = "0000000000000000".to_string();

    let error = apply(&card, &sources_for(&scripts)).unwrap_err();

    assert_eq!(error.code, AssistantErrorCode::Conflict);
    assert!(error.detail.contains("changed since the draft"));
    assert!(scripts.saved_units().is_empty());
    assert!(scripts.saved_casts().is_empty());
}

#[test]
fn a_project_without_a_script_is_not_found() {
    let scripts = FakeScripts::default();
    let card = card_for(
        &script_fixture(),
        "c1",
        vec![draft(None, "narration", "New.", "")],
        Vec::new(),
    );

    let error = apply(&card, &sources_for(&scripts)).unwrap_err();

    assert_eq!(error.code, AssistantErrorCode::NotFound);
    assert!(error.detail.contains("no script"));
}

#[test]
fn a_unit_that_vanished_is_not_found() {
    let (scripts, script) = stored();
    let card = card_for(
        &script,
        "gone",
        vec![draft(None, "narration", "New.", "")],
        Vec::new(),
    );

    let error = apply(&card, &sources_for(&scripts)).unwrap_err();

    assert_eq!(error.code, AssistantErrorCode::NotFound);
    assert!(error.detail.contains("unit gone no longer exists"));
}

#[test]
fn a_chapter_without_a_stored_unit_gets_a_linked_unit() {
    let script = script(Vec::new());
    let scripts = FakeScripts::with_script(script.clone(), vec![chapter("c2", 2)]);
    let card = card_for(
        &script,
        "c2",
        vec![
            draft(None, "narration", "First.", ""),
            draft(None, "narration", "Second.", ""),
        ],
        Vec::new(),
    );

    apply(&card, &sources_for(&scripts)).unwrap();

    let saved = scripts.saved_units();
    let (unit, seq) = &saved[0];
    assert_eq!(unit.id, "c2");
    assert_eq!(unit.chapter_id.as_deref(), Some("c2"));
    assert_eq!(*seq, 6);
    let ids: Vec<&str> = unit
        .blocks
        .iter()
        .flatten()
        .map(|block| block.id.as_str())
        .collect();
    assert_eq!(ids, ["B5", "B6"]);
}

#[test]
fn a_kept_block_that_no_longer_exists_is_a_conflict() {
    let (scripts, script) = stored();
    let card = card_for(
        &script,
        "c1",
        vec![draft(Some("zz"), "narration", "Ghost.", "")],
        Vec::new(),
    );

    let error = apply(&card, &sources_for(&scripts)).unwrap_err();

    assert_eq!(error.code, AssistantErrorCode::Conflict);
    assert!(error.detail.contains("block zz no longer exists"));
    assert!(scripts.saved_units().is_empty());
}

#[test]
fn a_failing_unit_write_is_a_storage_error_after_the_cast_was_saved() {
    let (scripts, script) = stored();
    let scripts = scripts.failing_unit_saves();
    let card = card_for(
        &script,
        "c1",
        vec![draft(None, "dialogue", "Halt!", "new1")],
        vec![member("new1", "Gatekeeper")],
    );

    let error = apply(&card, &sources_for(&scripts)).unwrap_err();

    assert_eq!(error.code, AssistantErrorCode::Storage);
    assert_eq!(scripts.saved_casts().len(), 1);
    assert!(scripts.saved_units().is_empty());
}

#[test]
fn new_member_ids_never_collide_with_stored_or_sibling_ids() {
    let stored = vec![CastMember {
        id: "x1".to_string(),
        ..CastMember::default()
    }];

    let members = new_members(&[member("a", "A"), member("b", "B")], &stored);

    assert_eq!(members.len(), 2);
    assert_eq!(members[0].0, "a");
    assert_eq!(members[1].1.id, format!("{}x", members[0].1.id));
    assert_eq!(members[0].1.c, 1);
    assert_eq!(members[1].1.c, 2);
}

#[test]
fn radix_writes_base_36_digits() {
    assert_eq!(radix(0), "0");
    assert_eq!(radix(35), "z");
    assert_eq!(radix(36), "10");
    assert_eq!(radix(1_295), "zz");
}
