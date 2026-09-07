use crate::features::assistant::edits::ensure_editable;
use crate::features::assistant::models::AssistantChange;
use crate::features::assistant::models::ChangeTarget;
use crate::features::assistant::sources::Sources;
use crate::features::assistant::tools::ToolContext;
use crate::features::assistant::tools::ToolOutput;
use crate::features::assistant::tools::args::output;
use crate::features::assistant::tools::project::project_id_property;
use crate::features::assistant::tools::project::project_of;
use crate::features::assistant::tools::script::cast_members;
use crate::features::assistant::tools::script::require_script;
use crate::features::scripting::cast::extra_member;
use crate::features::scripting::models::CastMember;
use crate::features::scripting::models::Script;
use serde::Deserialize;
use serde_json::Value;
use serde_json::json;
use std::collections::HashSet;

const NARRATOR_KIND: &str = "narrator";
const KNOWLEDGE_KIND: &str = "kb";

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Rename {
    id: String,
    name: String,
}

#[derive(Deserialize, Default)]
#[serde(deny_unknown_fields, default)]
struct Request {
    add: Vec<String>,
    rename: Vec<Rename>,
    remove: Vec<String>,
}

struct Roster {
    cast: Vec<CastMember>,
    extra: Vec<CastMember>,
    taken: HashSet<String>,
}

#[derive(Default)]
struct Outcome {
    added: Vec<CastMember>,
    renamed: Vec<CastMember>,
    removed: Vec<String>,
}

pub(super) fn definitions() -> Vec<Value> {
    vec![json!({
        "name": "edit_script_cast",
        "description": "Add, rename and remove the extra members of the cast of a project script, the speakers the user added by hand (kind `extra`). The narrator and the characters taken from the novel knowledge cannot be changed. Names must not be empty or equal, ignoring case, to another cast member. A member can be removed only when no block names it in `who`. Removals run first, then renames, then additions; if anything is invalid nothing is written. Requires editing to be enabled for the session.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "projectId": project_id_property(),
                "add": {
                    "type": "array",
                    "description": "Names of the new members.",
                    "items": { "type": "string" }
                },
                "rename": {
                    "type": "array",
                    "description": "Extra members to rename.",
                    "items": {
                        "type": "object",
                        "properties": {
                            "id": { "type": "string", "description": "Cast id from read_script." },
                            "name": { "type": "string", "description": "New name." }
                        },
                        "required": ["id", "name"],
                        "additionalProperties": false
                    }
                },
                "remove": {
                    "type": "array",
                    "description": "Cast ids of the extra members to delete.",
                    "items": { "type": "string" }
                }
            },
            "required": ["projectId"],
            "additionalProperties": false
        }
    })]
}

pub(super) fn edit_script_cast(
    args: &Value,
    ctx: &ToolContext,
    sources: &Sources,
) -> Result<ToolOutput, String> {
    ensure_editable(ctx)?;
    let project = project_of(args, ctx, sources)?;
    let request = parse_request(args)?;
    let script = require_script(sources, project.id)?;
    let mut roster = Roster::of(&script, cast_members(&script, &project, sources)?);
    let outcome = apply(&request, &script, &mut roster)?;
    sources
        .scripts
        .cast_save(project.id, roster.extra.clone())?;
    ctx.sink.changed(AssistantChange::in_project(
        ChangeTarget::Script,
        project.id,
        None,
    ));
    let label = format!(
        "edit_script_cast(project {}: +{} ~{} -{})",
        project.id,
        outcome.added.len(),
        outcome.renamed.len(),
        outcome.removed.len()
    );
    let value = json!({
        "projectId": project.id,
        "added": members_json(&outcome.added),
        "renamed": members_json(&outcome.renamed),
        "removed": outcome.removed,
        "extraCast": members_json(&roster.extra),
    });
    Ok(output(value, label))
}

