use crate::features::assistant::models::AssistantError;
use crate::features::assistant::models::AssistantResult;
use serde_json::Value;

pub const PENDING: &str = "pending";

pub fn id_of(attachment: &Value) -> Option<&str> {
    attachment.get("id").and_then(Value::as_str)
}

pub fn is_kind(attachment: &Value, kind: &str) -> bool {
    attachment.get("kind").and_then(Value::as_str) == Some(kind)
}

pub fn picked(attachments: &[Value], kind: &str, item_ids: &[String]) -> Vec<usize> {
    attachments
        .iter()
        .enumerate()
        .filter(|(_, attachment)| is_kind(attachment, kind) && is_wanted(attachment, item_ids))
        .map(|(index, _)| index)
        .collect()
}

pub fn require_pending(attachment: &Value) -> AssistantResult<()> {
    let status = attachment.get("status").and_then(Value::as_str);
    if status == Some(PENDING) {
        return Ok(());
    }
    Err(AssistantError::conflict(format!(
        "card {} is already {}",
        id_of(attachment).unwrap_or_default(),
        status.unwrap_or("resolved")
    )))
}

pub fn require_cards(
    attachments: &[Value],
    item_ids: &[String],
    kinds: &[&str],
) -> AssistantResult<()> {
    let unknown: Vec<&str> = item_ids
        .iter()
        .filter(|id| !attachments.iter().any(|item| is_card(item, kinds, id)))
        .map(String::as_str)
        .collect();
    if unknown.is_empty() {
        return Ok(());
    }
    Err(AssistantError::not_found(format!(
        "no confirmation card matches: {}",
        unknown.join(", ")
    )))
}

fn is_card(attachment: &Value, kinds: &[&str], id: &str) -> bool {
    kinds.iter().any(|kind| is_kind(attachment, kind)) && id_of(attachment) == Some(id)
}

fn is_wanted(attachment: &Value, item_ids: &[String]) -> bool {
    id_of(attachment).is_some_and(|id| item_ids.iter().any(|wanted| wanted == id))
}
