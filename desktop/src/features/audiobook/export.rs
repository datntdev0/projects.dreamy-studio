use crate::features::audiobook::audio::decode_all;
use crate::features::audiobook::audio::encode_wav;
use crate::features::audiobook::audio::gain_of;
use crate::features::audiobook::audio::place;
use crate::features::audiobook::files::AudiobookFiles;
use crate::features::audiobook::models::Audiobook;
use crate::features::audiobook::models::MixSettings;
use crate::features::audiobook::rules::PAUSE_TYPE;
use crate::features::audiobook::rules::SegmentState;
use crate::features::audiobook::rules::is_voiced;
use crate::features::audiobook::rules::record_of;
use crate::features::audiobook::rules::segment_state;
use crate::features::audiobook::rules::voiced_blocks;
use crate::features::audiobook::subtitles::Cue;
use crate::features::audiobook::subtitles::parse_srt;
use crate::features::audiobook::subtitles::srt_text;
use crate::features::novel::files::write_atomic;
use crate::features::project::models::ProjectError;
use crate::features::project::models::ProjectResult;
use crate::features::scripting::chapters::ProjectChapter;
use crate::features::scripting::chapters::resolve_unit;
use crate::features::scripting::files::ScriptFiles;
use crate::features::scripting::files::require_unit_id;
use crate::features::scripting::models::ScriptUnit;
use crate::features::scripting::models::UnitHead;
use crate::shared::files::read_if_exists;
use std::collections::BTreeSet;
use std::fs;
use std::path::Path;
use std::path::PathBuf;

const SLUG_MAX: usize = 60;
const SLUG_FALLBACK: &str = "unit";
const BOOK_FALLBACK: &str = "audiobook";
const NOTHING_TO_EXPORT: &str = "there are no segments to export";

#[derive(Debug, Clone, PartialEq)]
pub struct Slot {
    pub unit_id: String,
    pub block_id: String,
    pub text: String,
    pub start: f64,
    pub end: f64,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Timeline {
    pub slots: Vec<Slot>,
    pub total: f64,
}

pub fn timeline(book: &Audiobook, units: &[ScriptUnit], mix: &MixSettings) -> Timeline {
    let mut at = mix.intro;
    let mut slots: Vec<Slot> = Vec::new();
    for (index, unit) in units.iter().enumerate() {
        if index > 0 {
            at += mix.outro + mix.intro;
        }
        at = place_unit(book, unit, mix, at, &mut slots);
    }
    Timeline {
        slots,
        total: at + mix.outro,
    }
}

fn place_unit(
    book: &Audiobook,
    unit: &ScriptUnit,
    mix: &MixSettings,
    start: f64,
    slots: &mut Vec<Slot>,
) -> f64 {
    let mut at = start;
    let mut voiced = false;
    for block in unit.blocks.iter().flatten() {
        if block.kind == PAUSE_TYPE {
            at += block.ms.max(0) as f64 / 1000.0;
            continue;
        }
        if !is_voiced(block) {
            continue;
        }
        if voiced {
            at += mix.gap;
        }
        voiced = true;
        let dur = record_of(book, &unit.id, &block.id).map_or(0.0, |record| record.dur);
        slots.push(Slot {
            unit_id: unit.id.clone(),
            block_id: block.id.clone(),
            text: block.text.clone(),
            start: at,
            end: at + dur,
        });
        at += dur;
    }
    at
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
        return Err(ProjectError::invalid(format!(
            "{} has no segments to export",
            unit_label(unit)
        )));
    }
    if missing > 0 {
        return Err(ProjectError::invalid(format!(
            "{}: {missing} of {total} segments are not generated or need review",
            unit_label(unit)
        )));
    }
    Ok(())
}

fn unit_label(unit: &ScriptUnit) -> String {
    format!("{} \"{}\"", unit.no, unit.title.trim())
}

pub fn slug(title: &str) -> String {
    slug_or(title, SLUG_FALLBACK)
}

fn slug_or(title: &str, fallback: &str) -> String {
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
        fallback.to_string()
    } else {
        trimmed.to_string()
    }
}

pub fn export_stem(project_name: &str, units: &[ScriptUnit]) -> String {
    match units {
        [unit] => format!("{}-{}", unit.no, slug(&unit.title)),
        [first, .., last] => format!(
            "{}-{}-{}",
            slug_or(project_name, BOOK_FALLBACK),
            first.no,
            last.no
        ),
        [] => BOOK_FALLBACK.to_string(),
    }
}

