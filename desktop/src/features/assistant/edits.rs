use crate::features::assistant::models::AssistantChange;
use crate::features::assistant::models::ChangeTarget;
use crate::features::assistant::sources::NovelSource;
use crate::features::assistant::sources::Sources;
use crate::features::assistant::tools::ToolContext;
use crate::features::assistant::tools::ToolOutput;
use crate::features::assistant::tools::find_novel;
use crate::features::assistant::tools::optional_str;
use crate::features::assistant::tools::output;
use crate::features::assistant::tools::required_int;
use crate::features::assistant::tools::required_str;
use crate::features::knowledge::models::KnowledgeEdit;
use crate::features::knowledge::service::parse_lang;
use crate::features::novel::models::NovelPatch;
use serde_json::Value;
use serde_json::json;
use std::collections::HashSet;

pub const EDIT_DISABLED: &str = "Editing is not enabled for this session. Ask the user to turn on editing in the assistant panel, then try again.";

struct ParagraphEdit {
    p: usize,
    expected: String,
    text: String,
}

pub fn edit_novel(
    args: &Value,
    ctx: &ToolContext,
    novels: &dyn NovelSource,
) -> Result<ToolOutput, String> {
    ensure_editable(ctx)?;
    let novel_id = required_int(args, "novelId")?;
    find_novel(ctx.scope, novels, novel_id)?;
    let patch = NovelPatch {
        title: optional_str(args, "title")?,
        name: optional_str(args, "name")?,
        author: optional_str(args, "author")?,
        lang: None,
        description: optional_str(args, "description")?,
        tags: optional_tags(args)?,
    };
    let fields = patched_fields(&patch);
    if fields.is_empty() {
        return Err(
            "pass at least one of title, name, author, description or tags to change".to_string(),
        );
    }
    let updated = novels.update(novel_id, patch)?;
    ctx.sink.changed(change(ChangeTarget::Novel, novel_id));
    let label = format!("edit_novel(novel {novel_id}: {})", fields.join(", "));
    let value = json!({
        "novelId": updated.id,
        "title": updated.title,
        "name": updated.name,
        "author": updated.author,
        "description": updated.description,
        "tags": updated.tags,
        "changed": fields,
    });
    Ok(output(value, label))
}

pub fn edit_novel_chapter(
    args: &Value,
    ctx: &ToolContext,
    novels: &dyn NovelSource,
) -> Result<ToolOutput, String> {
    ensure_editable(ctx)?;
    let novel_id = required_int(args, "novelId")?;
    let seq = required_int(args, "chapter")?;
    let title = optional_str(args, "title")?;
    let edits = paragraph_edits(args)?;
    if title.is_none() && edits.is_empty() {
        return Err("pass a title or at least one paragraph to change".to_string());
    }
    if title.as_deref().is_some_and(|text| text.trim().is_empty()) {
        return Err("argument 'title' must not be empty".to_string());
    }
    find_novel(ctx.scope, novels, novel_id)?;
    let chapter = novels
        .chapters(novel_id)?
        .into_iter()
        .find(|row| row.seq == seq)
        .ok_or_else(|| format!("chapter {seq} not found in novel {novel_id}"))?;
    let rows = novels.chapter_read(novel_id, &chapter.id)?;
    for edit in &edits {
        let row = rows
            .iter()
            .find(|row| row.n == edit.p)
            .ok_or_else(|| format!("paragraph {} not found in chapter {seq}", edit.p))?;
        if row.text != edit.expected {
            return Err(format!(
                "paragraph {} does not match `expected`; nothing was written. Read the chapter again and retry. Current text: {}",
                edit.p, row.text
            ));
        }
    }
    let mut written = false;
    let mut failure = None;
    for edit in &edits {
        match novels.paragraph_update(novel_id, &chapter.id, edit.p, &edit.text) {
            Ok(_) => written = true,
            Err(error) => {
                failure = Some(error);
                break;
            }
        }
    }
    let mut renamed = false;
    if failure.is_none()
        && let Some(title) = &title
    {
        match novels.chapter_rename(novel_id, &chapter.id, title) {
            Ok(_) => renamed = true,
            Err(error) => failure = Some(error),
        }
    }
    if written || renamed {
        ctx.sink.changed(AssistantChange {
            target: ChangeTarget::Chapter,
            novel_id,
            chapter_id: Some(chapter.id.clone()),
            lang: None,
        });
    }
    if renamed {
        ctx.sink.changed(change(ChangeTarget::Novel, novel_id));
    }
    if let Some(error) = failure {
        return Err(error);
    }
    let positions: Vec<usize> = edits.iter().map(|edit| edit.p).collect();
    let label = chapter_label(novel_id, seq, &positions, renamed);
    let value = json!({
        "novelId": novel_id,
        "chapter": seq,
        "paragraphs": positions,
        "title": title,
    });
    Ok(output(value, label))
}

