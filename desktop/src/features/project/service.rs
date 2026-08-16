use crate::features::novel::files::CoverKind;
use crate::features::novel::models::NovelErrorCode;
use crate::features::novel::service::cover_data_url;
use crate::features::novel::service::parse_cover_data_url;
use crate::features::project::files::PROJECTS_DIR;
use crate::features::project::files::ProjectFiles;
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
    if name.is_empty() {
        return Err(ProjectError::invalid("name must not be empty"));
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
        let now = now_text();
        let id = repo.insert(&NewProject {
            name: &name,
            template: &input.template,
            description: &description,
            novel_id: input.novel_id,
            src_kind,
            src_lang: src_lang.as_deref(),
            range_from: input.range_from,
            range_to: input.range_to,
            now: &now,
        })?;
        let folder = format!("{PROJECTS_DIR}/{id}");
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

fn require_summary(repo: &ProjectRepository, id: i64) -> ProjectResult<ProjectSummary> {
    repo.find_summary(id)?
        .ok_or_else(|| ProjectError::not_found(format!("project {id} does not exist")))
}

fn require_project(repo: &ProjectRepository, id: i64) -> ProjectResult<ProjectRow> {
    repo.find_project(id)?
        .ok_or_else(|| ProjectError::not_found(format!("project {id} does not exist")))
}

#[cfg(test)]
#[path = "../../../test/features/project/service.test.rs"]
mod tests;
