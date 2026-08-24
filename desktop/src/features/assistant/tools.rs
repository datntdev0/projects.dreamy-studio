use crate::features::assistant::models::AssistantScope;
use crate::features::assistant::models::ScopeKind;
use crate::features::novel::models::ChapterRow;
use crate::features::novel::models::NovelSummary;
use crate::features::novel::models::ParagraphRow;
use crate::features::novel::service::NovelWorkspace;
use serde_json::Value;
use serde_json::json;

pub const PAGE_PARAGRAPHS: usize = 60;
pub const PAGE_CHARS: usize = 12_000;

pub trait NovelSource {
    fn list(&self) -> Result<Vec<NovelSummary>, String>;
    fn chapters(&self, novel_id: i64) -> Result<Vec<ChapterRow>, String>;
    fn chapter_read(&self, novel_id: i64, chapter_id: &str) -> Result<Vec<ParagraphRow>, String>;
}

impl NovelSource for NovelWorkspace {
    fn list(&self) -> Result<Vec<NovelSummary>, String> {
        NovelWorkspace::list(self).map_err(|error| error.to_string())
    }

    fn chapters(&self, novel_id: i64) -> Result<Vec<ChapterRow>, String> {
        NovelWorkspace::chapters(self, novel_id).map_err(|error| error.to_string())
    }

    fn chapter_read(&self, novel_id: i64, chapter_id: &str) -> Result<Vec<ParagraphRow>, String> {
        NovelWorkspace::chapter_read(self, novel_id, chapter_id).map_err(|error| error.to_string())
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ToolOutput {
    pub text: String,
    pub label: String,
}

pub fn definitions() -> Value {
    json!([
        {
            "name": "list_novel",
            "description": "List every novel in the workspace with its title, author, language, tags and chapter counts.",
            "inputSchema": {
                "type": "object",
                "properties": {},
                "additionalProperties": false
            }
        },
        {
            "name": "read_novel",
            "description": "Read one novel: its metadata and the outline of its chapters (number, title, word count, translation and analysis status).",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "novelId": { "type": "integer", "description": "Novel id from list_novel." }
                },
                "required": ["novelId"],
                "additionalProperties": false
            }
        },
        {
            "name": "read_novel_chapter",
            "description": "Read the paragraphs of one chapter. Paragraph positions are 1-based. A page holds at most 60 paragraphs or 12000 characters; when `next` is not null, call again with from set to `next`.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "novelId": { "type": "integer", "description": "Novel id from list_novel." },
                    "chapter": { "type": "integer", "description": "Chapter number from read_novel." },
                    "from": { "type": "integer", "minimum": 1, "description": "First paragraph position, default 1." },
                    "to": { "type": "integer", "minimum": 1, "description": "Last paragraph position, default the end of the chapter." }
                },
                "required": ["novelId", "chapter"],
                "additionalProperties": false
            }
        }
    ])
}

pub fn call(
    name: &str,
    args: &Value,
    scope: &AssistantScope,
    source: &dyn NovelSource,
) -> Result<ToolOutput, String> {
    match name {
        "list_novel" => list_novel(scope, source),
        "read_novel" => read_novel(args, scope, source),
        "read_novel_chapter" => read_novel_chapter(args, scope, source),
        other => Err(format!("unknown tool '{other}'")),
    }
}

fn list_novel(scope: &AssistantScope, source: &dyn NovelSource) -> Result<ToolOutput, String> {
    let novels = source.list()?;
    let items: Vec<Value> = novels
        .iter()
        .filter(|novel| allowed(scope, novel.id))
        .map(novel_json)
        .collect();
    let label = format!("list_novel() → {} novel", items.len());
    Ok(output(Value::Array(items), label))
}

fn read_novel(
    args: &Value,
    scope: &AssistantScope,
    source: &dyn NovelSource,
) -> Result<ToolOutput, String> {
    let novel_id = required_int(args, "novelId")?;
    let novel = find_novel(scope, source, novel_id)?;
    let chapters = source.chapters(novel_id)?;
    let outline: Vec<Value> = chapters.iter().map(chapter_json).collect();
    let label = format!("read_novel(novel {novel_id}) → {} chương", outline.len());
    let mut value = novel_json(&novel);
    value["chapters"] = Value::Array(outline);
    Ok(output(value, label))
}

