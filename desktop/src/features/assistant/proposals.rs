use crate::features::assistant::edits::add_dictionary;
use crate::features::assistant::edits::list_of;
use crate::features::assistant::edits::replace_in_passage;
use crate::features::assistant::edits::translation_change;
use crate::features::assistant::models::AssistantChange;
use crate::features::assistant::models::AssistantError;
use crate::features::assistant::models::AssistantResult;
use crate::features::assistant::models::ChangeTarget;
use crate::features::assistant::models::Decision;
use crate::features::assistant::sources::Sources;
use crate::features::assistant::tools::ToolContext;
use crate::features::assistant::tools::ToolOutput;
use crate::features::assistant::tools::chapter_by_seq;
use crate::features::assistant::tools::find_novel;
use crate::features::assistant::tools::optional_int;
use crate::features::assistant::tools::output;
use crate::features::assistant::tools::required_int;
use crate::features::assistant::tools::required_str;
use crate::features::assistant::tools::required_target;
use crate::features::knowledge::check::KnowledgeIssue;
use crate::features::knowledge::check::check;
use crate::features::knowledge::models::KnowledgeEdit;
use crate::features::knowledge::ontology::Ontology;
use crate::features::knowledge::service::parse_lang;
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
const CHANGES_KIND: &str = "knowledge_changes";
const CHANGE_SET_ID: &str = "cs1";
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

pub fn submit_knowledge_changes(
    args: &Value,
    ctx: &ToolContext,
    sources: &Sources,
) -> Result<ToolOutput, String> {
    let novel_id = required_int(args, "novelId")?;
    let raw_lang = required_str(args, "lang")?;
    let lang = parse_lang(&raw_lang).map_err(|error| error.to_string())?;
    let title = required_str(args, "title")?;
    let items = list_of(args, "changes")?;
    if items.is_empty() {
        return Err("argument 'changes' must contain at least one change".to_string());
    }
    find_novel(ctx.scope, sources.novels.as_ref(), novel_id)?;
    let mut changes = Vec::new();
    let mut edits = Vec::new();
    let mut raw = Vec::new();
    for (index, item) in items.iter().enumerate() {
        let (change, edit, value) = parse_change(item, novel_id, index)
            .map_err(|reason| format!("change {index}: {reason}"))?;
        changes.push(change);
        edits.push(edit);
        raw.push(value);
    }
    let before = sources.knowledge.get(novel_id, lang.as_str())?;
    let ontology = Ontology::get();
    let issues_before = check(ontology, &before.items);
    let count = edits.len();
    let after = sources
        .knowledge
        .preview(novel_id, lang.as_str(), edits)
        .map_err(|error| format!("the edits cannot be applied: {error}"))?;
    let issues_after = check(ontology, &after.items);
    let validation = validate(&issues_before, &issues_after);
    let attachment = json!({
        "kind": CHANGES_KIND,
        "id": CHANGE_SET_ID,
        "title": title,
        "edits": count,
        "validation": validation,
        "changes": changes,
        "status": "pending",
        "lang": lang.as_str(),
        "novelId": novel_id,
        "raw": raw,
    });
    ctx.sink.attach(attachment);
    let label = format!(
        "submit_knowledge_changes(novel {novel_id}, {}, {count} sửa) → giải quyết {}, phát sinh {}",
        lang.as_str(),
        validation["resolves"],
        validation["introduces"].as_array().map_or(0, Vec::len)
    );
    Ok(output(json!({ "validation": validation }), label))
}

fn parse_change(
    item: &Value,
    novel_id: i64,
    index: usize,
) -> Result<(Value, KnowledgeEdit, Value), String> {
    let target = text_field(item, "target")?;
    let before = nullable_text(item, "before")?;
    let after = nullable_text(item, "after")?;
    let reason = text_field(item, "reason")?;
    let ev = parse_citations(item.get("ev"), novel_id)?;
    let raw = item
        .get("edit")
        .filter(|value| value.is_object())
        .ok_or_else(|| "edit must be an object".to_string())?;
    let edit: KnowledgeEdit =
        serde_json::from_value(raw.clone()).map_err(|error| format!("invalid edit: {error}"))?;
    let change = json!({
        "id": format!("c{}", index + 1),
        "op": raw.get("k").and_then(Value::as_str).unwrap_or(""),
        "target": target,
        "before": before,
        "after": after,
        "reason": reason,
        "ev": ev,
    });
    Ok((change, edit, raw.clone()))
}

fn nullable_text(item: &Value, key: &str) -> Result<Value, String> {
    match item.get(key) {
        None | Some(Value::Null) => Ok(Value::Null),
        Some(_) => text_field(item, key).map(|text| json!(text)),
    }
}

