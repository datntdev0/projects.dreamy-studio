use super::*;
use crate::features::audiobook::audio::decode_wav;
use crate::features::audiobook::models::UnitAudioFile;
use crate::features::project::models::ProjectErrorCode;
use crate::features::scripting::models::ScriptFile;
use crate::testing::audio::audio_block;
use crate::testing::audio::audio_unit;
use crate::testing::audio::pause_block;
use crate::testing::audio::record_for;
use crate::testing::audio::tone_wav;
use crate::testing::audio::voiced_book;
use crate::testing::audio::with_records;
use tempfile::TempDir;

const RATE: u32 = 8_000;

fn mix() -> MixSettings {
    MixSettings {
        gap: 0.5,
        intro: 1.0,
        outro: 2.0,
        vol: -6.0,
    }
}

fn story() -> ScriptUnit {
    audio_unit(
        "U01",
        vec![
            audio_block("b1", "heading", "Chapter one", ""),
            pause_block("p1", 500),
            audio_block("b2", "narration", "It rained.", ""),
            audio_block("n1", "note", "Keep calm", ""),
            audio_block("b3", "dialogue", "Hi", "kb-1"),
        ],
    )
}

fn durations() -> [(&'static str, &'static str, f64); 3] {
    [
        ("b1", "narr", 1.0),
        ("b2", "narr", 2.0),
        ("b3", "kb-1", 0.5),
    ]
}

fn done_book(unit: &ScriptUnit) -> Audiobook {
    let blocks = unit.blocks.as_ref().unwrap();
    let records = durations()
        .iter()
        .map(|(id, speaker, dur)| {
            let block = blocks.iter().find(|block| block.id == *id).unwrap();
            (*id, record_for(block, Some(speaker), *dur))
        })
        .collect();
    with_records(voiced_book(&["narr", "kb-1"]), &unit.id, records)
}

#[test]
fn the_timeline_adds_intro_gaps_pauses_and_outro() {
    let unit = story();

    let timeline = timeline(&done_book(&unit), &unit, &mix());

    let spans: Vec<(&str, f64, f64)> = timeline
        .cues
        .iter()
        .map(|cue| (cue.block_id.as_str(), cue.start, cue.end))
        .collect();
    assert_eq!(
        spans,
        vec![("b1", 1.0, 2.0), ("b2", 3.0, 5.0), ("b3", 5.5, 6.0)]
    );
    assert_eq!(timeline.total, 8.0);
}

#[test]
fn subtitles_list_one_cue_per_segment() {
    let unit = story();

    let text = srt_text(&timeline(&done_book(&unit), &unit, &mix()));

    assert_eq!(
        text,
        "1\n00:00:01,000 --> 00:00:02,000\nChapter one\n\n\
         2\n00:00:03,000 --> 00:00:05,000\nIt rained.\n\n\
         3\n00:00:05,500 --> 00:00:06,000\nHi\n\n"
    );
    assert_eq!(srt_time(3725.5), "01:02:05,500");
    assert_eq!(srt_time(-1.0), "00:00:00,000");
}

#[test]
fn export_names_use_the_unit_number_and_a_slug() {
    let unit = story();

    assert_eq!(
        export_name(&unit, ExportFormat::Wav),
        "1-chapter-one-start.wav"
    );
    assert_eq!(slug("  Chương Một!! "), "chương-một");
    assert_eq!(slug("?!"), "unit");
    assert_eq!(slug(&"a".repeat(80)).len(), 60);
}

#[test]
fn export_requires_every_segment_to_be_fresh() {
    let unit = story();
    let mut book = done_book(&unit);

    assert!(require_complete(&book, &unit).is_ok());
    book.units.get_mut("U01").unwrap().audio.remove("b2");
    let missing = require_complete(&book, &unit).unwrap_err();
    let empty =
        require_complete(&book, &audio_unit("U02", vec![pause_block("p", 10)])).unwrap_err();

    assert_eq!(missing.code, ProjectErrorCode::InvalidInput);
    assert!(missing.detail.contains("1 of 3"), "{}", missing.detail);
    assert_eq!(empty.code, ProjectErrorCode::InvalidInput);
}

