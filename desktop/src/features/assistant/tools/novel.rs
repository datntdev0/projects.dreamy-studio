use crate::features::assistant::sources::NovelSource;
use crate::features::assistant::sources::Sources;
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
use crate::features::knowledge::models::KnowledgeLang;
use crate::features::novel::models::ChapterRow;
use crate::features::novel::models::NovelSummary;
use crate::features::novel::progress::knowledge_langs;
use crate::features::novel::progress::translation_langs;
use crate::features::translation::models::TranslationTarget;
use serde_json::Map;
use serde_json::Value;
use serde_json::json;
use std::collections::HashSet;

pub const OUTLINE_PAGE: usize = 50;

struct LangProgress {
    lang: &'static str,
    chapters: Vec<i64>,
}

struct NovelProgress {
    translation: Vec<LangProgress>,
    analysis: Vec<LangProgress>,
}

pub(super) fn list_novel(ctx: &ToolContext, sources: &Sources) -> Result<ToolOutput, String> {
    let limit = novel_limit(ctx)?;
    let novels = sources.novels.list()?;
    let items: Vec<Value> = novels
        .iter()
        .filter(|novel| allowed(limit, novel.id))
        .map(novel_list_json)
        .collect();
    let label = format!("list_novel() → {} novel", items.len());
    Ok(output(Value::Array(items), label))
}

pub(super) fn read_novel(
    args: &Value,
    ctx: &ToolContext,
    sources: &Sources,
) -> Result<ToolOutput, String> {
    let novel_id = required_int(args, "novelId")?;
    let from = optional_int(args, "from")?;
    let to = optional_int(args, "to")?;
    let novel = find_novel(ctx, sources.novels.as_ref(), novel_id)?;
    let chapters = sources.novels.chapters(novel_id)?;
    let progress = progress_of(sources, &novel, &chapters)?;
    let (page, next) = outline_page(&chapters, from, to);
    let outline: Vec<Value> = page.into_iter().map(chapter_json).collect();
    let label = format!(
        "read_novel(novel {novel_id}) → {}/{} chương",
        outline.len(),
        chapters.len()
    );
    let value = json!({
        "novelId": novel.id,
        "title": novel.title,
        "name": novel.name,
        "author": novel.author,
        "lang": novel.lang,
        "description": novel.description,
        "tags": novel.tags,
        "chapterCount": chapters.len(),
        "translation": detailed_json(&progress.translation),
        "analysis": detailed_json(&progress.analysis),
        "chapters": outline,
        "next": next,
    });
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

fn novel_list_json(novel: &NovelSummary) -> Value {
    json!({
        "novelId": novel.id,
        "title": novel.title,
        "name": novel.name,
        "author": novel.author,
        "lang": novel.lang,
        "tags": novel.tags,
        "chapterCount": novel.chapter_count,
        "translated": novel.translated,
        "analyzed": novel.analyzed,
    })
}

fn chapter_json(chapter: &ChapterRow) -> Value {
    json!({
        "chapter": chapter.seq,
        "title": chapter.title,
        "words": chapter.word_count,
    })
}

fn detailed_json(progress: &[LangProgress]) -> Value {
    let details: Map<String, Value> = progress
        .iter()
        .map(|item| {
            let detail = json!({
                "count": item.chapters.len(),
                "chapters": chapter_ranges(&item.chapters),
            });
            (item.lang.to_string(), detail)
        })
        .collect();
    Value::Object(details)
}

fn outline_page(
    chapters: &[ChapterRow],
    from: Option<i64>,
    to: Option<i64>,
) -> (Vec<&ChapterRow>, Value) {
    let first = from.unwrap_or(i64::MIN);
    let last = to.unwrap_or(i64::MAX);
    let mut wanted = chapters
        .iter()
        .filter(|chapter| chapter.seq >= first && chapter.seq <= last);
    let page: Vec<&ChapterRow> = wanted.by_ref().take(OUTLINE_PAGE).collect();
    let next = wanted
        .next()
        .map_or(Value::Null, |chapter| json!(chapter.seq));
    (page, next)
}

fn progress_of(
    sources: &Sources,
    novel: &NovelSummary,
    chapters: &[ChapterRow],
) -> Result<NovelProgress, String> {
    let targets: Vec<&'static str> = translation_langs(&novel.lang)
        .into_iter()
        .map(TranslationTarget::as_str)
        .collect();
    let langs: Vec<&'static str> = knowledge_langs(&novel.lang)
        .into_iter()
        .map(KnowledgeLang::as_str)
        .collect();
    let translation = langs_progress(chapters, &targets, |lang| {
        sources.translation.translated_chapters(novel.id, lang)
    })?;
    let analysis = langs_progress(chapters, &langs, |lang| {
        sources.knowledge.analyzed_chapters(novel.id, lang)
    })?;
    Ok(NovelProgress {
        translation,
        analysis,
    })
}

fn langs_progress(
    chapters: &[ChapterRow],
    langs: &[&'static str],
    done: impl Fn(&str) -> Result<Vec<String>, String>,
) -> Result<Vec<LangProgress>, String> {
    langs
        .iter()
        .map(|lang| {
            let ids: HashSet<String> = done(lang)?.into_iter().collect();
            Ok(LangProgress {
                lang,
                chapters: chapter_seqs(chapters, &ids),
            })
        })
        .collect()
}

fn chapter_seqs(chapters: &[ChapterRow], ids: &HashSet<String>) -> Vec<i64> {
    let mut seqs: Vec<i64> = chapters
        .iter()
        .filter(|chapter| ids.contains(&chapter.id))
        .map(|chapter| chapter.seq)
        .collect();
    seqs.sort_unstable();
    seqs
}

fn chapter_ranges(seqs: &[i64]) -> String {
    let mut ranges: Vec<(i64, i64)> = Vec::new();
    for &seq in seqs {
        match ranges.last_mut() {
            Some((_, end)) if *end + 1 == seq => *end = seq,
            _ => ranges.push((seq, seq)),
        }
    }
    ranges
        .iter()
        .map(|&(start, end)| range_text(start, end))
        .collect::<Vec<_>>()
        .join(",")
}

fn range_text(start: i64, end: i64) -> String {
    if start == end {
        start.to_string()
    } else {
        format!("{start}-{end}")
    }
}