fn parse_citations(value: Option<&Value>, novel_id: i64) -> Result<Vec<Value>, String> {
    let Some(items) = value.filter(|value| !value.is_null()) else {
        return Ok(Vec::new());
    };
    let items = items
        .as_array()
        .ok_or_else(|| "ev must be an array".to_string())?;
    let mut citations = Vec::new();
    for item in items {
        let chapter = item
            .get("chapter")
            .and_then(Value::as_i64)
            .ok_or_else(|| "ev chapter must be an integer".to_string())?;
        let p = item
            .get("p")
            .and_then(Value::as_i64)
            .filter(|p| *p >= 1)
            .ok_or_else(|| "ev p must be a 1-based integer".to_string())?;
        let quote = text_field(item, "quote")?;
        citations.push(json!({
            "novelId": novel_id,
            "chapter": chapter,
            "p": p,
            "quote": quote,
        }));
    }
    Ok(citations)
}

fn validate(before: &[KnowledgeIssue], after: &[KnowledgeIssue]) -> Value {
    let known: HashSet<&str> = before.iter().map(|issue| issue.id.as_str()).collect();
    let remaining: HashSet<&str> = after.iter().map(|issue| issue.id.as_str()).collect();
    let resolves = known.iter().filter(|id| !remaining.contains(*id)).count();
    let introduces: Vec<&str> = after
        .iter()
        .filter(|issue| !known.contains(issue.id.as_str()))
        .map(|issue| issue.message.as_str())
        .collect();
    json!({
        "ok": introduces.is_empty(),
        "resolves": resolves,
        "introduces": introduces,
    })
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
    let mut changes = match status {
        Decision::Rejected => {
            for pick in &picks {
                mark(attachments, pick, Decision::Rejected);
            }
            Vec::new()
        }
        Decision::Applied => apply(attachments, &picks, sources, novel_id)?,
    };
    changes.extend(resolve_knowledge(
        attachments,
        item_ids,
        status,
        sources,
        novel_id,
    )?);
    Ok(changes)
}

fn resolve_knowledge(
    attachments: &mut [Value],
    item_ids: &[String],
    status: Decision,
    sources: &Sources,
    novel_id: i64,
) -> AssistantResult<Vec<AssistantChange>> {
    let mut changes = Vec::new();
    for attachment in attachments.iter_mut() {
        if !is_pending_set(attachment, item_ids) {
            continue;
        }
        if status == Decision::Applied {
            changes.push(apply_set(attachment, sources, novel_id)?);
        }
        attachment["status"] = json!(status.as_str());
    }
    Ok(changes)
}

fn is_pending_set(attachment: &Value, item_ids: &[String]) -> bool {
    attachment.get("kind").and_then(Value::as_str) == Some(CHANGES_KIND)
        && attachment.get("status").and_then(Value::as_str) == Some("pending")
        && id_of(attachment).is_some_and(|id| item_ids.iter().any(|wanted| wanted == id))
}

fn apply_set(
    attachment: &Value,
    sources: &Sources,
    novel_id: i64,
) -> AssistantResult<AssistantChange> {
    let lang = attachment
        .get("lang")
        .and_then(Value::as_str)
        .ok_or_else(|| AssistantError::invalid("the change set has no language"))?;
    let edits: Vec<KnowledgeEdit> =
        serde_json::from_value(attachment.get("raw").cloned().unwrap_or(Value::Null))
            .map_err(|error| AssistantError::invalid(format!("unreadable edits: {error}")))?;
    sources
        .knowledge
        .preview(novel_id, lang, edits.clone())
        .map_err(|error| AssistantError::conflict(format!("the edits no longer apply: {error}")))?;
    sources
        .knowledge
        .edit(novel_id, lang, edits)
        .map_err(AssistantError::storage)?;
    Ok(AssistantChange {
        target: ChangeTarget::Knowledge,
        novel_id,
        chapter_id: None,
        lang: Some(lang.to_string()),
        translation_target: None,
    })
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

fn owned_text(item: &Value, key: &str) -> Option<String> {
    item.get(key).and_then(Value::as_str).map(str::to_string)
}

fn work_of(list: &str, item: &Value) -> Option<Work> {
    if list == "findings" {
        let n = item.get("n").and_then(Value::as_u64)?;
        return Some(Work::Replace {
            n: usize::try_from(n).ok()?,
            from: owned_text(item, "from")?,
            to: owned_text(item, "to")?,
        });
    }
    Some(Work::Define(DictInput {
        src: owned_text(item, "src")?,
        dst: owned_text(item, "dst")?,
        kind: owned_text(item, "type")?,
        note: owned_text(item, "note").unwrap_or_default(),
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
