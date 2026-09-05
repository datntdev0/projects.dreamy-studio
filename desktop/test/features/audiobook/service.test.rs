use super::*;
use crate::features::audiobook::models::SpeakerVoice;
use crate::features::project::models::ProjectErrorCode;
use crate::testing::audio::FakeVoice;
use crate::testing::audio::ffmpeg_available;
use crate::testing::audio::segment_request;
use crate::testing::project::create_project;
use crate::testing::project::project_workspace;
use std::fs;
use std::path::PathBuf;
use tempfile::TempDir;

fn fixture() -> (TempDir, AudiobookWorkspace, i64) {
    let (dir, projects) = project_workspace();
    let id = create_project(&projects);
    (dir, AudiobookWorkspace::new(projects), id)
}

fn audiobook_dir(dir: &TempDir, id: i64) -> PathBuf {
    dir.path()
        .join("projects")
        .join(id.to_string())
        .join("audiobook")
}

#[test]
fn returns_none_without_stored_audio() {
    let (_dir, audiobook, id) = fixture();

    assert_eq!(audiobook.get(id).unwrap(), None);
    assert_eq!(
        audiobook.get(999).unwrap_err().code,
        ProjectErrorCode::NotFound
    );
}

#[test]
fn unit_get_returns_defaults_for_a_new_unit() {
    let (_dir, audiobook, id) = fixture();

    let unit = audiobook.unit_get(id, "U01").unwrap();

    assert!(unit.audio.is_empty());
    assert_eq!(unit.mix, MixSettings::default());
    assert_eq!(
        serde_json::to_value(&unit).unwrap(),
        serde_json::json!({
            "audio": {},
            "mix": { "gap": 0.6, "intro": 0.8, "outro": 1.5, "vol": 0.0 },
            "meta": null
        })
    );
}

#[test]
fn config_is_saved_and_returned_with_the_units() {
    let (dir, audiobook, id) = fixture();
    let mut config = AudiobookConfig::default();
    config.voices.insert(
        "narr".to_string(),
        SpeakerVoice {
            voice: Some(4),
            speed: 0.9,
        },
    );

    audiobook.config_save(id, config.clone()).unwrap();
    audiobook
        .mix_save(id, "U02", MixSettings::default())
        .unwrap();

    let book = audiobook.get(id).unwrap().unwrap();
    assert_eq!(book.voices, config.voices);
    assert!(book.units.contains_key("U02"));
    assert!(audiobook_dir(&dir, id).join("audiobook.json").is_file());
}

#[test]
fn mix_values_are_clamped() {
    let (_dir, audiobook, id) = fixture();
    let wild = MixSettings {
        gap: 9.0,
        intro: -1.0,
        outro: f64::NAN,
        vol: 20.0,
    };

    let saved = audiobook.mix_save(id, "U01", wild).unwrap();

    let expected = MixSettings {
        gap: 5.0,
        intro: 0.0,
        outro: 0.0,
        vol: 6.0,
    };
    assert_eq!(saved, expected);
    assert_eq!(audiobook.unit_get(id, "U01").unwrap().mix, expected);
    let quiet = MixSettings {
        vol: -40.0,
        ..MixSettings::default()
    };
    assert_eq!(audiobook.mix_save(id, "U01", quiet).unwrap().vol, -12.0);
}

#[test]
fn generation_writes_the_wav_and_the_record() {
    let (dir, audiobook, id) = fixture();
    let voice = FakeVoice::speaking(1.25);
    let request = SegmentRequest {
        paren: "softly".to_string(),
        ..segment_request("  Hello there ", Some("kb-1"), 7)
    };

    let record = audiobook
        .generate(id, "U01", "b1", &request, &voice)
        .unwrap();

    assert_eq!(voice.calls(), vec![(7, "Hello there".to_string())]);
    assert_eq!(record.text, "  Hello there ");
    assert_eq!(record.speaker.as_deref(), Some("kb-1"));
    assert_eq!((record.voice, record.speed), (Some(7), 1.0));
    assert_eq!(record.paren, "softly");
    assert_eq!(record.dur, 1.25);
    assert_eq!(record.flag, "");
    assert!(record.at.ends_with('Z'));
    let stored = audiobook.unit_get(id, "U01").unwrap();
    assert_eq!(stored.audio["b1"], record);
    let wav = audiobook_dir(&dir, id).join("audio/U01/b1.wav");
    assert_eq!(fs::read(&wav).unwrap(), voice.wav);
    assert_eq!(audiobook.segment_audio(id, "U01", "b1").unwrap(), voice.wav);
    assert_eq!(fs::read_dir(wav.parent().unwrap()).unwrap().count(), 1);
}

