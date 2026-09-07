use crate::features::assistant::cards;
use crate::features::assistant::grants::TurnSink;
use crate::features::assistant::models::AssistantChange;
use crate::features::assistant::models::AssistantError;
use crate::features::assistant::models::AssistantResult;
use crate::features::assistant::models::Decision;
use crate::features::assistant::sources::Sources;
use serde_json::Value;
use serde_json::json;

mod apply;
mod card;
mod plan;
mod rev;
mod summary;

pub use apply::fresh_block_id;
pub use apply::rewritten_unit;
pub use card::CurrentBlock;
pub use card::DRAFT_KIND;
pub use card::DraftBlock;
pub use card::DraftCard;
pub use card::MAX_BLOCKS;
pub use plan::Plan;
pub use plan::Rules;
pub use plan::build;
pub use plan::parse_members;
pub use plan::ref_chapters;
pub use plan::shape_all;
pub use rev::base_rev;
pub use summary::outdated_audio;
pub use summary::speakers_of;
pub use summary::stale_audio;
pub use summary::stats_of;
pub use summary::unresolved_of;

const CARD_PREFIX: &str = "sd";

pub fn attach(mut card: DraftCard, sink: &dyn TurnSink) -> Result<DraftCard, String> {
    card.id = format!("{CARD_PREFIX}{}", sink.next_card(DRAFT_KIND));
    sink.attach(serde_json::to_value(&card).map_err(|error| error.to_string())?);
    Ok(card)
}

pub fn resolve(
    attachments: &mut [Value],
    item_ids: &[String],
    status: Decision,
    sources: &Sources,
) -> AssistantResult<Vec<AssistantChange>> {
    let picked = cards::picked(attachments, DRAFT_KIND, item_ids);
    for index in &picked {
        cards::require_pending(&attachments[*index])?;
    }
    let mut changes = Vec::new();
    for index in picked {
        if status == Decision::Applied {
            changes.push(apply::apply(&parse(&attachments[index])?, sources)?);
        }
        attachments[index]["status"] = json!(status.as_str());
    }
    Ok(changes)
}

fn parse(attachment: &Value) -> AssistantResult<DraftCard> {
    serde_json::from_value(attachment.clone())
        .map_err(|error| AssistantError::invalid(format!("the draft card is malformed: {error}")))
}

#[cfg(test)]
#[path = "../../../test/features/assistant/drafts.test.rs"]
mod tests;
