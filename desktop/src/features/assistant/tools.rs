use crate::features::assistant::edits;
use crate::features::assistant::grants::TurnSink;
use crate::features::assistant::models::AssistantScope;
use crate::features::assistant::models::ScopeKind;
use crate::features::assistant::proposals;
use crate::features::assistant::sources::NovelSource;
use crate::features::assistant::sources::Sources;
use crate::features::knowledge::models::KnowledgeEntity;
use crate::features::knowledge::models::KnowledgeEvidence;
use crate::features::knowledge::models::KnowledgeFact;
use crate::features::knowledge::models::KnowledgeItem;
use crate::features::knowledge::service::parse_lang;
use crate::features::novel::models::ChapterRow;
use crate::features::novel::models::NovelSummary;
use crate::features::translation::models::DictEntry;
use crate::features::translation::models::TranslationTarget;
use crate::features::translation::warnings::TranslationWarning;
use crate::features::translation::warnings::WarningKind;
use serde_json::Value;
use serde_json::json;
use std::collections::BTreeSet;
use std::collections::HashSet;

pub const PAGE_PARAGRAPHS: usize = 60;
pub const PAGE_CHARS: usize = 12_000;
pub const PAGE_ENTITIES: usize = 80;
pub const MAX_PAGE_ENTITIES: usize = 400;

