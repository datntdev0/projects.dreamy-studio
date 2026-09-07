use super::*;
use crate::features::audiobook::models::SpeakerVoice;
use crate::testing::audio::audio_block;
use crate::testing::audio::audio_unit;
use crate::testing::audio::pause_block;
use crate::testing::audio::record_for;
use crate::testing::audio::voiced_book;
use crate::testing::audio::with_records;
use crate::testing::script::chapter;
use crate::testing::script::script;
use crate::testing::script::unit;

fn dialogue() -> ScriptBlock {
    ScriptBlock {
        paren: "softly".to_string(),
        ..audio_block("b2", "dialogue", "Hello", "kb-1")
    }
}

#[test]
fn speakers_follow_the_block_type() {
    assert_eq!(
        speaker_of(&audio_block("b", "heading", "T", "")),
        Some("narr")
    );
    assert_eq!(
        speaker_of(&audio_block("b", "narration", "T", "x")),
        Some("narr")
    );
    assert_eq!(
        speaker_of(&audio_block("b", "dialogue", "T", "kb-1")),
        Some("kb-1")
    );
    assert_eq!(speaker_of(&audio_block("b", "dialogue", "T", "")), None);
}

#[test]
fn only_voiced_blocks_with_text_are_segments() {
    let unit = audio_unit(
        "U01",
        vec![
            audio_block("b1", "narration", "Text", ""),
            audio_block("b2", "note", "Hint", ""),
            pause_block("b3", 500),
            audio_block("b4", "dialogue", "  ", "kb-1"),
            audio_block("b5", "heading", "One", ""),
        ],
    );

    let ids: Vec<&str> = voiced_blocks(&unit)
        .map(|block| block.id.as_str())
        .collect();

    assert_eq!(ids, vec!["b1", "b5"]);
}

fn book_with(record: AudioRecord) -> Audiobook {
    with_records(voiced_book(&["kb-1"]), "U01", vec![("b2", record)])
}

#[test]
fn segment_states_track_every_stale_reason_and_flags() {
    let block = dialogue();
    let fresh = record_for(&block, Some("kb-1"), 1.0);

    assert_eq!(
        segment_state(&voiced_book(&["kb-1"]), "U01", &block),
        SegmentState::None
    );
    assert_eq!(
        segment_state(&book_with(fresh.clone()), "U01", &block),
        SegmentState::Done
    );
    let changes = [
        AudioRecord {
            text: "Hi".to_string(),
            ..fresh.clone()
        },
        AudioRecord {
            speaker: Some("narr".to_string()),
            ..fresh.clone()
        },
        AudioRecord {
            voice: Some(6),
            ..fresh.clone()
        },
        AudioRecord {
            speed: 1.1,
            ..fresh.clone()
        },
        AudioRecord {
            paren: String::new(),
            ..fresh.clone()
        },
    ];
    for record in changes {
        assert_eq!(
            segment_state(&book_with(record), "U01", &block),
            SegmentState::Stale
        );
    }
    let flagged = AudioRecord {
        flag: "noise".to_string(),
        ..fresh
    };
    assert_eq!(
        segment_state(&book_with(flagged), "U01", &block),
        SegmentState::Flag
    );
}

#[test]
fn voices_without_config_expect_no_voice_at_natural_speed() {
    let block = audio_block("b1", "narration", "Text", "");
    let record = AudioRecord {
        voice: None,
        ..record_for(&block, Some("narr"), 1.0)
    };
    let mut book = with_records(voiced_book(&[]), "U01", vec![("b1", record)]);

    assert_eq!(segment_state(&book, "U01", &block), SegmentState::Done);
    book.voices.insert(
        "narr".to_string(),
        SpeakerVoice {
            voice: None,
            speed: 1.2,
        },
    );
    assert_eq!(segment_state(&book, "U01", &block), SegmentState::Stale);
}

fn two_segment_unit(id: &str) -> ScriptUnit {
    audio_unit(
        id,
        vec![
            audio_block("b1", "narration", "One", ""),
            audio_block("b2", "dialogue", "Two", "kb-1"),
        ],
    )
}

fn record(unit: &ScriptUnit, index: usize, speaker: &str) -> AudioRecord {
    record_for(&unit.blocks.as_ref().unwrap()[index], Some(speaker), 1.5)
}

#[test]
fn unit_stats_count_done_stale_and_missing_segments() {
    let first = two_segment_unit("U01");
    let stale = AudioRecord {
        flag: "x".to_string(),
        ..record(&first, 1, "kb-1")
    };
    let book = with_records(
        voiced_book(&["narr", "kb-1"]),
        "U01",
        vec![("b1", record(&first, 0, "narr")), ("b2", stale)],
    );

    let stat = unit_stat(&book, &first);

    assert_eq!((stat.total, stat.done, stat.stale, stat.none), (2, 1, 1, 0));
    assert_eq!(stat.dur, 3.0);
    assert_eq!(stat.state, UnitState::Stale);
    assert_eq!(unit_stat(&book, &unit("U02", 2)).state, UnitState::None);
}

#[test]
fn progress_reports_idle_doing_done_and_stale() {
    let first = two_segment_unit("U01");
    let second = two_segment_unit("U02");
    let plan = script(vec![first.clone(), second.clone()]);
    let base = voiced_book(&["narr", "kb-1"]);
    let done_first = with_records(
        base.clone(),
        "U01",
        vec![
            ("b1", record(&first, 0, "narr")),
            ("b2", record(&first, 1, "kb-1")),
        ],
    );
    let doing_second = with_records(
        done_first.clone(),
        "U02",
        vec![("b1", record(&second, 0, "narr"))],
    );
    let done_all = with_records(
        doing_second.clone(),
        "U02",
        vec![("b2", record(&second, 1, "kb-1"))],
    );
    let mut stale = done_all.clone();
    stale.voices.get_mut("narr").unwrap().speed = 1.3;

    let idle = audiobook_progress(&base, &[], &plan);
    let doing = audiobook_progress(&doing_second, &[], &plan);
    let done = audiobook_progress(&done_all, &[], &plan);
    let review = audiobook_progress(&stale, &[], &plan);

    assert_eq!((idle.state.as_str(), idle.done, idle.total), ("idle", 0, 2));
    assert_eq!(idle.note, "0/2 chapters");
    assert_eq!((doing.state.as_str(), doing.done), ("doing", 1));
    assert_eq!((done.state.as_str(), done.done), ("done", 2));
    assert_eq!(done.note, "2/2 chapters");
    assert_eq!((review.state.as_str(), review.done), ("stale", 0));
    assert_eq!(review.note, "0/2 chapters · 2 need review");
    assert_eq!(review.id, AUDIOBOOK_MODULE);
}

#[test]
fn progress_counts_derived_chapters_that_have_no_stored_unit() {
    let linked = ScriptUnit {
        chapter_id: Some("c1".to_string()),
        ..two_segment_unit("c1")
    };
    let plan = script(vec![linked.clone()]);
    let chapters = [chapter("c1", 1), chapter("c2", 2), chapter("c3", 3)];
    let book = with_records(
        voiced_book(&["narr", "kb-1"]),
        "c1",
        vec![
            ("b1", record(&linked, 0, "narr")),
            ("b2", record(&linked, 1, "kb-1")),
        ],
    );

    let progress = audiobook_progress(&book, &chapters, &plan);

    assert_eq!(
        (progress.state.as_str(), progress.done, progress.total),
        ("doing", 1, 3)
    );
    assert_eq!(progress.note, "1/3 chapters");
}
