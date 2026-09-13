use crate::features::assistant::sources::Sources;
use crate::features::assistant::tools::ToolContext;
use crate::features::assistant::tools::ToolOutput;
use crate::features::assistant::tools::args::optional_int;
use crate::features::assistant::tools::args::output;
use crate::features::assistant::tools::args::required_int;
use crate::features::assistant::tools::args::required_str;
use crate::features::assistant::tools::paging::next_position;
use crate::features::assistant::tools::paging::page_bounds;
use crate::features::assistant::tools::scope::chapter_by_seq;
use crate::features::assistant::tools::scope::find_novel;
use crate::features::novel::models::ChapterRow;
use crate::features::translation::models::DictEntry;
use crate::features::translation::models::TranslationTarget;
use crate::features::translation::warnings::TranslationWarning;
use crate::features::translation::warnings::WarningKind;
use serde_json::Value;
use serde_json::json;

pub(super) fn read_translation(
    args: &Value,
    ctx: &ToolContext,
    sources: &Sources,
) -> Result<ToolOutput, String> {
    let novel_id = required_int(args, "novelId")?;
    let target = required_target(args)?;
    let seq = required_int(args, "chapter")?;
    let from = optional_int(args, "from")?;
    let to = optional_int(args, "to")?;
    let novels = sources.novels.as_ref();
    find_novel(ctx, novels, novel_id)?;
    let chapter = chapter_by_seq(novels, novel_id, seq)?;
    let rows = novels.chapter_read(novel_id, &chapter.id)?;
    let book = sources.translation.get(novel_id, target.as_str())?;
    let translated = book
        .chapters
        .get(&chapter.id)
        .ok_or_else(|| format!("chapter {seq} has no {} translation yet", target.as_str()))?;
    let total = rows.len();
    let (start, end) = page_bounds(total, from, to);
    let paragraphs: Vec<Value> = rows[start.saturating_sub(1)..end]
        .iter()
        .map(|row| {
            let own = translated.paragraphs.get(row.n - 1);
            json!({
                "p": row.n,
                "source": row.text,
                "translation": own.map(|item| item.text.as_str()),
                "note": own.map_or("", |item| item.note.as_str()),
            })
        })
        .collect();
    let next = next_position(end, total);
    let label = format!(
        "read_translation(novel {novel_id}, ch {seq}, {}, ¶{start}–{end}) → {} đoạn",
        target.as_str(),
        paragraphs.len()
    );
    let value = json!({
        "novelId": novel_id,
        "chapter": seq,
        "title": translated.title,
        "target": target.as_str(),
        "total": total,
        "from": start,
        "to": end,
        "paragraphs": paragraphs,
        "next": next,
    });
    Ok(output(value, label))
}

pub(super) fn read_translation_guide(
    args: &Value,
    ctx: &ToolContext,
    sources: &Sources,
) -> Result<ToolOutput, String> {
    let novel_id = required_int(args, "novelId")?;
    let target = required_target(args)?;
    let novels = sources.novels.as_ref();
    find_novel(ctx, novels, novel_id)?;
    let chapters = novels.chapters(novel_id)?;
    let book = sources.translation.get(novel_id, target.as_str())?;
    let dictionary: Vec<Value> = book.dict.iter().map(dict_json).collect();
    let warnings: Vec<Value> = book
        .warnings
        .iter()
        .map(|warning| warning_json(warning, &chapters))
        .collect();
    let label = format!(
        "read_translation_guide(novel {novel_id}, {}) → {} mục từ, {} cảnh báo",
        target.as_str(),
        dictionary.len(),
        warnings.len()
    );
    let value = json!({
        "novelId": novel_id,
        "target": target.as_str(),
        "guidelines": book.guidelines,
        "dictionary": dictionary,
        "warnings": warnings,
    });
    Ok(output(value, label))
}

fn warning_json(warning: &TranslationWarning, chapters: &[ChapterRow]) -> Value {
    let kind = match warning.kind {
        WarningKind::Source => "source",
        WarningKind::Dict => "dict",
    };
    let chapter = chapters
        .iter()
        .find(|row| row.id == warning.chapter_id)
        .map(|row| row.seq);
    json!({
        "kind": kind,
        "chapter": chapter,
        "p": warning.n,
        "entryId": warning.entry_id,
    })
}

pub(crate) fn dict_json(entry: &DictEntry) -> Value {
    json!({
        "id": entry.id,
        "src": entry.src,
        "dst": entry.dst,
        "type": entry.kind,
        "note": entry.note,
    })
}

pub(crate) fn required_target(args: &Value) -> Result<TranslationTarget, String> {
    let raw = required_str(args, "target")?;
    TranslationTarget::parse(&raw)
        .ok_or_else(|| format!("unsupported target '{raw}'; use VI or EN"))
}