#[test]
fn backend_failures_keep_the_previous_record() {
    let (_dir, audiobook, id) = fixture();
    let request = segment_request("Hello", Some("narr"), 7);
    let first = audiobook
        .generate(id, "U01", "b1", &request, &FakeVoice::speaking(1.0))
        .unwrap();

    let error = audiobook
        .generate(id, "U01", "b1", &request, &FakeVoice::failing("MODEL_BUSY"))
        .unwrap_err();

    assert_eq!(error.code, ProjectErrorCode::BackendFailed);
    assert_eq!(error.detail, "MODEL_BUSY");
    assert_eq!(audiobook.unit_get(id, "U01").unwrap().audio["b1"], first);
}

#[test]
fn generation_validates_the_request() {
    let (_dir, audiobook, id) = fixture();
    let voice = FakeVoice::speaking(1.0);
    let slow = SegmentRequest {
        speed: 0.1,
        ..segment_request("Hello", None, 1)
    };

    let blank = audiobook
        .generate(id, "U01", "b1", &segment_request(" ", None, 1), &voice)
        .unwrap_err();
    let speed = audiobook
        .generate(id, "U01", "b1", &slow, &voice)
        .unwrap_err();
    let path = audiobook
        .generate(id, "U01", "../b", &segment_request("Hi", None, 1), &voice)
        .unwrap_err();

    for error in [blank, speed, path] {
        assert_eq!(error.code, ProjectErrorCode::InvalidInput);
    }
    assert!(voice.calls().is_empty());
}

#[test]
fn faster_speech_is_converted_before_it_is_stored() {
    if !ffmpeg_available() {
        return;
    }
    let (_dir, audiobook, id) = fixture();
    let request = SegmentRequest {
        speed: 1.5,
        ..segment_request("Hello", Some("narr"), 7)
    };

    let record = audiobook
        .generate(id, "U01", "b1", &request, &FakeVoice::speaking(3.0))
        .unwrap();

    assert!((record.dur - 2.0).abs() < 0.05, "{}", record.dur);
    assert_eq!(record.speed, 1.5);
}

#[test]
fn flags_are_set_and_cleared_on_existing_records() {
    let (_dir, audiobook, id) = fixture();
    let request = segment_request("Hello", Some("narr"), 7);
    audiobook
        .generate(id, "U01", "b1", &request, &FakeVoice::speaking(1.0))
        .unwrap();

    let flagged = audiobook.flag_set(id, "U01", "b1", " clipped ").unwrap();
    let cleared = audiobook.flag_set(id, "U01", "b1", "").unwrap();
    let missing = audiobook.flag_set(id, "U01", "b9", "x").unwrap_err();

    assert_eq!(flagged.flag, "clipped");
    assert_eq!(cleared.flag, "");
    assert_eq!(audiobook.unit_get(id, "U01").unwrap().audio["b1"].flag, "");
    assert_eq!(missing.code, ProjectErrorCode::NotFound);
}

#[test]
fn segment_audio_reports_missing_files() {
    let (_dir, audiobook, id) = fixture();

    let error = audiobook.segment_audio(id, "U01", "b1").unwrap_err();

    assert_eq!(error.code, ProjectErrorCode::NotFound);
}

#[test]
fn previews_return_the_spoken_wav_without_storing_it() {
    let (dir, audiobook, id) = fixture();
    let voice = FakeVoice::speaking(0.5);

    let bytes = audiobook.preview(id, 3, 1.0, " Sample ", &voice).unwrap();

    assert_eq!(bytes, voice.wav);
    assert_eq!(voice.calls(), vec![(3, "Sample".to_string())]);
    assert_eq!(audiobook.get(id).unwrap(), None);
    let scratch = audiobook_dir(&dir, id).join("audio");
    assert_eq!(fs::read_dir(scratch).unwrap().count(), 0);
}

#[test]
fn export_rejects_units_without_a_script() {
    let (_dir, audiobook, id) = fixture();

    let error = audiobook.export(id, "U01", ExportFormat::Wav).unwrap_err();
    let malformed = audiobook.export(id, "../U", ExportFormat::Wav).unwrap_err();

    assert_eq!(error.code, ProjectErrorCode::NotFound);
    assert_eq!(malformed.code, ProjectErrorCode::InvalidInput);
}
