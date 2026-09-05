use super::*;
use crate::testing::audio::ffmpeg_available;
use crate::testing::audio::tone_wav;
use std::ffi::OsString;
use tempfile::TempDir;

#[test]
fn speed_changes_build_an_atempo_conversion() {
    let args = ffmpeg::wav_args(
        Path::new("in.wav"),
        Path::new("out.wav"),
        &tempo_options(1.25),
    );

    let expected: Vec<OsString> = [
        "-v",
        "error",
        "-nostdin",
        "-y",
        "-i",
        "in.wav",
        "-filter:a",
        "atempo=1.25",
        "-c:a",
        "pcm_s16le",
        "-f",
        "wav",
        "out.wav",
    ]
    .iter()
    .map(OsString::from)
    .collect();
    assert_eq!(args, expected);
    assert_eq!(format_options(24_000, 2), vec!["-ar", "24000", "-ac", "2"]);
}

#[test]
fn speeds_outside_the_tempo_range_are_rejected() {
    for speed in [0.5, 0.6, 1.0, 1.5, 2.0] {
        assert!(require_speed(speed).is_ok(), "{speed}");
    }
    for speed in [0.0, 0.4, 2.1, f64::NAN, f64::INFINITY] {
        assert!(require_speed(speed).is_err(), "{speed}");
    }
    assert!(is_natural_speed(1.0));
    assert!(!is_natural_speed(1.2));
}

#[test]
fn natural_speed_keeps_the_clip_and_measures_it() {
    let dir = TempDir::new().unwrap();

    let (clip, seconds) = render_clip(&tone_wav(8_000, 1, 1.5), 1.0, dir.path()).unwrap();

    assert_eq!(seconds, 1.5);
    assert_eq!(clip.read().unwrap(), tone_wav(8_000, 1, 1.5));
    let path = clip.path().to_path_buf();
    drop(clip);
    assert!(!path.exists());
}

#[test]
fn unreadable_engine_audio_is_a_backend_failure() {
    let dir = TempDir::new().unwrap();

    let error = render_clip(b"not audio", 1.0, dir.path()).err().unwrap();

    assert_eq!(error.code, ProjectErrorCode::BackendFailed);
    assert_eq!(std::fs::read_dir(dir.path()).unwrap().count(), 0);
}

#[test]
fn other_speeds_run_ffmpeg_atempo() {
    if !ffmpeg_available() {
        return;
    }
    let dir = TempDir::new().unwrap();

    let (clip, seconds) = render_clip(&tone_wav(8_000, 1, 2.0), 1.25, dir.path()).unwrap();

    assert!((seconds - 1.6).abs() < 0.05, "{seconds}");
    let persisted = dir.path().join("out").join("seg.wav");
    clip.persist(&persisted).unwrap();
    assert!(persisted.is_file());
    assert_eq!(std::fs::read_dir(dir.path()).unwrap().count(), 1);
}

#[test]
fn encoded_pcm_decodes_back_with_gain_applied() {
    let dir = TempDir::new().unwrap();
    let path = dir.path().join("a.wav");
    let samples = vec![0.25_f32, -0.25, 0.9, -0.9];
    std::fs::write(&path, encode_wav(&samples, 16_000, 2, gain_of(6.0))).unwrap();

    let decoded = decode_wav(&path).unwrap();

    assert_eq!((decoded.sample_rate, decoded.channels), (16_000, 2));
    assert!((decoded.samples[0] - 0.4988).abs() < 0.01);
    assert!((decoded.samples[2] - 1.0).abs() < 0.001);
    assert!((decoded.samples[3] + 1.0).abs() < 0.001);
    assert!((gain_of(0.0) - 1.0).abs() < f32::EPSILON);
    assert!((gain_of(-12.0) - 0.251).abs() < 0.001);
}

#[test]
fn placing_sums_and_grows_the_buffer() {
    let sound = DecodedSound {
        sample_rate: 10,
        channels: 2,
        samples: vec![0.5; 4],
    };
    let mut buffer = vec![0.25_f32; 4];

    place(&mut buffer, &sound, 1);

    assert_eq!(buffer, vec![0.25, 0.25, 0.75, 0.75, 0.5, 0.5]);
}

#[test]
fn mixed_layouts_are_normalized_to_the_first_segment() {
    if !ffmpeg_available() {
        return;
    }
    let dir = TempDir::new().unwrap();
    let first = dir.path().join("a.wav");
    let second = dir.path().join("b.wav");
    std::fs::write(&first, tone_wav(16_000, 1, 0.5)).unwrap();
    std::fs::write(&second, tone_wav(8_000, 2, 0.5)).unwrap();

    let sounds = decode_all(&[first, second], &dir.path().join("scratch")).unwrap();

    assert_eq!((sounds[1].sample_rate, sounds[1].channels), (16_000, 1));
    assert!((sounds[1].samples.len() as i64 - 8_000).abs() < 400);
}
