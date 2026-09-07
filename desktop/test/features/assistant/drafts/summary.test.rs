use super::*;
use crate::features::audiobook::models::AudioRecord;
use crate::features::audiobook::models::SpeakerVoice;
use crate::features::audiobook::models::UnitAudio;
use std::collections::BTreeMap;

fn block(id: Option<&str>, kind: &str, text: &str, who: &str) -> DraftBlock {
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

fn cast() -> Vec<CastMember> {
    vec![
        CastMember {
            id: "kb-1".to_string(),
            name: "Lin Mo".to_string(),
            kind: "kb".to_string(),
            c: 0,
        },
        CastMember {
            id: "narr".to_string(),
            name: "Narrator".to_string(),
            kind: "narrator".to_string(),
            c: -1,
        },
    ]
}

fn members() -> Vec<DraftMember> {
    vec![DraftMember {
        id: "new1".to_string(),
        name: "Old Gatekeeper".to_string(),
    }]
}

fn book(text: &str) -> Audiobook {
    let record = AudioRecord {
        text: text.to_string(),
        speaker: Some("kb-1".to_string()),
        voice: Some(7),
        speed: 1.0,
        ..AudioRecord::default()
    };
    Audiobook {
        voices: BTreeMap::from([(
            "kb-1".to_string(),
            SpeakerVoice {
                voice: Some(7),
                speed: 1.0,
            },
        )]),
        units: BTreeMap::from([(
            "c1".to_string(),
            UnitAudio {
                audio: BTreeMap::from([("b2".to_string(), record)]),
                meta: None,
            },
        )]),
        ..Audiobook::default()
    }
}

fn drafted() -> Vec<DraftBlock> {
    vec![
        block(Some("b1"), "heading", "Chapter one.", ""),
        block(None, "narration", "The gate opened at dawn.", ""),
        block(None, "dialogue", "Who goes there?", "kb-1"),
        block(None, "dialogue", "A friend.", "new1"),
        block(None, "dialogue", "Hm.", ""),
        block(None, "pause", "", ""),
    ]
}

#[test]
fn stats_count_blocks_words_types_and_kept_blocks() {
    let stats = stats_of(&drafted(), 3);

    assert_eq!(stats.blocks, 6);
    assert_eq!(stats.voiced, 5);
    assert_eq!(stats.words, 2 + 5 + 3 + 2 + 1);
    assert_eq!(stats.narration, 1);
    assert_eq!(stats.dialogue, 3);
    assert_eq!(stats.kept, 1);
    assert_eq!(stats.stale_audio, 3);
}

#[test]
fn speakers_are_listed_in_order_of_appearance_with_their_names() {
    let mut blocks = drafted();
    blocks.push(block(None, "dialogue", "Again.", "kb-1"));

    let speakers = speakers_of(&blocks, &cast(), &members());

    assert_eq!(
        speakers,
        vec![
            Speaker {
                id: "kb-1".to_string(),
                name: "Lin Mo".to_string(),
                blocks: 2,
            },
            Speaker {
                id: "new1".to_string(),
                name: "Old Gatekeeper".to_string(),
                blocks: 1,
            },
        ]
    );
}

#[test]
fn only_dialogue_with_a_speaker_counts_as_speaking() {
    let blocks = vec![
        block(None, "narration", "text", "kb-1"),
        block(None, "dialogue", "line", ""),
    ];

    assert!(speakers_of(&blocks, &cast(), &[]).is_empty());
}

#[test]
fn an_unknown_speaker_falls_back_to_its_id() {
    let blocks = vec![block(None, "dialogue", "line", "ghost")];

    assert_eq!(speakers_of(&blocks, &cast(), &[])[0].name, "ghost");
}

#[test]
fn unresolved_counts_dialogue_without_a_speaker() {
    assert_eq!(unresolved_of(&drafted()), 1);
}

#[test]
fn audio_of_an_unchanged_kept_block_stays_current() {
    let blocks = vec![block(Some("b2"), "dialogue", "Who goes there?", "kb-1")];

    assert_eq!(
        stale_audio(Some(&book("Who goes there?")), "c1", &blocks),
        0
    );
}

#[test]
fn audio_of_a_block_whose_text_changed_is_stale() {
    let blocks = vec![block(Some("b2"), "dialogue", "Who is there?", "kb-1")];

    assert_eq!(
        stale_audio(Some(&book("Who goes there?")), "c1", &blocks),
        1
    );
}

#[test]
fn audio_of_a_block_that_disappears_is_stale() {
    let blocks = vec![block(None, "dialogue", "Who goes there?", "kb-1")];

    assert_eq!(
        stale_audio(Some(&book("Who goes there?")), "c1", &blocks),
        1
    );
}

#[test]
fn units_without_audio_have_no_stale_audio() {
    let blocks = drafted();

    assert_eq!(stale_audio(None, "c1", &blocks), 0);
    assert_eq!(stale_audio(Some(&book("x")), "other", &blocks), 0);
}
