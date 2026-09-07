use super::*;
use crate::testing::assistant::script_block;

fn blocks() -> Vec<ScriptBlock> {
    vec![
        script_block("b1", "narration", "The gate opened.", ""),
        script_block("b2", "dialogue", "Who goes there?", "kb-1"),
    ]
}

fn cast(ids: &[&str]) -> Vec<CastMember> {
    ids.iter()
        .map(|id| CastMember {
            id: id.to_string(),
            ..CastMember::default()
        })
        .collect()
}

#[test]
fn the_revision_is_stable_and_sixteen_hex_digits_long() {
    let first = base_rev(&blocks(), &cast(&["x1"]));

    assert_eq!(first, base_rev(&blocks(), &cast(&["x1"])));
    assert_eq!(first.len(), 16);
    assert!(first.chars().all(|digit| digit.is_ascii_hexdigit()));
}

#[test]
fn any_field_of_a_block_changes_the_revision() {
    let base = base_rev(&blocks(), &[]);
    let edits: [fn(&mut ScriptBlock); 6] = [
        |block| block.id = "b9".to_string(),
        |block| block.kind = "narration".to_string(),
        |block| block.text.push('!'),
        |block| block.who = "x1".to_string(),
        |block| block.paren = "softly".to_string(),
        |block| block.ms = 5,
    ];

    for edit in edits {
        let mut changed = blocks();
        edit(&mut changed[1]);
        assert_ne!(base_rev(&changed, &[]), base, "an edit went unnoticed");
    }
}

#[test]
fn block_order_and_count_change_the_revision() {
    let base = base_rev(&blocks(), &[]);
    let mut swapped = blocks();
    swapped.swap(0, 1);

    assert_ne!(base_rev(&swapped, &[]), base);
    assert_ne!(base_rev(&blocks()[..1], &[]), base);
}

#[test]
fn the_extra_cast_ids_change_the_revision() {
    let base = base_rev(&blocks(), &cast(&["x1"]));

    assert_ne!(base_rev(&blocks(), &cast(&["x1", "x2"])), base);
    assert_ne!(base_rev(&blocks(), &[]), base);
}

#[test]
fn moving_text_between_neighbour_fields_changes_the_revision() {
    let mut left = script_block("b1", "narration", "ab", "");
    let mut right = script_block("b1", "narration", "a", "b");
    left.paren = String::new();
    right.paren = String::new();

    assert_ne!(base_rev(&[left], &[]), base_rev(&[right], &[]));
}
