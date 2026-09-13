use crate::features::audiobook::audio::Clip;
use crate::features::audiobook::audio::render_clip;
use crate::features::audiobook::audio::require_speed;
use crate::features::audiobook::export::export_units;
use crate::features::audiobook::files::AudiobookFiles;
use crate::features::audiobook::models::AudioRecord;
use crate::features::audiobook::models::Audiobook;
use crate::features::audiobook::models::AudiobookConfig;
use crate::features::audiobook::models::ExportReply;
use crate::features::audiobook::models::MixSettings;
use crate::features::audiobook::models::SegmentRequest;
use crate::features::audiobook::models::UnitAudio;
use crate::features::audiobook::subtitles::rescale_srt;
use crate::features::audiobook::voice::SegmentVoice;
use crate::features::novel::files::write_atomic;
use crate::features::project::models::ProjectError;
use crate::features::project::models::ProjectResult;
use crate::features::project::service::ProjectWorkspace;
use crate::features::scripting::chapters::project_chapters;
use crate::features::scripting::files::require_safe_id;
use crate::features::workspace::repository::format_timestamp;
use crate::shared::files::read_if_exists;
use crate::shared::files::remove_if_exists;
use chrono::Utc;
use std::path::Path;
use std::sync::atomic::AtomicBool;
use std::sync::atomic::Ordering;

#[derive(Debug, Clone)]
pub struct AudiobookWorkspace {
    projects: ProjectWorkspace,
}

impl AudiobookWorkspace {
    pub fn new(projects: ProjectWorkspace) -> Self {
        Self { projects }
    }

    pub fn dir(&self) -> &Path {
        self.projects.dir()
    }

    pub fn get(&self, project_id: i64) -> ProjectResult<Option<Audiobook>> {
        self.with_files(project_id, |files| files.read_book())
    }

    pub fn unit_get(&self, project_id: i64, unit_id: &str) -> ProjectResult<UnitAudio> {
        self.with_files(project_id, |files| Ok(files.read_unit(unit_id)?.into()))
    }

    pub fn config_save(&self, project_id: i64, config: AudiobookConfig) -> ProjectResult<()> {
        self.with_files(project_id, |files| {
            files
                .update_config(|stored| stored.voices = config.voices)
                .map(drop)
        })
    }

    pub fn mix_save(&self, project_id: i64, mix: MixSettings) -> ProjectResult<MixSettings> {
        let mix = mix.clamped();
        self.with_files(project_id, |files| {
            files.update_config(|stored| stored.mix = mix)?;
            Ok(mix)
        })
    }

    pub fn flag_set(
        &self,
        project_id: i64,
        unit_id: &str,
        block_id: &str,
        flag: &str,
    ) -> ProjectResult<AudioRecord> {
        require_safe_id("block", block_id)?;
        self.with_files(project_id, |files| {
            let mut unit = files.read_unit(unit_id)?;
            let record = unit
                .audio
                .get_mut(block_id)
                .ok_or_else(|| missing_record(block_id))?;
            record.flag = flag.trim().to_string();
            let updated = record.clone();
            files.write_unit(unit_id, &unit)?;
            Ok(updated)
        })
    }

    pub fn segment_audio(
        &self,
        project_id: i64,
        unit_id: &str,
        block_id: &str,
    ) -> ProjectResult<Vec<u8>> {
        self.with_files(project_id, |files| {
            read_if_exists(&files.segment_path(unit_id, block_id)?)?
                .ok_or_else(|| missing_record(block_id))
        })
    }

    pub fn generate(
        &self,
        project_id: i64,
        unit_id: &str,
        block_id: &str,
        request: &SegmentRequest,
        voice: &dyn SegmentVoice,
    ) -> ProjectResult<AudioRecord> {
        let never = AtomicBool::new(false);
        self.generate_unless(project_id, unit_id, block_id, request, voice, &never)?
            .ok_or_else(|| ProjectError::invalid("segment generation was cancelled"))
    }

