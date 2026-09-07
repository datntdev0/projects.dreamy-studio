use super::*;
use crate::testing::assistant::script_block;
use serde_json::json;

const ALL_TYPES: [&str; 7] = [
    "heading",
    "narration",
    "dialogue",
    "pause",
    "note",
    "scene",
    "action",
];

fn cast() -> Vec<CastMember> {
    [
        ("narr", "Narrator"),
        ("kb-1", "Lin Mo"),
        ("x1", "Tea woman"),
    ]
    .iter()
    .map(|(id, name)| CastMember {
        id: id.to_string(),
        name: name.to_string(),
        kind: "kb".to_string(),
        c: 0,
    })
    .collect()
}

fn paragraphs() -> BTreeMap<i64, usize> {
    BTreeMap::from([(1, 3)])
}

fn member(reference: &str, name: &str) -> DraftMember {
    DraftMember {
        id: reference.to_string(),
        name: name.to_string(),
    }
}

fn run(raw: Value, members: &[DraftMember], current: &[ScriptBlock]) -> Result<Plan, String> {
    run_with(raw, members, current, &ALL_TYPES, Some(&paragraphs()))
}

fn run_with(
    raw: Value,
    members: &[DraftMember],
    current: &[ScriptBlock],
    allowed: &[&str],
    counts: Option<&BTreeMap<i64, usize>>,
) -> Result<Plan, String> {
    let allowed: Vec<String> = allowed.iter().map(|kind| kind.to_string()).collect();
    let cast = cast();
    let rules = Rules {
        allowed: &allowed,
        cast: &cast,
        paragraphs: counts,
    };
    build(raw.as_array().unwrap(), members, &rules, current)
}

fn single(block: Value) -> Plan {
    run(json!([block]), &[], &[]).unwrap()
}

fn reason_of(block: Value) -> String {
    let plan = run(
        json!([block, { "type": "narration", "text": "ok" }]),
        &[],
        &[],
    )
    .unwrap();
    assert_eq!(plan.blocks.len(), 1);
    assert_eq!(plan.dropped.len(), 1);
    assert_eq!(plan.dropped[0].index, 0);
    plan.dropped[0].reason.clone()
}

#[test]
fn a_narration_block_gets_the_frontend_defaults() {
    let block = &single(json!({ "type": "narration", "text": "  The gate opened.  " })).blocks[0];

    assert_eq!(block.kind, "narration");
    assert_eq!(block.text, "The gate opened.");
    assert_eq!(block.who, "");
    assert_eq!(block.paren, "");
    assert_eq!(block.ms, 0);
    assert_eq!(block.loc, "");
    assert_eq!(block.time, "MORNING");
    assert_eq!(block.id, None);
    assert!(!block.kept);
}

#[test]
fn a_dialogue_block_keeps_its_speaker_and_parenthetical() {
    let block = &single(json!({
        "type": "dialogue",
        "text": "Who goes there?",
        "who": "kb-1",
        "paren": " whispering "
    }))
    .blocks[0];

    assert_eq!(block.who, "kb-1");
    assert_eq!(block.paren, "whispering");
}

#[test]
fn the_narrator_and_extra_cast_ids_are_valid_speakers() {
    let plan = run(
        json!([
            { "type": "dialogue", "text": "a", "who": "narr" },
            { "type": "dialogue", "text": "b", "who": "x1" },
            { "type": "dialogue", "text": "c", "who": "new1" }
        ]),
        &[member("new1", "Gatekeeper")],
        &[],
    )
    .unwrap();

    let who: Vec<&str> = plan.blocks.iter().map(|block| block.who.as_str()).collect();
    assert_eq!(who, ["narr", "x1", "new1"]);
    assert_eq!(plan.members, vec![member("new1", "Gatekeeper")]);
}

#[test]
fn an_unknown_speaker_drops_the_block_with_a_hint() {
    let reason = reason_of(json!({ "type": "dialogue", "text": "Hi", "who": "ghost" }));

    assert!(reason.contains("unknown speaker 'ghost'"));
    assert!(reason.contains("extraCast"));
}

#[test]
fn a_dialogue_without_a_speaker_is_kept_unresolved() {
    let block = &single(json!({ "type": "dialogue", "text": "Hm." })).blocks[0];

    assert_eq!(block.who, "");
}

#[test]
fn types_without_a_speaker_clear_who_and_paren() {
    let block = &single(json!({
        "type": "narration",
        "text": "text",
        "who": "kb-1",
        "paren": "softly"
    }))
    .blocks[0];

    assert_eq!(block.who, "");
    assert_eq!(block.paren, "");
}

