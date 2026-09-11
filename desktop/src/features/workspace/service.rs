use crate::features::workspace::inspector::NotFoundReason;
use crate::features::workspace::inspector::StatusKind;
use crate::features::workspace::inspector::WorkspaceInspector;
use crate::features::workspace::repository::RECENT_WORKSPACE_LIMIT;
use crate::features::workspace::repository::RecentWorkspace;
use crate::features::workspace::repository::WorkspaceRepository;
use crate::features::workspace::repository::format_timestamp;
use crate::features::workspace::session::CurrentWorkspace;
use crate::infra::storage::StorageResult;
use crate::shared::path::NormalizedPath;
use chrono::DateTime;
use chrono::Utc;
use serde::Serialize;
use std::fs;
use std::path::Path;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentWorkspaceView {
    pub path: String,
    pub name: String,
    pub last_opened_at: String,
    pub status: StatusKind,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<NotFoundReason>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub project_count: Option<u64>,
    pub is_current: bool,
}

#[derive(Debug, Clone)]
pub struct WorkspaceService {
    repository: WorkspaceRepository,
    inspector: WorkspaceInspector,
}

impl WorkspaceService {
    pub fn new(repository: WorkspaceRepository) -> Self {
        Self::with_inspector(repository, WorkspaceInspector)
    }

    pub fn with_inspector(repository: WorkspaceRepository, inspector: WorkspaceInspector) -> Self {
        Self {
            repository,
            inspector,
        }
    }

    pub fn recent_list_for(&self, current: Option<&CurrentWorkspace>) -> Vec<RecentWorkspaceView> {
        let current_key = current.map(current_key_of);
        let mut views = Vec::new();
        let mut found = false;
        for entry in self.repository.list() {
            if is_entry_current(&entry, current_key.as_deref()) {
                found = true;
                views.push(self.to_current_view(entry));
            } else {
                views.push(self.to_view(entry));
            }
        }
        if let (Some(current), false) = (current, found) {
            views.insert(0, self.to_current_view(entry_of_current(current)));
        }
        views.truncate(RECENT_WORKSPACE_LIMIT);
        views
    }

    pub fn measure(&self, path: &str) -> u64 {
        self.inspector.directory_size(Path::new(path))
    }

    pub fn delete_workspace(&self, path: &str) -> Result<(), String> {
        let target = NormalizedPath::new(path);
        let known = self
            .repository
            .list()
            .into_iter()
            .any(|entry| NormalizedPath::new(&entry.path).key == target.key);
        if !known {
            return Err("Workspace is not in the recent list.".to_string());
        }
        let folder = Path::new(&target.path);
        if folder.parent().is_none() {
            return Err("Deleting a filesystem root is not allowed.".to_string());
        }
        if folder.exists() {
            if !folder.is_dir() {
                return Err("Workspace path is not a directory.".to_string());
            }
            fs::remove_dir_all(folder).map_err(|error| error.to_string())?;
        }
        self.repository
            .remove(&target.path)
            .map_err(|error| error.to_string())
    }

    pub fn record_opened(&self, path: &str, now: DateTime<Utc>) -> StorageResult<()> {
        self.repository.touch(path, now)
    }

    pub fn relocate_recent(
        &self,
        old_path: &str,
        new_path: &str,
        now: DateTime<Utc>,
    ) -> StorageResult<()> {
        self.repository.relocate(old_path, new_path, now)
    }

    fn to_view(&self, entry: RecentWorkspace) -> RecentWorkspaceView {
        let folder = Path::new(&entry.path);
        let folder_status = self.inspector.status(folder);
        let project_count = match folder_status.status {
            StatusKind::Ok => Some(self.inspector.project_count(folder)),
            StatusKind::NotFound => None,
        };
        RecentWorkspaceView {
            path: entry.path,
            name: entry.name,
            last_opened_at: entry.last_opened_at,
            status: folder_status.status,
            reason: folder_status.reason,
            project_count,
            is_current: false,
        }
    }

    fn to_current_view(&self, entry: RecentWorkspace) -> RecentWorkspaceView {
        let folder = Path::new(&entry.path);
        let project_count = match self.inspector.status(folder).status {
            StatusKind::Ok => self.inspector.project_count(folder),
            StatusKind::NotFound => 0,
        };
        RecentWorkspaceView {
            path: entry.path,
            name: entry.name,
            last_opened_at: entry.last_opened_at,
            status: StatusKind::Ok,
            reason: None,
            project_count: Some(project_count),
            is_current: true,
        }
    }
}

fn current_key_of(current: &CurrentWorkspace) -> String {
    NormalizedPath::new(&current.path).key
}

fn is_entry_current(entry: &RecentWorkspace, current_key: Option<&str>) -> bool {
    match current_key {
        Some(key) => NormalizedPath::new(&entry.path).key == key,
        None => false,
    }
}

fn entry_of_current(current: &CurrentWorkspace) -> RecentWorkspace {
    RecentWorkspace {
        path: current.path.clone(),
        name: current.name.clone(),
        last_opened_at: format_timestamp(Utc::now()),
    }
}
