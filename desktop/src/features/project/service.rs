use crate::features::novel::files::CoverKind;
use crate::features::novel::models::NovelErrorCode;
use crate::features::novel::service::cover_data_url;
use crate::features::novel::service::parse_cover_data_url;
use crate::features::project::files::PROJECTS_DIR;
use crate::features::project::files::ProjectFiles;
use crate::features::project::files::slug;
use crate::features::project::models::ProjectError;
use crate::features::project::models::ProjectErrorCode;
use crate::features::project::models::ProjectInput;
use crate::features::project::models::ProjectPatch;
use crate::features::project::models::ProjectResult;
use crate::features::project::models::ProjectSummary;
use crate::features::project::repository::NewProject;
use crate::features::project::repository::ProjectRepository;
use crate::features::project::repository::ProjectRow;
use crate::features::workspace::inspector::WORKSPACE_DB_FILE;
use crate::features::workspace::repository::format_timestamp;
use crate::features::workspace::session::WorkspaceSession;
use crate::infra::storage::database::Database;
use chrono::Utc;
use rusqlite::TransactionBehavior;
use std::path::PathBuf;
use std::sync::Arc;
use std::sync::Mutex;
use std::sync::MutexGuard;

pub const TEMPLATES: [&str; 3] = ["audiobook", "filmseries", "blank"];

fn now_text() -> String {
    format_timestamp(Utc::now())
}

fn lock(mutex: &Mutex<()>) -> MutexGuard<'_, ()> {
    match mutex.lock() {
        Ok(guard) => guard,
        Err(poisoned) => poisoned.into_inner(),
    }
}

fn parse_cover(data_url: &str) -> ProjectResult<(CoverKind, Vec<u8>)> {
    parse_cover_data_url(data_url).map_err(|error| {
        let code = match error.code {
            NovelErrorCode::CoverTooLarge => ProjectErrorCode::CoverTooLarge,
            _ => ProjectErrorCode::CoverInvalid,
        };
        ProjectError::new(code, error.detail)
    })
}

fn clean_name(name: &str) -> ProjectResult<String> {
    let name = name.trim();
    if name.is_empty()
        || name.chars().count() > 60
        || name.chars().any(|c| "<>:\"/\\|?*".contains(c))
    {
        return Err(ProjectError::invalid(
            "name must be 1-60 characters and contain no forbidden characters",
        ));
    }
    Ok(name.to_string())
}

#[derive(Debug, Clone, Default)]
pub struct ProjectService {
    gate: Arc<Mutex<()>>,
}

impl ProjectService {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn open(&self, session: &WorkspaceSession) -> ProjectResult<ProjectWorkspace> {
        match session.current() {
            Some(current) => Ok(ProjectWorkspace::with_gate(
                PathBuf::from(current.path),
                self.gate.clone(),
            )),
            None => Err(ProjectError::new(
                ProjectErrorCode::NoWorkspace,
                "no workspace is open",
            )),
        }
    }
}

#[derive(Debug, Clone)]
pub struct ProjectWorkspace {
    dir: PathBuf,
    gate: Arc<Mutex<()>>,
}

impl ProjectWorkspace {
    #[cfg(test)]
    pub fn new(dir: PathBuf) -> Self {
        Self::with_gate(dir, Arc::new(Mutex::new(())))
    }

    pub fn with_gate(dir: PathBuf, gate: Arc<Mutex<()>>) -> Self {
        Self { dir, gate }
    }

    pub fn list(&self) -> ProjectResult<Vec<ProjectSummary>> {
        let db = self.database()?;
        Ok(ProjectRepository::new(db.connection()).list()?)
    }

