use crate::features::assistant::sources::Sources;
use crate::features::assistant::tools::ToolContext;
use crate::features::assistant::tools::ToolOutput;
use crate::features::assistant::tools::args::optional_bool;
use crate::features::assistant::tools::args::optional_int;
use crate::features::assistant::tools::args::optional_str;
use crate::features::assistant::tools::args::output;
use crate::features::assistant::tools::args::required_str;
use crate::features::assistant::tools::paging::next_position;
use crate::features::assistant::tools::paging::page_bounds;
use crate::features::assistant::tools::project::project_id_property;
use crate::features::assistant::tools::project::project_of;
use crate::features::assistant::tools::project::uses_translation;
use crate::features::knowledge::models::WireKnowledge;
use crate::features::project::models::ProjectSummary;
use crate::features::scripting::cast::knowledge_lang;
use crate::features::scripting::cast::project_cast;
use crate::features::scripting::chapters::ProjectChapter;
use crate::features::scripting::models::CastMember;
use crate::features::scripting::models::Script;
use crate::features::scripting::models::ScriptBlock;
use crate::features::scripting::models::ScriptUnit;
use crate::features::scripting::progress::unit_slots;
use crate::features::translation::models::TranslationTarget;
use serde_json::Value;
use serde_json::json;
use std::collections::BTreeMap;
use std::collections::BTreeSet;

pub const MAX_SEARCH_RESULTS: usize = 50;
const SNIPPET_CONTEXT: usize = 40;

type SourceTexts = BTreeMap<i64, Vec<String>>;

pub(super) fn definitions() -> Vec<Value> {
    vec![
        json!({
            "name": "read_script",
            "description": "Read the script of one project: its configuration `cfg` (the block `types` allowed, the unit kind), the cast (the speakers a dialogue block can name in `who`: the narrator, the characters of the novel knowledge and the extra members the user added) and the outline of the script units. Every outline row pairs a chapter of the linked novel with its script unit (`unit` is null when none is written yet); units that follow no chapter have a null `chapter`.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "projectId": project_id_property()
                },
                "required": ["projectId"],
                "additionalProperties": false
            }
        }),
        json!({
            "name": "read_script_unit",
            "description": "Read the blocks of one script unit. Block positions `p` are 1-based. A page holds at most 60 blocks or 12000 characters; when `next` is not null, call again with from set to `next`. Each block has id, type, text, who (the speaker id from the cast), paren, ms, loc, time, ref, beat, refs and chars. With `withSource` every block also lists the source paragraphs its `ref` and `refs` (format chapter.paragraph) point to, taken from the original text or from the translation when the project works from a translation.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "projectId": project_id_property(),
                    "unitId": { "type": "string", "description": "Unit id from read_script." },
                    "from": { "type": "integer", "minimum": 1, "description": "First block position, default 1." },
                    "to": { "type": "integer", "minimum": 1, "description": "Last block position, default the end of the unit." },
                    "withSource": { "type": "boolean", "description": "Attach the referenced source paragraphs to each block, default false." }
                },
                "required": ["projectId", "unitId"],
                "additionalProperties": false
            }
        }),
        json!({
            "name": "search_project",
            "description": "Search the script of one project, case-insensitively, in the text, the speaker (`who`) and the location (`loc`) of every block. At most 50 results are returned with the unit id, block id, 1-based position and a snippet; `truncated` is true when more blocks match.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "projectId": project_id_property(),
                    "query": { "type": "string", "description": "Text to look for." },
                    "unitId": { "type": "string", "description": "Search only this unit." }
                },
                "required": ["projectId", "query"],
                "additionalProperties": false
            }
        }),
    ]
}

pub(super) fn read_script(
    args: &Value,
    ctx: &ToolContext,
    sources: &Sources,
) -> Result<ToolOutput, String> {
    let project = project_of(args, ctx, sources)?;
    let chapters = sources.scripts.chapters(project.id)?;
    let script = sources.scripts.script(project.id)?;
    let rows = outline_rows(&chapters, script.as_ref());
    let cast = cast_json(script.as_ref(), &project, sources)?;
    let label = format!(
        "read_script(project {}) → {} đơn vị, {} nhân vật",
        project.id,
        rows.len(),
        cast.len()
    );
    let value = json!({
        "projectId": project.id,
        "cfg": script.as_ref().map(|item| &item.cfg),
        "cast": cast,
        "units": rows,
    });
    Ok(output(value, label))
}