#[test]
fn unknown_and_disallowed_types_are_dropped() {
    assert_eq!(
        reason_of(json!({ "type": "poem", "text": "x" })),
        "unknown block type 'poem'"
    );
    let plan = run_with(
        json!([{ "type": "scene" }, { "type": "narration", "text": "ok" }]),
        &[],
        &[],
        &["narration", "dialogue"],
        None,
    )
    .unwrap();

    assert_eq!(plan.dropped.len(), 1);
    assert_eq!(
        plan.dropped[0].reason,
        "block type 'scene' is not allowed in this script; use one of: narration, dialogue"
    );
}

#[test]
fn blocks_with_text_need_it_and_the_others_clear_it() {
    assert_eq!(
        reason_of(json!({ "type": "narration", "text": "   " })),
        "a narration block needs text"
    );
    assert_eq!(
        reason_of(json!({ "type": "heading" })),
        "a heading block needs text"
    );
    let plan = single(json!({ "type": "pause", "text": "ignored" }));

    assert_eq!(plan.blocks[0].text, "");
}

#[test]
fn a_pause_defaults_and_clamps_its_length() {
    let plan = run(
        json!([
            { "type": "pause" },
            { "type": "pause", "ms": 1200 },
            { "type": "pause", "ms": 99999 },
            { "type": "pause", "ms": -5 },
            { "type": "narration", "text": "x", "ms": 700 }
        ]),
        &[],
        &[],
    )
    .unwrap();

    let ms: Vec<i64> = plan.blocks.iter().map(|block| block.ms).collect();
    assert_eq!(ms, [800, 1200, 30_000, 0, 0]);
}

#[test]
fn a_scene_keeps_its_location_and_normalizes_its_time() {
    let plan = run(
        json!([
            { "type": "scene", "loc": " Gate ", "time": "night" },
            { "type": "scene", "loc": "Hall", "time": "teatime" },
            { "type": "scene", "loc": "Yard" },
            { "type": "action", "text": "He runs.", "loc": "ignored", "time": "NIGHT" }
        ]),
        &[],
        &[],
    )
    .unwrap();

    let scenes: Vec<(&str, &str)> = plan
        .blocks
        .iter()
        .map(|block| (block.loc.as_str(), block.time.as_str()))
        .collect();
    assert_eq!(
        scenes,
        [
            ("Gate", "NIGHT"),
            ("Hall", "MORNING"),
            ("Yard", "MORNING"),
            ("", "MORNING")
        ]
    );
    assert_eq!(
        plan.warnings,
        vec!["1 scene time(s) were reset to MORNING".to_string()]
    );
}

#[test]
fn source_references_are_checked_against_the_source_paragraphs() {
    let plan = single(json!({
        "type": "narration",
        "text": "text",
        "refs": ["1.2", " 1.3 ", "1.4", "1.0", "2.1", "bad", "1.2", ""]
    }));

    assert_eq!(plan.blocks[0].refs, ["1.2", "1.3"]);
    assert_eq!(
        plan.warnings,
        vec!["4 source reference(s) were removed because they point to no paragraph".to_string()]
    );
}

#[test]
fn without_source_text_every_reference_is_removed() {
    let plan = run_with(
        json!([{ "type": "narration", "text": "text", "refs": ["1.1"] }]),
        &[],
        &[],
        &ALL_TYPES,
        None,
    )
    .unwrap();

    assert!(plan.blocks[0].refs.is_empty());
    assert_eq!(
        plan.warnings,
        vec![
            "1 source reference(s) were removed because the project has no linked novel text"
                .to_string()
        ]
    );
}

#[test]
fn present_characters_must_be_in_the_cast() {
    let plan = run(
        json!([{
            "type": "scene",
            "chars": ["kb-1", "ghost", "new1", "kb-1"]
        }]),
        &[member("new1", "Gatekeeper")],
        &[],
    )
    .unwrap();

    assert_eq!(plan.blocks[0].chars, ["kb-1", "new1"]);
    assert_eq!(
        plan.warnings,
        vec!["1 character id(s) were removed because they are not in the cast".to_string()]
    );
}

#[test]
fn identical_current_blocks_keep_their_ids_once() {
    let current = vec![
        script_block("b1", "narration", "The gate opened.", ""),
        script_block("b2", "dialogue", "Who goes there?", "kb-1"),
    ];

    let plan = run(
        json!([
            { "type": "narration", "text": "The gate opened." },
            { "type": "narration", "text": "The gate opened." },
            { "type": "dialogue", "text": "Who goes there?", "who": "kb-1" },
            { "type": "dialogue", "text": "Who goes there?", "who": "x1" }
        ]),
        &[],
        &current,
    )
    .unwrap();

    let ids: Vec<Option<&str>> = plan
        .blocks
        .iter()
        .map(|block| block.id.as_deref())
        .collect();
    assert_eq!(ids, [Some("b1"), None, Some("b2"), None]);
    let kept: Vec<bool> = plan.blocks.iter().map(|block| block.kept).collect();
    assert_eq!(kept, [true, false, true, false]);
}

