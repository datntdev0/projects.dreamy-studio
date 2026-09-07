use super::*;
use crate::testing::script::chapter;
use crate::testing::script::linked_unit;
use crate::testing::script::script;
use crate::testing::script::unit;
use crate::testing::script::written_linked_unit;
use crate::testing::script::written_unit;

fn chapters(count: i64) -> Vec<ProjectChapter> {
    (1..=count)
        .map(|seq| chapter(&format!("c{seq}"), seq))
        .collect()
}

#[test]
fn reports_idle_doing_and_done_over_free_units() {
    let idle = script_progress(&[], &script(vec![unit("U01", 1), unit("U02", 2)]));
    let doing = script_progress(&[], &script(vec![written_unit("U01", 1), unit("U02", 2)]));
    let done = script_progress(&[], &script(vec![written_unit("U01", 1)]));

    assert_eq!((idle.state.as_str(), idle.done, idle.total), ("idle", 0, 2));
    assert_eq!(idle.note, "0/2 chapters");
    assert_eq!(doing.state, "doing");
    assert_eq!(doing.note, "1/2 chapters");
    assert_eq!((done.state.as_str(), done.done, done.total), ("done", 1, 1));
}

#[test]
fn counts_meta_or_non_empty_blocks_as_content() {
    let mut empty_blocks = unit("U01", 1);
    empty_blocks.blocks = Some(Vec::new());
    let mut only_meta = unit("U02", 2);
    only_meta.meta = written_unit("U02", 2).meta;

    assert!(!empty_blocks.has_content());
    assert!(only_meta.has_content());
}

#[test]
fn counts_every_derived_chapter_and_only_stored_content() {
    let derived = chapters(15);
    let stored = script(vec![written_linked_unit("c2"), written_linked_unit("c9")]);

    let progress = script_progress(&derived, &stored);

    assert_eq!((progress.done, progress.total), (2, 15));
    assert_eq!(progress.state, "doing");
    assert_eq!(progress.note, "2/15 chapters");
}

#[test]
fn a_newly_translated_chapter_raises_the_total_without_touching_the_script() {
    let stored = script(vec![written_linked_unit("c1")]);

    let before = script_progress(&chapters(12), &stored);
    let after = script_progress(&chapters(15), &stored);

    assert_eq!((before.done, before.total), (1, 12));
    assert_eq!((after.done, after.total), (1, 15));
}

#[test]
fn ignores_stored_chapter_units_that_left_the_derived_list() {
    let stored = script(vec![written_linked_unit("gone"), linked_unit("c1")]);

    let progress = script_progress(&chapters(2), &stored);

    assert_eq!((progress.done, progress.total), (0, 2));
    assert_eq!(progress.state, "idle");
}

#[test]
fn free_units_add_to_the_derived_chapters() {
    let stored = script(vec![written_linked_unit("c1"), written_unit("U01", 1)]);

    let progress = script_progress(&chapters(2), &stored);

    assert_eq!((progress.done, progress.total), (2, 3));
}

#[test]
fn falls_back_to_the_derived_chapters_without_a_script() {
    let states = module_states(&chapters(5), None, &Audiobook::default());
    let blank = module_states(&[], None, &Audiobook::default());

    assert_eq!(states[0], ProjectModuleState::idle(SCRIPTING_MODULE, 5));
    assert_eq!(states[1], ProjectModuleState::idle(AUDIOBOOK_MODULE, 5));
    assert_eq!(blank[0].total, 0);
}

#[test]
fn sizes_the_audiobook_row_by_derived_chapters() {
    let stored = script(vec![written_linked_unit("c1")]);
    let states = module_states(&chapters(2), Some(&stored), &Audiobook::default());

    assert_eq!(states[0].id, SCRIPTING_MODULE);
    assert_eq!(
        states[1],
        ProjectModuleState {
            note: "0/2 chapters".to_string(),
            ..ProjectModuleState::idle(AUDIOBOOK_MODULE, 2)
        }
    );
}
