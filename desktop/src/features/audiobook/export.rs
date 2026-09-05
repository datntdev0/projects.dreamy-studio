use crate::features::audiobook::audio::decode_all;
use crate::features::audiobook::audio::encode_wav;
use crate::features::audiobook::audio::gain_of;
use crate::features::audiobook::audio::place;
use crate::features::audiobook::files::AudiobookFiles;
use crate::features::audiobook::models::Audiobook;
use crate::features::audiobook::models::ExportFormat;
use crate::features::audiobook::models::MixSettings;
use crate::features::audiobook::rules::PAUSE_TYPE;
use crate::features::audiobook::rules::SegmentState;
use crate::features::audiobook::rules::is_voiced;
use crate::features::audiobook::rules::record_of;
use crate::features::audiobook::rules::segment_state;
use crate::features::audiobook::rules::voiced_blocks;
use crate::features::novel::files::write_atomic;
use crate::features::project::models::ProjectError;
use crate::features::project::models::ProjectResult;
use crate::features::scripting::files::ScriptFiles;
use crate::features::scripting::models::ScriptUnit;
use std::fmt::Write;
use std::fs;
use std::path::Path;
use std::path::PathBuf;

const SLUG_MAX: usize = 60;
const SLUG_FALLBACK: &str = "unit";

#[derive(Debug, Clone, PartialEq)]
pub struct Cue {
    pub block_id: String,
    pub text: String,
    pub start: f64,
    pub end: f64,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Timeline {
    pub cues: Vec<Cue>,
    pub total: f64,
}

pub fn timeline(book: &Audiobook, unit: &ScriptUnit, mix: &MixSettings) -> Timeline {
    let mut at = mix.intro;
    let mut cues: Vec<Cue> = Vec::new();
    for block in unit.blocks.iter().flatten() {
        if block.kind == PAUSE_TYPE {
            at += block.ms.max(0) as f64 / 1000.0;
            continue;
        }
        if !is_voiced(block) {
            continue;
        }
        if !cues.is_empty() {
            at += mix.gap;
        }
        let dur = record_of(book, &unit.id, &block.id).map_or(0.0, |record| record.dur);
        cues.push(Cue {
            block_id: block.id.clone(),
            text: block.text.clone(),
            start: at,
            end: at + dur,
        });
        at += dur;
    }
    Timeline {
        cues,
        total: at + mix.outro,
    }
}

pub fn require_complete(book: &Audiobook, unit: &ScriptUnit) -> ProjectResult<()> {
    let mut total = 0;
    let mut missing = 0;
    for block in voiced_blocks(unit) {
        total += 1;
        if segment_state(book, &unit.id, block) != SegmentState::Done {
            missing += 1;
        }
    }
    if total == 0 {
        return Err(ProjectError::invalid("this unit has no segments to export"));
    }
    if missing > 0 {
        return Err(ProjectError::invalid(format!(
            "{missing} of {total} segments are not generated or need review"
        )));
    }
    Ok(())
}

pub fn srt_text(timeline: &Timeline) -> String {
    let mut out = String::new();
    for (index, cue) in timeline.cues.iter().enumerate() {
        let _ = write!(
            out,
            "{}\n{} --> {}\n{}\n\n",
            index + 1,
            srt_time(cue.start),
            srt_time(cue.end),
            cue.text.trim()
        );
    }
    out
}

pub fn srt_time(seconds: f64) -> String {
    let total = (seconds.max(0.0) * 1000.0).round() as u64;
    let (hours, rest) = (total / 3_600_000, total % 3_600_000);
    let (minutes, rest) = (rest / 60_000, rest % 60_000);
    format!(
        "{hours:02}:{minutes:02}:{:02},{:03}",
        rest / 1000,
        rest % 1000
    )
}

pub fn slug(title: &str) -> String {
    let mut out = String::new();
    for character in title.chars().flat_map(char::to_lowercase) {
        if character.is_alphanumeric() {
            out.push(character);
        } else if !out.is_empty() && !out.ends_with('-') {
            out.push('-');
        }
    }
    let trimmed: String = out.trim_end_matches('-').chars().take(SLUG_MAX).collect();
    let trimmed = trimmed.trim_end_matches('-');
    if trimmed.is_empty() {
        SLUG_FALLBACK.to_string()
    } else {
        trimmed.to_string()
    }
}

pub fn export_name(unit: &ScriptUnit, format: ExportFormat) -> String {
    format!("{}-{}.{}", unit.no, slug(&unit.title), format.extension())
}

pub fn mix_wav(
    files: &AudiobookFiles,
    unit: &ScriptUnit,
    timeline: &Timeline,
    mix: &MixSettings,
) -> ProjectResult<Vec<u8>> {
    let paths = timeline
        .cues
        .iter()
        .map(|cue| files.segment_path(&unit.id, &cue.block_id))
        .collect::<ProjectResult<Vec<PathBuf>>>()?;
    let sounds = decode_all(&paths, &files.audio_dir(&unit.id)?)?;
    let Some(first) = sounds.first() else {
        return Err(ProjectError::invalid("this unit has no segments to export"));
    };
    let (sample_rate, channels) = (first.sample_rate, first.channels);
    let rate = f64::from(sample_rate);
    let mut buffer = vec![0.0_f32; frame_of(timeline.total, rate) * channels as usize];
    for (cue, sound) in timeline.cues.iter().zip(&sounds) {
        place(&mut buffer, sound, frame_of(cue.start, rate));
    }
    Ok(encode_wav(&buffer, sample_rate, channels, gain_of(mix.vol)))
}

fn frame_of(seconds: f64, rate: f64) -> usize {
    (seconds.max(0.0) * rate).round() as usize
}

pub fn export_unit(dir: &Path, unit_id: &str, format: ExportFormat) -> ProjectResult<PathBuf> {
    let unit = read_script_unit(dir, unit_id)?;
    let files = AudiobookFiles::new(dir);
    let book = files.read_book()?.unwrap_or_default();
    require_complete(&book, &unit)?;
    let mix = book
        .unit(unit_id)
        .map(|audio| audio.mix)
        .unwrap_or_default()
        .clamped();
    let timeline = timeline(&book, &unit, &mix);
    let bytes = match format {
        ExportFormat::Wav => mix_wav(&files, &unit, &timeline, &mix)?,
        ExportFormat::Srt => srt_text(&timeline).into_bytes(),
    };
    let target = files.exports_dir().join(export_name(&unit, format));
    fs::create_dir_all(files.exports_dir())?;
    write_atomic(&target, &bytes)?;
    Ok(target)
}

pub fn read_script_unit(dir: &Path, unit_id: &str) -> ProjectResult<ScriptUnit> {
    let files = ScriptFiles::new(dir);
    let script = files
        .read_script()?
        .ok_or_else(|| ProjectError::not_found("this project has no script yet"))?;
    let head = script
        .units
        .into_iter()
        .find(|head| head.id == unit_id)
        .ok_or_else(|| ProjectError::not_found(format!("unknown unit {unit_id}")))?;
    let body = files.read_unit(unit_id)?;
    Ok(ScriptUnit::join(head, body))
}

#[cfg(test)]
#[path = "../../../test/features/audiobook/export.test.rs"]
mod tests;
