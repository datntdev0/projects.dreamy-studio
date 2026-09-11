use crate::features::pipeline::log::TaskLog;
use crate::features::pipeline::models::JobOwner;
use crate::features::pipeline::models::PipelineError;
use crate::features::pipeline::models::PipelineResult;
use crate::features::pipeline::models::PipelineTask;
use crate::features::pipeline::models::TaskRequest;
use crate::features::workspace::session::WorkspaceSession;
use std::collections::HashMap;
use std::path::Path;
use std::sync::Arc;
use std::sync::atomic::AtomicBool;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TaskOutcome {
    Cancelled,
    Failed(String),
}

pub trait PipelineJob: Send + Sync {
    fn kind(&self) -> &'static str;
    fn owner(&self) -> JobOwner;
    fn scope(&self) -> String;
    fn dir(&self) -> &Path;
    fn validate(&self, tasks: &[TaskRequest]) -> PipelineResult<()>;
    fn prepare(&self) -> Result<(), String>;
    fn run(
        &self,
        task: &PipelineTask,
        log: &TaskLog,
        progress: &dyn Fn(u8),
        cancel: &AtomicBool,
    ) -> Result<(), TaskOutcome>;
}

pub trait JobFactory: Send + Sync {
    fn kind(&self) -> &'static str;
    fn create(
        &self,
        session: &WorkspaceSession,
        owner: JobOwner,
        params: &serde_json::Value,
    ) -> PipelineResult<Box<dyn PipelineJob>>;
}

#[derive(Default)]
pub struct JobRegistry {
    factories: HashMap<&'static str, Arc<dyn JobFactory>>,
}

impl JobRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn register(mut self, factory: Arc<dyn JobFactory>) -> Self {
        self.factories.insert(factory.kind(), factory);
        self
    }

    pub fn create(
        &self,
        kind: &str,
        session: &WorkspaceSession,
        owner: JobOwner,
        params: &serde_json::Value,
    ) -> PipelineResult<Box<dyn PipelineJob>> {
        let factory = self
            .factories
            .get(kind)
            .ok_or_else(|| PipelineError::invalid(format!("unsupported pipeline kind '{kind}'")))?;
        factory.create(session, owner, params)
    }
}