pub(super) fn read_script_unit(
    args: &Value,
    ctx: &ToolContext,
    sources: &Sources,
) -> Result<ToolOutput, String> {
    let project = project_of(args, ctx, sources)?;
    let unit_id = required_str(args, "unitId")?;
    let from = optional_int(args, "from")?;
    let to = optional_int(args, "to")?;
    let with_source = optional_bool(args, "withSource")?.unwrap_or(false);
    let chapters = sources.scripts.chapters(project.id)?;
    let script = require_script(sources, project.id)?;
    let unit = require_unit(&script, project.id, &unit_id)?;
    let blocks = unit_blocks(unit);
    let (start, end) = block_page(blocks, from, to);
    let page = &blocks[start.saturating_sub(1)..end];
    let texts = if with_source {
        Some(source_texts(&project, sources, page)?)
    } else {
        None
    };
    let rows: Vec<Value> = page
        .iter()
        .enumerate()
        .map(|(offset, block)| block_json(start + offset, block, texts.as_ref()))
        .collect();
    let label = format!(
        "read_script_unit(project {}, unit {unit_id}, ¶{start}–{end}) → {} khối",
        project.id,
        rows.len()
    );
    let mut value = unit_head_json(unit, &chapters);
    value["projectId"] = json!(project.id);
    value["total"] = json!(blocks.len());
    value["from"] = json!(start);
    value["to"] = json!(end);
    value["blocks"] = Value::Array(rows);
    value["next"] = next_position(end, blocks.len());
    Ok(output(value, label))
}

pub(super) fn search_project(
    args: &Value,
    ctx: &ToolContext,
    sources: &Sources,
) -> Result<ToolOutput, String> {
    let project = project_of(args, ctx, sources)?;
    let query = required_str(args, "query")?;
    let needle = query.trim().to_lowercase();
    if needle.is_empty() {
        return Err("argument 'query' must not be empty".to_string());
    }
    let unit_id = optional_str(args, "unitId")?;
    let script = require_script(sources, project.id)?;
    let units = match unit_id.as_deref() {
        Some(id) => vec![require_unit(&script, project.id, id)?],
        None => script.units.iter().collect(),
    };
    let mut results: Vec<Value> = units
        .iter()
        .flat_map(|unit| matching_blocks(unit, &needle))
        .take(MAX_SEARCH_RESULTS + 1)
        .collect();
    let truncated = results.len() > MAX_SEARCH_RESULTS;
    results.truncate(MAX_SEARCH_RESULTS);
    let label = format!(
        "search_project(project {}, \"{needle}\") → {} khối",
        project.id,
        results.len()
    );
    let value = json!({
        "projectId": project.id,
        "query": query.trim(),
        "results": results,
        "truncated": truncated,
    });
    Ok(output(value, label))
}

pub(super) fn require_script(sources: &Sources, project_id: i64) -> Result<Script, String> {
    sources
        .scripts
        .script(project_id)?
        .ok_or_else(|| format!("project {project_id} has no script yet"))
}

pub(super) fn require_unit<'a>(
    script: &'a Script,
    project_id: i64,
    unit_id: &str,
) -> Result<&'a ScriptUnit, String> {
    script
        .units
        .iter()
        .find(|unit| unit.id == unit_id)
        .ok_or_else(|| format!("unit {unit_id} not found in project {project_id}"))
}

pub(super) fn unit_blocks(unit: &ScriptUnit) -> &[ScriptBlock] {
    unit.blocks.as_deref().unwrap_or_default()
}

pub(super) fn block_page(
    blocks: &[ScriptBlock],
    from: Option<i64>,
    to: Option<i64>,
) -> (usize, usize) {
    let sizes: Vec<usize> = blocks
        .iter()
        .map(|block| block.text.chars().count())
        .collect();
    page_bounds(&sizes, from, to)
}