pub fn mix_wav(
    files: &AudiobookFiles,
    timeline: &Timeline,
    mix: &MixSettings,
) -> ProjectResult<Vec<u8>> {
    let paths = timeline
        .slots
        .iter()
        .map(|slot| files.segment_path(&slot.unit_id, &slot.block_id))
        .collect::<ProjectResult<Vec<PathBuf>>>()?;
    let sounds = decode_all(&paths, &files.scratch_dir())?;
    let Some(first) = sounds.first() else {
        return Err(ProjectError::invalid(NOTHING_TO_EXPORT));
    };
    let (sample_rate, channels) = (first.sample_rate, first.channels);
    let rate = f64::from(sample_rate);
    let mut buffer = vec![0.0_f32; frame_of(timeline.total, rate) * channels as usize];
    for (slot, sound) in timeline.slots.iter().zip(&sounds) {
        place(&mut buffer, sound, frame_of(slot.start, rate));
    }
    Ok(encode_wav(&buffer, sample_rate, channels, gain_of(mix.vol)))
}

fn frame_of(seconds: f64, rate: f64) -> usize {
    (seconds.max(0.0) * rate).round() as usize
}

pub fn subtitle_cues(files: &AudiobookFiles, timeline: &Timeline) -> ProjectResult<Vec<Cue>> {
    let mut cues = Vec::new();
    for slot in &timeline.slots {
        cues.extend(slot_cues(files, slot)?);
    }
    Ok(cues)
}

fn slot_cues(files: &AudiobookFiles, slot: &Slot) -> ProjectResult<Vec<Cue>> {
    let path = files.segment_srt_path(&slot.unit_id, &slot.block_id)?;
    let sentences = read_if_exists(&path)?
        .map(|bytes| parse_srt(&String::from_utf8_lossy(&bytes)))
        .unwrap_or_default();
    if sentences.is_empty() {
        return Ok(vec![Cue {
            start: slot.start,
            end: slot.end,
            text: slot.text.clone(),
        }]);
    }
    Ok(sentences
        .iter()
        .map(|cue| cue.shifted(slot.start))
        .collect())
}

pub fn export_units(
    dir: &Path,
    project_name: &str,
    chapters: &[ProjectChapter],
    unit_ids: &[String],
) -> ProjectResult<(PathBuf, PathBuf)> {
    require_selection(unit_ids)?;
    let units = read_script_units(dir, chapters, unit_ids)?;
    let files = AudiobookFiles::new(dir);
    let book = files.read_book()?.unwrap_or_default();
    for unit in &units {
        require_complete(&book, unit)?;
    }
    let mix = book.mix.clamped();
    let timeline = timeline(&book, &units, &mix);
    let wav = mix_wav(&files, &timeline, &mix)?;
    let srt = srt_text(&subtitle_cues(&files, &timeline)?);
    let stem = export_stem(project_name, &units);
    let exports = files.exports_dir();
    fs::create_dir_all(&exports)?;
    let wav_path = exports.join(format!("{stem}.wav"));
    let srt_path = exports.join(format!("{stem}.srt"));
    write_atomic(&wav_path, &wav)?;
    write_atomic(&srt_path, srt.as_bytes())?;
    Ok((wav_path, srt_path))
}

fn require_selection(unit_ids: &[String]) -> ProjectResult<()> {
    if unit_ids.is_empty() {
        return Err(ProjectError::invalid("select at least one unit to export"));
    }
    let mut seen = BTreeSet::new();
    for unit_id in unit_ids {
        require_unit_id(unit_id)?;
        if !seen.insert(unit_id.as_str()) {
            return Err(ProjectError::invalid(format!(
                "unit {unit_id} is selected twice"
            )));
        }
    }
    Ok(())
}

pub fn read_script_units(
    dir: &Path,
    chapters: &[ProjectChapter],
    unit_ids: &[String],
) -> ProjectResult<Vec<ScriptUnit>> {
    let files = ScriptFiles::new(dir);
    let script = files
        .read_script()?
        .ok_or_else(|| ProjectError::not_found("this project has no script yet"))?;
    if let Some(unknown) = unit_ids
        .iter()
        .find(|unit_id| !script.units.iter().any(|head| &head.id == *unit_id))
    {
        return Err(ProjectError::not_found(format!("unknown unit {unknown}")));
    }
    let heads: Vec<UnitHead> = script
        .units
        .into_iter()
        .filter(|head| unit_ids.contains(&head.id))
        .collect();
    let mut units = Vec::with_capacity(heads.len());
    for head in heads {
        let body = files.read_unit(&head.id)?;
        let mut unit = ScriptUnit::join(head, body);
        resolve_unit(&mut unit, chapters);
        units.push(unit);
    }
    units.sort_by_key(|unit| unit.no);
    Ok(units)
}

#[cfg(test)]
#[path = "../../../test/features/audiobook/export.test.rs"]
mod tests;
