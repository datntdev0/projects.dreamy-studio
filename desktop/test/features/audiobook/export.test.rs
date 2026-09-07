use super::*;
use crate::features::audiobook::audio::decode_wav;
use crate::features::audiobook::models::AudiobookConfig;
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
use crate::testing::script::chapter;
use tempfile::TempDir;

const RATE: u32 = 8_000;

fn mix() -> MixSettings {
    MixSettings {
        gap: 0.5,
        intro: 1.0,
        outro: 2.0,
        vol: -6.0,
        sentence: 0.3,
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

fn sequel() -> ScriptUnit {
    ScriptUnit {
        no: 2,
        title: "Chapter Two".to_string(),
        ..audio_unit(
            "U02",
            vec![
                audio_block("c1", "narration", "Sun. Wind.", ""),
                audio_block("c2", "narration", "End.", ""),
            ],
        )
    }
}

type Durations = Vec<(&'static str, &'static str, f64)>;

fn durations_of(unit_id: &str) -> Durations {
    match unit_id {
        "U01" => vec![
            ("b1", "narr", 1.0),
            ("b2", "narr", 2.0),
            ("b3", "kb-1", 0.5),
        ],
        _ => vec![("c1", "narr", 1.5), ("c2", "narr", 1.0)],
    }
}

fn add_records(book: Audiobook, unit: &ScriptUnit) -> Audiobook {
    let blocks = unit.blocks.as_ref().unwrap();
    let records = durations_of(&unit.id)
        .iter()
        .map(|(id, speaker, dur)| {
            let block = blocks.iter().find(|block| block.id == *id).unwrap();
            (*id, record_for(block, Some(speaker), *dur))
        })
        .collect();
    with_records(book, &unit.id, records)
}

fn done_book(units: &[ScriptUnit]) -> Audiobook {
    let book = Audiobook {
        mix: mix(),
        ..voiced_book(&["narr", "kb-1"])
    };
    units.iter().fold(book, add_records)
}

fn spans(timeline: &Timeline) -> Vec<(&str, f64, f64)> {
    timeline
        .slots
        .iter()
        .map(|slot| (slot.block_id.as_str(), slot.start, slot.end))
        .collect()
}

#[test]
fn the_timeline_adds_intro_gaps_pauses_and_outro() {
    let units = [story()];

    let timeline = timeline(&done_book(&units), &units, &mix());

    assert_eq!(
        spans(&timeline),
        vec![("b1", 1.0, 2.0), ("b2", 3.0, 5.0), ("b3", 5.5, 6.0)]
    );
    assert_eq!(timeline.total, 8.0);
}

#[test]
fn chapters_are_joined_with_outro_and_intro() {
    let units = [story(), sequel()];

    let timeline = timeline(&done_book(&units), &units, &mix());

    assert_eq!(
        spans(&timeline),
        vec![
            ("b1", 1.0, 2.0),
            ("b2", 3.0, 5.0),
            ("b3", 5.5, 6.0),
            ("c1", 9.0, 10.5),
            ("c2", 11.0, 12.0),
        ]
    );
    assert_eq!(timeline.slots[3].unit_id, "U02");
    assert_eq!(timeline.total, 14.0);
}

#[test]
fn export_names_use_the_unit_number_or_the_project_range() {
    let first = story();
    let second = sequel();

    assert_eq!(
        export_stem("My Book", std::slice::from_ref(&first)),
        "1-chapter-one-start"
    );
    assert_eq!(
        export_stem("My Book!", &[first.clone(), second.clone()]),
        "my-book-1-2"
    );
    assert_eq!(export_stem("??", &[first, second]), "audiobook-1-2");
    assert_eq!(slug("  Chương Một!! "), "chương-một");
    assert_eq!(slug("?!"), "unit");
    assert_eq!(slug(&"a".repeat(80)).len(), 60);
}

#[test]
fn export_requires_every_segment_to_be_fresh() {
    let unit = story();
    let mut book = done_book(std::slice::from_ref(&unit));

    assert!(require_complete(&book, &unit).is_ok());
    book.units.get_mut("U01").unwrap().audio.remove("b2");
    let missing = require_complete(&book, &unit).unwrap_err();
    let empty =
        require_complete(&book, &audio_unit("U02", vec![pause_block("p", 10)])).unwrap_err();

    assert_eq!(missing.code, ProjectErrorCode::InvalidInput);
    assert!(missing.detail.contains("1 of 3"), "{}", missing.detail);
    assert!(
        missing.detail.contains("Chapter One: Start"),
        "{}",
        missing.detail
    );
    assert_eq!(empty.code, ProjectErrorCode::InvalidInput);
}

fn write_project(dir: &Path, units: &[ScriptUnit], book: &Audiobook) {
    let scripts = ScriptFiles::new(dir);
    let mut heads = Vec::new();
    for unit in units {
        let (head, body) = unit.clone().split();
        scripts.write_unit(&unit.id, &body).unwrap();
        heads.push(head);
    }
    scripts
        .write_script(&ScriptFile {
            units: heads,
            ..ScriptFile::default()
        })
        .unwrap();
    let files = AudiobookFiles::new(dir);
    files
        .write_config(&AudiobookConfig {
            voices: book.voices.clone(),
            mix: book.mix,
        })
        .unwrap();
    for unit in units {
        write_unit_audio(&files, unit, book);
    }
}

fn write_unit_audio(files: &AudiobookFiles, unit: &ScriptUnit, book: &Audiobook) {
    let stored = UnitAudioFile {
        audio: book.units[&unit.id].audio.clone(),
    };
    files.write_unit(&unit.id, &stored).unwrap();
    for (id, _, dur) in durations_of(&unit.id) {
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

fn ids(values: &[&str]) -> Vec<String> {
    values.iter().map(|value| value.to_string()).collect()
}

#[test]
fn single_unit_export_writes_wav_and_srt() {
    let dir = TempDir::new().unwrap();
    let units = [story()];
    write_project(dir.path(), &units, &done_book(&units));

    let (wav, srt) = export_units(dir.path(), "Book", &[], &ids(&["U01"])).unwrap();

    assert_eq!(
        wav,
        dir.path().join("audiobook/exports/1-chapter-one-start.wav")
    );
    assert_eq!(
        srt,
        dir.path().join("audiobook/exports/1-chapter-one-start.srt")
    );
    let decoded = decode_wav(&wav).unwrap();
    assert_eq!((decoded.sample_rate, decoded.channels), (RATE, 1));
    assert_eq!(decoded.samples.len(), 8 * RATE as usize);
    assert_eq!(peak(&decoded.samples, 0.0, 0.99), 0.0);
    assert!((peak(&decoded.samples, 1.0, 2.0) - 0.25).abs() < 0.01);
    assert_eq!(peak(&decoded.samples, 2.01, 2.99), 0.0);
    assert!((peak(&decoded.samples, 3.0, 5.0) - 0.25).abs() < 0.01);
    assert_eq!(peak(&decoded.samples, 5.01, 5.49), 0.0);
    assert!(peak(&decoded.samples, 5.5, 6.0) > 0.2);
    assert_eq!(peak(&decoded.samples, 6.01, 8.0), 0.0);
    assert_eq!(
        fs::read_to_string(srt).unwrap(),
        "1\n00:00:01,000 --> 00:00:02,000\nChapter one\n\n\
         2\n00:00:03,000 --> 00:00:05,000\nIt rained.\n\n\
         3\n00:00:05,500 --> 00:00:06,000\nHi\n\n"
    );
}

#[test]
fn chapters_are_exported_together_in_script_order() {
    let dir = TempDir::new().unwrap();
    let units = [story(), sequel()];
    write_project(dir.path(), &units, &done_book(&units));
    let files = AudiobookFiles::new(dir.path());
    fs::write(
        files.segment_srt_path("U02", "c1").unwrap(),
        "1\n00:00:00,000 --> 00:00:00,600\nSun.\n\n2\n00:00:00,900 --> 00:00:01,500\nWind.\n\n",
    )
    .unwrap();

    let (wav, srt) = export_units(dir.path(), "My Book", &[], &ids(&["U02", "U01"])).unwrap();

    assert_eq!(wav, dir.path().join("audiobook/exports/my-book-1-2.wav"));
    assert!(srt.ends_with("my-book-1-2.srt"));
    let decoded = decode_wav(&wav).unwrap();
    assert_eq!(decoded.samples.len(), 14 * RATE as usize);
    assert_eq!(peak(&decoded.samples, 6.01, 8.99), 0.0);
    assert!((peak(&decoded.samples, 9.0, 10.5) - 0.25).abs() < 0.01);
    let text = fs::read_to_string(srt).unwrap();
    assert!(
        text.ends_with(
            "3\n00:00:05,500 --> 00:00:06,000\nHi\n\n\
             4\n00:00:09,000 --> 00:00:09,600\nSun.\n\n\
             5\n00:00:09,900 --> 00:00:10,500\nWind.\n\n\
             6\n00:00:11,000 --> 00:00:12,000\nEnd.\n\n"
        ),
        "{text}"
    );
}

#[test]
fn export_validates_the_selection() {
    let dir = TempDir::new().unwrap();
    let units = [story(), sequel()];
    write_project(dir.path(), &units, &done_book(&units));

    let empty = export_units(dir.path(), "Book", &[], &[]).unwrap_err();
    let twice = export_units(dir.path(), "Book", &[], &ids(&["U01", "U01"])).unwrap_err();
    let unsafe_id = export_units(dir.path(), "Book", &[], &ids(&["../U"])).unwrap_err();
    let unknown = export_units(dir.path(), "Book", &[], &ids(&["U01", "U77"])).unwrap_err();

    for error in [empty, twice, unsafe_id] {
        assert_eq!(error.code, ProjectErrorCode::InvalidInput);
    }
    assert_eq!(unknown.code, ProjectErrorCode::NotFound);
    assert!(!dir.path().join("audiobook/exports").exists());
}

#[test]
fn export_refuses_any_stale_chapter() {
    let dir = TempDir::new().unwrap();
    let units = [story(), sequel()];
    let mut book = done_book(&units);
    book.units.get_mut("U02").unwrap().audio.remove("c2");
    write_project(dir.path(), &units, &book);

    let stale = export_units(dir.path(), "Book", &[], &ids(&["U01", "U02"])).unwrap_err();

    assert_eq!(stale.code, ProjectErrorCode::InvalidInput);
    assert!(stale.detail.contains("Chapter Two"), "{}", stale.detail);
    assert!(!dir.path().join("audiobook/exports").exists());
}

#[test]
fn chapter_units_take_their_number_and_title_from_the_derived_chapters() {
    let dir = TempDir::new().unwrap();
    let stored = ScriptUnit {
        id: "U01".to_string(),
        chapter_id: Some("U01".to_string()),
        no: 0,
        ch: None,
        title: String::new(),
        ..story()
    };
    let units = [stored.clone()];
    write_project(dir.path(), &units, &done_book(&units));
    let chapters = [ProjectChapter {
        id: "U01".to_string(),
        seq: 7,
        title: "Seven Winds".to_string(),
    }];

    let resolved = read_script_units(dir.path(), &chapters, &ids(&["U01"])).unwrap();
    let (wav, _) = export_units(dir.path(), "Book", &chapters, &ids(&["U01"])).unwrap();

    assert_eq!((resolved[0].no, resolved[0].ch), (7, Some(7)));
    assert_eq!(resolved[0].title, "Seven Winds");
    assert_eq!(wav, dir.path().join("audiobook/exports/7-seven-winds.wav"));
}

#[test]
fn chapter_units_are_exported_in_chapter_order() {
    let dir = TempDir::new().unwrap();
    let first = ScriptUnit {
        chapter_id: Some("U01".to_string()),
        ..story()
    };
    let second = ScriptUnit {
        chapter_id: Some("U02".to_string()),
        ..sequel()
    };
    let units = [second.clone(), first.clone()];
    write_project(dir.path(), &units, &done_book(&units));
    let chapters = [chapter("U01", 4), chapter("U02", 9)];

    let resolved = read_script_units(dir.path(), &chapters, &ids(&["U01", "U02"])).unwrap();

    assert_eq!(
        resolved.iter().map(|unit| unit.no).collect::<Vec<_>>(),
        vec![4, 9]
    );
}
