use crate::features::workspace::inspector::NotFoundReason;
use crate::features::workspace::inspector::StatusKind;
use crate::features::workspace::inspector::WorkspaceInspector;
use crate::features::workspace::repository::RecentWorkspace;
use crate::features::workspace::repository::WorkspaceRepository;
use crate::infra::storage::StorageResult;
use chrono::DateTime;
use chrono::Utc;
use serde::Serialize;
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

    pub fn recent_list(&self) -> Vec<RecentWorkspaceView> {
        let mut views = Vec::new();
        for entry in self.repository.list() {
            views.push(self.to_view(entry));
        }
        views
    }

    pub fn measure(&self, path: &str) -> u64 {
        self.inspector.directory_size(Path::new(path))
    }

    pub fn remove_recent(&self, path: &str) -> StorageResult<()> {
        self.repository.remove(path)
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
        }
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
        conn.execute_batch("CREATE TABLE projects (id INTEGER PRIMARY KEY);")
            .unwrap();
        for _ in 0..rows {
            conn.execute("INSERT INTO projects DEFAULT VALUES", [])
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
    fn remove_recent_deletes_entry_only() {
        let dir = TempDir::new().unwrap();
        let service = service_in(&dir);
        let folder = make_folder(&dir, "Novel");
        fs::write(folder.join("keep.txt"), b"data").unwrap();
        service.record_opened(text(&folder), at(1)).unwrap();
        service.remove_recent(text(&folder)).unwrap();
        assert!(service.recent_list().is_empty());
        assert!(folder.join("keep.txt").is_file());
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
}
