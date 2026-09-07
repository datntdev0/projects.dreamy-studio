use crate::features::assistant::models::ScopeKind;
use crate::features::assistant::sources::NovelSource;
use crate::features::assistant::sources::ProjectSource;
use crate::features::assistant::tools::ToolContext;
use crate::features::novel::models::ChapterRow;
use crate::features::novel::models::NovelSummary;
use crate::features::pipeline::models::PipelineSnapshot;
use crate::features::project::models::ProjectSummary;

pub(crate) fn chapter_by_seq(
    source: &dyn NovelSource,
    novel_id: i64,
    seq: i64,
) -> Result<ChapterRow, String> {
    source
        .chapters(novel_id)?
        .into_iter()
        .find(|row| row.seq == seq)
        .ok_or_else(|| format!("chapter {seq} not found in novel {novel_id}"))
}

pub(super) fn novel_limit(ctx: &ToolContext) -> Result<Option<i64>, String> {
    match ctx.scope.kind {
        ScopeKind::Workspace => Ok(None),
        ScopeKind::Novel => Ok(ctx.scope.novel_id),
        ScopeKind::Project => ctx
            .linked_novel
            .map(Some)
            .ok_or_else(|| "the project has no linked novel".to_string()),
    }
}

pub(super) fn allowed(limit: Option<i64>, novel_id: i64) -> bool {
    limit.is_none_or(|id| id == novel_id)
}

pub(crate) fn find_novel(
    ctx: &ToolContext,
    source: &dyn NovelSource,
    novel_id: i64,
) -> Result<NovelSummary, String> {
    if !allowed(novel_limit(ctx)?, novel_id) {
        return Err(format!("novel {novel_id} is outside the current scope"));
    }
    source
        .list()?
        .into_iter()
        .find(|novel| novel.id == novel_id)
        .ok_or_else(|| format!("novel {novel_id} not found"))
}

pub(super) fn project_limit(ctx: &ToolContext) -> Result<Option<i64>, String> {
    match ctx.scope.kind {
        ScopeKind::Project => ctx
            .scope
            .project_id
            .map(Some)
            .ok_or_else(|| "the project scope has no project id".to_string()),
        ScopeKind::Workspace | ScopeKind::Novel => Ok(None),
    }
}

pub(crate) fn find_project(
    ctx: &ToolContext,
    source: &dyn ProjectSource,
    project_id: i64,
) -> Result<ProjectSummary, String> {
    if !allowed(project_limit(ctx)?, project_id) {
        return Err(format!("project {project_id} is outside the current scope"));
    }
    source
        .get(project_id)?
        .ok_or_else(|| format!("project {project_id} not found"))
}

pub(super) fn offers_project_tools(kind: ScopeKind) -> bool {
    kind != ScopeKind::Novel
}

pub(super) fn offers_pipeline_tool(kind: ScopeKind, name: &str) -> bool {
    name != "start_synthesis" || offers_project_tools(kind)
}

pub(super) fn owns_pipeline(
    ctx: &ToolContext,
    novel_id: Option<i64>,
    project_id: Option<i64>,
) -> bool {
    match ctx.scope.kind {
        ScopeKind::Workspace => true,
        ScopeKind::Novel => same_id(novel_id, ctx.scope.novel_id),
        ScopeKind::Project => {
            same_id(project_id, ctx.scope.project_id) || same_id(novel_id, ctx.linked_novel)
        }
    }
}

pub(super) fn owns_snapshot(ctx: &ToolContext, snapshot: &PipelineSnapshot) -> bool {
    owns_pipeline(ctx, snapshot.novel_id, snapshot.project_id)
}

fn same_id(actual: Option<i64>, wanted: Option<i64>) -> bool {
    actual.is_some() && actual == wanted
}
