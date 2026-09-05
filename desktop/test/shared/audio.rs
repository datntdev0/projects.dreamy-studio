use crate::features::audiobook::audio::encode_wav;
use crate::features::audiobook::models::AudioRecord;
use crate::features::audiobook::models::Audiobook;
use crate::features::audiobook::models::MixSettings;
use crate::features::audiobook::models::SegmentRequest;
use crate::features::audiobook::models::SpeakerVoice;
use crate::features::audiobook::voice::SegmentVoice;
use crate::features::audiobook::voice::Speech;
use crate::features::project::models::ProjectError;
use crate::features::project::models::ProjectErrorCode;
use crate::features::project::models::ProjectResult;
use crate::features::scripting::models::ScriptBlock;
use crate::features::scripting::models::ScriptUnit;
use crate::testing::script::unit;
use std::collections::BTreeMap;
use std::sync::Mutex;

pub fn wav_bytes() -> Vec<u8> {
    let sample_rate = 8_000_u32;
    let sample_count = sample_rate as usize;
    let data_len = sample_count * 2;
    let mut bytes = Vec::with_capacity(44 + data_len);
    bytes.extend_from_slice(b"RIFF");
    bytes.extend_from_slice(&(36 + data_len as u32).to_le_bytes());
    bytes.extend_from_slice(b"WAVEfmt ");
    bytes.extend_from_slice(&16_u32.to_le_bytes());
    bytes.extend_from_slice(&1_u16.to_le_bytes());
    bytes.extend_from_slice(&1_u16.to_le_bytes());
    bytes.extend_from_slice(&sample_rate.to_le_bytes());
    bytes.extend_from_slice(&(sample_rate * 2).to_le_bytes());
    bytes.extend_from_slice(&2_u16.to_le_bytes());
    bytes.extend_from_slice(&16_u16.to_le_bytes());
    bytes.extend_from_slice(b"data");
    bytes.extend_from_slice(&(data_len as u32).to_le_bytes());
    for _ in 0..sample_count {
        bytes.extend_from_slice(&i16::MAX.to_le_bytes());
    }
    bytes
}

pub fn tone_samples(sample_rate: u32, channels: u32, seconds: f64, level: f32) -> Vec<f32> {
    let frames = (f64::from(sample_rate) * seconds).round() as usize;
    let mut samples = Vec::with_capacity(frames * channels as usize);
    for frame in 0..frames {
        let phase = 2.0 * std::f32::consts::PI * 440.0 * frame as f32 / sample_rate as f32;
        let value = level * phase.sin();
        samples.extend(std::iter::repeat_n(value, channels as usize));
    }
    samples
}

pub fn tone_wav(sample_rate: u32, channels: u32, seconds: f64) -> Vec<u8> {
    encode_wav(
        &tone_samples(sample_rate, channels, seconds, 0.5),
        sample_rate,
        channels,
        1.0,
    )
}

pub fn ffmpeg_available() -> bool {
    crate::shared::ffmpeg::sidecar_path().is_ok()
}

#[derive(Default)]
pub struct FakeVoice {
    pub wav: Vec<u8>,
    pub subtitles: Option<String>,
    pub failure: Option<String>,
    pub calls: Mutex<Vec<(i64, String)>>,
    pub pauses: Mutex<Vec<i64>>,
}

impl FakeVoice {
    pub fn speaking(seconds: f64) -> Self {
        Self {
            wav: tone_wav(8_000, 1, seconds),
            ..Self::default()
        }
    }

    pub fn subtitled(seconds: f64, subtitles: &str) -> Self {
        Self {
            subtitles: Some(subtitles.to_string()),
            ..Self::speaking(seconds)
        }
    }

    pub fn failing(message: &str) -> Self {
        Self {
            failure: Some(message.to_string()),
            ..Self::default()
        }
    }

    pub fn calls(&self) -> Vec<(i64, String)> {
        self.calls.lock().unwrap().clone()
    }

    pub fn pauses(&self) -> Vec<i64> {
        self.pauses.lock().unwrap().clone()
    }
}

impl SegmentVoice for FakeVoice {
    fn speak(&self, voice_id: i64, text: &str, pause_ms: i64) -> ProjectResult<Speech> {
        self.calls
            .lock()
            .unwrap()
            .push((voice_id, text.to_string()));
        self.pauses.lock().unwrap().push(pause_ms);
        match &self.failure {
            Some(message) => Err(ProjectError::new(
                ProjectErrorCode::BackendFailed,
                message.clone(),
            )),
            None => Ok(Speech {
                wav: self.wav.clone(),
                subtitles: self.subtitles.clone(),
            }),
        }
    }
}

pub fn segment_request(text: &str, speaker: Option<&str>, voice: i64) -> SegmentRequest {
    SegmentRequest {
        text: text.to_string(),
        speaker: speaker.map(str::to_string),
        voice,
        speed: 1.0,
        paren: String::new(),
    }
}

pub fn audio_block(id: &str, kind: &str, text: &str, who: &str) -> ScriptBlock {
    ScriptBlock {
        id: id.to_string(),
        kind: kind.to_string(),
        text: text.to_string(),
        who: who.to_string(),
        ..ScriptBlock::default()
    }
}

pub fn pause_block(id: &str, ms: i64) -> ScriptBlock {
    ScriptBlock {
        id: id.to_string(),
        kind: "pause".to_string(),
        ms,
        ..ScriptBlock::default()
    }
}

pub fn audio_unit(id: &str, blocks: Vec<ScriptBlock>) -> ScriptUnit {
    ScriptUnit {
        blocks: Some(blocks),
        title: "Chapter One: Start".to_string(),
        ..unit(id, 1)
    }
}

pub fn record_for(block: &ScriptBlock, speaker: Option<&str>, dur: f64) -> AudioRecord {
    AudioRecord {
        text: block.text.clone(),
        speaker: speaker.map(str::to_string),
        voice: Some(5),
        speed: 1.0,
        paren: block.paren.clone(),
        dur,
        at: "2026-11-23T10:00:00.000Z".to_string(),
        flag: String::new(),
    }
}

pub fn voiced_book(speakers: &[&str]) -> Audiobook {
    let voices = speakers
        .iter()
        .map(|speaker| {
            (
                speaker.to_string(),
                SpeakerVoice {
                    voice: Some(5),
                    speed: 1.0,
                },
            )
        })
        .collect();
    Audiobook {
        voices,
        mix: MixSettings::default(),
        units: BTreeMap::new(),
    }
}

pub fn with_records(
    mut book: Audiobook,
    unit_id: &str,
    records: Vec<(&str, AudioRecord)>,
) -> Audiobook {
    let unit = book.units.entry(unit_id.to_string()).or_default();
    for (block_id, record) in records {
        unit.audio.insert(block_id.to_string(), record);
    }
    book
}