pub(super) fn unit_for_chapter<'a>(
    script: Option<&'a Script>,
    chapter_id: &str,
) -> Option<&'a str> {
    script?
        .units
        .iter()
        .find(|unit| unit.chapter_id.as_deref() == Some(chapter_id))
        .map(|unit| unit.id.as_str())
}

pub(super) fn unit_title(unit: &ScriptUnit, chapters: &[ProjectChapter]) -> String {
    match chapter_of(unit, chapters) {
        Some(chapter) => chapter.title.clone(),
        None => unit.title.clone(),
    }
}

pub(super) fn unit_seq(unit: &ScriptUnit, chapters: &[ProjectChapter]) -> Option<i64> {
    match chapter_of(unit, chapters) {
        Some(chapter) => Some(chapter.seq),
        None => unit.ch,
    }
}

fn chapter_of<'a>(unit: &ScriptUnit, chapters: &'a [ProjectChapter]) -> Option<&'a ProjectChapter> {
    let chapter_id = unit.chapter_id.as_deref()?;
    chapters.iter().find(|chapter| chapter.id == chapter_id)
}

fn outline_rows(chapters: &[ProjectChapter], script: Option<&Script>) -> Vec<Value> {
    let slots = match script {
        Some(script) => unit_slots(chapters, script),
        None => vec![None; chapters.len()],
    };
    slots
        .into_iter()
        .enumerate()
        .map(|(index, unit)| {
            json!({
                "chapter": chapters.get(index).map(chapter_json),
                "unit": unit.map(|item| unit_head_json(item, chapters)),
            })
        })
        .collect()
}

fn chapter_json(chapter: &ProjectChapter) -> Value {
    json!({
        "chapterId": chapter.id,
        "chapter": chapter.seq,
        "title": chapter.title,
    })
}

fn unit_head_json(unit: &ScriptUnit, chapters: &[ProjectChapter]) -> Value {
    let chapter = chapter_of(unit, chapters);
    json!({
        "unitId": unit.id,
        "chapterId": unit.chapter_id,
        "no": chapter.map_or(unit.no, |item| item.seq),
        "ch": chapter.map_or(unit.ch, |item| Some(item.seq)),
        "chs": unit.chs,
        "title": unit_title(unit, chapters),
        "blocks": unit_blocks(unit).len(),
        "words": word_count(unit),
        "hasContent": unit.has_content(),
    })
}

fn word_count(unit: &ScriptUnit) -> i64 {
    match &unit.meta {
        Some(meta) => meta.words,
        None => unit_blocks(unit)
            .iter()
            .map(|block| block.text.split_whitespace().count() as i64)
            .sum(),
    }
}

fn cast_json(
    script: Option<&Script>,
    project: &ProjectSummary,
    sources: &Sources,
) -> Result<Vec<Value>, String> {
    let Some(script) = script else {
        return Ok(Vec::new());
    };
    Ok(cast_members(script, project, sources)?
        .iter()
        .map(|member| json!({ "id": member.id, "name": member.name, "kind": member.kind }))
        .collect())
}

pub(super) fn cast_members(
    script: &Script,
    project: &ProjectSummary,
    sources: &Sources,
) -> Result<Vec<CastMember>, String> {
    let knowledge = cast_knowledge(project, sources)?;
    Ok(project_cast(script, knowledge.as_ref()))
}

fn cast_knowledge(
    project: &ProjectSummary,
    sources: &Sources,
) -> Result<Option<WireKnowledge>, String> {
    let Some(novel_id) = project.novel_id.filter(|_| !project.novel_missing) else {
        return Ok(None);
    };
    sources
        .knowledge
        .get(novel_id, knowledge_lang(project))
        .map(Some)
}

fn block_json(position: usize, block: &ScriptBlock, texts: Option<&SourceTexts>) -> Value {
    let mut value = json!({
        "p": position,
        "id": block.id,
        "type": block.kind,
        "text": block.text,
        "who": block.who,
        "paren": block.paren,
        "ms": block.ms,
        "loc": block.loc,
        "time": block.time,
        "ref": block.reference,
        "beat": block.beat,
        "refs": block.refs,
        "chars": block.chars,
    });
    if let Some(texts) = texts {
        value["source"] = Value::Array(source_json(block, texts));
    }
    value
}