    pub fn create(&self, input: ProjectInput) -> ProjectResult<ProjectSummary> {
        let name = clean_name(&input.name)?;
        if !TEMPLATES.contains(&input.template.as_str()) {
            return Err(ProjectError::invalid("unsupported project template"));
        }
        if input.range_from.is_some() != input.range_to.is_some() {
            return Err(ProjectError::new(
                ProjectErrorCode::RangeInvalid,
                "both chapter range endpoints are required",
            ));
        }
        if input.novel_id.is_none() && (input.src_kind.is_some() || input.range_from.is_some()) {
            return Err(ProjectError::invalid("source settings require a novel"));
        }
        let src_kind = match (&input.novel_id, input.src_kind.as_deref()) {
            (Some(_), None) => Some("original"),
            (Some(_), Some("original" | "translation")) => input.src_kind.as_deref(),
            (Some(_), Some(_)) => {
                return Err(ProjectError::invalid("unsupported source text kind"));
            }
            (None, _) => None,
        };
        let description = input.description.trim().to_string();
        let _gate = lock(&self.gate);
        let mut db = self.database()?;
        let tx = db
            .connection_mut()
            .transaction_with_behavior(TransactionBehavior::Immediate)?;
        let repo = ProjectRepository::new(&tx);
        ensure_name_available(&repo, &name, None)?;
        let src_lang = match input.novel_id {
            Some(id) => {
                let (lang, count) = repo.novel(id)?.ok_or_else(|| {
                    ProjectError::new(
                        ProjectErrorCode::NovelNotFound,
                        format!("novel {id} does not exist"),
                    )
                })?;
                if let (Some(from), Some(to)) = (input.range_from, input.range_to)
                    && (from < 1 || from > to || to > count)
                {
                    return Err(ProjectError::new(
                        ProjectErrorCode::RangeInvalid,
                        "chapter range is outside the novel",
                    ));
                }
                Some(lang)
            }
            None => None,
        };
        let files = self.files();
        let folder = unique_folder(&repo, &files, &name)?;
        let now = now_text();
        let id = repo.insert(&NewProject {
            name: &name,
            folder: &folder,
            template: &input.template,
            description: &description,
            novel_id: input.novel_id,
            src_kind,
            src_lang: src_lang.as_deref(),
            range_from: input.range_from,
            range_to: input.range_to,
            now: &now,
        })?;
        if let Err(error) = files.create_dir(&folder) {
            drop(tx);
            return Err(error);
        }
        let summary = ProjectRepository::new(&tx)
            .find_summary(id)?
            .ok_or_else(|| ProjectError::not_found("new project disappeared"))?;
        if let Err(error) = tx.commit() {
            let _ = files.remove_dir(&folder);
            return Err(error.into());
        }
        Ok(summary)
    }

    pub fn update(&self, id: i64, patch: ProjectPatch) -> ProjectResult<ProjectSummary> {
        let name = patch.name.as_deref().map(clean_name).transpose()?;
        let description = patch.description.map(|value| value.trim().to_string());
        let _gate = lock(&self.gate);
        let mut db = self.database()?;
        let tx = db
            .connection_mut()
            .transaction_with_behavior(TransactionBehavior::Immediate)?;
        let repo = ProjectRepository::new(&tx);
        let mut row = require_project(&repo, id)?;
        if let Some(name) = name {
            ensure_name_available(&repo, &name, Some(id))?;
            row.name = name;
        }
        if let Some(description) = description {
            row.description = description;
        }
        repo.update(&row, &now_text())?;
        let summary = repo
            .find_summary(id)?
            .ok_or_else(|| ProjectError::not_found(format!("project {id} does not exist")))?;
        tx.commit()?;
        Ok(summary)
    }

    pub fn archive(&self, ids: &[i64], archived: bool) -> ProjectResult<()> {
        let _gate = lock(&self.gate);
        let mut db = self.database()?;
        let tx = db.connection_mut().transaction()?;
        let repo = ProjectRepository::new(&tx);
        let now = now_text();
        for id in ids {
            if repo.find_project(*id)?.is_some() {
                repo.archive(*id, archived, &now)?;
            }
        }
        tx.commit()?;
        Ok(())
    }

    pub fn delete(&self, ids: &[i64]) -> ProjectResult<usize> {
        let _gate = lock(&self.gate);
        let mut db = self.database()?;
        let tx = db.connection_mut().transaction()?;
        let repo = ProjectRepository::new(&tx);
        let mut folders = Vec::new();
        let mut removed = 0;
        let mut gone = Vec::new();
        for id in ids
            .iter()
            .copied()
            .collect::<std::collections::BTreeSet<_>>()
        {
            if let Some(project) = repo.find_project(id)? {
                folders.push(project.folder);
                removed += usize::from(repo.delete(id)?);
                gone.push(id);
            }
        }
        tx.commit()?;
        for folder in folders {
            self.files().remove_dir(&folder)?;
        }
        for id in gone {
            self.files().clear_cover(id)?;
        }
        Ok(removed)
    }

