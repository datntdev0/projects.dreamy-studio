use crate::features::assistant::edits::add_dictionary;
use crate::features::assistant::edits::list_of;
use crate::features::assistant::edits::replace_in_passage;
use crate::features::assistant::edits::translation_change;
use crate::features::assistant::models::AssistantChange;
use crate::features::assistant::models::AssistantError;
use crate::features::assistant::models::AssistantResult;
use crate::features::assistant::models::Decision;
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
use crate::features::translation::models::DictInput;
use crate::features::translation::service::ChapterTranslation;
use serde_json::Value;
use serde_json::json;
use std::collections::BTreeMap;
use std::collections::HashMap;
use std::collections::HashSet;
use std::collections::btree_map::Entry;

const SEVERITIES: [&str; 3] = ["error", "warning", "info"];
const CATEGORIES: [&str; 5] = ["name", "dict", "meaning", "omission", "style"];
const DICT_TYPES: [&str; 5] = ["name", "place", "org", "title", "term"];

const REVIEW_KIND: &str = "translation_review";
const LISTS: [&str; 2] = ["findings", "dictionary"];

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

enum Work {
    Replace { n: usize, from: String, to: String },
    Define(DictInput),
}

struct Pick {
    review: usize,
    list: &'static str,
    index: usize,
}

struct Book {
    chapter_id: Option<String>,
    target: String,
    chapter: Option<ChapterTranslation>,
    defined: HashSet<String>,
    edited: HashMap<usize, String>,
}

impl Book {
    fn open(attachment: &Value, sources: &Sources, novel_id: i64) -> AssistantResult<Self> {
        let target = attachment
            .get("target")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string();
        let chapter_id = attachment
            .get("chapter")
            .and_then(Value::as_i64)
            .and_then(|seq| chapter_by_seq(sources.novels.as_ref(), novel_id, seq).ok())
            .map(|row| row.id);
        let book = sources
            .translation
            .get(novel_id, &target)
            .map_err(AssistantError::storage)?;
        let chapter = chapter_id
            .as_ref()
            .and_then(|id| book.chapters.get(id))
            .cloned();
        let defined = book
            .dict
            .iter()
            .map(|entry| entry.src.trim().to_string())
            .collect();
        Ok(Self {
            chapter_id,
            target,
            chapter,
            defined,
            edited: HashMap::new(),
        })
    }

    fn accept(&mut self, work: &Work) -> bool {
        match work {
            Work::Replace { n, from, to } => {
                let Some(current) = self.current(*n) else {
                    return false;
                };
                if from.is_empty() || !current.contains(from.as_str()) {
                    return false;
                }
                self.edited
                    .insert(*n, current.replacen(from.as_str(), to, 1));
                true
            }
            Work::Define(input) => {
                let src = input.src.trim();
                !src.is_empty()
                    && !input.dst.trim().is_empty()
                    && self.defined.insert(src.to_string())
            }
        }
    }

    fn current(&self, n: usize) -> Option<String> {
        if let Some(text) = self.edited.get(&n) {
            return Some(text.clone());
        }
        let chapter = self.chapter.as_ref()?;
        n.checked_sub(1)
            .and_then(|index| chapter.paragraphs.get(index))
            .map(|passage| passage.text.clone())
    }
}

pub fn resolve(
    attachments: &mut [Value],
    item_ids: &[String],
    status: Decision,
    sources: &Sources,
    novel_id: i64,
) -> AssistantResult<Vec<AssistantChange>> {
    let picks = select(attachments, item_ids);
    match status {
        Decision::Rejected => {
            for pick in &picks {
                mark(attachments, pick, Decision::Rejected);
            }
            Ok(Vec::new())
        }
        Decision::Applied => apply(attachments, &picks, sources, novel_id),
    }
}

