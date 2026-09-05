use crate::features::project::models::ProjectInput;
use crate::features::project::service::ProjectWorkspace;
use crate::features::workspace::inspector::WORKSPACE_DB_FILE;
use crate::infra::storage::database::Database;
use crate::infra::storage::migrator::Migrator;
use crate::infra::storage::migrator::workspace_scripts;
use std::sync::atomic::AtomicBool;
use tempfile::TempDir;

pub fn project_workspace() -> (TempDir, ProjectWorkspace) {
    let dir = TempDir::new().unwrap();
    let mut db = Database::create(&dir.path().join(WORKSPACE_DB_FILE)).unwrap();
    Migrator::migrate(
        db.connection_mut(),
        &workspace_scripts().unwrap(),
        &AtomicBool::new(false),
    )
    .unwrap();
    let workspace = ProjectWorkspace::new(dir.path().to_path_buf());
    (dir, workspace)
}

pub fn create_project(workspace: &ProjectWorkspace) -> i64 {
    let input = ProjectInput {
        name: "Book".to_string(),
        template: "audiobook".to_string(),
        description: String::new(),
        novel_id: None,
        src_kind: None,
        range_from: None,
        range_to: None,
    };
    workspace.create(input).unwrap().id
}
