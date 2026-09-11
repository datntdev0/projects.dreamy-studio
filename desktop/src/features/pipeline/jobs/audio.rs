use crate::features::audiobook::models::SegmentRequest;
use crate::features::audiobook::service::AudiobookWorkspace;
use crate::features::audiobook::voice::LibrarySpeaker;
use crate::features::audiobook::voice::SegmentVoice;
use crate::features::backend::service::Synthesizer;
use crate::features::library::service::LibraryService;
use crate::features::pipeline::job::JobFactory;
use crate::features::pipeline::job::PipelineJob;
use crate::features::pipeline::job::TaskOutcome;
use crate::features::pipeline::log::TaskLog;
use crate::features::pipeline::models::JobOwner;
use crate::features::pipeline::models::PipelineError;
use crate::features::pipeline::models::PipelineErrorCode;
use crate::features::pipeline::models::PipelineResult;
use crate::features::pipeline::models::PipelineTask;
use crate::features::pipeline::models::TaskRequest;
use crate::features::project::models::ProjectError;
use crate::features::project::models::ProjectErrorCode;
use crate::features::project::service::ProjectService;
use crate::features::scripting::files::require_safe_id;
use crate::features::scripting::files::require_unit_id;
use crate::features::workspace::session::WorkspaceSession;
use std::collections::BTreeMap;
use std::path::Path;
use std::sync::Arc;
use std::sync::atomic::AtomicBool;
use std::sync::atomic::Ordering;

pub const KIND_AUDIO: &str = "audio";
const DEFAULT_SCOPE: &str = "audio";

pub struct AudioJob {
    audiobook: AudiobookWorkspace,
    project_id: i64,
    scope: String,
    requests: BTreeMap<String, SegmentRequest>,
    voice: Arc<dyn SegmentVoice>,
}

impl AudioJob {
    pub fn new(
        audiobook: AudiobookWorkspace,
        project_id: i64,
        requests: BTreeMap<String, SegmentRequest>,
        voice: Arc<dyn SegmentVoice>,
    ) -> Self {
        Self {
            audiobook,
            project_id,
            scope: DEFAULT_SCOPE.to_string(),
            requests,
            voice,
        }
    }

    pub fn with_scope(mut self, scope: &str) -> Self {
        self.scope = scope.to_string();
        self
    }

    fn request_of(&self, segment_id: Option<&str>) -> Result<&SegmentRequest, String> {
        let segment_id = segment_id.ok_or_else(|| "segmentId is required".to_string())?;
        self.requests
            .get(segment_id)
            .ok_or_else(|| format!("segment {segment_id} has no request"))
    }
}

impl PipelineJob for AudioJob {
    fn kind(&self) -> &'static str {
        KIND_AUDIO
    }

    fn owner(&self) -> JobOwner {
        JobOwner::Project(self.project_id)
    }

    fn scope(&self) -> String {
        self.scope.clone()
    }

    fn dir(&self) -> &Path {
        self.audiobook.dir()
    }

    fn validate(&self, tasks: &[TaskRequest]) -> PipelineResult<()> {
        for task in tasks {
            require_unit_id(&task.chapter_id).map_err(pipeline_error)?;
            let segment_id = task.segment_id.as_deref().unwrap_or_default();
            require_safe_id("block", segment_id).map_err(pipeline_error)?;
            let request = self
                .request_of(task.segment_id.as_deref())
                .map_err(PipelineError::invalid)?;
            if request.text.trim().is_empty() {
                return Err(PipelineError::invalid("segment text must not be empty"));
            }
        }
        Ok(())
    }

    fn prepare(&self) -> Result<(), String> {
        Ok(())
    }

    fn run(
        &self,
        task: &PipelineTask,
        log: &TaskLog,
        progress: &dyn Fn(u8),
        cancel: &AtomicBool,
    ) -> Result<(), TaskOutcome> {
        if cancel.load(Ordering::SeqCst) {
            return Err(TaskOutcome::Cancelled);
        }
        let segment_id = task.segment_id.as_deref().unwrap_or_default();
        let request = self
            .request_of(task.segment_id.as_deref())
            .map_err(TaskOutcome::Failed)?;
        log.line(&format!(
            "generating segment {segment_id} of {} with voice {}",
            task.chapter_id, request.voice
        ));
        let record = self
            .audiobook
            .generate_unless(
                self.project_id,
                &task.chapter_id,
                segment_id,
                request,
                self.voice.as_ref(),
                cancel,
            )
            .map_err(|error| TaskOutcome::Failed(error.detail))?
            .ok_or(TaskOutcome::Cancelled)?;
        log.line(&format!("saved {:.2}s of audio", record.dur));
        progress(100);
        Ok(())
    }
}

pub struct AudioJobFactory {
    projects: ProjectService,
    library: LibraryService,
    synthesizer: Arc<dyn Synthesizer>,
}

impl AudioJobFactory {
    pub fn new(
        projects: ProjectService,
        library: LibraryService,
        synthesizer: Arc<dyn Synthesizer>,
    ) -> Self {
        Self {
            projects,
            library,
            synthesizer,
        }
    }
}

impl JobFactory for AudioJobFactory {
    fn kind(&self) -> &'static str {
        KIND_AUDIO
    }

    fn create(
        &self,
        session: &WorkspaceSession,
        owner: JobOwner,
        params: &serde_json::Value,
    ) -> PipelineResult<Box<dyn PipelineJob>> {
        let project_id = owner.require_project()?;
        let projects = self.projects.open(session).map_err(pipeline_error)?;
        projects
            .with_project(project_id, |_, _| Ok(()))
            .map_err(pipeline_error)?;
        let library = self
            .library
            .open(session)
            .map_err(|error| PipelineError::new(PipelineErrorCode::NoWorkspace, error.detail))?;
        let voice = Arc::new(LibrarySpeaker::new(library, self.synthesizer.clone()));
        let job = AudioJob::new(
            AudiobookWorkspace::new(projects),
            project_id,
            requests_of(params)?,
            voice,
        );
        Ok(Box::new(match scope_of(params) {
            Some(scope) => job.with_scope(scope),
            None => job,
        }))
    }
}

pub fn requests_of(params: &serde_json::Value) -> PipelineResult<BTreeMap<String, SegmentRequest>> {
    let raw = params
        .get("requests")
        .cloned()
        .ok_or_else(|| PipelineError::invalid("requests are required"))?;
    serde_json::from_value(raw)
        .map_err(|error| PipelineError::invalid(format!("requests are malformed: {error}")))
}

fn scope_of(params: &serde_json::Value) -> Option<&str> {
    params
        .get("target")
        .and_then(serde_json::Value::as_str)
        .filter(|scope| !scope.trim().is_empty())
}

pub fn pipeline_error(error: ProjectError) -> PipelineError {
    let code = match error.code {
        ProjectErrorCode::NoWorkspace => PipelineErrorCode::NoWorkspace,
        ProjectErrorCode::NotFound => PipelineErrorCode::NotFound,
        ProjectErrorCode::Io => PipelineErrorCode::Io,
        ProjectErrorCode::Db => PipelineErrorCode::Db,
        ProjectErrorCode::Task => PipelineErrorCode::Task,
        _ => PipelineErrorCode::InvalidInput,
    };
    PipelineError::new(code, error.detail)
}