    pub fn generate_unless(
        &self,
        project_id: i64,
        unit_id: &str,
        block_id: &str,
        request: &SegmentRequest,
        voice: &dyn SegmentVoice,
        cancel: &AtomicBool,
    ) -> ProjectResult<Option<AudioRecord>> {
        let text = spoken_text(&request.text)?;
        require_speed(request.speed)?;
        let (target, scratch, mix) = self.with_files(project_id, |files| {
            Ok((
                files.segment_path(unit_id, block_id)?,
                files.audio_dir(unit_id)?,
                files.mix()?,
            ))
        })?;
        let speech = voice.speak(request.voice, &text, mix.sentence_pause_ms())?;
        let (clip, dur) = render_clip(&speech.wav, request.speed, &scratch)?;
        let subtitles = speech
            .subtitles
            .as_deref()
            .and_then(|srt| rescale_srt(srt, request.speed));
        if cancel.load(Ordering::SeqCst) {
            return Ok(None);
        }
        let record = AudioRecord {
            text: request.text.clone(),
            speaker: request.speaker.clone(),
            voice: Some(request.voice),
            speed: request.speed,
            paren: request.paren.clone(),
            dur,
            at: format_timestamp(Utc::now()),
            flag: String::new(),
            source: speech.source.unwrap_or_default(),
        };
        self.with_files(project_id, |files| {
            let srt_target = files.segment_srt_path(unit_id, block_id)?;
            persist_segment(clip, &target, &srt_target, subtitles.as_deref())?;
            let mut unit = files.read_unit(unit_id)?;
            unit.audio.insert(block_id.to_string(), record.clone());
            files.write_unit(unit_id, &unit)?;
            Ok(Some(record))
        })
    }

    pub fn preview(
        &self,
        project_id: i64,
        voice_id: i64,
        speed: f64,
        text: &str,
        voice: &dyn SegmentVoice,
    ) -> ProjectResult<Vec<u8>> {
        let text = spoken_text(text)?;
        require_speed(speed)?;
        let (scratch, mix) =
            self.with_files(project_id, |files| Ok((files.scratch_dir(), files.mix()?)))?;
        let speech = voice.speak(voice_id, &text, mix.sentence_pause_ms())?;
        let (clip, _) = render_clip(&speech.wav, speed, &scratch)?;
        clip.read()
    }

    pub fn export(&self, project_id: i64, unit_ids: &[String]) -> ProjectResult<ExportReply> {
        let root = self.projects.dir().to_path_buf();
        let (wav, srt) = self.projects.with_project(project_id, |summary, dir| {
            let chapters = project_chapters(&root, summary)?;
            export_units(dir, &summary.name, &chapters, unit_ids)
        })?;
        Ok(ExportReply {
            wav: wav.to_string_lossy().into_owned(),
            srt: srt.to_string_lossy().into_owned(),
        })
    }

    fn with_files<T>(
        &self,
        project_id: i64,
        job: impl FnOnce(&AudiobookFiles) -> ProjectResult<T>,
    ) -> ProjectResult<T> {
        self.projects
            .with_project(project_id, |_, dir| job(&AudiobookFiles::new(dir)))
    }
}

fn persist_segment(
    clip: Clip,
    wav_target: &Path,
    srt_target: &Path,
    subtitles: Option<&str>,
) -> ProjectResult<()> {
    clip.persist(wav_target)?;
    match subtitles {
        Some(text) => write_atomic(srt_target, text.as_bytes())?,
        None => remove_if_exists(srt_target)?,
    }
    Ok(())
}

fn spoken_text(text: &str) -> ProjectResult<String> {
    let text = text.trim();
    if text.is_empty() {
        return Err(ProjectError::invalid("text must not be empty"));
    }
    Ok(text.to_string())
}

fn missing_record(block_id: &str) -> ProjectError {
    ProjectError::not_found(format!("segment {block_id} has no audio"))
}
