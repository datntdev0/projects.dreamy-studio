use super::*;
use crate::testing::script::script;
use crate::testing::script::unit;
use crate::testing::script::written_unit;

fn project(range_from: Option<i64>, range_to: Option<i64>) -> ProjectSummary {
    ProjectSummary {
        id: 1,
        name: "Book".to_string(),
        folder: "projects/1".to_string(),
        template: "audiobook".to_string(),
        description: String::new(),
        novel_id: None,
        novel_missing: false,
        src_kind: None,
        src_lang: None,
        range_from,
        range_to,
        archived: false,
        modules: Vec::new(),
        created_at: String::new(),
        updated_at: String::new(),
        opened_at: String::new(),
    }
}

#[test]
fn reports_idle_doing_and_done() {
    let idle = script_progress(&script(vec![unit("U01", 1), unit("U02", 2)]));
    let doing = script_progress(&script(vec![written_unit("U01", 1), unit("U02", 2)]));
    let done = script_progress(&script(vec![written_unit("U01", 1)]));

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
fn falls_back_to_the_chapter_range_without_a_script() {
    let states = module_states(&project(Some(3), Some(7)), None, &Audiobook::default());
    let blank = module_states(&project(None, None), None, &Audiobook::default());

    assert_eq!(states[0], ProjectModuleState::idle(SCRIPTING_MODULE, 5));
    assert_eq!(states[1], ProjectModuleState::idle(AUDIOBOOK_MODULE, 0));
    assert_eq!(blank[0].total, 0);
}

#[test]
fn sizes_the_audiobook_row_by_script_units() {
    let stored = script(vec![written_unit("U01", 1), unit("U02", 2)]);
    let states = module_states(&project(None, None), Some(&stored), &Audiobook::default());

    assert_eq!(states[0].id, SCRIPTING_MODULE);
    assert_eq!(
        states[1],
        ProjectModuleState {
            note: "0/2 chapters".to_string(),
            ..ProjectModuleState::idle(AUDIOBOOK_MODULE, 2)
        }
    );
}
