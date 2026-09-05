use super::*;
use crate::features::audiobook::models::AudioRecord;
use crate::features::audiobook::models::MixSettings;
use crate::features::audiobook::models::SpeakerVoice;
use crate::features::project::models::ProjectErrorCode;
use tempfile::TempDir;

#[test]
fn reads_no_book_without_any_file() {
    let dir = TempDir::new().unwrap();

    assert_eq!(AudiobookFiles::new(dir.path()).read_book().unwrap(), None);
}

#[test]
fn reads_the_config_and_every_unit_file() {
    let dir = TempDir::new().unwrap();
    let files = AudiobookFiles::new(dir.path());
    let mut config = AudiobookConfig::default();
    config.voices.insert(
        "narr".to_string(),
        SpeakerVoice {
            voice: Some(3),
            speed: 1.2,
        },
    );
    files.write_config(&config).unwrap();
    let mut unit = UnitAudioFile::default();
    unit.audio.insert("b1".to_string(), AudioRecord::default());
    files.write_unit("U01", &unit).unwrap();
    std::fs::write(dir.path().join("audiobook/units/bad name.json"), b"{}").unwrap();
    std::fs::write(dir.path().join("audiobook/units/notes.txt"), b"x").unwrap();

    let book = files.read_book().unwrap().unwrap();

    assert_eq!(book.voices, config.voices);
    assert_eq!(book.mix, MixSettings::default());
    assert_eq!(book.units.keys().collect::<Vec<_>>(), vec!["U01"]);
    assert_eq!(book.units["U01"].meta, None);
    assert!(book.units["U01"].audio.contains_key("b1"));
}

#[test]
fn reads_a_missing_unit_as_defaults() {
    let dir = TempDir::new().unwrap();

    let unit = AudiobookFiles::new(dir.path()).read_unit("U09").unwrap();

    assert_eq!(unit, UnitAudioFile::default());
}

#[test]
fn rejects_unsafe_unit_and_block_ids() {
    let dir = TempDir::new().unwrap();
    let files = AudiobookFiles::new(dir.path());

    for (unit_id, block_id) in [("../x", "b1"), ("U01", "../b"), ("U01", ""), ("", "b1")] {
        let error = files.segment_path(unit_id, block_id).unwrap_err();
        assert_eq!(
            error.code,
            ProjectErrorCode::InvalidInput,
            "{unit_id}/{block_id}"
        );
    }
    assert!(files.read_unit("a/b").is_err());
    assert_eq!(
        files.segment_path("U01", "b-1_x").unwrap(),
        dir.path().join("audiobook/audio/U01/b-1_x.wav")
    );
    assert_eq!(
        files.segment_srt_path("U01", "b-1_x").unwrap(),
        dir.path().join("audiobook/audio/U01/b-1_x.srt")
    );
    assert!(files.segment_srt_path("U01", "../b").is_err());
}

#[test]
fn config_updates_keep_the_other_settings() {
    let dir = TempDir::new().unwrap();
    let files = AudiobookFiles::new(dir.path());
    let mix = MixSettings {
        sentence: 1.0,
        ..MixSettings::default()
    };

    files.update_config(|config| config.mix = mix).unwrap();
    files
        .update_config(|config| {
            config
                .voices
                .insert("narr".to_string(), SpeakerVoice::default());
        })
        .unwrap();

    let stored = files.read_config().unwrap().unwrap();
    assert_eq!(stored.mix, mix);
    assert!(stored.voices.contains_key("narr"));
    assert_eq!(files.mix().unwrap(), mix);
}

#[test]
fn stored_mix_is_clamped_when_read() {
    let dir = TempDir::new().unwrap();
    let files = AudiobookFiles::new(dir.path());
    std::fs::create_dir_all(dir.path().join("audiobook")).unwrap();
    std::fs::write(
        files.config_path(),
        br#"{ "voices": {}, "mix": { "sentence": 5 } }"#,
    )
    .unwrap();

    assert_eq!(files.mix().unwrap().sentence, 2.0);
    assert_eq!(files.mix().unwrap().gap, 0.6);
}
