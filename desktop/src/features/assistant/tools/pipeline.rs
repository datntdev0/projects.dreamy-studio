use crate::features::assistant::models::ScopeKind;
use crate::features::assistant::sources::Sources;
use crate::features::assistant::tools::ToolContext;
use crate::features::assistant::tools::ToolOutput;
use crate::features::assistant::tools::args::optional_int;
use crate::features::assistant::tools::args::output;
use crate::features::assistant::tools::args::required_int;
use crate::features::assistant::tools::scope::owns_pipeline;
use crate::features::assistant::tools::scope::owns_snapshot;
use crate::features::pipeline::models::JobOwner;
use crate::features::pipeline::models::PipelineSnapshot;
use crate::features::pipeline::models::PipelineStatus;
use crate::features::pipeline::models::PipelineTask;
use serde_json::Value;
use serde_json::json;
use std::cmp::Reverse;

pub const DEFAULT_HISTORY: i64 = 20;
pub const MAX_HISTORY: i64 = 100;

pub(super) fn definitions() -> Vec<Value> {
    vec![
        json!({
            "name": "read_pipeline",
            "description": "Check the status of translation, analysis and audio generation runs; use it only when the user asks. Without `pipelineId`, list the latest runs of the current scope, newest first (kind, target, status, progress counts), optionally of one `novelId` or `projectId`. With `pipelineId`, read one run with the status, progress and error of each task.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "pipelineId": { "type": "integer", "description": "Run id; leave out to list the runs." },
                    "novelId": { "type": "integer", "description": "List only runs of this novel." },
                    "projectId": { "type": "integer", "description": "List only runs of this project." },
                    "limit": { "type": "integer", "minimum": 1, "maximum": MAX_HISTORY, "description": "Runs to list, default 20." }
                },
                "additionalProperties": false
            }
        }),
        json!({
            "name": "cancel_pipeline",
            "description": "Cancel a queued or running run; use it only when the user asks to stop one. `cancelled` is false when the run already finished.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "pipelineId": pipeline_id_property()
                },
                "required": ["pipelineId"],
                "additionalProperties": false
            }
        }),
    ]
}

fn pipeline_id_property() -> Value {
    json!({ "type": "integer", "description": "Run id from read_pipeline." })
}

pub(super) fn list_pipeline(
    args: &Value,
    ctx: &ToolContext,
    sources: &Sources,
) -> Result<ToolOutput, String> {
    let novel_id = optional_int(args, "novelId")?;
    let project_id = optional_int(args, "projectId")?;
    let limit = optional_int(args, "limit")?
        .unwrap_or(DEFAULT_HISTORY)
        .clamp(1, MAX_HISTORY);
    let mut runs = Vec::new();
    for owner in owners_of(novel_id, project_id, ctx)? {
        runs.extend(sources.pipelines.history(owner, limit)?);
    }
    runs.sort_by_key(|run| Reverse(run.id));
    runs.truncate(limit as usize);
    let items: Vec<Value> = runs.iter().map(|run| snapshot_json(run, false)).collect();
    let label = format!("list_pipeline() → {} lần chạy", items.len());
    Ok(output(Value::Array(items), label))
}

pub(super) fn read_pipeline(
    args: &Value,
    ctx: &ToolContext,
    sources: &Sources,
) -> Result<ToolOutput, String> {
    let snapshot = scoped_snapshot(args, ctx, sources)?;
    let label = format!(
        "read_pipeline(run {}) → {} tác vụ, {}",
        snapshot.id,
        snapshot.tasks.len(),
        snapshot.status.as_str()
    );
    Ok(output(snapshot_json(&snapshot, true), label))
}

pub(super) fn cancel_pipeline(
    args: &Value,
    ctx: &ToolContext,
    sources: &Sources,
) -> Result<ToolOutput, String> {
    let snapshot = scoped_snapshot(args, ctx, sources)?;
    let active = matches!(
        snapshot.status,
        PipelineStatus::Queued | PipelineStatus::Running
    );
    let cancelled = active && sources.pipelines.cancel(snapshot.id);
    let label = format!("cancel_pipeline(run {}) → {cancelled}", snapshot.id);
    let value = json!({ "pipelineId": snapshot.id, "cancelled": cancelled });
    Ok(output(value, label))
}

fn scoped_snapshot(
    args: &Value,
    ctx: &ToolContext,
    sources: &Sources,
) -> Result<PipelineSnapshot, String> {
    let pipeline_id = required_int(args, "pipelineId")?;
    let snapshot = sources
        .pipelines
        .snapshot(pipeline_id)?
        .ok_or_else(|| format!("run {pipeline_id} not found"))?;
    if !owns_snapshot(ctx, &snapshot) {
        return Err(format!("run {pipeline_id} is outside the current scope"));
    }
    Ok(snapshot)
}

fn owners_of(
    novel_id: Option<i64>,
    project_id: Option<i64>,
    ctx: &ToolContext,
) -> Result<Vec<Option<JobOwner>>, String> {
    match (novel_id, project_id) {
        (Some(_), Some(_)) => Err("pass novelId or projectId, not both".to_string()),
        (Some(id), None) => {
            require_owned(owns_pipeline(ctx, Some(id), None), "novel", id)?;
            Ok(vec![Some(JobOwner::Novel(id))])
        }
        (None, Some(id)) => {
            require_owned(owns_pipeline(ctx, None, Some(id)), "project", id)?;
            Ok(vec![Some(JobOwner::Project(id))])
        }
        (None, None) => default_owners(ctx),
    }
}

fn require_owned(owned: bool, what: &str, id: i64) -> Result<(), String> {
    if owned {
        return Ok(());
    }
    Err(format!("{what} {id} is outside the current scope"))
}

fn default_owners(ctx: &ToolContext) -> Result<Vec<Option<JobOwner>>, String> {
    match (ctx.scope.kind, ctx.scope.novel_id, ctx.scope.project_id) {
        (ScopeKind::Workspace, _, _) => Ok(vec![None]),
        (ScopeKind::Novel, Some(novel_id), _) => Ok(vec![Some(JobOwner::Novel(novel_id))]),
        (ScopeKind::Project, _, Some(project_id)) => {
            let own = Some(JobOwner::Project(project_id));
            Ok(std::iter::once(own)
                .chain(ctx.linked_novel.map(|id| Some(JobOwner::Novel(id))))
                .collect())
        }
        _ => Err("the session scope has no owner id".to_string()),
    }
}

fn snapshot_json(snapshot: &PipelineSnapshot, with_tasks: bool) -> Value {
    let mut value = json!({
        "pipelineId": snapshot.id,
        "kind": snapshot.kind,
        "target": snapshot.target,
        "novelId": snapshot.novel_id,
        "projectId": snapshot.project_id,
        "status": snapshot.status.as_str(),
        "total": snapshot.total,
        "done": snapshot.done,
        "failed": snapshot.failed,
        "createdAt": snapshot.created_at,
        "startedAt": snapshot.started_at,
        "finishedAt": snapshot.finished_at,
    });
    if with_tasks {
        value["tasks"] = Value::Array(snapshot.tasks.iter().map(task_json).collect());
    }
    value
}

fn task_json(task: &PipelineTask) -> Value {
    json!({
        "taskId": task.id,
        "chapterId": task.chapter_id,
        "segmentId": task.segment_id,
        "passage": task.passage,
        "status": task.status.as_str(),
        "progress": task.progress,
        "error": task.error,
        "startedAt": task.started_at,
        "finishedAt": task.finished_at,
    })
}