fn write_project(dir: &Path, unit: &ScriptUnit, book: &Audiobook) {
    let (head, body) = unit.clone().split();
    let scripts = ScriptFiles::new(dir);
    scripts
        .write_script(&ScriptFile {
            units: vec![head],
            ..ScriptFile::default()
        })
        .unwrap();
    scripts.write_unit(&unit.id, &body).unwrap();
    let files = AudiobookFiles::new(dir);
    files
        .write_config(&crate::features::audiobook::models::AudiobookConfig {
            voices: book.voices.clone(),
        })
        .unwrap();
    let stored = UnitAudioFile {
        audio: book.units[&unit.id].audio.clone(),
        mix: mix(),
    };
    files.write_unit(&unit.id, &stored).unwrap();
    for (id, _, dur) in durations() {
        let path = files.segment_path(&unit.id, id).unwrap();
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, tone_wav(RATE, 1, dur)).unwrap();
    }
}

fn peak(samples: &[f32], from: f64, to: f64) -> f32 {
    let start = (from * f64::from(RATE)) as usize;
    let end = (to * f64::from(RATE)) as usize;
    samples[start..end]
        .iter()
        .fold(0.0_f32, |high, sample| high.max(sample.abs()))
}

#[test]
fn wav_export_mixes_segments_on_the_timeline_with_gain() {
    let dir = TempDir::new().unwrap();
    let unit = story();
    write_project(dir.path(), &unit, &done_book(&unit));

    let path = export_unit(dir.path(), "U01", ExportFormat::Wav).unwrap();

    assert_eq!(
        path,
        dir.path().join("audiobook/exports/1-chapter-one-start.wav")
    );
    let decoded = decode_wav(&path).unwrap();
    assert_eq!((decoded.sample_rate, decoded.channels), (RATE, 1));
    assert_eq!(decoded.samples.len(), 8 * RATE as usize);
    assert_eq!(peak(&decoded.samples, 0.0, 0.99), 0.0);
    assert!((peak(&decoded.samples, 1.0, 2.0) - 0.25).abs() < 0.01);
    assert_eq!(peak(&decoded.samples, 2.01, 2.99), 0.0);
    assert!((peak(&decoded.samples, 3.0, 5.0) - 0.25).abs() < 0.01);
    assert_eq!(peak(&decoded.samples, 5.01, 5.49), 0.0);
    assert!(peak(&decoded.samples, 5.5, 6.0) > 0.2);
    assert_eq!(peak(&decoded.samples, 6.01, 8.0), 0.0);
}

#[test]
fn srt_export_writes_the_subtitles_next_to_the_audio() {
    let dir = TempDir::new().unwrap();
    let unit = story();
    write_project(dir.path(), &unit, &done_book(&unit));

    let path = export_unit(dir.path(), "U01", ExportFormat::Srt).unwrap();

    assert!(path.ends_with("1-chapter-one-start.srt"));
    let text = fs::read_to_string(path).unwrap();
    assert!(text.starts_with("1\n00:00:01,000 --> 00:00:02,000\nChapter one\n"));
}

#[test]
fn export_refuses_stale_segments_and_unknown_units() {
    let dir = TempDir::new().unwrap();
    let unit = story();
    let mut book = done_book(&unit);
    book.voices.get_mut("kb-1").unwrap().voice = Some(9);
    write_project(dir.path(), &unit, &book);

    let stale = export_unit(dir.path(), "U01", ExportFormat::Wav).unwrap_err();
    let unknown = export_unit(dir.path(), "U77", ExportFormat::Srt).unwrap_err();

    assert_eq!(stale.code, ProjectErrorCode::InvalidInput);
    assert_eq!(unknown.code, ProjectErrorCode::NotFound);
    assert!(!dir.path().join("audiobook/exports").exists());
}
