use crate::commands::project::run_blocking;
use crate::features::project::models::ProjectResult;
use crate::features::project::service::ProjectService;
use crate::features::scripting::models::CastMember;
use crate::features::scripting::models::Script;
use crate::features::scripting::models::ScriptUnit;
use crate::features::scripting::service::ScriptingWorkspace;
use crate::features::workspace::session::WorkspaceSession;
use tauri::AppHandle;
use tauri::Runtime;

fn scripting(
    service: &ProjectService,
    session: &WorkspaceSession,
) -> ProjectResult<ScriptingWorkspace> {
    Ok(ScriptingWorkspace::new(service.open(session)?))
}

pub fn get_script(
    service: &ProjectService,
    session: &WorkspaceSession,
    project_id: i64,
) -> ProjectResult<Option<Script>> {
    scripting(service, session)?.get(project_id)
}

pub fn save_script(
    service: &ProjectService,
    session: &WorkspaceSession,
    project_id: i64,
    script: Script,
) -> ProjectResult<()> {
    scripting(service, session)?.save(project_id, script)
}

pub fn save_unit(
    service: &ProjectService,
    session: &WorkspaceSession,
    project_id: i64,
    unit: ScriptUnit,
    seq: i64,
) -> ProjectResult<()> {
    scripting(service, session)?.unit_save(project_id, unit, seq)
}

pub fn save_cast(
    service: &ProjectService,
    session: &WorkspaceSession,
    project_id: i64,
    extra_cast: Vec<CastMember>,
) -> ProjectResult<()> {
    scripting(service, session)?.cast_save(project_id, extra_cast)
}

#[tauri::command]
pub async fn scripting_get<R: Runtime>(
    app: AppHandle<R>,
    project_id: i64,
) -> ProjectResult<Option<Script>> {
    run_blocking(app, move |service, session| {
        get_script(service, session, project_id)
    })
    .await
}

#[tauri::command]
pub async fn scripting_save<R: Runtime>(
    app: AppHandle<R>,
    project_id: i64,
    script: Script,
) -> ProjectResult<()> {
    run_blocking(app, move |service, session| {
        save_script(service, session, project_id, script)
    })
    .await
}

#[tauri::command]
pub async fn scripting_unit_save<R: Runtime>(
    app: AppHandle<R>,
    project_id: i64,
    unit: ScriptUnit,
    seq: i64,
) -> ProjectResult<()> {
    run_blocking(app, move |service, session| {
        save_unit(service, session, project_id, unit, seq)
    })
    .await
}

#[tauri::command]
pub async fn scripting_cast_save<R: Runtime>(
    app: AppHandle<R>,
    project_id: i64,
    extra_cast: Vec<CastMember>,
) -> ProjectResult<()> {
    run_blocking(app, move |service, session| {
        save_cast(service, session, project_id, extra_cast)
    })
    .await
}

#[cfg(test)]
#[path = "../../test/commands/scripting.test.rs"]
mod tests;
