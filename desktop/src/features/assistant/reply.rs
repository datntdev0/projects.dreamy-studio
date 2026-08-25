use crate::features::assistant::models::AssistantCitation;
use crate::features::assistant::tools::NovelSource;
use crate::features::novel::models::ChapterRow;
use crate::features::novel::models::ParagraphRow;
use serde_json::Value;
use serde_json::from_str;
use serde_json::from_value;
use std::collections::HashMap;

const OPEN: &str = "<citations>";
const CLOSE: &str = "</citations>";

type ChapterCache = HashMap<i64, Option<Vec<ChapterRow>>>;
type ParagraphCache = HashMap<(i64, i64), Option<Vec<ParagraphRow>>>;

pub fn parse(raw: &str) -> (String, Vec<AssistantCitation>) {
    let normalized = raw.replace("\r\n", "\n");
    let mut text = String::new();
    let mut rest = normalized.as_str();
    let mut last_body: Option<&str> = None;
    while let Some(start) = rest.find(OPEN) {
        let after = &rest[start + OPEN.len()..];
        let Some(end) = after.find(CLOSE) else {
            break;
        };
        text.push_str(&rest[..start]);
        last_body = Some(&after[..end]);
        rest = &after[end + CLOSE.len()..];
    }
    text.push_str(rest);
    let citations = last_body.map(parse_citations).unwrap_or_default();
    (text.trim().to_string(), citations)
}

fn parse_citations(body: &str) -> Vec<AssistantCitation> {
    let Ok(Value::Array(items)) = from_str::<Value>(strip_fence(body)) else {
        return Vec::new();
    };
    items
        .into_iter()
        .filter_map(|item| from_value::<AssistantCitation>(item).ok())
        .collect()
}

fn strip_fence(body: &str) -> &str {
    let trimmed = body.trim();
    let Some(inner) = trimmed.strip_prefix("```") else {
        return trimmed;
    };
    let inner = inner.strip_suffix("```").unwrap_or(inner);
    let inner = inner.strip_prefix("json").unwrap_or(inner);
    inner.trim()
}

pub fn verify(
    citations: Vec<AssistantCitation>,
    source: &dyn NovelSource,
) -> Vec<AssistantCitation> {
    let mut chapters = ChapterCache::new();
    let mut paragraphs = ParagraphCache::new();
    citations
        .into_iter()
        .filter(|citation| holds(citation, source, &mut chapters, &mut paragraphs))
        .collect()
}

fn holds(
    citation: &AssistantCitation,
    source: &dyn NovelSource,
    chapters: &mut ChapterCache,
    paragraphs: &mut ParagraphCache,
) -> bool {
    let quote = citation.quote.trim();
    if quote.is_empty() || citation.p < 1 {
        return false;
    }
    let Some(rows) = paragraph_rows(citation, source, chapters, paragraphs) else {
        return false;
    };
    rows.iter()
        .find(|row| row.n as i64 == citation.p)
        .is_some_and(|row| row.text.contains(&citation.quote) || row.text.contains(quote))
}

fn paragraph_rows<'a>(
    citation: &AssistantCitation,
    source: &dyn NovelSource,
    chapters: &mut ChapterCache,
    paragraphs: &'a mut ParagraphCache,
) -> Option<&'a Vec<ParagraphRow>> {
    let key = (citation.novel_id, citation.chapter);
    if !paragraphs.contains_key(&key) {
        let rows = chapter_id(citation, source, chapters)
            .and_then(|id| source.chapter_read(citation.novel_id, &id).ok());
        paragraphs.insert(key, rows);
    }
    paragraphs.get(&key).and_then(Option::as_ref)
}

fn chapter_id(
    citation: &AssistantCitation,
    source: &dyn NovelSource,
    chapters: &mut ChapterCache,
) -> Option<String> {
    chapters
        .entry(citation.novel_id)
        .or_insert_with(|| source.chapters(citation.novel_id).ok())
        .as_ref()?
        .iter()
        .find(|row| row.seq == citation.chapter)
        .map(|row| row.id.clone())
}

#[cfg(test)]
#[path = "../../../test/features/assistant/reply.test.rs"]
mod tests;
