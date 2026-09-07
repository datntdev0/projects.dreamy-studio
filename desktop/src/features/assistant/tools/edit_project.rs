use crate::features::assistant::edits::ensure_editable;
use crate::features::assistant::models::AssistantChange;
use crate::features::assistant::models::ChangeTarget;
use crate::features::assistant::sources::Sources;
use crate::features::assistant::tools::ToolContext;
use crate::features::assistant::tools::ToolOutput;
use crate::features::assistant::tools::args::optional_str;
use crate::features::assistant::tools::args::output;
use crate::features::assistant::tools::project::project_id_property;
use crate::features::assistant::tools::project::project_of;
use crate::features::project::models::ProjectPatch;
use serde_json::Value;
use serde_json::json;

pub(super) fn definitions() -> Vec<Value> {
    vec![json!({
        "name": "edit_project",
        "description": "Change the name and/or the description of one project. Only the fields you pass are changed; modules and the archive state cannot be changed here. Requires editing to be enabled for the session.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "projectId": project_id_property(),
                "name": { "type": "string", "description": "New project name; must not be empty." },
                "description": { "type": "string", "description": "New project description." }
            },
            "required": ["projectId"],
            "additionalProperties": false
        }
    })]
}

pub(super) fn edit_project(
    args: &Value,
    ctx: &ToolContext,
    sources: &Sources,
) -> Result<ToolOutput, String> {
    ensure_editable(ctx)?;
    let project = project_of(args, ctx, sources)?;
    let name = optional_str(args, "name")?;
    let description = optional_str(args, "description")?;
    if name.is_none() && description.is_none() {
        return Err("pass a name or a description to change".to_string());
    }
    if name.as_deref().is_some_and(|text| text.trim().is_empty()) {
        return Err("argument 'name' must not be empty".to_string());
    }
    let changed = changed_fields(name.is_some(), description.is_some());
    let patch = ProjectPatch {
        name,
        description,
        modules: None,
    };
    let updated = sources.projects.update(project.id, patch)?;
    ctx.sink.changed(AssistantChange::in_project(
        ChangeTarget::Project,
        updated.id,
        None,
    ));
    let label = format!(
        "edit_project(project {}: {})",
        updated.id,
        changed.join(", ")
    );
    let value = json!({
        "projectId": updated.id,
        "name": updated.name,
        "description": updated.description,
        "changed": changed,
    });
    Ok(output(value, label))
}

fn changed_fields(name: bool, description: bool) -> Vec<&'static str> {
    [(name, "name"), (description, "description")]
        .into_iter()
        .filter(|(given, _)| *given)
        .map(|(_, field)| field)
        .collect()
}
