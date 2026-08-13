use crate::features::workspace::inspector::NotFoundReason;
use crate::features::workspace::inspector::StatusKind;
use crate::features::workspace::inspector::WorkspaceInspector;
use crate::features::workspace::repository::format_timestamp;
use crate::features::workspace::repository::RecentWorkspace;
use crate::features::workspace::repository::RECENT_WORKSPACE_LIMIT;
use crate::features::workspace::repository::WorkspaceRepository;
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

    #[cfg(test)]
    pub fn recent_list(&self) -> Vec<RecentWorkspaceView> {
        self.recent_list_for(None)
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::features::workspace::inspector::WORKSPACE_DB_FILE;
    use crate::infra::storage::database::Database;
    use crate::infra::storage::migrator::Migrator;
    use crate::infra::storage::migrator::app_scripts;
    use chrono::TimeZone;
    use rusqlite::Connection;
    use serde_json::Value;
    use std::fs;
    use std::path::PathBuf;
    use std::sync::atomic::AtomicBool;
    use tempfile::TempDir;

    fn at(second: u32) -> DateTime<Utc> {
        Utc.with_ymd_and_hms(2026, 1, 1, 0, 0, second).unwrap()
    }

    fn service_in(dir: &TempDir) -> WorkspaceService {
        let path = dir.path().join("application.dreamydb");
        let mut db = Database::create(&path).unwrap();
        let cancel = AtomicBool::new(false);
        Migrator::migrate(db.connection_mut(), &app_scripts().unwrap(), &cancel).unwrap();
        WorkspaceService::new(WorkspaceRepository::new(path))
    }

    fn make_folder(dir: &TempDir, name: &str) -> PathBuf {
        let folder = dir.path().join(name);
        fs::create_dir(&folder).unwrap();
        folder
    }

    fn make_projects(folder: &Path, rows: u32) {
        let conn = Connection::open(folder.join(WORKSPACE_DB_FILE)).unwrap();
        conn.execute_batch("CREATE TABLE ws_projects (id INTEGER PRIMARY KEY);")
            .unwrap();
        for _ in 0..rows {
            conn.execute("INSERT INTO ws_projects DEFAULT VALUES", [])
                .unwrap();
        }
    }

    fn text(path: &Path) -> &str {
        path.to_str().unwrap()
    }

    fn view_name(view: RecentWorkspaceView) -> String {
        view.name
    }

    #[test]
    fn ok_row_carries_project_count() {
        let dir = TempDir::new().unwrap();
        let service = service_in(&dir);
        let folder = make_folder(&dir, "Novel");
        make_projects(&folder, 3);
        service.record_opened(text(&folder), at(1)).unwrap();
        let views = service.recent_list();
        assert_eq!(views.len(), 1);
        assert_eq!(views[0].name, "Novel");
        assert_eq!(views[0].status, StatusKind::Ok);
        assert_eq!(views[0].reason, None);
        assert_eq!(views[0].project_count, Some(3));
    }

    #[test]
    fn ok_row_without_workspace_database_has_zero_projects() {
        let dir = TempDir::new().unwrap();
        let service = service_in(&dir);
        let folder = make_folder(&dir, "Empty");
        service.record_opened(text(&folder), at(1)).unwrap();
        assert_eq!(service.recent_list()[0].project_count, Some(0));
    }

    #[test]
    fn missing_folder_is_not_found_without_project_count() {
        let dir = TempDir::new().unwrap();
        let service = service_in(&dir);
        let gone = dir.path().join("Gone");
        service.record_opened(text(&gone), at(1)).unwrap();
        let views = service.recent_list();
        assert_eq!(views[0].status, StatusKind::NotFound);
        assert_eq!(views[0].reason, Some(NotFoundReason::Missing));
        assert_eq!(views[0].project_count, None);
    }

    #[test]
    fn file_path_is_not_a_directory() {
        let dir = TempDir::new().unwrap();
        let service = service_in(&dir);
        let file = dir.path().join("file.txt");
        fs::write(&file, b"x").unwrap();
        service.record_opened(text(&file), at(1)).unwrap();
        let views = service.recent_list();
        assert_eq!(views[0].status, StatusKind::NotFound);
        assert_eq!(views[0].reason, Some(NotFoundReason::NotADirectory));
        assert_eq!(views[0].project_count, None);
    }

    #[test]
    fn rows_are_ordered_newest_first() {
        let dir = TempDir::new().unwrap();
        let service = service_in(&dir);
        let first = make_folder(&dir, "First");
        let second = make_folder(&dir, "Second");
        let third = dir.path().join("Third");
        service.record_opened(text(&first), at(1)).unwrap();
        service.record_opened(text(&third), at(3)).unwrap();
        service.record_opened(text(&second), at(2)).unwrap();
        let names: Vec<String> = service.recent_list().into_iter().map(view_name).collect();
        assert_eq!(names, vec!["Third", "Second", "First"]);
    }

    #[test]
    fn ok_row_serializes_to_contract_shape() {
        let dir = TempDir::new().unwrap();
        let service = service_in(&dir);
        let folder = make_folder(&dir, "Novel");
        make_projects(&folder, 2);
        service.record_opened(text(&folder), at(4)).unwrap();
        let json = serde_json::to_value(service.recent_list()).unwrap();
        let row = &json[0];
        assert_eq!(row["path"], text(&folder));
        assert_eq!(row["name"], "Novel");
        assert_eq!(row["lastOpenedAt"], "2026-01-01T00:00:04.000Z");
        assert_eq!(row["status"], "ok");
        assert_eq!(row["projectCount"], 2);
        assert_eq!(row.get("reason"), None);
        assert_eq!(row["isCurrent"], false);
    }

    #[test]
    fn not_found_row_omits_project_count() {
        let dir = TempDir::new().unwrap();
        let service = service_in(&dir);
        let gone = dir.path().join("Gone");
        service.record_opened(text(&gone), at(1)).unwrap();
        let json = serde_json::to_value(service.recent_list()).unwrap();
        let row: &Value = &json[0];
        assert_eq!(row["status"], "not_found");
        assert_eq!(row["reason"], "missing");
        assert_eq!(row.get("projectCount"), None);
        assert!(row.get("last_opened_at").is_none());
    }

    #[test]
    fn recent_list_is_empty_without_database() {
        let dir = TempDir::new().unwrap();
        let repository = WorkspaceRepository::new(dir.path().join("none.dreamydb"));
        let service = WorkspaceService::new(repository);
        assert!(service.recent_list().is_empty());
    }

    #[test]
    fn measure_sums_directory_size() {
        let dir = TempDir::new().unwrap();
        let service = service_in(&dir);
        let folder = make_folder(&dir, "Sized");
        fs::write(folder.join("a.bin"), vec![0u8; 12]).unwrap();
        fs::write(folder.join("b.bin"), vec![0u8; 8]).unwrap();
        assert_eq!(service.measure(text(&folder)), 20);
    }

    #[test]
    fn delete_workspace_removes_entry_and_workspace_directory() {
        let dir = TempDir::new().unwrap();
        let service = service_in(&dir);
        let folder = make_folder(&dir, "Novel");
        fs::write(folder.join("delete.txt"), b"data").unwrap();
        service.record_opened(text(&folder), at(1)).unwrap();
        service.delete_workspace(text(&folder)).unwrap();
        assert!(service.recent_list().is_empty());
        assert!(!folder.exists());
    }

    #[test]
    fn relocate_recent_updates_entry() {
        let dir = TempDir::new().unwrap();
        let service = service_in(&dir);
        let old = dir.path().join("Old");
        let new = make_folder(&dir, "New");
        service.record_opened(text(&old), at(1)).unwrap();
        service
            .relocate_recent(text(&old), text(&new), at(2))
            .unwrap();
        let views = service.recent_list();
        assert_eq!(views.len(), 1);
        assert_eq!(views[0].name, "New");
        assert_eq!(views[0].status, StatusKind::Ok);
    }

    fn current_of(folder: &Path) -> CurrentWorkspace {
        let target = NormalizedPath::new(text(folder));
        CurrentWorkspace {
            name: target.name,
            path: target.path,
        }
    }

    fn current_flags(views: &[RecentWorkspaceView]) -> Vec<bool> {
        views.iter().map(view_is_current).collect()
    }

    fn view_is_current(view: &RecentWorkspaceView) -> bool {
        view.is_current
    }

    #[test]
    fn no_open_workspace_flags_every_row_as_not_current() {
        let dir = TempDir::new().unwrap();
        let service = service_in(&dir);
        let first = make_folder(&dir, "First");
        let second = make_folder(&dir, "Second");
        service.record_opened(text(&first), at(1)).unwrap();
        service.record_opened(text(&second), at(2)).unwrap();
        assert_eq!(current_flags(&service.recent_list()), vec![false, false]);
        assert_eq!(
            current_flags(&service.recent_list_for(None)),
            vec![false, false]
        );
    }

    #[test]
    fn open_row_is_flagged_and_others_are_not() {
        let dir = TempDir::new().unwrap();
        let service = service_in(&dir);
        let first = make_folder(&dir, "First");
        let second = make_folder(&dir, "Second");
        make_projects(&first, 4);
        service.record_opened(text(&first), at(1)).unwrap();
        service.record_opened(text(&second), at(2)).unwrap();
        let views = service.recent_list_for(Some(&current_of(&first)));
        assert_eq!(current_flags(&views), vec![false, true]);
        assert_eq!(views[1].status, StatusKind::Ok);
        assert_eq!(views[1].project_count, Some(4));
    }

    #[test]
    fn open_row_is_ok_with_zero_projects_when_folder_is_gone() {
        let dir = TempDir::new().unwrap();
        let service = service_in(&dir);
        let gone = dir.path().join("Gone");
        service.record_opened(text(&gone), at(1)).unwrap();
        let views = service.recent_list_for(Some(&current_of(&gone)));
        assert_eq!(views.len(), 1);
        assert_eq!(views[0].status, StatusKind::Ok);
        assert_eq!(views[0].reason, None);
        assert_eq!(views[0].project_count, Some(0));
        assert!(views[0].is_current);
    }

    #[test]
    fn open_row_is_built_when_its_entry_was_removed() {
        let dir = TempDir::new().unwrap();
        let service = service_in(&dir);
        let open = make_folder(&dir, "Open");
        let other = make_folder(&dir, "Other");
        make_projects(&open, 2);
        service.record_opened(text(&other), at(1)).unwrap();
        let views = service.recent_list_for(Some(&current_of(&open)));
        assert_eq!(views.len(), 2);
        assert_eq!(views[0].name, "Open");
        assert_eq!(views[0].path, text(&open));
        assert_eq!(views[0].status, StatusKind::Ok);
        assert_eq!(views[0].project_count, Some(2));
        assert!(views[0].is_current);
        assert!(!views[0].last_opened_at.is_empty());
        assert!(!views[1].is_current);
    }

    #[test]
    fn open_row_is_built_when_the_list_is_empty() {
        let dir = TempDir::new().unwrap();
        let service = service_in(&dir);
        let open = make_folder(&dir, "Open");
        let views = service.recent_list_for(Some(&current_of(&open)));
        assert_eq!(views.len(), 1);
        assert!(views[0].is_current);
    }

    #[test]
    fn matching_ignores_case_and_trailing_separator() {
        let dir = TempDir::new().unwrap();
        let service = service_in(&dir);
        let folder = make_folder(&dir, "Novel");
        service.record_opened(text(&folder), at(1)).unwrap();
        let shouted = format!("{}\\", text(&folder).to_uppercase());
        let current = CurrentWorkspace {
            name: "Novel".to_string(),
            path: shouted,
        };
        let views = service.recent_list_for(Some(&current));
        assert_eq!(views.len(), 1);
        assert!(views[0].is_current);
        assert_eq!(views[0].path, text(&folder));
    }

    #[test]
    fn current_row_serializes_with_is_current() {
        let dir = TempDir::new().unwrap();
        let service = service_in(&dir);
        let gone = dir.path().join("Gone");
        service.record_opened(text(&gone), at(1)).unwrap();
        let views = service.recent_list_for(Some(&current_of(&gone)));
        let json = serde_json::to_value(views).unwrap();
        assert_eq!(json[0]["isCurrent"], true);
        assert_eq!(json[0]["status"], "ok");
        assert_eq!(json[0]["projectCount"], 0);
        assert_eq!(json[0].get("reason"), None);
        assert!(json[0].get("is_current").is_none());
    }
}
