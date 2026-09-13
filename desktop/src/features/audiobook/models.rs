use serde::Deserialize;
use serde::Serialize;
use std::collections::BTreeMap;

pub const SPEED_DEFAULT: f64 = 1.0;
pub const GAP_LIMITS: (f64, f64) = (0.0, 5.0);
pub const INTRO_LIMITS: (f64, f64) = (0.0, 10.0);
pub const OUTRO_LIMITS: (f64, f64) = (0.0, 10.0);
pub const VOL_LIMITS: (f64, f64) = (-12.0, 6.0);
pub const SENTENCE_LIMITS: (f64, f64) = (0.0, 2.0);

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct SpeakerVoice {
    pub voice: Option<i64>,
    pub speed: f64,
}

impl Default for SpeakerVoice {
    fn default() -> Self {
        Self {
            voice: None,
            speed: SPEED_DEFAULT,
        }
    }
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct AudiobookConfig {
    pub voices: BTreeMap<String, SpeakerVoice>,
    pub mix: MixSettings,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct AudioRecord {
    pub text: String,
    pub speaker: Option<String>,
    pub voice: Option<i64>,
    pub speed: f64,
    pub paren: String,
    pub dur: f64,
    pub at: String,
    pub flag: String,
    #[serde(skip_serializing_if = "String::is_empty")]
    pub source: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct MixSettings {
    pub gap: f64,
    pub intro: f64,
    pub outro: f64,
    pub vol: f64,
    pub sentence: f64,
}

impl Default for MixSettings {
    fn default() -> Self {
        Self {
            gap: 0.6,
            intro: 0.8,
            outro: 1.5,
            vol: 0.0,
            sentence: 0.3,
        }
    }
}

impl MixSettings {
    pub fn clamped(self) -> Self {
        Self {
            gap: clamp_field(self.gap, GAP_LIMITS),
            intro: clamp_field(self.intro, INTRO_LIMITS),
            outro: clamp_field(self.outro, OUTRO_LIMITS),
            vol: clamp_field(self.vol, VOL_LIMITS),
            sentence: clamp_field(self.sentence, SENTENCE_LIMITS),
        }
    }

    pub fn sentence_pause_ms(self) -> i64 {
        (self.clamped().sentence * 1000.0).round() as i64
    }
}

fn clamp_field(value: f64, (low, high): (f64, f64)) -> f64 {
    let finite = if value.is_finite() { value } else { 0.0 };
    finite.clamp(low, high)
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct UnitAudioFile {
    pub audio: BTreeMap<String, AudioRecord>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UnitAudio {
    pub audio: BTreeMap<String, AudioRecord>,
    pub meta: Option<String>,
}

impl From<UnitAudioFile> for UnitAudio {
    fn from(file: UnitAudioFile) -> Self {
        Self {
            audio: file.audio,
            meta: None,
        }
    }
}

#[derive(Debug, Clone, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Audiobook {
    pub voices: BTreeMap<String, SpeakerVoice>,
    pub mix: MixSettings,
    pub units: BTreeMap<String, UnitAudio>,
}

impl Audiobook {
    pub fn unit(&self, unit_id: &str) -> Option<&UnitAudio> {
        self.units.get(unit_id)
    }

    pub fn voicing(&self, speaker: Option<&str>) -> SpeakerVoice {
        speaker
            .and_then(|id| self.voices.get(id))
            .cloned()
            .unwrap_or_default()
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SegmentRequest {
    pub text: String,
    #[serde(default)]
    pub speaker: Option<String>,
    pub voice: i64,
    #[serde(default = "default_speed")]
    pub speed: f64,
    #[serde(default)]
    pub paren: String,
}

fn default_speed() -> f64 {
    SPEED_DEFAULT
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportReply {
    pub wav: String,
    pub srt: String,
}
