use crate::features::audiobook::files::AudiobookFiles;
use crate::features::project::models::ProjectError;
use crate::features::project::models::ProjectModuleState;
use crate::features::project::models::ProjectResult;
use crate::features::project::service::ProjectWorkspace;
use crate::features::scripting::chapters::project_chapters;
use crate::features::scripting::files::ScriptFiles;
use crate::features::scripting::files::require_unit_id;
use crate::features::scripting::models::CastMember;
use crate::features::scripting::models::Script;
use crate::features::scripting::models::ScriptFile;
use crate::features::scripting::models::ScriptUnit;
use crate::features::scripting::models::UnitHead;
use crate::features::scripting::progress::module_states;
use std::collections::BTreeSet;
use std::path::Path;

#[derive(Debug, Clone)]
pub struct ScriptingWorkspace {
    projects: ProjectWorkspace,
}

impl ScriptingWorkspace {
    pub fn new(projects: ProjectWorkspace) -> Self {
        Self { projects }
    }

    pub fn get(&self, project_id: i64) -> ProjectResult<Option<Script>> {
        self.projects
            .with_project(project_id, |_, dir| read_script(&ScriptFiles::new(dir)))
    }

    pub fn save(&self, project_id: i64, script: Script) -> ProjectResult<()> {
        self.projects
            .with_project(project_id, |_, dir| write_script(dir, script))
    }

    pub fn unit_save(&self, project_id: i64, unit: ScriptUnit, seq: i64) -> ProjectResult<()> {
        self.projects
            .with_project(project_id, |_, dir| write_unit(dir, unit, seq))
    }

    pub fn cast_save(&self, project_id: i64, extra_cast: Vec<CastMember>) -> ProjectResult<()> {
        self.projects.with_project(project_id, |_, dir| {
            let files = ScriptFiles::new(dir);
            let mut stored = require_script(&files)?;
            stored.extra_cast = extra_cast;
            files.write_script(&stored)
        })
    }

    pub fn modules(&self, project_id: i64) -> ProjectResult<Vec<ProjectModuleState>> {
        let root = self.projects.dir().to_path_buf();
        self.projects.with_project(project_id, |project, dir| {
            let chapters = project_chapters(&root, project)?;
            let script = read_script(&ScriptFiles::new(dir))?;
            let book = AudiobookFiles::new(dir).read_book()?.unwrap_or_default();
            Ok(module_states(&chapters, script.as_ref(), &book))
        })
    }
}

fn read_script(files: &ScriptFiles) -> ProjectResult<Option<Script>> {
    let Some(stored) = files.read_script()? else {
        return Ok(None);
    };
    let mut units = Vec::with_capacity(stored.units.len());
    for head in stored.units {
        let body = files.read_unit(&head.id)?;
        units.push(ScriptUnit::join(head, body));
    }
    Ok(Some(Script {
        cfg: stored.cfg,
        choose: stored.choose,
        extra_cast: stored.extra_cast,
        units,
        seq: stored.seq,
        useq: stored.useq,
    }))
}

fn write_script(dir: &Path, script: Script) -> ProjectResult<()> {
    let units: Vec<ScriptUnit> = script
        .units
        .into_iter()
        .filter(ScriptUnit::is_persisted)
        .collect();
    let keep = unique_ids(&units)?;
    let files = ScriptFiles::new(dir);
    let mut heads = Vec::with_capacity(units.len());
    for unit in units {
        let (head, body) = unit.split();
        files.write_unit(&head.id, &body)?;
        heads.push(head);
    }
    files.write_script(&ScriptFile {
        cfg: script.cfg,
        choose: script.choose,
        extra_cast: script.extra_cast,
        units: heads,
        seq: script.seq,
        useq: script.useq,
    })?;
    files.remove_orphans(&keep)
}

fn write_unit(dir: &Path, unit: ScriptUnit, seq: i64) -> ProjectResult<()> {
    require_unit(&unit)?;
    let files = ScriptFiles::new(dir);
    let mut stored = require_script(&files)?;
    stored.seq = seq;
    if unit.is_persisted() {
        let (head, body) = unit.split();
        files.write_unit(&head.id, &body)?;
        upsert_head(&mut stored.units, head);
    } else {
        files.remove_unit(&unit.id)?;
        stored.units.retain(|head| head.id != unit.id);
    }
    files.write_script(&stored)
}

fn upsert_head(heads: &mut Vec<UnitHead>, head: UnitHead) {
    match heads.iter_mut().find(|stored| stored.id == head.id) {
        Some(stored) => *stored = head,
        None => heads.push(head),
    }
}

fn require_unit(unit: &ScriptUnit) -> ProjectResult<()> {
    require_unit_id(&unit.id)?;
    match unit.chapter_id.as_deref() {
        Some(chapter_id) if chapter_id != unit.id => Err(ProjectError::invalid(format!(
            "unit {} must use its chapter id {chapter_id}",
            unit.id
        ))),
        _ => Ok(()),
    }
}

fn require_script(files: &ScriptFiles) -> ProjectResult<ScriptFile> {
    files
        .read_script()?
        .ok_or_else(|| ProjectError::not_found("this project has no script yet"))
}

fn unique_ids(units: &[ScriptUnit]) -> ProjectResult<BTreeSet<String>> {
    let mut seen = BTreeSet::new();
    for unit in units {
        require_unit(unit)?;
        if !seen.insert(unit.id.clone()) {
            return Err(ProjectError::invalid(format!(
                "unit id {} is duplicated",
                unit.id
            )));
        }
    }
    Ok(seen)
}
