use crate::features::assistant::sources::NovelSource;
use crate::features::assistant::sources::Sources;
use crate::features::assistant::tools::ToolContext;
use crate::features::assistant::tools::ToolOutput;
use crate::features::assistant::tools::args::output;
use crate::features::assistant::tools::args::required_int;
use crate::features::assistant::tools::scope::allowed;
use crate::features::assistant::tools::scope::find_project;
use crate::features::assistant::tools::scope::project_limit;
use crate::features::assistant::tools::script::unit_for_chapter;
use crate::features::project::models::ProjectSummary;
use serde_json::Value;
use serde_json::json;

pub(super) fn definitions() -> Vec<Value> {
    vec![json!({
        "name": "read_project",
        "description": "Without `projectId`, list the projects (id, name, template, description, linked novel id, archived flag, modules, last update). With `projectId`, read one project: its metadata, the text version it works from (`srcKind` original or translation, and `srcLang`), the linked novel, the progress of every enabled module and the chapters of the linked novel with the id of the script unit written for each (null when none yet).",
        "inputSchema": {
            "type": "object",
            "properties": {
                "projectId": { "type": "integer", "description": "Project id; leave out to list the projects." }
            },
            "additionalProperties": false
        }
    })]
}

pub(super) fn project_id_property() -> Value {
    json!({ "type": "integer", "description": "Project id from read_project." })
}

pub(super) fn list_project(ctx: &ToolContext, sources: &Sources) -> Result<ToolOutput, String> {
    let limit = project_limit(ctx)?;
    let items: Vec<Value> = sources
        .projects
        .list()?
        .iter()
        .filter(|project| allowed(limit, project.id))
        .map(project_json)
        .collect();
    let label = format!("list_project() → {} project", items.len());
    Ok(output(Value::Array(items), label))
}

pub(super) fn read_project(
    args: &Value,
    ctx: &ToolContext,
    sources: &Sources,
) -> Result<ToolOutput, String> {
    let project = project_of(args, ctx, sources)?;
    let chapters = sources.scripts.chapters(project.id)?;
    let script = sources.scripts.script(project.id)?;
    let modules: Vec<Value> = sources
        .scripts
        .modules(project.id)?
        .iter()
        .map(|module| {
            json!({
                "id": module.id,
                "state": module.state,
                "done": module.done,
                "total": module.total,
                "note": module.note,
            })
        })
        .collect();
    let chapter_rows: Vec<Value> = chapters
        .iter()
        .map(|chapter| {
            json!({
                "chapterId": chapter.id,
                "chapter": chapter.seq,
                "title": chapter.title,
                "unitId": unit_for_chapter(script.as_ref(), &chapter.id),
            })
        })
        .collect();
    let label = format!(
        "read_project(project {}) → {} chương",
        project.id,
        chapter_rows.len()
    );
    let mut value = project_json(&project);
    value["srcKind"] = json!(project.src_kind);
    value["srcLang"] = json!(project.src_lang);
    value["novel"] = linked_novel_json(&project, sources.novels.as_ref())?;
    value["moduleStates"] = Value::Array(modules);
    value["chapters"] = Value::Array(chapter_rows);
    Ok(output(value, label))
}

pub(super) fn project_of(
    args: &Value,
    ctx: &ToolContext,
    sources: &Sources,
) -> Result<ProjectSummary, String> {
    let project_id = required_int(args, "projectId")?;
    find_project(ctx, sources.projects.as_ref(), project_id)
}

pub(super) fn uses_translation(project: &ProjectSummary) -> bool {
    project.src_kind.as_deref() == Some("translation")
}

fn project_json(project: &ProjectSummary) -> Value {
    json!({
        "projectId": project.id,
        "name": project.name,
        "template": project.template,
        "description": project.description,
        "novelId": project.novel_id,
        "archived": project.archived,
        "modules": project.modules,
        "updatedAt": project.updated_at,
    })
}

fn linked_novel_json(project: &ProjectSummary, novels: &dyn NovelSource) -> Result<Value, String> {
    let Some(novel_id) = project.novel_id else {
        return Ok(Value::Null);
    };
    let found = novels
        .list()?
        .into_iter()
        .find(|novel| novel.id == novel_id);
    Ok(match found {
        Some(novel) => json!({
            "novelId": novel.id,
            "title": novel.title,
            "name": novel.name,
            "lang": novel.lang,
        }),
        None => json!({ "novelId": novel_id, "missing": true }),
    })
}