fn read_novel_chapter(
    args: &Value,
    scope: &AssistantScope,
    source: &dyn NovelSource,
) -> Result<ToolOutput, String> {
    let novel_id = required_int(args, "novelId")?;
    let seq = required_int(args, "chapter")?;
    let from = optional_int(args, "from")?;
    let to = optional_int(args, "to")?;
    find_novel(scope, source, novel_id)?;
    let chapters = source.chapters(novel_id)?;
    let chapter = chapters
        .iter()
        .find(|row| row.seq == seq)
        .ok_or_else(|| format!("chapter {seq} not found in novel {novel_id}"))?;
    let rows = source.chapter_read(novel_id, &chapter.id)?;
    let total = rows.len();
    let (start, end) = page_bounds(&rows, from, to);
    let paragraphs: Vec<Value> = rows[start.saturating_sub(1)..end]
        .iter()
        .map(|row| json!({ "p": row.n, "text": row.text }))
        .collect();
    let next = if end < total {
        json!(end + 1)
    } else {
        Value::Null
    };
    let label = format!(
        "read_novel_chapter(novel {novel_id}, ch {seq}, ¶{start}–{end}) → {} đoạn",
        paragraphs.len()
    );
    let value = json!({
        "novelId": novel_id,
        "chapter": seq,
        "title": chapter.title,
        "total": total,
        "from": start,
        "to": end,
        "paragraphs": paragraphs,
        "next": next,
    });
    Ok(output(value, label))
}

fn page_bounds(rows: &[ParagraphRow], from: Option<i64>, to: Option<i64>) -> (usize, usize) {
    let total = rows.len();
    if total == 0 {
        return (1, 0);
    }
    let start = clamp_position(from.unwrap_or(1), 1, total);
    let wanted = clamp_position(to.unwrap_or(total as i64), start, total);
    let mut end = start - 1;
    let mut chars = 0;
    for row in &rows[start - 1..wanted] {
        let size = row.text.chars().count();
        if end >= start && (end - start + 1 >= PAGE_PARAGRAPHS || chars + size > PAGE_CHARS) {
            break;
        }
        chars += size;
        end += 1;
    }
    (start, end)
}

fn clamp_position(value: i64, low: usize, high: usize) -> usize {
    value.clamp(low as i64, high as i64) as usize
}

fn allowed(scope: &AssistantScope, novel_id: i64) -> bool {
    match (scope.kind, scope.novel_id) {
        (ScopeKind::Novel, Some(id)) => id == novel_id,
        _ => true,
    }
}

fn find_novel(
    scope: &AssistantScope,
    source: &dyn NovelSource,
    novel_id: i64,
) -> Result<NovelSummary, String> {
    if !allowed(scope, novel_id) {
        return Err(format!("novel {novel_id} is outside the current scope"));
    }
    source
        .list()?
        .into_iter()
        .find(|novel| novel.id == novel_id)
        .ok_or_else(|| format!("novel {novel_id} not found"))
}

fn required_int(args: &Value, key: &str) -> Result<i64, String> {
    optional_int(args, key)?.ok_or_else(|| format!("missing integer argument '{key}'"))
}

fn optional_int(args: &Value, key: &str) -> Result<Option<i64>, String> {
    match args.get(key) {
        None | Some(Value::Null) => Ok(None),
        Some(value) => value
            .as_i64()
            .map(Some)
            .ok_or_else(|| format!("argument '{key}' must be an integer")),
    }
}

fn novel_json(novel: &NovelSummary) -> Value {
    json!({
        "novelId": novel.id,
        "title": novel.title,
        "name": novel.name,
        "author": novel.author,
        "lang": novel.lang,
        "description": novel.description,
        "tags": novel.tags,
        "chapterCount": novel.chapter_count,
        "translatedCount": novel.translated_count,
        "analyzedCount": novel.analyzed_count,
    })
}

fn chapter_json(chapter: &ChapterRow) -> Value {
    json!({
        "chapter": chapter.seq,
        "title": chapter.title,
        "words": chapter.word_count,
        "translation": chapter.translation_status,
        "analysis": chapter.analysis_status,
    })
}

fn output(value: Value, label: String) -> ToolOutput {
    ToolOutput {
        text: value.to_string(),
        label,
    }
}

#[cfg(test)]
#[path = "../../../test/features/assistant/tools.test.rs"]
mod tests;
