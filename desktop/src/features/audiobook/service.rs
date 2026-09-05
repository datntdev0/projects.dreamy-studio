use crate::features::project::files::read_json;
use crate::features::project::models::ProjectResult;
use crate::features::project::service::ProjectWorkspace;
use serde_json::Value;
use std::path::Path;
use std::path::PathBuf;

const AUDIOBOOK_DIR: &str = "audiobook";
const AUDIOBOOK_FILE: &str = "audiobook.json";

#[derive(Debug, Clone)]
pub struct AudiobookWorkspace {
    projects: ProjectWorkspace,
}

impl AudiobookWorkspace {
    pub fn new(projects: ProjectWorkspace) -> Self {
        Self { projects }
    }

    pub fn get(&self, project_id: i64) -> ProjectResult<Option<Value>> {
        self.projects
            .with_project(project_id, |_, dir| read_json(&audiobook_path(dir)))
    }
}

pub fn audiobook_path(project_dir: &Path) -> PathBuf {
    project_dir.join(AUDIOBOOK_DIR).join(AUDIOBOOK_FILE)
}

#[cfg(test)]
#[path = "../../../test/features/audiobook/service.test.rs"]
mod tests;