#[test]
fn pauses_and_scenes_keep_ids_only_when_their_own_fields_match() {
    let mut pause = script_block("p1", "pause", "", "");
    pause.ms = 500;
    let mut scene = script_block("s1", "scene", "", "");
    scene.loc = "Gate".to_string();
    scene.time = "NIGHT".to_string();
    let current = vec![pause, scene];

    let plan = run(
        json!([
            { "type": "pause", "ms": 900 },
            { "type": "pause", "ms": 500 },
            { "type": "scene", "loc": "Hall", "time": "NIGHT" },
            { "type": "scene", "loc": "Gate", "time": "NIGHT" }
        ]),
        &[],
        &current,
    )
    .unwrap();

    let ids: Vec<Option<&str>> = plan
        .blocks
        .iter()
        .map(|block| block.id.as_deref())
        .collect();
    assert_eq!(ids, [None, Some("p1"), None, Some("s1")]);
}

#[test]
fn a_malformed_block_is_dropped_with_its_index() {
    let plan = run(
        json!([
            { "text": "no type" },
            { "type": "narration", "text": "ok", "ms": "slow" },
            { "type": "narration", "text": "fine" }
        ]),
        &[],
        &[],
    )
    .unwrap();

    assert_eq!(plan.blocks.len(), 1);
    let indexes: Vec<usize> = plan.dropped.iter().map(|item| item.index).collect();
    assert_eq!(indexes, [0, 1]);
    assert!(plan.dropped[0].reason.starts_with("the block is invalid"));
}

#[test]
fn nothing_valid_left_is_an_error_listing_the_reasons() {
    let error = run(
        json!([{ "type": "narration" }, { "type": "dialogue", "who": "ghost", "text": "x" }]),
        &[],
        &[],
    )
    .unwrap_err();

    assert!(error.starts_with("no valid block is left. Dropped: block 0: "));
    assert!(error.contains("block 1: unknown speaker 'ghost'"));
}

#[test]
fn the_number_of_blocks_is_bounded() {
    assert_eq!(
        run(json!([]), &[], &[]).unwrap_err(),
        "argument 'blocks' must list at least one block"
    );
    let many: Vec<Value> = (0..=MAX_BLOCKS)
        .map(|_| json!({ "type": "narration", "text": "x" }))
        .collect();

    let error = run(Value::Array(many), &[], &[]).unwrap_err();

    assert_eq!(error, "a draft holds at most 400 blocks, got 401");
}

#[test]
fn unused_members_are_left_out_with_a_warning() {
    let plan = run(
        json!([
            { "type": "dialogue", "text": "a", "who": "new1" },
            { "type": "scene", "chars": ["new3"] }
        ]),
        &[
            member("new1", "Gatekeeper"),
            member("new2", "Cook"),
            member("new3", "Monk"),
        ],
        &[],
    )
    .unwrap();

    let ids: Vec<&str> = plan.members.iter().map(|item| item.id.as_str()).collect();
    assert_eq!(ids, ["new1", "new3"]);
    assert_eq!(
        plan.warnings,
        vec!["the extraCast member 'Cook' speaks in no block and was left out".to_string()]
    );
}

#[test]
fn members_are_parsed_trimmed_and_checked() {
    let members = parse_members(
        &[json!({ "ref": " new1 ", "name": " Gatekeeper " })],
        &cast(),
    )
    .unwrap();

    assert_eq!(members, vec![member("new1", "Gatekeeper")]);
}

#[test]
fn members_may_not_clash_with_the_cast_or_each_other() {
    let clashes = [
        (json!([{ "ref": "kb-1", "name": "Other" }]), "already used"),
        (
            json!([{ "ref": "a", "name": "A" }, { "ref": "a", "name": "B" }]),
            "already used",
        ),
        (
            json!([{ "ref": "n1", "name": "lin mo" }]),
            "already exists in the cast with id 'kb-1'",
        ),
        (
            json!([{ "ref": "a", "name": "Cook" }, { "ref": "b", "name": "COOK" }]),
            "already exists in the cast with id 'a'",
        ),
        (json!([{ "ref": " ", "name": "A" }]), "non-empty"),
        (json!([{ "ref": "a", "name": " " }]), "non-empty"),
        (json!([{ "name": "A" }]), "extraCast[0] is invalid"),
    ];

    for (raw, expected) in clashes {
        let error = parse_members(raw.as_array().unwrap(), &cast()).unwrap_err();
        assert!(error.contains(expected), "{error} lacks {expected}");
    }
}

#[test]
fn reference_chapters_are_collected_from_every_block() {
    let raw = json!([
        { "type": "narration", "text": "a", "refs": ["3.1", " 2.4 ", "bad"] },
        { "type": "narration", "text": "b", "refs": ["3.9"] },
        { "type": "narration", "text": "c" }
    ]);

    let chapters = ref_chapters(raw.as_array().unwrap());

    assert_eq!(chapters.into_iter().collect::<Vec<_>>(), [2, 3]);
}