    pub fn open_project(&self, id: i64) -> ProjectResult<ProjectSummary> {
        let _gate = lock(&self.gate);
        let mut db = self.database()?;
        let tx = db.connection_mut().transaction()?;
        let repo = ProjectRepository::new(&tx);
        require_project(&repo, id)?;
        repo.touch_opened(id, &now_text())?;
        let summary = repo
            .find_summary(id)?
            .ok_or_else(|| ProjectError::not_found(format!("project {id} does not exist")))?;
        tx.commit()?;
        Ok(summary)
    }

    pub fn cover_get(&self, id: i64) -> ProjectResult<Option<String>> {
        let db = self.database()?;
        require_project(&ProjectRepository::new(db.connection()), id)?;
        let cover = self.files().read_cover(id)?;
        Ok(cover.map(|(kind, bytes)| cover_data_url(kind, &bytes)))
    }

    pub fn cover_set(&self, id: i64, data_url: &str) -> ProjectResult<ProjectSummary> {
        let (kind, bytes) = parse_cover(data_url)?;
        let _gate = lock(&self.gate);
        let db = self.database()?;
        let repo = ProjectRepository::new(db.connection());
        let row = require_project(&repo, id)?;
        self.files().write_cover(id, kind, &bytes)?;
        repo.update(&row, &now_text())?;
        require_summary(&repo, id)
    }

    pub fn cover_clear(&self, id: i64) -> ProjectResult<ProjectSummary> {
        let _gate = lock(&self.gate);
        let db = self.database()?;
        let repo = ProjectRepository::new(db.connection());
        let row = require_project(&repo, id)?;
        self.files().clear_cover(id)?;
        repo.update(&row, &now_text())?;
        require_summary(&repo, id)
    }

    pub fn dir_list(
        &self,
        id: i64,
        path: &str,
    ) -> ProjectResult<Vec<crate::features::project::models::DirEntry>> {
        let db = self.database()?;
        let project = require_project(&ProjectRepository::new(db.connection()), id)?;
        self.files().list(&project.folder, path)
    }

    pub fn folder_path(&self, id: i64) -> ProjectResult<PathBuf> {
        let db = self.database()?;
        let project = require_project(&ProjectRepository::new(db.connection()), id)?;
        Ok(self.files().project_dir(&project.folder))
    }

    fn database(&self) -> ProjectResult<Database> {
        Ok(Database::open_read_write(
            &self.dir.join(WORKSPACE_DB_FILE),
        )?)
    }

    fn files(&self) -> ProjectFiles {
        ProjectFiles::new(self.dir.clone())
    }
}

fn ensure_name_available(
    repo: &ProjectRepository,
    name: &str,
    except: Option<i64>,
) -> ProjectResult<()> {
    let duplicate = repo.list()?.iter().any(|project| {
        project.name.to_lowercase() == name.to_lowercase() && Some(project.id) != except
    });
    if duplicate {
        return Err(ProjectError::new(
            ProjectErrorCode::NameTaken,
            "a project already uses that name",
        ));
    }
    Ok(())
}

fn unique_folder(
    repo: &ProjectRepository,
    files: &ProjectFiles,
    name: &str,
) -> ProjectResult<String> {
    let rows = repo.list()?;
    let base = slug(name);
    let mut suffix = 1;
    loop {
        let leaf = if suffix == 1 {
            base.clone()
        } else {
            format!("{base}-{suffix}")
        };
        let folder = format!("{PROJECTS_DIR}/{leaf}");
        if !rows.iter().any(|row| row.folder == folder) && !files.folder_taken(&folder) {
            return Ok(folder);
        }
        suffix += 1;
    }
}

fn require_summary(repo: &ProjectRepository, id: i64) -> ProjectResult<ProjectSummary> {
    repo.find_summary(id)?
        .ok_or_else(|| ProjectError::not_found(format!("project {id} does not exist")))
}