fn parse_request(args: &Value) -> Result<Request, String> {
    let mut fields = args.clone();
    if let Some(map) = fields.as_object_mut() {
        map.remove("projectId");
    }
    let request: Request =
        serde_json::from_value(fields).map_err(|error| format!("invalid arguments: {error}"))?;
    if request.add.is_empty() && request.rename.is_empty() && request.remove.is_empty() {
        return Err("pass at least one of add, rename or remove".to_string());
    }
    Ok(request)
}

impl Roster {
    fn of(script: &Script, cast: Vec<CastMember>) -> Self {
        let taken = cast.iter().map(|member| member.id.clone()).collect();
        Self {
            cast,
            extra: script.extra_cast.clone(),
            taken,
        }
    }

    fn name_taken(&self, name: &str, except: Option<&str>) -> bool {
        let lowered = name.to_lowercase();
        self.cast
            .iter()
            .filter(|member| Some(member.id.as_str()) != except)
            .any(|member| member.name.to_lowercase() == lowered)
    }

    fn require_extra(&self, id: &str) -> Result<usize, String> {
        if let Some(position) = self.extra.iter().position(|member| member.id == id) {
            return Ok(position);
        }
        match self.cast.iter().find(|member| member.id == id) {
            Some(member) => Err(format!(
                "cast member '{}' ({id}) is {} and cannot be changed; only extra members can",
                member.name,
                origin_of(member)
            )),
            None => Err(format!("cast member '{id}' not found")),
        }
    }
}

fn origin_of(member: &CastMember) -> &'static str {
    match member.kind.as_str() {
        NARRATOR_KIND => "the narrator",
        KNOWLEDGE_KIND => "a character of the novel knowledge",
        _ => "not an extra member",
    }
}

fn apply(request: &Request, script: &Script, roster: &mut Roster) -> Result<Outcome, String> {
    let mut outcome = Outcome::default();
    for id in &request.remove {
        remove_member(id, script, roster)?;
        outcome.removed.push(id.clone());
    }
    for item in &request.rename {
        outcome.renamed.push(rename_member(item, roster)?);
    }
    for name in &request.add {
        outcome.added.push(add_member(name, roster)?);
    }
    Ok(outcome)
}

fn remove_member(id: &str, script: &Script, roster: &mut Roster) -> Result<(), String> {
    let position = roster.require_extra(id)?;
    let uses = usage(script, id);
    if uses > 0 {
        return Err(format!(
            "cast member '{}' ({id}) is still the speaker of {uses} block(s); change those blocks first with edit_script_unit",
            roster.extra[position].name
        ));
    }
    roster.extra.remove(position);
    roster.cast.retain(|member| member.id != id);
    Ok(())
}

fn rename_member(item: &Rename, roster: &mut Roster) -> Result<CastMember, String> {
    let position = roster.require_extra(&item.id)?;
    let name = clean_name(&item.name)?;
    if roster.name_taken(&name, Some(&item.id)) {
        return Err(format!("'{name}' already exists in the cast"));
    }
    roster.extra[position].name = name.clone();
    if let Some(member) = roster.cast.iter_mut().find(|member| member.id == item.id) {
        member.name = name;
    }
    Ok(roster.extra[position].clone())
}

fn add_member(raw: &str, roster: &mut Roster) -> Result<CastMember, String> {
    let name = clean_name(raw)?;
    if roster.name_taken(&name, None) {
        return Err(format!("'{name}' already exists in the cast"));
    }
    let color = roster.cast.len() as i64;
    let member = extra_member(&name, color, &mut roster.taken);
    roster.extra.push(member.clone());
    roster.cast.push(member.clone());
    Ok(member)
}

fn clean_name(raw: &str) -> Result<String, String> {
    let name = raw.trim();
    if name.is_empty() {
        return Err("a cast member name must not be empty".to_string());
    }
    Ok(name.to_string())
}

fn usage(script: &Script, id: &str) -> usize {
    script
        .units
        .iter()
        .flat_map(|unit| unit.blocks.iter().flatten())
        .filter(|block| block.who == id)
        .count()
}

fn members_json(members: &[CastMember]) -> Vec<Value> {
    members
        .iter()
        .map(|member| json!({ "id": member.id, "name": member.name }))
        .collect()
}