pub struct ToolContext<'a> {
    pub scope: &'a AssistantScope,
    pub can_edit: bool,
    pub sink: &'a dyn TurnSink,
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
        },
        {
            "name": "read_novel_knowledge",
            "description": "Read the knowledge base of one novel: its entities (id, type, name, titles, aliases, chapters where they appear) and the facts that touch them. `types` and `predicates` list the keys the ontology allows. Entities can be filtered by `type` and by a case-insensitive `query` on name, titles or aliases. A page holds 80 entities by default; when `next` is not null, call again with offset set to `next`.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "novelId": { "type": "integer", "description": "Novel id from list_novel." },
                    "lang": { "type": "string", "enum": ["src", "VI", "EN"], "description": "Knowledge language: src is the original text, VI and EN are translations." },
                    "query": { "type": "string", "description": "Keep only entities whose name, titles or aliases contain this text." },
                    "type": { "type": "string", "description": "Keep only entities of this type key." },
                    "offset": { "type": "integer", "minimum": 0, "description": "Entities to skip, default 0." },
                    "limit": { "type": "integer", "minimum": 1, "description": "Entities per page, default 80, at most 400." }
                },
                "required": ["novelId", "lang"],
                "additionalProperties": false
            }
        },
        {
            "name": "read_translation",
            "description": "Read the paragraphs of one translated chapter next to their source text. Paragraph positions are 1-based. A page holds at most 60 paragraphs or 12000 characters (source and translation together); when `next` is not null, call again with from set to `next`. It is an error when the chapter has no translation for the target yet.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "novelId": { "type": "integer", "description": "Novel id from list_novel." },
                    "target": { "type": "string", "enum": ["VI", "EN"], "description": "Translation target language." },
                    "chapter": { "type": "integer", "description": "Chapter number from read_novel." },
                    "from": { "type": "integer", "minimum": 1, "description": "First paragraph position, default 1." },
                    "to": { "type": "integer", "minimum": 1, "description": "Last paragraph position, default the end of the chapter." }
                },
                "required": ["novelId", "target", "chapter"],
                "additionalProperties": false
            }
        },
        {
            "name": "read_translation_guide",
            "description": "Read the translation rules of one novel for one target language: the translation guidelines, the dictionary entries (id, src, dst, type, note) and the consistency warnings found in the translated chapters.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "novelId": { "type": "integer", "description": "Novel id from list_novel." },
                    "target": { "type": "string", "enum": ["VI", "EN"], "description": "Translation target language." }
                },
                "required": ["novelId", "target"],
                "additionalProperties": false
            }
        },
        {
            "name": "edit_novel",
            "description": "Change the metadata of one novel. Only the fields you pass are changed; the novel language cannot be changed. Requires editing to be enabled for the session.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "novelId": { "type": "integer", "description": "Novel id from list_novel." },
                    "title": { "type": "string", "description": "New display title." },
                    "name": { "type": "string", "description": "New name." },
                    "author": { "type": "string", "description": "New author." },
                    "description": { "type": "string", "description": "New description." },
                    "tags": { "type": "array", "items": { "type": "string" }, "description": "New full list of tags; it replaces the old list." }
                },
                "required": ["novelId"],
                "additionalProperties": false
            }
        },
        {
            "name": "edit_novel_chapter",
            "description": "Rename a chapter and/or replace the text of some of its paragraphs. For every paragraph pass `expected`, its current text exactly as read_novel_chapter returned it. All `expected` values are checked first; if any differs, nothing is written. Requires editing to be enabled for the session.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "novelId": { "type": "integer", "description": "Novel id from list_novel." },
                    "chapter": { "type": "integer", "description": "Chapter number from read_novel." },
                    "title": { "type": "string", "description": "New chapter title." },
                    "paragraphs": {
                        "type": "array",
                        "description": "Paragraph replacements.",
                        "items": {
                            "type": "object",
                            "properties": {
                                "p": { "type": "integer", "minimum": 1, "description": "1-based paragraph position." },
                                "expected": { "type": "string", "description": "Current text of the paragraph, exactly as read." },
                                "text": { "type": "string", "description": "New text of the paragraph." }
                            },
                            "required": ["p", "expected", "text"],
                            "additionalProperties": false
                        }
                    }
                },
                "required": ["novelId", "chapter"],
                "additionalProperties": false
            }
        },
        {
            "name": "edit_novel_knowledge",
            "description": "Apply edits to the knowledge base of one novel atomically: if any edit is invalid, none is applied. Returns {applied, remap}, where remap maps the `ref` of each added item to its new id. Requires editing to be enabled for the session. `edits` is an array of objects, each with a required \"k\" naming the edit and these fields: rename {id, name}; retype {id, type}; del {id}; merge {sources: [id], target: id}; fact {id, pred?, subject?, object?} to change a fact; props {id, titles?, aliases?} to replace the titles or aliases of an entity; evidence {id, add?: [{chapter, p, q}], remove?: [{chapter, p, q}]}; add_entity {ref, type, name, titles?, aliases?, ev: [{chapter, p, q}]}; add_fact {ref, pred, subject, object?, ev: [{chapter, p, q}]}. In evidence, `chapter` is the chapter number, `p` the 1-based paragraph position and `q` a quote from that paragraph. Ids, `type` keys and `pred` keys come from read_novel_knowledge.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "novelId": { "type": "integer", "description": "Novel id from list_novel." },
                    "lang": { "type": "string", "enum": ["src", "VI", "EN"], "description": "Knowledge language: src is the original text, VI and EN are translations." },
                    "edits": {
                        "type": "array",
                        "minItems": 1,
                        "description": "Edits to apply in order.",
                        "items": {
                            "type": "object",
                            "properties": {
                                "k": { "type": "string", "enum": ["rename", "retype", "del", "merge", "fact", "props", "evidence", "add_entity", "add_fact"], "description": "Edit kind." }
                            },
                            "required": ["k"]
                        }
                    }
                },
                "required": ["novelId", "lang", "edits"],
                "additionalProperties": false
            }
        },
        {
            "name": "edit_translation_passage",
            "description": "Replace the text of one translated paragraph. Pass `expected`, the current translation exactly as read_translation returned it; if it differs, nothing is written. Requires editing to be enabled for the session.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "novelId": { "type": "integer", "description": "Novel id from list_novel." },
                    "target": { "type": "string", "enum": ["VI", "EN"], "description": "Translation target language." },
                    "chapter": { "type": "integer", "description": "Chapter number from read_novel." },
                    "p": { "type": "integer", "minimum": 1, "description": "1-based paragraph position." },
                    "expected": { "type": "string", "description": "Current translation of the paragraph, exactly as read." },
                    "text": { "type": "string", "description": "New translation of the paragraph." }
                },
                "required": ["novelId", "target", "chapter", "p", "expected", "text"],
                "additionalProperties": false
            }
        },
        {
            "name": "edit_dictionary",
            "description": "Add, update and remove translation dictionary entries of one novel for one target language. Entries are checked first; if one is invalid (a duplicate `src`, an unknown id), nothing is written. Entry types are name, place, org, title and term. Requires editing to be enabled for the session.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "novelId": { "type": "integer", "description": "Novel id from list_novel." },
                    "target": { "type": "string", "enum": ["VI", "EN"], "description": "Translation target language." },
                    "add": {
                        "type": "array",
                        "description": "Entries to add.",
                        "items": {
                            "type": "object",
                            "properties": {
                                "src": { "type": "string", "description": "Source term." },
                                "dst": { "type": "string", "description": "Translated term." },
                                "type": { "type": "string", "enum": ["name", "place", "org", "title", "term"], "description": "Entry type." },
                                "note": { "type": "string", "description": "Optional note." }
                            },
                            "required": ["src", "dst", "type"],
                            "additionalProperties": false
                        }
                    },
                    "update": {
                        "type": "array",
                        "description": "Entries to change; only the fields you pass are changed.",
                        "items": {
                            "type": "object",
                            "properties": {
                                "id": { "type": "integer", "description": "Entry id from read_translation_guide." },
                                "src": { "type": "string", "description": "New source term." },
                                "dst": { "type": "string", "description": "New translated term." },
                                "type": { "type": "string", "enum": ["name", "place", "org", "title", "term"], "description": "New entry type." },
                                "note": { "type": "string", "description": "New note." }
                            },
                            "required": ["id"],
                            "additionalProperties": false
                        }
                    },
                    "remove": {
                        "type": "array",
                        "description": "Ids of the entries to delete.",
                        "items": { "type": "integer" }
                    }
                },
                "required": ["novelId", "target"],
                "additionalProperties": false
            }
        },
        {
            "name": "submit_translation_review",
            "description": "Submit the result of a translation review as a card the user can apply or reject item by item. Call it exactly once, after reading the whole chapter; a later call replaces the earlier one. Nothing is written to the novel. Each finding quotes `from`, a snippet copied verbatim from the current translation of paragraph `n`, and the `to` that replaces its first occurrence. Findings whose paragraph or snippet does not match, and dictionary entries whose `src` already exists, are dropped; the result lists them in `dropped` (with the 0-based `index` into the array you sent) so you can fix and submit again.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "novelId": { "type": "integer", "description": "Novel id from list_novel." },
                    "target": { "type": "string", "enum": ["VI", "EN"], "description": "Translation target language." },
                    "chapter": { "type": "integer", "description": "Chapter number from read_novel." },
                    "checked": { "type": "integer", "minimum": 0, "description": "Number of paragraphs you checked." },
                    "findings": {
                        "type": "array",
                        "description": "Problems found in the translation.",
                        "items": {
                            "type": "object",
                            "properties": {
                                "n": { "type": "integer", "minimum": 1, "description": "1-based paragraph position." },
                                "severity": { "type": "string", "enum": ["error", "warning", "info"], "description": "How serious the problem is." },
                                "category": { "type": "string", "enum": ["name", "dict", "meaning", "omission", "style"], "description": "Kind of problem." },
                                "from": { "type": "string", "description": "Snippet of the current translation, copied verbatim. Must not be empty." },
                                "to": { "type": "string", "description": "Text that replaces the first occurrence of `from`." },
                                "reason": { "type": "string", "description": "Why the change is needed, in the user's language." }
                            },
                            "required": ["n", "severity", "category", "from", "to", "reason"],
                            "additionalProperties": false
                        }
                    },
                    "dictionary": {
                        "type": "array",
                        "description": "Dictionary entries worth adding. Terms already in the dictionary are dropped.",
                        "items": {
                            "type": "object",
                            "properties": {
                                "src": { "type": "string", "description": "Source term." },
                                "dst": { "type": "string", "description": "Translated term." },
                                "type": { "type": "string", "enum": ["name", "place", "org", "title", "term"], "description": "Entry type." },
                                "note": { "type": "string", "description": "Optional note." }
                            },
                            "required": ["src", "dst", "type"],
                            "additionalProperties": false
                        }
                    }
                },
                "required": ["novelId", "target", "chapter", "checked", "findings", "dictionary"],
                "additionalProperties": false
            }
        }
    ])
}

