use crate::features::assistant::sources::Sources;
use crate::features::assistant::tools::ToolContext;
use crate::features::assistant::tools::ToolOutput;
use crate::features::assistant::tools::args::optional_int;
use crate::features::assistant::tools::args::optional_str;
use crate::features::assistant::tools::args::optional_strings;
use crate::features::assistant::tools::args::output;
use crate::features::assistant::tools::args::required_int;
use crate::features::assistant::tools::args::required_str;
use crate::features::assistant::tools::scope::find_novel;
use crate::features::knowledge::check::KnowledgeIssue;
use crate::features::knowledge::check::check;
use crate::features::knowledge::models::KnowledgeEntity;
use crate::features::knowledge::models::KnowledgeEvidence;
use crate::features::knowledge::models::KnowledgeFact;
use crate::features::knowledge::models::KnowledgeItem;
use crate::features::knowledge::ontology::Ontology;
use crate::features::knowledge::service::parse_lang;
use serde_json::Value;
use serde_json::json;
use std::collections::BTreeSet;
use std::collections::HashSet;

pub const PAGE_ENTITIES: usize = 80;
pub const MAX_PAGE_ENTITIES: usize = 400;
pub const MAX_ISSUES: usize = 50;

pub(super) fn read_novel_knowledge(
    args: &Value,
    ctx: &ToolContext,
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
    find_novel(ctx, sources.novels.as_ref(), novel_id)?;
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

pub(super) fn read_knowledge_issues(
    args: &Value,
    ctx: &ToolContext,
    sources: &Sources,
) -> Result<ToolOutput, String> {
    let novel_id = required_int(args, "novelId")?;
    let raw_lang = required_str(args, "lang")?;
    let lang = parse_lang(&raw_lang).map_err(|error| error.to_string())?;
    let wanted = optional_strings(args, "issueIds")?;
    let rule = optional_str(args, "rule")?;
    find_novel(ctx, sources.novels.as_ref(), novel_id)?;
    let knowledge = sources.knowledge.get(novel_id, lang.as_str())?;
    let issues = check(Ontology::get(), &knowledge.items);
    let matching: Vec<&KnowledgeIssue> = issues
        .iter()
        .filter(|issue| wanted.as_ref().is_none_or(|ids| ids.contains(&issue.id)))
        .filter(|issue| rule.as_deref().is_none_or(|key| issue.rule == key))
        .collect();
    let items: Vec<Value> = matching
        .iter()
        .take(MAX_ISSUES)
        .map(|issue| issue_json(issue, &knowledge.items))
        .collect();
    let label = format!(
        "read_knowledge_issues(novel {novel_id}, {}) → {} xung đột",
        lang.as_str(),
        items.len()
    );
    Ok(output(Value::Array(items), label))
}

fn issue_json(issue: &KnowledgeIssue, items: &[KnowledgeItem]) -> Value {
    let involved: Vec<Value> = issue
        .ids
        .iter()
        .filter_map(|id| items.iter().find(|item| item_id(item) == id))
        .map(item_json)
        .collect();
    json!({
        "id": issue.id,
        "rule": issue.rule,
        "severity": issue.severity,
        "message": issue.message,
        "values": issue.values,
        "items": involved,
    })
}

fn item_id(item: &KnowledgeItem) -> &str {
    match item {
        KnowledgeItem::Entity(entity) => &entity.id,
        KnowledgeItem::Fact(fact) => &fact.id,
    }
}

fn item_json(item: &KnowledgeItem) -> Value {
    match item {
        KnowledgeItem::Entity(entity) => json!({
            "id": entity.id,
            "kind": "entity",
            "type": entity.entity_type,
            "name": entity.name,
            "ev": evidence_json(&entity.ev),
        }),
        KnowledgeItem::Fact(fact) => json!({
            "id": fact.id,
            "kind": "fact",
            "pred": fact.pred,
            "subject": fact.subject,
            "object": fact.object,
            "ev": evidence_json(&fact.ev),
        }),
    }
}

fn evidence_json(evidence: &[KnowledgeEvidence]) -> Vec<Value> {
    evidence
        .iter()
        .map(|item| json!({ "chapter": item.chapter, "p": item.p, "q": item.q }))
        .collect()
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