fn select(attachments: &[Value], item_ids: &[String]) -> Vec<Pick> {
    let mut picks = Vec::new();
    for (review, attachment) in attachments.iter().enumerate() {
        if attachment.get("kind").and_then(Value::as_str) != Some(REVIEW_KIND) {
            continue;
        }
        for list in LISTS {
            let items = attachment.get(list).and_then(Value::as_array);
            for (index, item) in items.into_iter().flatten().enumerate() {
                let pending = item.get("status").and_then(Value::as_str) == Some("pending");
                let wanted =
                    id_of(item).is_some_and(|id| item_ids.iter().any(|wanted| wanted == id));
                if pending && wanted {
                    picks.push(Pick {
                        review,
                        list,
                        index,
                    });
                }
            }
        }
    }
    picks
}

fn apply(
    attachments: &mut [Value],
    picks: &[Pick],
    sources: &Sources,
    novel_id: i64,
) -> AssistantResult<Vec<AssistantChange>> {
    let mut books: BTreeMap<usize, Book> = BTreeMap::new();
    for pick in picks {
        if let Entry::Vacant(slot) = books.entry(pick.review) {
            slot.insert(Book::open(&attachments[pick.review], sources, novel_id)?);
        }
    }
    let mut works = Vec::new();
    let mut failed = Vec::new();
    for pick in picks {
        let item = &attachments[pick.review][pick.list][pick.index];
        let accepted = books
            .get_mut(&pick.review)
            .and_then(|book| work_of(pick.list, item).filter(|work| book.accept(work)));
        match accepted {
            Some(work) => works.push(work),
            None => failed.push(id_of(item).unwrap_or("?").to_string()),
        }
    }
    if !failed.is_empty() {
        return Err(AssistantError::conflict(format!(
            "these items no longer apply: {}",
            failed.join(", ")
        )));
    }
    let mut changes = Vec::new();
    for (pick, work) in picks.iter().zip(&works) {
        let book = &books[&pick.review];
        write(work, book, sources, novel_id).map_err(AssistantError::storage)?;
        mark(attachments, pick, Decision::Applied);
        let change = translation_change(
            novel_id,
            book.chapter_id.as_deref().unwrap_or(""),
            &book.target,
        );
        let change = match work {
            Work::Replace { .. } => change,
            Work::Define(_) => AssistantChange {
                chapter_id: None,
                ..change
            },
        };
        if !changes.contains(&change) {
            changes.push(change);
        }
    }
    Ok(changes)
}

fn write(work: &Work, book: &Book, sources: &Sources, novel_id: i64) -> Result<(), String> {
    match work {
        Work::Replace { n, from, to } => {
            let chapter_id = book
                .chapter_id
                .as_deref()
                .ok_or_else(|| "the chapter is no longer in the novel".to_string())?;
            replace_in_passage(sources, novel_id, &book.target, chapter_id, *n, from, to)
        }
        Work::Define(input) => {
            add_dictionary(sources, novel_id, &book.target, input.clone()).map(|_| ())
        }
    }
}

fn work_of(list: &str, item: &Value) -> Option<Work> {
    let text = |key: &str| item.get(key).and_then(Value::as_str).map(str::to_string);
    if list == "findings" {
        let n = item.get("n").and_then(Value::as_u64)?;
        return Some(Work::Replace {
            n: usize::try_from(n).ok()?,
            from: text("from")?,
            to: text("to")?,
        });
    }
    Some(Work::Define(DictInput {
        src: text("src")?,
        dst: text("dst")?,
        kind: text("type")?,
        note: text("note").unwrap_or_default(),
    }))
}

fn mark(attachments: &mut [Value], pick: &Pick, status: Decision) {
    attachments[pick.review][pick.list][pick.index]["status"] = json!(status.as_str());
}

fn id_of(item: &Value) -> Option<&str> {
    item.get("id").and_then(Value::as_str)
}

#[cfg(test)]
#[path = "../../../test/features/assistant/proposals.test.rs"]
mod tests;