fn require_project(repo: &ProjectRepository, id: i64) -> ProjectResult<ProjectRow> {
    repo.find_project(id)?
        .ok_or_else(|| ProjectError::not_found(format!("project {id} does not exist")))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::infra::storage::migrator::Migrator;
    use crate::infra::storage::migrator::workspace_scripts;
    use std::sync::atomic::AtomicBool;
    use tempfile::TempDir;

    fn workspace() -> (TempDir, ProjectWorkspace) {
        let dir = TempDir::new().unwrap();
        let db_path = dir.path().join(WORKSPACE_DB_FILE);
        let mut db = Database::create(&db_path).unwrap();
        Migrator::migrate(
            db.connection_mut(),
            &workspace_scripts().unwrap(),
            &AtomicBool::new(false),
        )
        .unwrap();
        let workspace = ProjectWorkspace::new(dir.path().to_path_buf());
        (dir, workspace)
    }

    fn input(name: &str) -> ProjectInput {
        ProjectInput {
            name: name.to_string(),
            template: "audiobook".to_string(),
            description: String::new(),
            novel_id: None,
            src_kind: None,
            range_from: None,
            range_to: None,
        }
    }

    fn insert_novel(dir: &TempDir, chapters: i64) -> i64 {
        let conn = rusqlite::Connection::open(dir.path().join(WORKSPACE_DB_FILE)).unwrap();
        conn.execute(
            "INSERT INTO ws_novels (title, lang, origin, created_at, updated_at) VALUES ('Book', 'ZH', 'created', 'now', 'now')",
            [],
        ).unwrap();
        let id = conn.last_insert_rowid();
        for seq in 1..=chapters {
            conn.execute(
                "INSERT INTO ws_novel_chapters (id, novel_id, seq, title, word_count, created_at, updated_at) VALUES (?1, ?2, ?3, 'Chapter', 1, 'now', 'now')",
                rusqlite::params![format!("chapter-{seq}"), id, seq],
            ).unwrap();
        }
        id
    }

    #[test]
    fn validates_name_template_and_case_insensitive_uniqueness() {
        let (_dir, service) = workspace();
        assert_eq!(
            service.create(input("  ")).unwrap_err().code,
            ProjectErrorCode::InvalidInput
        );
        let mut unsupported = input("Name");
        unsupported.template = "other".to_string();
        assert_eq!(
            service.create(unsupported).unwrap_err().code,
            ProjectErrorCode::InvalidInput
        );
        service.create(input("Name")).unwrap();
        assert_eq!(
            service.create(input("name")).unwrap_err().code,
            ProjectErrorCode::NameTaken
        );
    }

    #[test]
    fn creates_project_folder_and_suffixes_existing_folder() {
        let (dir, service) = workspace();
        std::fs::create_dir_all(dir.path().join("projects/my-project")).unwrap();
        let project = service.create(input("My Project")).unwrap();
        assert_eq!(project.folder, "projects/my-project-2");
        assert!(dir.path().join(&project.folder).is_dir());
        assert_eq!(service.list().unwrap(), vec![project]);
    }

    #[test]
    fn update_archive_open_and_delete_update_rows_and_files() {
        let (dir, service) = workspace();
        let project = service.create(input("One")).unwrap();
        let updated = service
            .update(
                project.id,
                ProjectPatch {
                    name: Some(" Two ".to_string()),
                    description: Some(" text ".to_string()),
                },
            )
            .unwrap();
        assert_eq!(updated.name, "Two");
        assert_eq!(updated.description, "text");
        service.archive(&[project.id], true).unwrap();
        assert!(service.list().unwrap()[0].archived);
        let opened = service.open_project(project.id).unwrap();
        assert!(opened.opened_at >= project.opened_at);
        assert_eq!(service.delete(&[project.id, project.id]).unwrap(), 1);
        assert!(!dir.path().join(project.folder).exists());
    }

    #[test]
    fn validates_novel_range_and_marks_deleted_novels_missing() {
        let (dir, service) = workspace();
        let novel_id = insert_novel(&dir, 3);
        let mut request = input("Linked");
        request.novel_id = Some(novel_id);
        request.range_from = Some(1);
        request.range_to = Some(4);
        assert_eq!(
            service.create(request.clone()).unwrap_err().code,
            ProjectErrorCode::RangeInvalid
        );
        request.range_to = Some(3);
        let linked = service.create(request).unwrap();
        assert_eq!(linked.src_kind.as_deref(), Some("original"));
        assert_eq!(linked.src_lang.as_deref(), Some("ZH"));
        let conn = rusqlite::Connection::open(dir.path().join(WORKSPACE_DB_FILE)).unwrap();
        conn.execute("DELETE FROM ws_novels WHERE id = ?1", [novel_id])
            .unwrap();
        assert!(service.list().unwrap()[0].novel_missing);
        let mut nonexistent = input("Missing source");
        nonexistent.novel_id = Some(999);
        assert_eq!(
            service.create(nonexistent).unwrap_err().code,
            ProjectErrorCode::NovelNotFound
        );
    }

    #[test]
    fn cover_is_stored_outside_the_project_folder_and_removed_with_the_project() {
        let (dir, service) = workspace();
        let project = service.create(input("Covered")).unwrap();
        assert_eq!(service.cover_get(project.id).unwrap(), None);
        let cover = "data:image/png;base64,iVBORw0KGgo=";
        let updated = service.cover_set(project.id, cover).unwrap();
        assert!(updated.updated_at >= project.updated_at);
        assert_eq!(
            service.cover_get(project.id).unwrap().as_deref(),
            Some(cover)
        );
        assert!(service.dir_list(project.id, "").unwrap().is_empty());
        assert_eq!(
            service
                .cover_set(project.id, "data:image/gif;base64,AAAA")
                .unwrap_err()
                .code,
            ProjectErrorCode::CoverInvalid
        );
        service.cover_clear(project.id).unwrap();
        assert_eq!(service.cover_get(project.id).unwrap(), None);
        service.cover_set(project.id, cover).unwrap();
        service.delete(&[project.id]).unwrap();
        let leftover = dir
            .path()
            .join("project-covers")
            .join(format!("{}.png", project.id));
        assert!(!leftover.exists());
    }

    #[test]
    fn lists_one_directory_level_in_sorted_order_and_rejects_unsafe_paths() {
        let (dir, service) = workspace();
        let project = service.create(input("Files")).unwrap();
        let root = dir.path().join(&project.folder);
        std::fs::create_dir(root.join("Z folder")).unwrap();
        std::fs::write(root.join("b.txt"), b"12").unwrap();
        std::fs::write(root.join("A.txt"), b"1").unwrap();
        let entries = service.dir_list(project.id, "").unwrap();
        assert_eq!(
            entries
                .iter()
                .map(|entry| entry.name.as_str())
                .collect::<Vec<_>>(),
            vec!["Z folder", "A.txt", "b.txt"]
        );
        assert_eq!(entries[1].size, 1);
        assert_eq!(
            service.dir_list(project.id, "Z folder").unwrap(),
            Vec::new()
        );
        assert_eq!(
            service.dir_list(project.id, "../").unwrap_err().code,
            ProjectErrorCode::PathInvalid
        );
        assert_eq!(
            service
                .dir_list(project.id, root.to_str().unwrap())
                .unwrap_err()
                .code,
            ProjectErrorCode::PathInvalid
        );
    }

    #[cfg(unix)]
    #[test]
    fn rejects_a_directory_path_through_an_external_symlink() {
        use std::os::unix::fs::symlink;
        let (dir, service) = workspace();
        let project = service.create(input("Files")).unwrap();
        let outside = TempDir::new().unwrap();
        std::fs::write(outside.path().join("secret.txt"), b"secret").unwrap();
        let link = dir.path().join(&project.folder).join("outside");
        if symlink(outside.path(), &link).is_ok() {
            assert_eq!(
                service.dir_list(project.id, "outside").unwrap_err().code,
                ProjectErrorCode::PathInvalid
            );
            assert_eq!(service.dir_list(project.id, "").unwrap()[0].name, "outside");
        }
    }

    #[test]
    fn opening_without_workspace_returns_typed_error() {
        let error = ProjectService::new()
            .open(&WorkspaceSession::new())
            .unwrap_err();
        assert_eq!(error.code, ProjectErrorCode::NoWorkspace);
    }
}
