use crate::features::assistant::sources::NovelSource;
use crate::features::assistant::tools::ToolContext;
use crate::features::assistant::tools::ToolOutput;
use crate::features::assistant::tools::args::optional_int;
use crate::features::assistant::tools::args::output;
use crate::features::assistant::tools::args::required_int;
use crate::features::assistant::tools::paging::next_position;
use crate::features::assistant::tools::paging::page_bounds;
use crate::features::assistant::tools::scope::allowed;
use crate::features::assistant::tools::scope::find_novel;
use crate::features::assistant::tools::scope::novel_limit;
use crate::features::novel::models::ChapterRow;
use crate::features::novel::models::NovelSummary;
use serde_json::Value;
use serde_json::json;

pub(super) fn list_novel(
    ctx: &ToolContext,
    source: &dyn NovelSource,
) -> Result<ToolOutput, String> {
    let limit = novel_limit(ctx)?;
    let novels = source.list()?;
    let items: Vec<Value> = novels
        .iter()
        .filter(|novel| allowed(limit, novel.id))
        .map(novel_json)
        .collect();
    let label = format!("list_novel() → {} novel", items.len());
    Ok(output(Value::Array(items), label))
}

pub(super) fn read_novel(
    args: &Value,
    ctx: &ToolContext,
    source: &dyn NovelSource,
) -> Result<ToolOutput, String> {
    let novel_id = required_int(args, "novelId")?;
    let novel = find_novel(ctx, source, novel_id)?;
    let chapters = source.chapters(novel_id)?;
    let outline: Vec<Value> = chapters.iter().map(chapter_json).collect();
    let label = format!("read_novel(novel {novel_id}) → {} chương", outline.len());
    let mut value = novel_json(&novel);
    value["chapters"] = Value::Array(outline);
    Ok(output(value, label))
}

pub(super) fn read_novel_chapter(
    args: &Value,
    ctx: &ToolContext,
    source: &dyn NovelSource,
) -> Result<ToolOutput, String> {
    let novel_id = required_int(args, "novelId")?;
    let seq = required_int(args, "chapter")?;
    let from = optional_int(args, "from")?;
    let to = optional_int(args, "to")?;
    find_novel(ctx, source, novel_id)?;
    let chapters = source.chapters(novel_id)?;
    let chapter = chapters
        .iter()
        .find(|row| row.seq == seq)
        .ok_or_else(|| format!("chapter {seq} not found in novel {novel_id}"))?;
    let rows = source.chapter_read(novel_id, &chapter.id)?;
    let total = rows.len();
    let sizes: Vec<usize> = rows.iter().map(|row| row.text.chars().count()).collect();
    let (start, end) = page_bounds(&sizes, from, to);
    let paragraphs: Vec<Value> = rows[start.saturating_sub(1)..end]
        .iter()
        .map(|row| json!({ "p": row.n, "text": row.text }))
        .collect();
    let next = next_position(end, total);
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

pub(super) fn novel_json(novel: &NovelSummary) -> Value {
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