fn source_json(block: &ScriptBlock, texts: &SourceTexts) -> Vec<Value> {
    block_refs(block)
        .into_iter()
        .filter_map(|(chapter, p)| {
            let text = texts.get(&chapter)?.get(p.checked_sub(1)?)?;
            Some(json!({ "ref": format!("{chapter}.{p}"), "text": text }))
        })
        .collect()
}

fn block_refs(block: &ScriptBlock) -> Vec<(i64, usize)> {
    let mut seen = BTreeSet::new();
    block
        .reference
        .iter()
        .chain(&block.refs)
        .filter_map(|text| parse_ref(text))
        .filter(|item| seen.insert(*item))
        .collect()
}

fn parse_ref(text: &str) -> Option<(i64, usize)> {
    let (chapter, p) = text.trim().split_once('.')?;
    Some((chapter.parse().ok()?, p.parse().ok()?))
}

fn source_texts(
    project: &ProjectSummary,
    sources: &Sources,
    page: &[ScriptBlock],
) -> Result<SourceTexts, String> {
    let novel_id = project
        .novel_id
        .ok_or_else(|| "the project has no linked novel".to_string())?;
    let seqs: BTreeSet<i64> = page
        .iter()
        .flat_map(block_refs)
        .map(|(chapter, _)| chapter)
        .collect();
    let chapters = sources.novels.chapters(novel_id)?;
    let target = translation_target(project)?;
    let book = match &target {
        Some(target) => Some(sources.translation.get(novel_id, target.as_str())?),
        None => None,
    };
    let mut texts = SourceTexts::new();
    for row in chapters.iter().filter(|row| seqs.contains(&row.seq)) {
        let paragraphs = match &book {
            Some(book) => book.chapters.get(&row.id).map_or_else(Vec::new, |chapter| {
                chapter
                    .paragraphs
                    .iter()
                    .map(|item| item.text.clone())
                    .collect()
            }),
            None => sources
                .novels
                .chapter_read(novel_id, &row.id)?
                .into_iter()
                .map(|item| item.text)
                .collect(),
        };
        texts.insert(row.seq, paragraphs);
    }
    Ok(texts)
}

fn translation_target(project: &ProjectSummary) -> Result<Option<TranslationTarget>, String> {
    if !uses_translation(project) {
        return Ok(None);
    }
    project
        .src_lang
        .as_deref()
        .and_then(TranslationTarget::parse)
        .map(Some)
        .ok_or_else(|| "the project has no valid translation language".to_string())
}

fn matching_blocks(unit: &ScriptUnit, needle: &str) -> Vec<Value> {
    unit_blocks(unit)
        .iter()
        .enumerate()
        .filter(|(_, block)| matches_block(block, needle))
        .map(|(index, block)| hit_json(unit, index + 1, block, needle))
        .collect()
}

fn matches_block(block: &ScriptBlock, needle: &str) -> bool {
    [&block.text, &block.who, &block.loc]
        .iter()
        .any(|field| field.to_lowercase().contains(needle))
}

fn hit_json(unit: &ScriptUnit, position: usize, block: &ScriptBlock, needle: &str) -> Value {
    json!({
        "unitId": unit.id,
        "blockId": block.id,
        "p": position,
        "type": block.kind,
        "who": block.who,
        "snippet": snippet(&block.text, needle),
    })
}

fn snippet(text: &str, needle: &str) -> String {
    let chars: Vec<char> = text.chars().collect();
    let lower = text.to_lowercase();
    let hit = lower
        .find(needle)
        .map_or(0, |byte| lower[..byte].chars().count());
    let width = needle.chars().count();
    let start = hit.saturating_sub(SNIPPET_CONTEXT).min(chars.len());
    let end = (hit + width + SNIPPET_CONTEXT).min(chars.len());
    let body: String = chars[start..end].iter().collect();
    let head = if start > 0 { "…" } else { "" };
    let tail = if end < chars.len() { "…" } else { "" };
    format!("{head}{body}{tail}")
}