pub fn edit_novel_knowledge(
    args: &Value,
    ctx: &ToolContext,
    sources: &Sources,
) -> Result<ToolOutput, String> {
    ensure_editable(ctx)?;
    let novel_id = required_int(args, "novelId")?;
    let raw_lang = required_str(args, "lang")?;
    let lang = parse_lang(&raw_lang).map_err(|error| error.to_string())?;
    let raw = args
        .get("edits")
        .filter(|value| !value.is_null())
        .ok_or_else(|| "missing array argument 'edits'".to_string())?;
    let edits: Vec<KnowledgeEdit> =
        serde_json::from_value(raw.clone()).map_err(|error| format!("invalid edits: {error}"))?;
    if edits.is_empty() {
        return Err("argument 'edits' must contain at least one edit".to_string());
    }
    find_novel(ctx.scope, sources.novels.as_ref(), novel_id)?;
    let count = edits.len();
    let result = sources.knowledge.edit(novel_id, lang.as_str(), edits)?;
    ctx.sink.changed(AssistantChange {
        target: ChangeTarget::Knowledge,
        novel_id,
        chapter_id: None,
        lang: Some(lang.as_str().to_string()),
    });
    let label = format!(
        "edit_novel_knowledge(novel {novel_id}, {}, {count} sửa)",
        lang.as_str()
    );
    let value = json!({ "applied": count, "remap": result.remap });
    Ok(output(value, label))
}

fn ensure_editable(ctx: &ToolContext) -> Result<(), String> {
    if ctx.can_edit {
        Ok(())
    } else {
        Err(EDIT_DISABLED.to_string())
    }
}

fn change(target: ChangeTarget, novel_id: i64) -> AssistantChange {
    AssistantChange {
        target,
        novel_id,
        chapter_id: None,
        lang: None,
    }
}

fn optional_tags(args: &Value) -> Result<Option<Vec<String>>, String> {
    match args.get("tags") {
        None | Some(Value::Null) => Ok(None),
        Some(Value::Array(items)) => items
            .iter()
            .map(|item| {
                item.as_str()
                    .map(str::to_string)
                    .ok_or_else(|| "argument 'tags' must be an array of strings".to_string())
            })
            .collect::<Result<Vec<String>, String>>()
            .map(Some),
        Some(_) => Err("argument 'tags' must be an array of strings".to_string()),
    }
}

fn patched_fields(patch: &NovelPatch) -> Vec<&'static str> {
    [
        ("title", patch.title.is_some()),
        ("name", patch.name.is_some()),
        ("author", patch.author.is_some()),
        ("description", patch.description.is_some()),
        ("tags", patch.tags.is_some()),
    ]
    .into_iter()
    .filter(|(_, present)| *present)
    .map(|(field, _)| field)
    .collect()
}

fn paragraph_edits(args: &Value) -> Result<Vec<ParagraphEdit>, String> {
    let items = match args.get("paragraphs") {
        None | Some(Value::Null) => return Ok(Vec::new()),
        Some(Value::Array(items)) => items,
        Some(_) => return Err("argument 'paragraphs' must be an array".to_string()),
    };
    let mut seen = HashSet::new();
    let mut edits = Vec::with_capacity(items.len());
    for item in items {
        let p = required_int(item, "p")?;
        if p < 1 {
            return Err("paragraph position 'p' must be at least 1".to_string());
        }
        let p = p as usize;
        if !seen.insert(p) {
            return Err(format!("paragraph {p} appears more than once"));
        }
        edits.push(ParagraphEdit {
            p,
            expected: required_str(item, "expected")?,
            text: required_str(item, "text")?,
        });
    }
    Ok(edits)
}

fn chapter_label(novel_id: i64, seq: i64, positions: &[usize], renamed: bool) -> String {
    let mut parts = vec![format!("novel {novel_id}"), format!("ch {seq}")];
    if !positions.is_empty() {
        let marks: Vec<String> = positions.iter().map(|p| format!("¶{p}")).collect();
        parts.push(marks.join(" "));
    }
    if renamed {
        parts.push("title".to_string());
    }
    format!("edit_novel_chapter({})", parts.join(", "))
}

#[cfg(test)]
#[path = "../../../test/features/assistant/edits.test.rs"]
mod tests;