pub fn call(
    name: &str,
    args: &Value,
    ctx: &ToolContext,
    sources: &Sources,
) -> Result<ToolOutput, String> {
    let novels = sources.novels.as_ref();
    match name {
        "list_novel" => list_novel(ctx.scope, novels),
        "read_novel" => read_novel(args, ctx.scope, novels),
        "read_novel_chapter" => read_novel_chapter(args, ctx.scope, novels),
        "read_novel_knowledge" => read_novel_knowledge(args, ctx.scope, sources),
        "read_translation" => read_translation(args, ctx.scope, sources),
        "read_translation_guide" => read_translation_guide(args, ctx.scope, sources),
        "edit_novel" => edits::edit_novel(args, ctx, novels),
        "edit_novel_chapter" => edits::edit_novel_chapter(args, ctx, novels),
        "edit_novel_knowledge" => edits::edit_novel_knowledge(args, ctx, sources),
        "edit_translation_passage" => edits::edit_translation_passage(args, ctx, sources),
        "edit_dictionary" => edits::edit_dictionary(args, ctx, sources),
        "submit_translation_review" => proposals::submit_translation_review(args, ctx, sources),
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
    let sizes: Vec<usize> = rows.iter().map(|row| row.text.chars().count()).collect();
    let (start, end) = page_bounds(&sizes, from, to);
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

fn read_novel_knowledge(
    args: &Value,
    scope: &AssistantScope,
    sources: &Sources,
) -> Result<ToolOutput, String> {
    let novel_id = required_int(args, "novelId")?;
    let raw_lang = required_str(args, "lang")?;
    let lang = parse_lang(&raw_lang).map_err(|error| error.to_string())?;
    let query = optional_str(args, "query")?
        .map(|text| text.trim().to_lowercase())
        .filter(|text| !text.is_empty());
    let kind = optional_str(args, "type")?;
    let offset = optional_int(args, "offset")?.unwrap_or(0).max(0) as usize;
    let limit = optional_int(args, "limit")?.map_or(PAGE_ENTITIES, |value| {
        value.clamp(1, MAX_PAGE_ENTITIES as i64) as usize
    });
    find_novel(scope, sources.novels.as_ref(), novel_id)?;
    let knowledge = sources.knowledge.get(novel_id, lang.as_str())?;
    let entities: Vec<&KnowledgeEntity> = knowledge
        .items
        .iter()
        .filter_map(|item| match item {
            KnowledgeItem::Entity(entity) => Some(entity),
            KnowledgeItem::Fact(_) => None,
        })
        .filter(|entity| kind.as_deref().is_none_or(|key| entity.entity_type == key))
        .filter(|entity| {
            query
                .as_deref()
                .is_none_or(|text| matches_query(entity, text))
        })
        .collect();
    let total = entities.len();
    let page: Vec<&KnowledgeEntity> = entities.into_iter().skip(offset).take(limit).collect();
    let end = offset + page.len();
    let ids: HashSet<&str> = page.iter().map(|entity| entity.id.as_str()).collect();
    let facts: Vec<Value> = knowledge
        .items
        .iter()
        .filter_map(|item| match item {
            KnowledgeItem::Fact(fact) if touches(fact, &ids) => Some(fact_json(fact)),
            _ => None,
        })
        .collect();
    let next = if end < total { json!(end) } else { Value::Null };
    let label = format!(
        "read_novel_knowledge(novel {novel_id}, {}) → {} thực thể, {} sự kiện",
        lang.as_str(),
        page.len(),
        facts.len()
    );
    let value = json!({
        "lang": lang.as_str(),
        "types": knowledge.ontology.types.iter().map(|item| item.key.as_str()).collect::<Vec<_>>(),
        "predicates": knowledge.ontology.predicates.iter().map(|item| item.key.as_str()).collect::<Vec<_>>(),
        "entities": page.iter().map(|entity| entity_json(entity)).collect::<Vec<_>>(),
        "facts": facts,
        "total": total,
        "next": next,
    });
    Ok(output(value, label))
}

fn read_translation(
    args: &Value,
    scope: &AssistantScope,
    sources: &Sources,
) -> Result<ToolOutput, String> {
    let novel_id = required_int(args, "novelId")?;
    let target = required_target(args)?;
    let seq = required_int(args, "chapter")?;
    let from = optional_int(args, "from")?;
    let to = optional_int(args, "to")?;
    let novels = sources.novels.as_ref();
    find_novel(scope, novels, novel_id)?;
    let chapter = chapter_by_seq(novels, novel_id, seq)?;
    let rows = novels.chapter_read(novel_id, &chapter.id)?;
    let book = sources.translation.get(novel_id, target.as_str())?;
    let translated = book
        .chapters
        .get(&chapter.id)
        .ok_or_else(|| format!("chapter {seq} has no {} translation yet", target.as_str()))?;
    let total = rows.len();
    let sizes: Vec<usize> = rows
        .iter()
        .map(|row| {
            let own = translated.paragraphs.get(row.n - 1);
            row.text.chars().count() + own.map_or(0, |item| item.text.chars().count())
        })
        .collect();
    let (start, end) = page_bounds(&sizes, from, to);
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
    let next = if end < total {
        json!(end + 1)
    } else {
        Value::Null
    };
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

fn read_translation_guide(
    args: &Value,
    scope: &AssistantScope,
    sources: &Sources,
) -> Result<ToolOutput, String> {
    let novel_id = required_int(args, "novelId")?;
    let target = required_target(args)?;
    let novels = sources.novels.as_ref();
    find_novel(scope, novels, novel_id)?;
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

pub(crate) fn chapter_by_seq(
    source: &dyn NovelSource,
    novel_id: i64,
    seq: i64,
) -> Result<ChapterRow, String> {
    source
        .chapters(novel_id)?
        .into_iter()
        .find(|row| row.seq == seq)
        .ok_or_else(|| format!("chapter {seq} not found in novel {novel_id}"))
}

fn matches_query(entity: &KnowledgeEntity, query: &str) -> bool {
    std::iter::once(&entity.name)
        .chain(&entity.titles)
        .chain(&entity.aliases)
        .any(|text| text.to_lowercase().contains(query))
}

fn touches(fact: &KnowledgeFact, ids: &HashSet<&str>) -> bool {
    ids.contains(fact.subject.as_str())
        || fact
            .object
            .as_deref()
            .is_some_and(|object| ids.contains(object))
}

fn entity_json(entity: &KnowledgeEntity) -> Value {
    json!({
        "id": entity.id,
        "type": entity.entity_type,
        "name": entity.name,
        "titles": entity.titles,
        "aliases": entity.aliases,
        "chapters": chapters_of(&entity.ev),
    })
}

fn fact_json(fact: &KnowledgeFact) -> Value {
    json!({
        "id": fact.id,
        "pred": fact.pred,
        "subject": fact.subject,
        "object": fact.object,
        "chapters": chapters_of(&fact.ev),
    })
}

fn chapters_of(evidence: &[KnowledgeEvidence]) -> Vec<i64> {
    let chapters: BTreeSet<i64> = evidence.iter().map(|item| item.chapter).collect();
    chapters.into_iter().collect()
}

fn page_bounds(sizes: &[usize], from: Option<i64>, to: Option<i64>) -> (usize, usize) {
    let total = sizes.len();
    if total == 0 {
        return (1, 0);
    }
    let start = clamp_position(from.unwrap_or(1), 1, total);
    let wanted = clamp_position(to.unwrap_or(total as i64), start, total);
    let mut end = start - 1;
    let mut chars = 0;
    for size in &sizes[start - 1..wanted] {
        if end >= start && (end - start + 1 >= PAGE_PARAGRAPHS || chars + *size > PAGE_CHARS) {
            break;
        }
        chars += *size;
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

pub(crate) fn find_novel(
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

pub(crate) fn required_int(args: &Value, key: &str) -> Result<i64, String> {
    optional_int(args, key)?.ok_or_else(|| format!("missing integer argument '{key}'"))
}

pub(crate) fn required_str(args: &Value, key: &str) -> Result<String, String> {
    optional_str(args, key)?.ok_or_else(|| format!("missing string argument '{key}'"))
}

pub(crate) fn optional_str(args: &Value, key: &str) -> Result<Option<String>, String> {
    match args.get(key) {
        None | Some(Value::Null) => Ok(None),
        Some(value) => value
            .as_str()
            .map(|text| Some(text.to_string()))
            .ok_or_else(|| format!("argument '{key}' must be a string")),
    }
}

pub(crate) fn optional_int(args: &Value, key: &str) -> Result<Option<i64>, String> {
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

pub(crate) fn output(value: Value, label: String) -> ToolOutput {
    ToolOutput {
        text: value.to_string(),
        label,
    }
}

#[cfg(test)]
#[path = "../../../test/features/assistant/tools.test.rs"]
mod tests;
