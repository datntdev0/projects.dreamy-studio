use crate::features::library::sounds;
use crate::features::library::sounds::DecodedSound;
use crate::features::library::sounds::SoundFormat;
use crate::features::project::models::ProjectError;
use crate::features::project::models::ProjectErrorCode;
use crate::features::project::models::ProjectResult;
use crate::shared::ffmpeg;
use crate::shared::files::remove_if_exists;
use std::fs;
use std::path::Path;
use std::path::PathBuf;
use uuid::Uuid;

pub const SPEED_LIMITS: (f64, f64) = (0.5, 2.0);
const WAV_HEADER_LEN: usize = 44;
const PCM_BITS: u16 = 16;

pub struct Clip {
    path: PathBuf,
}

impl Clip {
    fn scratch(dir: &Path) -> Self {
        Self {
            path: dir.join(format!(".clip-{}.wav", Uuid::new_v4().simple())),
        }
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    pub fn persist(self, target: &Path) -> ProjectResult<()> {
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::rename(&self.path, target)?;
        Ok(())
    }

    pub fn read(&self) -> ProjectResult<Vec<u8>> {
        Ok(fs::read(&self.path)?)
    }
}

impl Drop for Clip {
    fn drop(&mut self) {
        let _ = remove_if_exists(&self.path);
    }
}

pub fn require_speed(speed: f64) -> ProjectResult<()> {
    let (low, high) = SPEED_LIMITS;
    if speed.is_finite() && (low..=high).contains(&speed) {
        Ok(())
    } else {
        Err(ProjectError::invalid(format!(
            "speed must be between {low} and {high}"
        )))
    }
}

pub fn is_natural_speed(speed: f64) -> bool {
    (speed - 1.0).abs() < 1e-9
}

pub fn tempo_options(speed: f64) -> Vec<String> {
    vec!["-filter:a".to_string(), format!("atempo={speed}")]
}

pub fn format_options(sample_rate: u32, channels: u32) -> Vec<String> {
    vec![
        "-ar".to_string(),
        sample_rate.to_string(),
        "-ac".to_string(),
        channels.to_string(),
    ]
}

pub fn render_clip(bytes: &[u8], speed: f64, scratch: &Path) -> ProjectResult<(Clip, f64)> {
    fs::create_dir_all(scratch)?;
    let raw = Clip::scratch(scratch);
    fs::write(raw.path(), bytes)?;
    let clip = if is_natural_speed(speed) {
        raw
    } else {
        convert(raw.path(), scratch, &tempo_options(speed))?
    };
    let seconds = duration_of(clip.path())?;
    Ok((clip, seconds))
}

fn convert(source: &Path, scratch: &Path, options: &[String]) -> ProjectResult<Clip> {
    let target = Clip::scratch(scratch);
    ffmpeg::run(&ffmpeg::wav_args(source, target.path(), options))
        .map_err(|detail| ProjectError::new(ProjectErrorCode::Io, detail))?;
    Ok(target)
}

pub fn duration_of(path: &Path) -> ProjectResult<f64> {
    sounds::analyze(path, SoundFormat::Wav)
        .map(|analysis| analysis.duration_ms as f64 / 1000.0)
        .map_err(|error| {
            ProjectError::new(
                ProjectErrorCode::BackendFailed,
                format!("generated audio is unreadable: {}", error.detail),
            )
        })
}

pub fn decode_wav(path: &Path) -> ProjectResult<DecodedSound> {
    sounds::decode(path, SoundFormat::Wav).map_err(|error| {
        ProjectError::new(
            ProjectErrorCode::Io,
            format!("cannot read {}: {}", path.display(), error.detail),
        )
    })
}

pub fn decode_all(paths: &[PathBuf], scratch: &Path) -> ProjectResult<Vec<DecodedSound>> {
    let mut sounds = Vec::with_capacity(paths.len());
    for path in paths {
        sounds.push(decode_wav(path)?);
    }
    let Some(first) = sounds.first() else {
        return Ok(sounds);
    };
    let layout = (first.sample_rate, first.channels);
    if sounds
        .iter()
        .all(|sound| (sound.sample_rate, sound.channels) == layout)
    {
        return Ok(sounds);
    }
    normalize_all(paths, &sounds, layout, scratch)
}

fn normalize_all(
    paths: &[PathBuf],
    sounds: &[DecodedSound],
    (sample_rate, channels): (u32, u32),
    scratch: &Path,
) -> ProjectResult<Vec<DecodedSound>> {
    fs::create_dir_all(scratch)?;
    let options = format_options(sample_rate, channels);
    let mut normalized = Vec::with_capacity(sounds.len());
    for (path, sound) in paths.iter().zip(sounds) {
        if (sound.sample_rate, sound.channels) == (sample_rate, channels) {
            normalized.push(sound.clone());
            continue;
        }
        let converted = convert(path, scratch, &options)?;
        normalized.push(decode_wav(converted.path())?);
    }
    Ok(normalized)
}

pub fn place(buffer: &mut Vec<f32>, sound: &DecodedSound, start_frame: usize) {
    let channels = sound.channels.max(1) as usize;
    let offset = start_frame * channels;
    let end = offset + sound.samples.len();
    if buffer.len() < end {
        buffer.resize(end, 0.0);
    }
    for (slot, sample) in buffer[offset..end].iter_mut().zip(&sound.samples) {
        *slot += *sample;
    }
}

pub fn gain_of(decibels: f64) -> f32 {
    10_f64.powf(decibels / 20.0) as f32
}

pub fn encode_wav(samples: &[f32], sample_rate: u32, channels: u32, gain: f32) -> Vec<u8> {
    let channels = channels.max(1) as u16;
    let block_align = channels * (PCM_BITS / 8);
    let data_len = (samples.len() * 2) as u32;
    let mut bytes = Vec::with_capacity(WAV_HEADER_LEN + samples.len() * 2);
    bytes.extend_from_slice(b"RIFF");
    bytes.extend_from_slice(&(36 + data_len).to_le_bytes());
    bytes.extend_from_slice(b"WAVEfmt ");
    bytes.extend_from_slice(&16_u32.to_le_bytes());
    bytes.extend_from_slice(&1_u16.to_le_bytes());
    bytes.extend_from_slice(&channels.to_le_bytes());
    bytes.extend_from_slice(&sample_rate.to_le_bytes());
    bytes.extend_from_slice(&(sample_rate * u32::from(block_align)).to_le_bytes());
    bytes.extend_from_slice(&block_align.to_le_bytes());
    bytes.extend_from_slice(&PCM_BITS.to_le_bytes());
    bytes.extend_from_slice(b"data");
    bytes.extend_from_slice(&data_len.to_le_bytes());
    for sample in samples {
        let scaled = (sample * gain).clamp(-1.0, 1.0) * f32::from(i16::MAX);
        bytes.extend_from_slice(&(scaled.round() as i16).to_le_bytes());
    }
    bytes
}

#[cfg(test)]
#[path = "../../../test/features/audiobook/audio.test.rs"]
mod tests;
