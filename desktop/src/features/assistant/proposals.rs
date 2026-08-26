use crate::features::assistant::edits::list_of;
use crate::features::assistant::sources::Sources;
use crate::features::assistant::tools::ToolContext;
use crate::features::assistant::tools::ToolOutput;
use crate::features::assistant::tools::chapter_by_seq;
use crate::features::assistant::tools::find_novel;
use crate::features::assistant::tools::optional_int;
use crate::features::assistant::tools::output;
use crate::features::assistant::tools::required_int;
use crate::features::assistant::tools::required_target;
use crate::features::novel::models::ParagraphRow;
use crate::features::translation::models::DictEntry;
use crate::features::translation::service::ChapterTranslation;
use serde_json::Value;
use serde_json::json;

const SEVERITIES: [&str; 3] = ["error", "warning", "info"];
const CATEGORIES: [&str; 5] = ["name", "dict", "meaning", "omission", "style"];
const DICT_TYPES: [&str; 5] = ["name", "place", "org", "title", "term"];

struct Dropped {
    index: usize,
    kind: &'static str,
    reason: String,
}

pub fn submit_translation_review(
    args: &Value,
    ctx: &ToolContext,
    sources: &Sources,
) -> Result<ToolOutput, String> {
    let novel_id = required_int(args, "novelId")?;
    let target = required_target(args)?;
    let seq = required_int(args, "chapter")?;
    let novels = sources.novels.as_ref();
    find_novel(ctx.scope, novels, novel_id)?;
    let chapter = chapter_by_seq(novels, novel_id, seq)?;
    let book = sources.translation.get(novel_id, target.as_str())?;
    let translated = book
        .chapters
        .get(&chapter.id)
        .ok_or_else(|| format!("chapter {seq} has no {} translation yet", target.as_str()))?;
    let rows = novels.chapter_read(novel_id, &chapter.id)?;
    let checked = optional_int(args, "checked")?
        .unwrap_or(translated.paragraphs.len() as i64)
        .max(0);
    let mut dropped = Vec::new();
    let findings = collect_findings(list_of(args, "findings")?, &rows, translated, &mut dropped);
    let source_text = rows
        .iter()
        .map(|row| row.text.as_str())
        .collect::<Vec<_>>()
        .join("\n");
    let dictionary = collect_dictionary(
        list_of(args, "dictionary")?,
        &book.dict,
        &source_text,
        &mut dropped,
    );
    let review = json!({
        "kind": "translation_review",
        "chapter": seq,
        "chapterTitle": chapter.title,
        "target": target.as_str(),
        "checked": checked,
        "findings": findings,
        "dictionary": dictionary,
    });
    ctx.sink.attach(review);
    let label = format!(
        "submit_translation_review(novel {novel_id}, ch {seq}, {}) → {} phát hiện, {} mục từ",
        target.as_str(),
        findings.len(),
        dictionary.len()
    );
    let value = json!({
        "accepted": { "findings": findings.len(), "dictionary": dictionary.len() },
        "dropped": dropped_json(&dropped),
    });
    Ok(output(value, label))
}

fn collect_findings(
    items: &[Value],
    rows: &[ParagraphRow],
    translated: &ChapterTranslation,
    dropped: &mut Vec<Dropped>,
) -> Vec<Value> {
    let mut findings = Vec::new();
    for (index, item) in items.iter().enumerate() {
        let id = format!("f{}", findings.len() + 1);
        match check_finding(item, &id, rows, translated) {
            Ok(finding) => findings.push(finding),
            Err(reason) => dropped.push(Dropped {
                index,
                kind: "finding",
                reason,
            }),
        }
    }
    findings
}

fn check_finding(
    item: &Value,
    id: &str,
    rows: &[ParagraphRow],
    translated: &ChapterTranslation,
) -> Result<Value, String> {
    let n = item
        .get("n")
        .and_then(Value::as_i64)
        .ok_or_else(|| "n must be an integer paragraph position".to_string())?;
    let passage = usize::try_from(n)
        .ok()
        .filter(|position| *position >= 1)
        .and_then(|position| translated.paragraphs.get(position - 1))
        .ok_or_else(|| format!("paragraph {n} is not a translated paragraph"))?;
    let severity = choice(item, "severity", &SEVERITIES)?;
    let category = choice(item, "category", &CATEGORIES)?;
    let from = text_field(item, "from")?;
    let to = text_field(item, "to")?;
    let reason = text_field(item, "reason")?;
    if from.is_empty() {
        return Err("from must not be empty; quote the text to replace verbatim".to_string());
    }
    if !passage.text.contains(from) {
        return Err(format!(
            "from `{from}` does not occur in the current translation of paragraph {n}"
        ));
    }
    let source = rows
        .iter()
        .find(|row| i64::try_from(row.n).is_ok_and(|position| position == n))
        .map_or("", |row| row.text.as_str());
    Ok(json!({
        "id": id,
        "n": n,
        "severity": severity,
        "category": category,
        "source": source,
        "current": passage.text,
        "suggested": passage.text.replacen(from, to, 1),
        "from": from,
        "to": to,
        "reason": reason,
        "status": "pending",
    }))
}

fn collect_dictionary(
    items: &[Value],
    dict: &[DictEntry],
    source_text: &str,
    dropped: &mut Vec<Dropped>,
) -> Vec<Value> {
    let mut proposals: Vec<Value> = Vec::new();
    for (index, item) in items.iter().enumerate() {
        let id = format!("d{}", proposals.len() + 1);
        match check_entry(item, &id, dict, &proposals, source_text) {
            Ok(proposal) => proposals.push(proposal),
            Err(reason) => dropped.push(Dropped {
                index,
                kind: "dictionary",
                reason,
            }),
        }
    }
    proposals
}

fn check_entry(
    item: &Value,
    id: &str,
    dict: &[DictEntry],
    proposals: &[Value],
    source_text: &str,
) -> Result<Value, String> {
    let src = text_field(item, "src")?.trim();
    let dst = text_field(item, "dst")?.trim();
    let kind = choice(item, "type", &DICT_TYPES)?;
    let note = match item.get("note") {
        None | Some(Value::Null) => "",
        Some(_) => text_field(item, "note")?.trim(),
    };
    if src.is_empty() || dst.is_empty() {
        return Err("src and dst must not be empty".to_string());
    }
    if dict.iter().any(|entry| entry.src.trim() == src) {
        return Err(format!("`{src}` is already in the dictionary"));
    }
    if proposals.iter().any(|entry| entry["src"] == src) {
        return Err(format!("`{src}` is already proposed in this review"));
    }
    Ok(json!({
        "id": id,
        "src": src,
        "dst": dst,
        "type": kind,
        "note": note,
        "occurrences": source_text.matches(src).count(),
        "status": "pending",
    }))
}

fn choice<'a>(item: &'a Value, key: &str, allowed: &[&str]) -> Result<&'a str, String> {
    let value = text_field(item, key)?;
    if allowed.contains(&value) {
        Ok(value)
    } else {
        Err(format!("{key} must be one of {}", allowed.join(", ")))
    }
}

fn text_field<'a>(item: &'a Value, key: &str) -> Result<&'a str, String> {
    item.get(key)
        .and_then(Value::as_str)
        .ok_or_else(|| format!("{key} must be a string"))
}

fn dropped_json(dropped: &[Dropped]) -> Vec<Value> {
    dropped
        .iter()
        .map(|item| json!({ "index": item.index, "kind": item.kind, "reason": item.reason }))
        .collect()
}

#[cfg(test)]
#[path = "../../../test/features/assistant/proposals.test.rs"]
mod tests;
