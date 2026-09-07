use crate::features::assistant::edits;
use crate::features::assistant::grants::TurnSink;
use crate::features::assistant::models::AssistantScope;
use crate::features::assistant::proposals;
use crate::features::assistant::sources::Sources;
use serde_json::Value;

mod args;
mod audiobook;
mod definitions;
mod knowledge;
mod novel;
mod paging;
mod project;
mod scope;
mod script;
mod translation;

pub(crate) use args::optional_int;
pub(crate) use args::optional_str;
pub(crate) use args::output;
pub(crate) use args::required_int;
pub(crate) use args::required_str;
pub(crate) use scope::chapter_by_seq;
pub(crate) use scope::find_novel;
pub(crate) use translation::dict_json;
pub(crate) use translation::required_target;

pub const PROJECT_TOOLS: [&str; 7] = [
    "list_project",
    "read_project",
    "read_script",
    "read_script_unit",
    "search_project",
    "read_audiobook",
    "read_audiobook_unit",
];

pub struct ToolContext<'a> {
    pub scope: &'a AssistantScope,
    pub linked_novel: Option<i64>,
    pub can_edit: bool,
    pub sink: &'a dyn TurnSink,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ToolOutput {
    pub text: String,
    pub label: String,
}

pub fn definitions(scope: &AssistantScope) -> Value {
    let mut tools = definitions::novel_definitions();
    if scope::offers_project_tools(scope.kind) {
        tools.extend(project::definitions());
        tools.extend(script::definitions());
        tools.extend(audiobook::definitions());
    }
    Value::Array(tools)
}

pub fn call(
    name: &str,
    args: &Value,
    ctx: &ToolContext,
    sources: &Sources,
) -> Result<ToolOutput, String> {
    if PROJECT_TOOLS.contains(&name) {
        return call_project_tool(name, args, ctx, sources);
    }
    call_novel_tool(name, args, ctx, sources)
}

fn call_project_tool(
    name: &str,
    args: &Value,
    ctx: &ToolContext,
    sources: &Sources,
) -> Result<ToolOutput, String> {
    if !scope::offers_project_tools(ctx.scope.kind) {
        return Err(format!("tool '{name}' is not available in this scope"));
    }
    match name {
        "list_project" => project::list_project(ctx, sources),
        "read_project" => project::read_project(args, ctx, sources),
        "read_script" => script::read_script(args, ctx, sources),
        "read_script_unit" => script::read_script_unit(args, ctx, sources),
        "read_audiobook" => audiobook::read_audiobook(args, ctx, sources),
        "read_audiobook_unit" => audiobook::read_audiobook_unit(args, ctx, sources),
        "search_project" => script::search_project(args, ctx, sources),
        other => Err(format!("unknown tool '{other}'")),
    }
}

fn call_novel_tool(
    name: &str,
    args: &Value,
    ctx: &ToolContext,
    sources: &Sources,
) -> Result<ToolOutput, String> {
    let novels = sources.novels.as_ref();
    match name {
        "list_novel" => novel::list_novel(ctx, novels),
        "read_novel" => novel::read_novel(args, ctx, novels),
        "read_novel_chapter" => novel::read_novel_chapter(args, ctx, novels),
        "read_novel_knowledge" => knowledge::read_novel_knowledge(args, ctx, sources),
        "read_translation" => translation::read_translation(args, ctx, sources),
        "read_translation_guide" => translation::read_translation_guide(args, ctx, sources),
        "edit_novel" => edits::edit_novel(args, ctx, novels),
        "edit_novel_chapter" => edits::edit_novel_chapter(args, ctx, novels),
        "edit_novel_knowledge" => edits::edit_novel_knowledge(args, ctx, sources),
        "edit_translation_passage" => edits::edit_translation_passage(args, ctx, sources),
        "edit_dictionary" => edits::edit_dictionary(args, ctx, sources),
        "read_knowledge_issues" => knowledge::read_knowledge_issues(args, ctx, sources),
        "submit_translation_review" => proposals::submit_translation_review(args, ctx, sources),
        "submit_knowledge_changes" => proposals::submit_knowledge_changes(args, ctx, sources),
        other => Err(format!("unknown tool '{other}'")),
    }
}

#[cfg(test)]
#[path = "../../../test/features/assistant/tools.test.rs"]
mod tests;

#[cfg(test)]
#[path = "../../../test/features/assistant/tools/project.test.rs"]
mod project_tests;
